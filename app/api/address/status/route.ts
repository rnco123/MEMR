import { NextResponse } from 'next/server'
import { isAddressLookupConfigured } from '@/lib/address/suggestions'

export const dynamic = 'force-dynamic'

export async function GET() {
  const enabled = isAddressLookupConfigured()
  return NextResponse.json({
    success: true,
    enabled,
    message: enabled ? 'Address lookup configured' : 'Address lookup not configured',
  })
}
