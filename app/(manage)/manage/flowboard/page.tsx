'use client'

import { withRoleProtection } from '@/lib/hoc/withRoleProtection'
import { UserRole } from '@/lib/roles'
import { FlowboardBoard } from '@/components/admin-views/FlowboardBoard'

/** The tenant's live flowboard, read-only. */
function ManageFlowboardPage() {
  return <FlowboardBoard endpoint="/api/manage/flowboard" readOnly />
}

export default withRoleProtection(ManageFlowboardPage, { allowedRoles: [UserRole.CLINIC_MANAGER] })
