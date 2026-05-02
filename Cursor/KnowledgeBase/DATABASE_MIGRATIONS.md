# Database Migrations

Supabase migrations in execution order (`supabase/migrations`).

## 001-010 Foundation and Compatibility

- `001_create_user_profiles.sql` - initial profile table and role base.
- `002_create_patients_table_with_rls.sql` - patient table + RLS baseline.
- `003_create_appointments_table_with_rls.sql` - appointment table + RLS.
- `004_update_rls_policies_for_existing_schema.sql` - align RLS with existing schema variants.
- `005_create_patient_documents_table.sql` - patient document metadata model.
- `006_create_missing_tables_for_auth.sql` - auth-adjacent schema completion.
- `007_create_old_schema_tables_linked_to_new.sql` - compatibility bridge tables/links.
- `008_add_missing_columns_to_existing_tables.sql` - schema gap patching.
- `009_fix_rls_policies_for_new_schema.sql` - RLS corrections for newer shapes.
- `010_rename_pid_to_id_in_patients.sql` - patient identifier normalization.

## 011-020 Hardening and Feature Growth

- `011_fix_all_rls_policies_final.sql` - broad policy normalization pass.
- `012_create_storage_bucket_policies.sql` - storage access control policies.
- `013_add_missing_columns_to_patient_documents.sql` - document metadata expansion.
- `014_create_chat_tables.sql` - conversations/messages.
- `015_create_profile_trigger.sql` - profile automation trigger logic.
- `016_fix_profiles_rls_for_chat.sql` - profile visibility for chat feature.
- `017_add_vitals_rls_policies.sql` - vitals/clinical RLS updates.
- `018_create_audit_log.sql` - audit trail table and supporting objects.
- `019_add_performance_indexes.sql` - index tuning.

## 021-029 Clinical, Transcript, and Catalog Scope

- `021_ai_soapnotes_rls_policies.sql` - SOAP notes access controls.
- `022_doctor_soapnotes_and_restrict_add.sql` - doctor-specific SOAP policy changes.
- `023_telemedicine_transcripts.sql` - transcript persistence schema.
- `024_fix_profiles_schema_compatibility.sql` - profile/table compatibility updates.
- `025_fix_flowboard_doctors_view_all_appointments.sql` - flowboard appointment visibility.
- `026_create_pharmacy_table.sql` - pharmacy domain table.
- `027_create_signed_form.sql` - signed form storage model.
- `028_encounters_doctors_view_by_id.sql` - doctor encounter visibility fix.
- `029_category_product_presales.sql` - category/product pre-sales support.

## 030-036 Product Policy and Workflow Additions

- `030_category_product_rls.sql` - RLS for category/product entities.
- `031_products_select_rls.sql` - select-policy refinement for products.
- `032_products_pre_sales_policies.sql` - pre-sales policy controls.
- `033_memr_workflow_scope.sql` - workflow scope support changes.
- `034_encounters_ensure_patient_id.sql` - enforce encounter patient linkage.
- `035_encounter_risk_storage.sql` - risk-alert storage model.
- `036_forms_and_signed_forms.sql` - forms and signed forms integration updates.

## Operational Notes

- The migration stream repeatedly revisits RLS policy quality, indicating strict multi-role data partitioning requirements.
- `supabase/README.md` and `supabase/REALTIME_SETUP.md` complement migration intent and runtime setup.
