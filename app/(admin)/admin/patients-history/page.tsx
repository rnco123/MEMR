'use client'

import { PatientsHistoryList } from '@/components/admin-views/PatientsHistoryList'

export default function AdminPatientsHistoryPage() {
  return <PatientsHistoryList endpoint="/api/admin/patients-history" />
}
