import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleApiError } from '@/lib/api-error-handler'
import { requireAdminUser } from '@/lib/admin-auth'
import {
  loadAdminPrescriptionReadyRows,
  loadPrescriptionReadyPharmacyOptions,
  loadPrescriptionReadyLocationOptions,
  type PrescriptionReadyDateFilter,
} from '@/lib/prescriptions/load-admin-prescription-ready'
import type { PrescriptionReadyAdminStatus } from '@/lib/prescriptions/prescription-ready'
import { parseIdListParam } from '@/lib/api/parse-id-list-param'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    await requireAdminUser()
    const admin = createAdminClient()

    const pharmacyIds = parseIdListParam(req.nextUrl.searchParams, 'pharmacy_ids', 'pharmacy_id')
    const locationIds = parseIdListParam(req.nextUrl.searchParams, 'location_ids', 'location_id')
    const statusRaw = req.nextUrl.searchParams.get('status')
    const status: PrescriptionReadyAdminStatus | 'all' =
      statusRaw === 'pending' || statusRaw === 'sent_to_pharmacy' ? statusRaw : 'all'
    const dateRaw = req.nextUrl.searchParams.get('prescription_date') ?? 'all'
    const prescriptionDate: PrescriptionReadyDateFilter =
      dateRaw === 'today' || dateRaw === 'this_month' ? dateRaw : 'all'
    const genderRaw = req.nextUrl.searchParams.get('gender')
    const gender: 'male' | 'female' | 'all' =
      genderRaw === 'male' || genderRaw === 'female' ? genderRaw : 'all'

    const baseFilters = {
      status: status as PrescriptionReadyAdminStatus | 'all',
      prescriptionDate,
    }

    const rows = await loadAdminPrescriptionReadyRows(admin, {
      pharmacyIds: pharmacyIds.length > 0 ? pharmacyIds : undefined,
      locationIds: locationIds.length > 0 ? locationIds : undefined,
      gender,
      ...baseFilters,
    })

    const [pharmacies, locations] = await Promise.all([
      loadPrescriptionReadyPharmacyOptions(admin, baseFilters),
      loadPrescriptionReadyLocationOptions(admin, baseFilters),
    ])

    return NextResponse.json({
      rows,
      pharmacies,
      locations,
      totalCount: rows.length,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
