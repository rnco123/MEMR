# External Supabase Setup

This project now supports connecting a second Supabase project for table read/write operations (without using external auth).

## 1) Environment Variables

Add these to `.env`:

- `EXTERNAL_SUPABASE_URL`
- `EXTERNAL_SUPABASE_PUBLISHABLE_KEY`
- `EXTERNAL_SUPABASE_SECRET_KEY`

Optional:

- `EXTERNAL_SUPABASE_ALLOWED_TABLES` (comma-separated table allowlist)
- Legacy keys:
  - `EXTERNAL_SUPABASE_ANON_KEY`
  - `EXTERNAL_SUPABASE_SERVICE_ROLE_KEY`

## 2) Available Helpers

- Server privileged client:
  - `lib/supabase/external-admin.ts` -> `createExternalAdminClient()`
- Browser client (publishable key):
  - `lib/supabase/external-client.ts` -> `createExternalClient()`
- Key helpers:
  - `lib/supabase/external-keys.ts`

## 3) Generic API Proxy

Endpoint:

- `POST /api/external-supabase`

Auth:

- Requires current app authenticated user.
- Uses external project secret key server-side.

### Read Example

```json
{
  "mode": "read",
  "table": "patients",
  "columns": "*",
  "filters": [{ "column": "id", "value": 1018 }],
  "limit": 50,
  "orderBy": { "column": "created_at", "ascending": false }
}
```

### Write Examples

Insert:

```json
{
  "mode": "write",
  "table": "patients",
  "action": "insert",
  "payload": { "id": 1018, "first_name": "Resky", "last_name": "Meera" }
}
```

Update:

```json
{
  "mode": "write",
  "table": "patients",
  "action": "update",
  "payload": { "phone": "+1231232312" },
  "match": [{ "column": "id", "value": 1018 }]
}
```

Delete:

```json
{
  "mode": "write",
  "table": "patients",
  "action": "delete",
  "match": [{ "column": "id", "value": 1018 }]
}
```

## 4) Schema sync (external-only migrations)

Primary app DB (`NEXT_PUBLIC_SUPABASE_URL`) and external DB (`EXTERNAL_SUPABASE_URL`) are **separate**.

### PostgREST schema cache (external project)

After running SQL migrations on the external project (`vsvueqtgulraaczqnnvh`), the **REST API** may lag behind Postgres until the schema cache reloads. Symptoms:

- `Could not find the table 'public.tenants' in the schema cache`
- `column Locations.tenant_id does not exist` (while SQL editor shows the column)

**Fix:** In [external project dashboard](https://supabase.com/dashboard/project/vsvueqtgulraaczqnnvh/settings/api) → **API Settings** → reload the schema / restart the API. Until then, MEMR sync writes **legacy** `Locations` columns via REST (`Group` stores `CLN-{id}`); extended columns (`memr_location_id`, `tenant_id`, …) are filled when the API cache catches up or via SQL.
Changing one does not change the other.

- MEMR migrations: `supabase/migrations/*.sql` → apply to primary project (e.g. `locations`, lowercase).
- External migrations: `supabase/migrations/external/*.sql` → apply to external project (e.g. `Locations`, PascalCase on Clinica San Miguel).

After adding a file under `supabase/migrations/external/`:

```bash
npm run db:sync-external
```

Then apply the printed SQL via Supabase Dashboard SQL editor or MCP `apply_migration` on the **external** project ref (`vsvueqtgulraaczqnnvh` when using that URL).

Migrations:

| File | Purpose |
|------|---------|
| `001_tenants_and_locations_tenant.sql` | `tenants` + optional `tenant_id` on `"Locations"` |
| `002_locations_memr_columns.sql` | Additive MEMR columns (`location_code`, `opening_hours`, `memr_location_id`, …) |

### Admin sync (automatic when configured)

If `EXTERNAL_SUPABASE_URL` + `EXTERNAL_SUPABASE_SECRET_KEY` are set:

- **Add tenant** (Admin → Locations) → upserts into external `tenants` (matched by `tenant_code`)
- **Add / edit location** → inserts/updates external `"Locations"` and stores `external_location_id` on primary `locations`

Primary app DB is still the source of truth for MEMR. External legacy columns (`mon_timing`, `credit_limit`, etc.) are filled with safe defaults so other projects keep working.

## Security Notes

- Do not expose `EXTERNAL_SUPABASE_SECRET_KEY` to client code.
- Prefer setting `EXTERNAL_SUPABASE_ALLOWED_TABLES` to a strict list.
- If you use the browser external client, enforce strict RLS policies on the external project.
