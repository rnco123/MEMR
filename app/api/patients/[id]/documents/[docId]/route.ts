import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireClinicalRole } from '@/lib/locations/scope'
import { guardPatientAccess } from '@/lib/encounters/guard'
import { NextRequest, NextResponse } from 'next/server'

// Force dynamic rendering since we use cookies for authentication
export const dynamic = 'force-dynamic'

// DELETE - Delete a document
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; docId: string } }
) {
  try {
    const supabase = await createClient()
    const patientId = Number(params.id)
    const docId = params.docId

    if (Number.isNaN(patientId)) {
      return NextResponse.json({ error: 'Invalid patient ID' }, { status: 400 })
    }

    // Verify user is authenticated
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
      await requireClinicalRole(supabase, user.id)
    } catch {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await guardPatientAccess(user.id, patientId)

    const supabaseAdmin = createAdminClient()

    const { data: document, error: fetchError } = await supabaseAdmin
      .from('patient_documents')
      .select('file_path, patient_id')
      .eq('id', docId)
      .eq('patient_id', patientId)
      .single()

    if (fetchError || !document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const filePath = document.file_path

    const { error: deleteError } = await supabaseAdmin
      .from('patient_documents')
      .delete()
      .eq('id', docId)
      .eq('patient_id', patientId)

    if (deleteError) {
      console.error('Error deleting document:', deleteError)
      return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 })
    }

    if (filePath) {
      const { error: storageError } = await supabaseAdmin.storage
        .from('patient-documents')
        .remove([filePath])

      if (storageError) {
        console.error('Error deleting file from storage:', storageError)
        // Don't fail the request if storage deletion fails
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/patients/[id]/documents/[docId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
