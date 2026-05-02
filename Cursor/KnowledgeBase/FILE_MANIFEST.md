# File Manifest

Comprehensive first-party workspace file inventory.
Generated from workspace scan of `e:/MEMR` (excluding dependency/build trees such as `node_modules` and `.next`).

## Root Files

- `.env`
- `.env.example`
- `.eslintrc.json`
- `.gitignore`
- `.prettierignore`
- `.prettierrc`
- `A06_VULNERABLE_COMPONENTS_ANALYSIS.md`
- `API_DOCUMENTATION.md`
- `BEST_PRACTICES_APPLIED.md`
- `DEPENDENCY_UPDATE_POLICY.md`
- `FULL_CONTEXT.md`
- `instrumentation.ts`
- `jest.config.js`
- `jest.setup.js`
- `middleware.ts`
- `next-env.d.ts`
- `next.config.js`
- `OWASP_TOP10_MAPPING.md`
- `package-lock.json`
- `package.json`
- `PATIENT_DOCUMENTS_FEATURE.md`
- `postcss.config.js`
- `PRODUCTION_DEPLOYMENT.md`
- `PRODUCTION_READINESS.md`
- `PROPOSED_SCOPE.md`
- `README.md`
- `RECOMMENDATIONS.md`
- `schema.md`
- `SECURITY.md`
- `SECURITY_ASSESSMENT.md`
- `SECURITY_ENHANCEMENTS.md`
- `SECURITY_SUMMARY.md`
- `sentry.client.config.ts`
- `sentry.edge.config.ts`
- `sentry.server.config.ts`
- `tailwind.config.ts`
- `tsconfig.json`
- `tsconfig.tsbuildinfo`
- `VERCEL_DEPLOYMENT_CHECKLIST.md`

## .github

- `.github/dependabot.yml`
- `.github/workflows/ci.yml`

## app

- `app/global-error.tsx`
- `app/globals.css`
- `app/layout.tsx`
- `app/page.tsx`
- `app/login/page.tsx`
- `app/openai/page.tsx`
- `app/patient-file/[id]/page.tsx`
- `app/sentry-test/page.tsx`
- `app/signup/page.tsx`
- `app/test-consent-forms/page.tsx`
- `app/test-daily/page.tsx`
- `app/test-soap-complete/page.tsx`
- `app/video/page.tsx`
- `app/(dashboard)/layout.tsx`
- `app/(dashboard)/dashboard/page.tsx`
- `app/(dashboard)/dashboard/flowboard/page.tsx`
- `app/(dashboard)/dashboard/follow-ups/page.tsx`
- `app/(dashboard)/dashboard/nurse-flowboard/page.tsx`
- `app/(dashboard)/dashboard/orders/page.tsx`
- `app/(dashboard)/dashboard/patients-history/page.tsx`
- `app/(dashboard)/dashboard/prescriptions/page.tsx`
- `app/api/audit/route.ts`
- `app/api/auth/signout/route.ts`
- `app/api/auth/test-login/route.ts`
- `app/api/chat/conversations/route.ts`
- `app/api/chat/messages/route.ts`
- `app/api/chat/sync-profiles/route.ts`
- `app/api/chat/users/route.ts`
- `app/api/daily/end-room/route.ts`
- `app/api/daily/room/route.ts`
- `app/api/daily/test/route.ts`
- `app/api/doctors/availability/route.ts`
- `app/api/encounters/[id]/ai-soapnote/route.ts`
- `app/api/encounters/[id]/consent-forms/route.ts`
- `app/api/encounters/[id]/icd-suggestions/route.ts`
- `app/api/encounters/[id]/orders/route.ts`
- `app/api/encounters/[id]/rooming/route.ts`
- `app/api/health/route.ts`
- `app/api/nurse/risk-alerts/route.ts`
- `app/api/openai/test/route.ts`
- `app/api/orders/[orderId]/route.ts`
- `app/api/patients/[id]/documents/route.ts`
- `app/api/patients/[id]/documents/[docId]/route.ts`
- `app/api/post-visit-tasks/route.ts`
- `app/api/post-visit-tasks/[taskId]/route.ts`
- `app/api/prescriptions/route.ts`
- `app/api/signup/route.ts`
- `app/api/soap/complete-soap/route.ts`
- `app/api/test-db-connection/route.ts`
- `app/api/transcripts/save/route.ts`

## components

- `components/AssignProviderModal.tsx`
- `components/BrandLogo.tsx`
- `components/Chat.tsx`
- `components/EncounterConsentFormsTab.tsx`
- `components/EncounterDetailModal.tsx`
- `components/EncounterRoomingPanel.tsx`
- `components/ErrorBoundary.tsx`
- `components/FinalReviewModal.tsx`
- `components/LoadingSpinner.tsx`
- `components/PreVisitSummary.tsx`
- `components/README.md`
- `components/SearchByDobDropdowns.tsx`
- `components/TelemedicineConnectionModal.tsx`
- `components/VitalsFormModal.tsx`

## docs

- `docs/SOAP_NOTES_SCHEMA.sql`

## lib

- `lib/api-error-handler.ts`
- `lib/audit.ts`
- `lib/auth-context.tsx`
- `lib/cache.ts`
- `lib/clinical.ts`
- `lib/config.ts`
- `lib/daily.ts`
- `lib/encounter-status.ts`
- `lib/fetch-user-role.ts`
- `lib/roles.ts`
- `lib/rate-limit.ts`
- `lib/sanitize.ts`
- `lib/status-timeline.ts`
- `lib/validation.ts`
- `lib/forms/render-consent-html.ts`
- `lib/forms/signature-paths.ts`
- `lib/hoc/withRoleProtection.tsx`
- `lib/icd-suggestions/format-subjective-for-icd.ts`
- `lib/icd-suggestions/suggest-icd-openai.ts`
- `lib/risk-alerts/build-clinical-context.ts`
- `lib/risk-alerts/openai-analyze.ts`
- `lib/security/api-auth.ts`
- `lib/security/csrf.ts`
- `lib/security/file-upload.ts`
- `lib/security/ip-whitelist.ts`
- `lib/security/monitoring.ts`
- `lib/security/password.ts`
- `lib/security/request-validator.ts`
- `lib/supabase/admin.ts`
- `lib/supabase/client.ts`
- `lib/supabase/keys.ts`
- `lib/supabase/server.ts`
- `lib/supabase/user-jwt-client.ts`
- `lib/utils/role-utils.ts`

## public

- `public/favicon.svg`
- `public/.well-known/security.txt`

## scripts

- `scripts/clean-next.cjs`
- `scripts/next-start.cjs`

## supabase

- `supabase/README.md`
- `supabase/REALTIME_SETUP.md`
- `supabase/migrations/001_create_user_profiles.sql`
- `supabase/migrations/002_create_patients_table_with_rls.sql`
- `supabase/migrations/003_create_appointments_table_with_rls.sql`
- `supabase/migrations/004_update_rls_policies_for_existing_schema.sql`
- `supabase/migrations/005_create_patient_documents_table.sql`
- `supabase/migrations/006_create_missing_tables_for_auth.sql`
- `supabase/migrations/007_create_old_schema_tables_linked_to_new.sql`
- `supabase/migrations/008_add_missing_columns_to_existing_tables.sql`
- `supabase/migrations/009_fix_rls_policies_for_new_schema.sql`
- `supabase/migrations/010_rename_pid_to_id_in_patients.sql`
- `supabase/migrations/011_fix_all_rls_policies_final.sql`
- `supabase/migrations/012_create_storage_bucket_policies.sql`
- `supabase/migrations/013_add_missing_columns_to_patient_documents.sql`
- `supabase/migrations/014_create_chat_tables.sql`
- `supabase/migrations/015_create_profile_trigger.sql`
- `supabase/migrations/016_fix_profiles_rls_for_chat.sql`
- `supabase/migrations/017_add_vitals_rls_policies.sql`
- `supabase/migrations/018_create_audit_log.sql`
- `supabase/migrations/019_add_performance_indexes.sql`
- `supabase/migrations/021_ai_soapnotes_rls_policies.sql`
- `supabase/migrations/022_doctor_soapnotes_and_restrict_add.sql`
- `supabase/migrations/023_telemedicine_transcripts.sql`
- `supabase/migrations/024_fix_profiles_schema_compatibility.sql`
- `supabase/migrations/025_fix_flowboard_doctors_view_all_appointments.sql`
- `supabase/migrations/026_create_pharmacy_table.sql`
- `supabase/migrations/027_create_signed_form.sql`
- `supabase/migrations/028_encounters_doctors_view_by_id.sql`
- `supabase/migrations/029_category_product_presales.sql`
- `supabase/migrations/030_category_product_rls.sql`
- `supabase/migrations/031_products_select_rls.sql`
- `supabase/migrations/032_products_pre_sales_policies.sql`
- `supabase/migrations/033_memr_workflow_scope.sql`
- `supabase/migrations/034_encounters_ensure_patient_id.sql`
- `supabase/migrations/035_encounter_risk_storage.sql`
- `supabase/migrations/036_forms_and_signed_forms.sql`

## tests

- `__tests__/lib/roles.test.ts`
- `__tests__/lib/validation.test.ts`

## Workspace-Local Agent Files

- `.cursor/debug-856db6.log`

## Knowledge Base Files (This Folder)

- `Cursor/KnowledgeBase/README.md`
- `Cursor/KnowledgeBase/SYSTEM_CONTEXT.md`
- `Cursor/KnowledgeBase/API_SURFACE.md`
- `Cursor/KnowledgeBase/DATABASE_MIGRATIONS.md`
- `Cursor/KnowledgeBase/FILE_MANIFEST.md`
