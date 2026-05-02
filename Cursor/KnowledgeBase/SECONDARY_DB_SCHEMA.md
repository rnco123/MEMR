# Secondary DB Schema (User-Provided)

This document stores the secondary Supabase schema provided by the user for future integrations.

## Tables

| table_schema | table_name |
| ------------ | ---------- |
| auth | audit_log_entries |
| auth | custom_oauth_providers |
| auth | flow_state |
| auth | identities |
| auth | instances |
| auth | mfa_amr_claims |
| auth | mfa_challenges |
| auth | mfa_factors |
| auth | oauth_authorizations |
| auth | oauth_client_states |
| auth | oauth_clients |
| auth | oauth_consents |
| auth | one_time_tokens |
| auth | refresh_tokens |
| auth | saml_providers |
| auth | saml_relay_states |
| auth | schema_migrations |
| auth | sessions |
| auth | sso_domains |
| auth | sso_providers |
| auth | users |
| auth | webauthn_challenges |
| auth | webauthn_credentials |
| cron | job |
| cron | job_run_details |
| extensions | pg_stat_statements |
| extensions | pg_stat_statements_info |
| net | _http_response |
| net | http_request_queue |
| pgsodium | decrypted_key |
| pgsodium | key |
| pgsodium | mask_columns |
| pgsodium | masking_rule |
| pgsodium | valid_key |
| public | About_Short |
| public | About_Short_es |
| public | Appoinments |
| public | Blog |
| public | FAQs |
| public | FAQs_es |
| public | Hero_Section |
| public | Hero_Section_es |
| public | Images |
| public | Locations |
| public | Mission |
| public | Mission_es |
| public | Newsletter |
| public | Qr |
| public | Rooms |
| public | Specials |
| public | Testinomial |
| public | Tickers |
| public | Tickers_es |
| public | Transcripts |
| public | about |
| public | about_es |
| public | ai_soapnotes |
| public | allpatients |
| public | allservices |
| public | allservices_es |
| public | bonus |
| public | bonus_config_history |
| public | call_logs |
| public | canned_responses |
| public | career |
| public | career_es |
| public | categories |
| public | clinics |
| public | credit_audit |
| public | discounts |
| public | doctor_soap_notes |
| public | doctors |
| public | email_log |
| public | email_replies |
| public | email_templates |
| public | emr_patient_detail |
| public | emr_profile |
| public | encounter |
| public | faqs |
| public | features |
| public | features_es |
| public | feedback |
| public | forms |
| public | fulfillment_requests |
| public | individual_bonus |
| public | intake_form |
| public | interactions |
| public | inventory |
| public | inventory_testing |
| public | loginid |
| public | meeting |
| public | notifications_settings |
| public | nurse |
| public | nursing_documentation |
| public | orders |
| public | patients |
| public | permissions |
| public | pharmacy |
| public | pk_caregiver |
| public | pk_emergency_contact |

## Integration Notes

- Preferred read test table: `public.categories`
- Secondary fallback read test table: `public.category` (if present in future)
- External connection in this project is configured through:
  - `EXTERNAL_SUPABASE_URL`
  - `EXTERNAL_SUPABASE_PUBLISHABLE_KEY`
  - `EXTERNAL_SUPABASE_SECRET_KEY`
