'use client'

import { withRoleProtection } from '@/lib/hoc/withRoleProtection'
import { UserRole } from '@/lib/roles'
import { SupportInbox } from '@/components/admin-views/SupportInbox'

/** Support tickets raised by the tenant's staff, read-only. */
function ManageSupportPage() {
  // The thread view fills its parent's height; give it the viewport below the header.
  return (
    <div className="h-[calc(100dvh-9rem)]">
      <SupportInbox readOnly />
    </div>
  )
}

export default withRoleProtection(ManageSupportPage, { allowedRoles: [UserRole.CLINIC_MANAGER] })
