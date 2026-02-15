# Supabase Database Setup

This directory contains SQL migrations for setting up the Supabase database schema for the MyclinicMD application.

## Setup Instructions

1. **Open Supabase Dashboard**: Go to your Supabase project dashboard
2. **Navigate to SQL Editor**: Click on "SQL Editor" in the left sidebar
3. **Run Migration**: Copy and paste the contents of the migration file into the SQL editor
4. **Execute**: Click "Run" to execute the migration

## Migration Files

### 001_create_user_profiles.sql
Creates the `user_profiles` table with:
- User role storage (`doctor` or `nurse`)
- Full name field
- Automatic profile creation on user signup
- Row Level Security (RLS) policies
- Timestamps for created_at and updated_at

**Note**: This migration is for new setups. If you already have a `profiles` table, skip this migration.

### 002_create_patients_table_with_rls.sql
Creates the `patients` table with RLS policies for role-based data isolation.

**Note**: This migration is for new setups. If you already have a `patients` table, skip this migration.

### 003_create_appointments_table_with_rls.sql
Creates the `appointments` table with RLS policies for role-based access.

**Note**: This migration is for new setups. If you already have an `appointments` table, skip this migration.

### 004_update_rls_policies_for_existing_schema.sql ⭐ **USE THIS FOR EXISTING SCHEMA**
This migration updates RLS policies to match your existing database structure:
- Uses `profiles` table with `uid` column (not `user_profiles`)
- Respects all foreign key relationships:
  - `profiles.uid` → `auth.users.id`
  - `doctors.doctor_id` → `profiles.uid`
  - `appointments.pid` → `patients.pid`
  - `encounters.doctor_id` → `doctors.doctor_id`
  - `encounters.appointment_id` → `appointments.appointment_id`
  - `intake_forms.encounter_id` → `encounters.eid`
  - `patient_file.encounter_id` → `encounters.eid`
  - `patient_file.pid` → `patients.pid`
  - `appointment_rooms.appointment_id` → `appointments.appointment_id`
  - `doctor_availability.doctor_id` → `doctors.doctor_id`

**Tables with RLS policies:**
- `profiles` - Users can view/update their own profile
- `patients` - Doctors can view all, Nurses can view assigned
- `appointments` - Doctors can manage all, Nurses can view assigned
- `encounters` - Doctors can manage own, Nurses can view assigned
- `intake_forms` - Doctors can manage for own encounters, Nurses can view assigned
- `patient_file` - Doctors can manage for own encounters, Nurses can view assigned
- `appointment_rooms` - Doctors can view own, Nurses can view assigned
- `doctors` - Users can view/update own, Doctors can view all
- `doctor_availability` - Doctors can manage own

### 005_create_patient_documents_table.sql
Creates the `patient_documents` table for storing uploaded documents in patient profiles:
- Stores document metadata (name, label, file info)
- Tracks uploader information and timestamp
- Supports document labels: image, report, bill, prescription, lab_result, xray, other
- RLS policies allow doctors and nurses to view/manage all patient documents

**Important: Storage Bucket Setup Required**
After running this migration, you need to create a Supabase Storage bucket:

1. Go to Supabase Dashboard → Storage
2. Click "Create a new bucket"
3. Name: `patient-documents`
4. Public: **Yes** (for public file access)
5. File size limit: 10MB (or your preferred limit)
6. Allowed MIME types: Leave empty for all types, or specify: `image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document`

**Storage Policies:**
After creating the bucket, set up storage policies in SQL Editor:
```sql
-- Allow authenticated users to upload files
CREATE POLICY "Authenticated users can upload documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'patient-documents');

-- Allow authenticated users to view files
CREATE POLICY "Authenticated users can view documents"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'patient-documents');

-- Allow authenticated users to delete files
CREATE POLICY "Authenticated users can delete documents"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'patient-documents');
```

## Row Level Security Policies

The RLS policies ensure:
- **Doctors** can access all data related to their patients
- **Nurses/Staff** can only access data for patients they have encounters with
- Users can only view/update their own profile
- Data isolation between different doctors and their patients

## Next Steps

After running the migration:
1. Verify RLS policies are working correctly
2. Test with doctor and nurse accounts
3. Ensure data isolation is working as expected
