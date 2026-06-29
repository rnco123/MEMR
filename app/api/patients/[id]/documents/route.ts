import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { getI693BasePath } from '@/lib/i693/paths'
import { listImmigrationDocumentsForPatient } from '@/lib/patient-documents/immigration-docs'
import { requireClinicalRole } from '@/lib/locations/scope'
import { guardPatientAccess } from '@/lib/encounters/guard'
import { handleApiError } from '@/lib/api-error-handler'
import { PATIENT_DOCUMENT_SELECT } from '@/lib/encounters/encounter-detail-selects'
import { createSignedUrlMap } from '@/lib/storage/signed-url-map'

// Patient documents: for doctors and nurses to upload and manage documents for a patient.
// Force dynamic rendering since we use cookies for authentication
export const dynamic = 'force-dynamic'

// GET - Fetch all documents for a patient
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const patientId = Number(params.id) // bigint

    if (isNaN(patientId)) {
      return NextResponse.json({ error: 'Invalid patient ID' }, { status: 400 })
    }

    // Verify user is authenticated (relaxed: log error but don't block if Supabase cookies are present)
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabaseAdmin = await guardPatientAccess(user.id, patientId)

    // Service role after access check — JWT RLS omits admin/fnp/pa.
    const { data: documents, error } = await supabaseAdmin
      .from('patient_documents')
      .select(PATIENT_DOCUMENT_SELECT)
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json(
        { error: `Failed to fetch documents: ${error.message}` },
        { status: 500 }
      )
    }

    // Use signed URLs (1h) so docs open in viewer even when bucket is private — one batched
    // storage call instead of one round trip per document.
    const signedUrlByPath = await createSignedUrlMap(
      supabaseAdmin,
      'patient-documents',
      (documents ?? []).map((doc: any) => doc.file_path).filter(Boolean),
      3600
    )

    // Batch uploader profiles (one query instead of one per document).
    const uploaderIds = [...new Set((documents ?? []).map((doc: any) => doc.uploaded_by).filter(Boolean))]
    const { data: uploaderProfiles } = uploaderIds.length
      ? await supabaseAdmin.from('profiles').select('uid, full_name, email').in('uid', uploaderIds)
      : { data: [] as { uid: string; full_name: string | null; email: string | null }[] }
    const uploaderById = new Map((uploaderProfiles ?? []).map((p) => [p.uid, p]))

    // Transform documents to match frontend interface
    // Schema has: id, patient_id, file_name, file_path, file_type, file_size, document_category, uploaded_by, created_at
    // Frontend expects: id, document_name, document_label, file_url, file_name, file_size, file_type, uploaded_by, uploaded_by_name, created_at
    const transformedDocuments = (documents ?? []).map((doc: any) => {
      const uploaderProfile = doc.uploaded_by ? uploaderById.get(doc.uploaded_by) : null
      const uploadedByName: string | null =
        uploaderProfile?.full_name || uploaderProfile?.email || null

      return {
        id: doc.id,
        patient_id: doc.patient_id,
        document_name: doc.file_name, // Use file_name as document_name
        document_label: doc.document_category || 'other', // Use document_category as document_label
        file_url: doc.file_path ? signedUrlByPath.get(doc.file_path) ?? '' : '',
        file_name: doc.file_name,
        file_size: doc.file_size,
        file_type: doc.file_type,
        uploaded_by: doc.uploaded_by,
        uploaded_by_name: uploadedByName,
        created_at: doc.created_at,
      }
    })

    let i693BasePath = '/dashboard/i-693'
    if (user) {
      const roleInfo = await fetchUserRole(supabase, user.id)
      i693BasePath = getI693BasePath(roleInfo?.role)
    }
    const immigrationDocs = await listImmigrationDocumentsForPatient(supabaseAdmin, patientId, {
      i693BasePath,
    })

    const merged = [...transformedDocuments, ...immigrationDocs].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )

    return NextResponse.json({ documents: merged })
  } catch (error) {
    return handleApiError(error)
  }
}

// POST - Upload a new document
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const patientId = Number(params.id) // bigint

    if (isNaN(patientId)) {
      return NextResponse.json({ error: 'Invalid patient ID' }, { status: 400 })
    }

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

    const supabaseAdmin = await guardPatientAccess(user.id, patientId)

    const formData = await request.formData()
    const file = formData.get('file') as File
    const documentName = formData.get('document_name') as string // This is what the user typed
    const documentLabel = formData.get('document_label') as string

    if (!file || !documentLabel) {
      return NextResponse.json(
        { error: 'Missing required fields: file, document_label' },
        { status: 400 }
      )
    }

    if (!documentName || documentName.trim() === '') {
      return NextResponse.json(
        { error: 'Document name is required' },
        { status: 400 }
      )
    }

    const {
      validatePatientDocumentUpload,
      scanPatientDocumentContent,
      generateSecureFileName,
      resolvePatientDocumentContentType,
    } = await import('@/lib/security/file-upload')

    const fileValidation = validatePatientDocumentUpload(file)
    if (!fileValidation.valid) {
      return NextResponse.json({ error: fileValidation.error }, { status: 400 })
    }

    const contentScan = await scanPatientDocumentContent(file)
    if (!contentScan.valid) {
      return NextResponse.json({ error: contentScan.error }, { status: 400 })
    }

    const contentType = resolvePatientDocumentContentType(file) ?? 'application/octet-stream'

    const validCategories = [
      'image',
      'report',
      'bill',
      'prescription',
      'lab_result',
      'xray',
      'immigration',
      'i693',
      'other',
    ]
    if (!validCategories.includes(documentLabel)) {
      return NextResponse.json({ error: 'Invalid document category' }, { status: 400 })
    }

    const fileName = generateSecureFileName(file.name)
    const filePath = `patient-${patientId}/${fileName}`

    const { error: uploadError } = await supabaseAdmin.storage
      .from('patient-documents')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType,
      })

    if (uploadError) {
      console.error('Error uploading file:', uploadError)
      return NextResponse.json(
        { error: uploadError.message || 'Failed to upload file' },
        { status: 500 }
      )
    }

    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from('patient-documents')
      .createSignedUrl(filePath, 3600)
    if (signError) {
      console.error('Error creating signed URL after upload:', signError.message)
    }
    const fileUrl = signed?.signedUrl ?? ''

    const { data: document, error: insertError } = await supabaseAdmin
      .from('patient_documents')
      .insert({
        patient_id: patientId,
        document_category: documentLabel,
        file_path: filePath,
        file_name: documentName.trim(),
        file_size: file.size,
        file_type: contentType,
        uploaded_by: user.id,
      })
      .select(PATIENT_DOCUMENT_SELECT)
      .single()

    if (insertError) {
      console.error('Error inserting document:', insertError)
      await supabaseAdmin.storage.from('patient-documents').remove([filePath])
      return NextResponse.json(
        { error: insertError.message || 'Failed to save document record' },
        { status: 500 }
      )
    }

    // Transform document to match frontend interface (same format as GET endpoint)
    // Fetch uploader name from profiles, or use stored name (e.g. patient intake uploads)
    let uploadedByName: string | null = null
    if (document.uploaded_by) {
      try {
        const { data: profile, error: profileError } = await supabaseAdmin
          .from('profiles')
          .select('full_name, email')
          .eq('uid', document.uploaded_by)
          .single()
        
        if (!profileError && profile) {
          uploadedByName = profile.full_name || profile.email || null
        }
      } catch (error) {
        console.error('Error fetching uploader profile:', error)
      }
    }

    // Transform to match frontend interface
    const transformedDocument = {
      id: document.id,
      patient_id: document.patient_id,
      document_name: document.file_name, // file_name is the document name user typed
      document_label: document.document_category || 'other', // document_category as document_label
      file_url: fileUrl,
      file_name: document.file_name, // Same as document_name
      file_size: document.file_size,
      file_type: document.file_type,
      uploaded_by: document.uploaded_by,
      uploaded_by_name: uploadedByName,
      created_at: document.created_at,
    }

    return NextResponse.json({ document: transformedDocument }, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
