export type EncounterSectionAuditSummary = {
  editor_name: string | null
  editor_role: string | null
  updated_at: string
} | null

export function encounterSectionAuditFromRow(
  row: Record<string, unknown> | null | undefined
): EncounterSectionAuditSummary {
  if (!row) return null
  const updatedAt =
    row.updated_at != null
      ? String(row.updated_at)
      : row.created_at != null
        ? String(row.created_at)
        : null
  const editorName = (row.editor_name as string | null | undefined) ?? null
  const editorRole = (row.editor_role as string | null | undefined) ?? null
  if (!updatedAt && !editorName) return null
  return {
    editor_name: editorName,
    editor_role: editorRole,
    updated_at: updatedAt ?? '',
  }
}
