# Patient Documents Feature

This document describes the patient document management feature that allows uploading, viewing, and managing documents in patient profiles.

## Features

- ✅ Upload documents with custom names and labels
- ✅ Categorize documents (Image, Report, Bill, Prescription, Lab Result, X-Ray, Other)
- ✅ Track uploader information and timestamp
- ✅ View/download documents
- ✅ Delete documents
- ✅ File size validation (10MB limit)
- ✅ Role-based access control (Doctors and Nurses)

## Database Schema

The `patient_documents` table stores:
- Document metadata (name, label, file info)
- Patient ID reference
- Uploader information (user ID and name)
- File URL from Supabase Storage
- Timestamps (created_at, updated_at)

## API Routes

### GET `/api/patients/[id]/documents`
Fetches all documents for a patient.

**Response:**
```json
{
  "documents": [
    {
      "id": "uuid",
      "patient_id": "uuid",
      "document_name": "Insurance Card",
      "document_label": "image",
      "file_url": "https://...",
      "file_name": "insurance-card.jpg",
      "file_size": 245760,
      "file_type": "image/jpeg",
      "uploaded_by": "uuid",
      "uploaded_by_name": "Dr. John Smith",
      "created_at": "2024-01-15T10:00:00Z"
    }
  ]
}
```

### POST `/api/patients/[id]/documents`
Uploads a new document.

**Request (FormData):**
- `file`: File object
- `document_name`: string
- `document_label`: 'image' | 'report' | 'bill' | 'prescription' | 'lab_result' | 'xray' | 'other'

**Response:**
```json
{
  "document": { ... }
}
```

### DELETE `/api/patients/[id]/documents/[docId]`
Deletes a document and its file from storage.

**Response:**
```json
{
  "success": true
}
```

## Setup Instructions

1. **Run the migration:**
   ```sql
   -- Run supabase/migrations/005_create_patient_documents_table.sql
   ```

2. **Create Supabase Storage bucket:**
   - Go to Supabase Dashboard → Storage
   - Create bucket: `patient-documents`
   - Set as Public: **Yes**
   - File size limit: 10MB

3. **Set up Storage policies:**
   ```sql
   -- Allow authenticated users to upload
   CREATE POLICY "Authenticated users can upload documents"
   ON storage.objects FOR INSERT
   TO authenticated
   WITH CHECK (bucket_id = 'patient-documents');

   -- Allow authenticated users to view
   CREATE POLICY "Authenticated users can view documents"
   ON storage.objects FOR SELECT
   TO authenticated
   USING (bucket_id = 'patient-documents');

   -- Allow authenticated users to delete
   CREATE POLICY "Authenticated users can delete documents"
   ON storage.objects FOR DELETE
   TO authenticated
   USING (bucket_id = 'patient-documents');
   ```

## Usage

### In Patient File Page

The feature is integrated into the patient file page at `/patient-file/sample`. 

**Note:** The sample page uses a hardcoded patient ID. To use with real patients:

1. Update the route to use dynamic patient ID: `app/patient-file/[id]/page.tsx`
2. Get patient ID from route params:
   ```typescript
   const { id } = useParams()
   const patientId = id as string
   ```

### Document Labels

- **image**: General images (photos, scans)
- **report**: Medical reports
- **bill**: Billing documents
- **prescription**: Prescription documents
- **lab_result**: Laboratory results
- **xray**: X-Ray images
- **other**: Other document types

## UI Features

- **Upload Modal**: Form with file picker, name input, and label dropdown
- **Document List**: Shows all documents with:
  - Document name and label badge
  - File size and original filename
  - Uploader name and timestamp
  - View and Delete buttons
- **Empty State**: Helpful message when no documents exist
- **Loading States**: Shows loading indicator while fetching

## Security

- Row Level Security (RLS) policies ensure only authorized users can access documents
- Doctors and Nurses can view/manage all patient documents
- File uploads are validated (size, type)
- Files are stored in Supabase Storage with proper access controls

## File Storage

Documents are stored in Supabase Storage at:
```
patient-documents/{patient_id}/{timestamp}-{random}.{ext}
```

Files are publicly accessible via signed URLs for authenticated users.
