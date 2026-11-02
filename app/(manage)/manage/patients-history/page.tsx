'use client'

import { withRoleProtection } from '@/lib/hoc/withRoleProtection'
import { UserRole } from '@/lib/roles'
import { PatientsHistoryList } from '@/components/admin-views/PatientsHistoryList'

/** Patients seen at the tenant's locations, read-only — no patient file. */
function ManagePatientsHistoryPage() {
  return <PatientsHistoryList endpoint="/api/manage/patients-history" readOnly />
}

export default withRoleProtection(ManagePatientsHistoryPage, { allowedRoles: [UserRole.CLINIC_MANAGER] })
