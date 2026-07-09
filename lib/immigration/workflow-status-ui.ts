import type { ImmigrationStatusColor, ImmigrationWorkflowStatus } from '@/lib/immigration/types'
import { WORKFLOW_COLUMNS } from '@/lib/immigration/types'

export const WORKFLOW_STATUS_DOT: Record<ImmigrationStatusColor, string> = {
  red: 'bg-red-500',
  yellow: 'bg-amber-400',
  purple: 'bg-purple-500',
  green: 'bg-emerald-500',
  blue: 'bg-blue-500',
}

export const WORKFLOW_STATUS_BADGE: Record<ImmigrationStatusColor, string> = {
  red: 'bg-red-50 text-red-900 border-red-200',
  yellow: 'bg-amber-50 text-amber-950 border-amber-200',
  purple: 'bg-purple-50 text-purple-900 border-purple-200',
  green: 'bg-emerald-50 text-emerald-900 border-emerald-200',
  blue: 'bg-blue-50 text-blue-900 border-blue-200',
}

export function workflowColumnForStatus(status: ImmigrationWorkflowStatus) {
  return WORKFLOW_COLUMNS.find((col) => col.status === status) ?? WORKFLOW_COLUMNS[0]!
}
