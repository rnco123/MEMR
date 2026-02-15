import { createClient } from '@/lib/supabase/server'
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
    const docId = params.docId

    // Verify user is authenticated
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get document to retrieve file path
    const { data: document, error: fetchError } = await supabase
      .from('patient_documents')
      .select('file_path')
      .eq('id', docId)
      .single()

    if (fetchError || !document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Use file_path directly from schema
    const filePath = document.file_path

    // Delete from database
    const { error: deleteError } = await supabase
      .from('patient_documents')
      .delete()
      .eq('id', docId)

    if (deleteError) {
      console.error('Error deleting document:', deleteError)
      return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 })
    }

    // Delete file from storage
    if (filePath) {
      const { error: storageError } = await supabase.storage
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
