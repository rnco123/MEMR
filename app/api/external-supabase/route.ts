import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createExternalAdminClient } from '@/lib/supabase/external-admin'
import { getExternalSupabaseAllowedTables, isExternalSupabaseWriteAllowed, filterPayloadToAllowedColumns, getExternalSupabaseAllowedColumns } from '@/lib/supabase/external-keys'
import { handleApiError, ValidationError } from '@/lib/api-error-handler'
import { requireAdminUser } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

const FilterSchema = z.object({
  column: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
})

const ReadSchema = z.object({
  mode: z.literal('read'),
  table: z.string().min(1),
  columns: z.string().default('*'),
  filters: z.array(FilterSchema).default([]),
  limit: z.number().int().positive().max(1000).default(100),
  orderBy: z
    .object({
      column: z.string().min(1),
      ascending: z.boolean().default(false),
    })
    .optional(),
})

const WriteSchema = z.object({
  mode: z.literal('write'),
  table: z.string().min(1),
  action: z.enum(['insert', 'upsert', 'update', 'delete']),
  payload: z.union([z.record(z.any()), z.array(z.record(z.any()))]).optional(),
  match: z.array(FilterSchema).default([]),
})

const RequestSchema = z.union([ReadSchema, WriteSchema])

/** Deny-by-default: empty allowlist blocks all tables (C-02a). */
function isAllowedTable(table: string): boolean {
  const allowlist = getExternalSupabaseAllowedTables()
  if (allowlist.length === 0) return false
  return allowlist.includes(table)
}

export async function POST(request: Request) {
  try {
    // Require admin authentication for all external-supabase operations (C-02b).
    await requireAdminUser()

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const parsed = RequestSchema.safeParse(body)
    if (!parsed.success) throw parsed.error

    const input = parsed.data
    if (!isAllowedTable(input.table)) {
      throw new ValidationError(
        `Table "${input.table}" is not in EXTERNAL_SUPABASE_ALLOWED_TABLES`
      )
    }

    const external = createExternalAdminClient()

    if (input.mode === 'read') {
      const allowedCols = getExternalSupabaseAllowedColumns(input.table)
      const columns =
        allowedCols && input.columns === '*'
          ? allowedCols.join(',')
          : input.columns
      let query = external.from(input.table).select(columns).limit(input.limit)
      for (const f of input.filters) {
        query = query.eq(f.column, f.value as never)
      }
      if (input.orderBy) {
        query = query.order(input.orderBy.column, { ascending: input.orderBy.ascending })
      }

      const { data, error } = await query
      if (error) throw error
      return NextResponse.json({ ok: true, mode: 'read', data: data ?? [] })
    }

    // write mode — disabled unless EXTERNAL_SUPABASE_ALLOW_WRITE=true (C-02d)
    if (!isExternalSupabaseWriteAllowed()) {
      throw new ValidationError('External Supabase write mode is disabled')
    }

    const matchEntries = input.match
    switch (input.action) {
      case 'insert': {
        if (!input.payload) throw new ValidationError('payload is required for insert')
        const payload = filterPayloadToAllowedColumns(input.table, input.payload as Record<string, unknown>)
        const { data, error } = await external.from(input.table).insert(payload).select()
        if (error) throw error
        return NextResponse.json({ ok: true, mode: 'write', action: 'insert', data: data ?? [] })
      }
      case 'upsert': {
        if (!input.payload) throw new ValidationError('payload is required for upsert')
        const payload = filterPayloadToAllowedColumns(input.table, input.payload as Record<string, unknown>)
        const { data, error } = await external.from(input.table).upsert(payload).select()
        if (error) throw error
        return NextResponse.json({ ok: true, mode: 'write', action: 'upsert', data: data ?? [] })
      }
      case 'update': {
        if (!input.payload || Array.isArray(input.payload)) {
          throw new ValidationError('payload object is required for update')
        }
        if (matchEntries.length === 0) {
          throw new ValidationError('match filters are required for update')
        }
        const payload = filterPayloadToAllowedColumns(
          input.table,
          input.payload as Record<string, unknown>
        ) as Record<string, unknown>
        let query = external.from(input.table).update(payload)
        for (const f of matchEntries) {
          query = query.eq(f.column, f.value as never)
        }
        const { data, error } = await query.select()
        if (error) throw error
        return NextResponse.json({ ok: true, mode: 'write', action: 'update', data: data ?? [] })
      }
      case 'delete': {
        if (matchEntries.length === 0) {
          throw new ValidationError('match filters are required for delete')
        }
        let query = external.from(input.table).delete()
        for (const f of matchEntries) {
          query = query.eq(f.column, f.value as never)
        }
        const { data, error } = await query.select()
        if (error) throw error
        return NextResponse.json({ ok: true, mode: 'write', action: 'delete', data: data ?? [] })
      }
      default:
        throw new ValidationError('Unsupported write action')
    }
  } catch (e) {
    return handleApiError(e)
  }
}
