'use client'

import ComplianceDashboard from '../../../(admin)/admin/compliance/page'
import { withComplianceAccess } from '@/lib/hoc/withComplianceAccess'

export default withComplianceAccess(ComplianceDashboard)
