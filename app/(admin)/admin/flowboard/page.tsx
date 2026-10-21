'use client'

import { FlowboardBoard } from '@/components/admin-views/FlowboardBoard'

export default function AdminFlowboardPage() {
  return <FlowboardBoard endpoint="/api/admin/flowboard" />
}
