import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { getI693BasePath } from '@/lib/i693/paths'
import { listImmigrationDocumentsForPatient } from '@/lib/patient-documents/immigration-docs'
import { requireClinicalRole } from '@/lib/locations/scope'

// Patient documents: for doctors and nurses to upload and manage documents for a patient.
// Force dynamic rendering since we use cookies for authentication
export const dynamic = 'force-dynamic'

// GET - Fetch all documents for a patient
export async function GET(
  request: NextRequest,
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
      console.error('Warning: auth.getUser() failed in documents GET, continuing with Supabase RLS:', userError)
      // We rely on Supabase RLS to enforce data access; do not return 401 here.
    }

    // Fetch documents
    const { data: documents, error } = await supabase
      .from('patient_documents')
      .select('*')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json(
        { error: `Failed to fetch documents: ${error.message}` },
        { status: 500 }
      )
    }

    // Use admin client for storage so bucket RLS cannot block listing/signed URLs
    const supabaseAdmin = createAdminClient()
    const getDocumentUrl = async (filePath: string, bucket = 'patient-documents'): Promise<string> => {
      const { data } = await supabaseAdmin.storage
        .from(bucket)
        .createSignedUrl(filePath, 3600)
      return data?.signedUrl ?? supabaseAdmin.storage.from(bucket).getPublicUrl(filePath).data.publicUrl
    }

    // Transform documents to match frontend interface
    // Schema has: id, patient_id, file_name, file_path, file_type, file_size, document_category, uploaded_by, created_at
    // Frontend expects: id, document_name, document_label, file_url, file_name, file_size, file_type, uploaded_by, uploaded_by_name, created_at
    const transformedDocuments = await Promise.all(
      (documents ?? []).map(async (doc: any) => {
        // Use signed URL (1h) so doc opens in viewer even when bucket is private
        const fileUrl = doc.file_path ? await getDocumentUrl(doc.file_path) : ''

        // Fetch uploader name from profiles
        let uploadedByName = null
        if (doc.uploaded_by) {
          try {
            const { data: profile, error: profileError } = await supabase
              .from('profiles')
              .select('full_name, email')
              .eq('uid', doc.uploaded_by)
              .single()
            
            if (!profileError && profile) {
              uploadedByName = profile.full_name || profile.email || null
            }
          } catch (error) {
            console.error('Error fetching uploader profile:', error)
          }
        }

        return {
          id: doc.id,
          patient_id: doc.patient_id,
          document_name: doc.file_name, // Use file_name as document_name
          document_label: doc.document_category || 'other', // Use document_category as document_label
          file_url: fileUrl,
          file_name: doc.file_name,
          file_size: doc.file_size,
          file_type: doc.file_type,
          uploaded_by: doc.uploaded_by,
          uploaded_by_name: uploadedByName,
          created_at: doc.created_at,
        }
      })
    )

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
    console.error('Error in GET /api/patients/[id]/documents:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
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

    const supabaseAdmin = createAdminClient()

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

    const { data: signed } = await supabaseAdmin.storage
      .from('patient-documents')
      .createSignedUrl(filePath, 3600)
    const fileUrl =
      signed?.signedUrl ??
      supabaseAdmin.storage.from('patient-documents').getPublicUrl(filePath).data.publicUrl

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
      .select()
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
    // Fetch uploader name from profiles
    let uploadedByName = null
    if (document.uploaded_by) {
      try {
        const { data: profile, error: profileError } = await supabase
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
    console.error('Error in POST /api/patients/[id]/documents:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
