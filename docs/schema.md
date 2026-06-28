| table_schema | table_name   | column_name                   | data_type                   | is_nullable |
| ------------ | ------------ | ----------------------------- | --------------------------- | ----------- |
| public       | ai_soapnotes | id                            | bigint                      | NO          |
| public       | ai_soapnotes | appointment_id                | bigint                      | NO          |
| public       | ai_soapnotes | subjective_text               | text                        | NO          |
| public       | ai_soapnotes | objective_text                | text                        | NO          |
| public       | ai_soapnotes | assessment_text               | text                        | NO          |
| public       | ai_soapnotes | plan_text                     | text                        | YES         |
| public       | ai_soapnotes | created_at                    | timestamp with time zone    | YES         |
| public       | ai_soapnotes | updated_at                    | timestamp with time zone    | YES         |
| public       | appointments | id                            | bigint                      | NO          |
| public       | appointments | appointment_date              | date                        | YES         |
| public       | appointments | appointment_time              | time without time zone      | YES         |
| public       | appointments | created_at                    | timestamp with time zone    | YES         |
| public       | appointments | location_id                   | bigint                      | YES         |
| public       | appointments | patient_id                    | bigint                      | NO          |
| public       | appointments | service_id                    | bigint                      | NO          |
| public       | appointments | onsite_type                   | USER-DEFINED                | NO          |
| public       | appointments | appointment_code              | text                        | YES         |
| public       | encounters   | id                            | bigint                      | NO          |
| public       | encounters   | appointment_id                | bigint                      | NO          |
| public       | encounters   | patient_id                    | bigint                      | NO          |
| public       | encounters   | intake_id                     | bigint                      | YES         |
| public       | encounters   | status                        | USER-DEFINED                | NO          |
| public       | encounters   | encounter_code                | text                        | YES         |
| public       | encounters   | created_at                    | timestamp with time zone    | YES         |
| public       | encounters   | updated_at                    | timestamp with time zone    | YES         |
| public       | forms        | id                            | bigint                      | NO          |
| public       | forms        | name                          | text                        | NO          |
| public       | forms        | is_active                     | boolean                     | YES         |
| public       | forms        | created_at                    | timestamp with time zone    | YES         |
| public       | forms        | content                       | jsonb                       | YES         |
| public       | intake_form  | id                            | bigint                      | NO          |
| public       | intake_form  | appointment_id                | bigint                      | YES         |
| public       | intake_form  | chief_complaint               | character varying           | YES         |
| public       | intake_form  | location                      | character varying           | YES         |
| public       | intake_form  | severity                      | integer                     | YES         |
| public       | intake_form  | symptoms_description          | text                        | YES         |
| public       | intake_form  | medical_conditions            | json                        | YES         |
| public       | intake_form  | surgeries                     | json                        | YES         |
| public       | intake_form  | allergies                     | json                        | YES         |
| public       | intake_form  | current_medications           | json                        | YES         |
| public       | intake_form  | fh_diabetes                   | boolean                     | YES         |
| public       | intake_form  | fh_hypertension               | boolean                     | YES         |
| public       | intake_form  | fh_cancer                     | boolean                     | YES         |
| public       | intake_form  | fh_heart_disease              | boolean                     | YES         |
| public       | intake_form  | tobacco_use                   | boolean                     | YES         |
| public       | intake_form  | alcohol_use                   | boolean                     | YES         |
| public       | intake_form  | drug_use                      | boolean                     | YES         |
| public       | intake_form  | created_at                    | timestamp without time zone | YES         |
| public       | intake_form  | updated_at                    | timestamp without time zone | YES         |
| public       | intake_form  | onset                         | date                        | YES         |
| public       | intake_form  | relieving_factors             | json                        | YES         |
| public       | intake_form  | cancer_type                   | character varying           | YES         |
| public       | intake_form  | number_of_pregnancies         | integer                     | YES         |
| public       | intake_form  | birth_control                 | character varying           | YES         |
| public       | intake_form  | last_pap_smear_status         | USER-DEFINED                | YES         |
| public       | intake_form  | last_pap_smear_month_year     | character varying           | YES         |
| public       | intake_form  | mammography_status            | USER-DEFINED                | YES         |
| public       | intake_form  | mammography_month_year        | character varying           | YES         |
| public       | intake_form  | last_prostate_exam_status     | USER-DEFINED                | YES         |
| public       | intake_form  | last_prostate_exam_month_year | character varying           | YES         |
| public       | intake_form  | occupation                    | bigint                      | YES         |
| public       | locations    | id                            | bigint                      | NO          |
| public       | locations    | title                         | text                        | YES         |
| public       | locations    | address                       | text                        | YES         |
| public       | locations    | location_code                 | text                        | YES         |
| public       | locations    | created_at                    | timestamp with time zone    | YES         |
| public       | occupation   | id                            | bigint                      | NO          |
| public       | occupation   | name                          | text                        | NO          |
| public       | patients     | id                            | bigint                      | NO          |
| public       | patients     | location_id                   | bigint                      | YES         |
| public       | patients     | first_name                    | text                        | NO          |
| public       | patients     | last_name                     | text                        | NO          |
| public       | patients     | email                         | text                        | YES         |
| public       | patients     | phone                         | text                        | YES         |
| public       | patients     | gender                        | USER-DEFINED                | YES         |
| public       | patients     | date_of_birth                 | date                        | YES         |
| public       | patients     | zip_code                      | text                        | YES         |
| public       | patients     | state                         | text                        | YES         |
| public       | patients     | street_address                | text                        | YES         |
| public       | patients     | last_visit_at                 | timestamp with time zone    | YES         |
| public       | patients     | is_text_opt_in                | boolean                     | YES         |
| public       | patients     | is_check_opt_in               | boolean                     | YES         |
| public       | patients     | created_at                    | timestamp with time zone    | YES         |
| public       | patients     | patient_code                  | text                        | YES         |
| public       | services     | id                            | bigint                      | NO          |
| public       | services     | title_en                      | text                        | NO          |
| public       | services     | title_es                      | text                        | YES         |
| public       | services     | created_at                    | timestamp with time zone    | YES         |
| public       | signed_form  | id                            | bigint                      | NO          |
| public       | signed_form  | appointment_id                | bigint                      | NO          |
| public       | signed_form  | telemedicine_form_path        | text                        | YES         |
| public       | signed_form  | hipaacompliance_form_path     | text                        | YES         |
| public       | signed_form  | generalsurgery_form_path      | text                        | YES         |
| public       | symptoms     | id                            | bigint                      | NO          |
| public       | symptoms     | name                          | text                        | NO          |


| table_name   | column_name    | foreign_table_name | foreign_column_name |
| ------------ | -------------- | ------------------ | ------------------- |
| appointments | patient_id     | patients           | id                  |
| appointments | service_id     | services           | id                  |
| intake_form  | appointment_id | appointments       | id                  |
| encounters   | appointment_id | appointments       | id                  |
| encounters   | patient_id     | patients           | id                  |
| encounters   | intake_id      | intake_form        | id                  |
| signed_form  | appointment_id | appointments       | id                  |
| ai_soapnotes | appointment_id | appointments       | id                  |
| appointments | location_id    | locations          | id                  |
| patients     | location_id    | locations          | id                  |
| intake_form  | occupation     | occupation         | id                  |


| table_name   | column_name |
| ------------ | ----------- |
| locations    | id          |
| patients     | id          |
| services     | id          |
| appointments | id          |
| intake_form  | id          |
| encounters   | id          |
| signed_form  | id          |
| ai_soapnotes | id          |
| forms        | id          |
| occupation   | id          |
| symptoms     | id          |

| table_name   | column_name                   | data_type                   | is_nullable | constraint_type | references_table | references_column |
| ------------ | ----------------------------- | --------------------------- | ----------- | --------------- | ---------------- | ----------------- |
| ai_soapnotes | appointment_id                | bigint                      | NO          | FOREIGN KEY     | appointments     | id                |
| ai_soapnotes | assessment_text               | text                        | NO          | null            | null             | null              |
| ai_soapnotes | created_at                    | timestamp with time zone    | YES         | null            | null             | null              |
| ai_soapnotes | id                            | bigint                      | NO          | PRIMARY KEY     | ai_soapnotes     | id                |
| ai_soapnotes | objective_text                | text                        | NO          | null            | null             | null              |
| ai_soapnotes | plan_text                     | text                        | YES         | null            | null             | null              |
| ai_soapnotes | subjective_text               | text                        | NO          | null            | null             | null              |
| ai_soapnotes | updated_at                    | timestamp with time zone    | YES         | null            | null             | null              |
| appointments | appointment_code              | text                        | YES         | null            | null             | null              |
| appointments | appointment_date              | date                        | YES         | null            | null             | null              |
| appointments | appointment_time              | time without time zone      | YES         | null            | null             | null              |
| appointments | created_at                    | timestamp with time zone    | YES         | null            | null             | null              |
| appointments | id                            | bigint                      | NO          | PRIMARY KEY     | appointments     | id                |
| appointments | location_id                   | bigint                      | YES         | FOREIGN KEY     | locations        | id                |
| appointments | onsite_type                   | USER-DEFINED                | NO          | null            | null             | null              |
| appointments | patient_id                    | bigint                      | NO          | FOREIGN KEY     | patients         | id                |
| appointments | service_id                    | bigint                      | NO          | FOREIGN KEY     | services         | id                |
| encounters   | appointment_id                | bigint                      | NO          | FOREIGN KEY     | appointments     | id                |
| encounters   | created_at                    | timestamp with time zone    | YES         | null            | null             | null              |
| encounters   | encounter_code                | text                        | YES         | null            | null             | null              |
| encounters   | id                            | bigint                      | NO          | PRIMARY KEY     | encounters       | id                |
| encounters   | intake_id                     | bigint                      | YES         | FOREIGN KEY     | intake_form      | id                |
| encounters   | patient_id                    | bigint                      | NO          | FOREIGN KEY     | patients         | id                |
| encounters   | status                        | USER-DEFINED                | NO          | null            | null             | null              |
| encounters   | updated_at                    | timestamp with time zone    | YES         | null            | null             | null              |
| forms        | content                       | jsonb                       | YES         | null            | null             | null              |
| forms        | created_at                    | timestamp with time zone    | YES         | null            | null             | null              |
| forms        | id                            | bigint                      | NO          | PRIMARY KEY     | forms            | id                |
| forms        | is_active                     | boolean                     | YES         | null            | null             | null              |
| forms        | name                          | text                        | NO          | null            | null             | null              |
| intake_form  | alcohol_use                   | boolean                     | YES         | null            | null             | null              |
| intake_form  | allergies                     | json                        | YES         | null            | null             | null              |
| intake_form  | appointment_id                | bigint                      | YES         | FOREIGN KEY     | appointments     | id                |
| intake_form  | birth_control                 | character varying           | YES         | null            | null             | null              |
| intake_form  | cancer_type                   | character varying           | YES         | null            | null             | null              |
| intake_form  | chief_complaint               | character varying           | YES         | null            | null             | null              |
| intake_form  | created_at                    | timestamp without time zone | YES         | null            | null             | null              |
| intake_form  | current_medications           | json                        | YES         | null            | null             | null              |
| intake_form  | drug_use                      | boolean                     | YES         | null            | null             | null              |
| intake_form  | fh_cancer                     | boolean                     | YES         | null            | null             | null              |
| intake_form  | fh_diabetes                   | boolean                     | YES         | null            | null             | null              |
| intake_form  | fh_heart_disease              | boolean                     | YES         | null            | null             | null              |
| intake_form  | fh_hypertension               | boolean                     | YES         | null            | null             | null              |
| intake_form  | id                            | bigint                      | NO          | PRIMARY KEY     | intake_form      | id                |
| intake_form  | last_pap_smear_month_year     | character varying           | YES         | null            | null             | null              |
| intake_form  | last_pap_smear_status         | USER-DEFINED                | YES         | null            | null             | null              |
| intake_form  | last_prostate_exam_month_year | character varying           | YES         | null            | null             | null              |
| intake_form  | last_prostate_exam_status     | USER-DEFINED                | YES         | null            | null             | null              |
| intake_form  | location                      | character varying           | YES         | null            | null             | null              |
| intake_form  | mammography_month_year        | character varying           | YES         | null            | null             | null              |
| intake_form  | mammography_status            | USER-DEFINED                | YES         | null            | null             | null              |
| intake_form  | medical_conditions            | json                        | YES         | null            | null             | null              |
| intake_form  | number_of_pregnancies         | integer                     | YES         | null            | null             | null              |
| intake_form  | occupation                    | bigint                      | YES         | FOREIGN KEY     | occupation       | id                |
| intake_form  | onset                         | date                        | YES         | null            | null             | null              |
| intake_form  | relieving_factors             | json                        | YES         | null            | null             | null              |
| intake_form  | severity                      | integer                     | YES         | null            | null             | null              |
| intake_form  | surgeries                     | json                        | YES         | null            | null             | null              |
| intake_form  | symptoms_description          | text                        | YES         | null            | null             | null              |
| intake_form  | tobacco_use                   | boolean                     | YES         | null            | null             | null              |
| intake_form  | updated_at                    | timestamp without time zone | YES         | null            | null             | null              |
| locations    | address                       | text                        | YES         | null            | null             | null              |
| locations    | created_at                    | timestamp with time zone    | YES         | null            | null             | null              |
| locations    | id                            | bigint                      | NO          | PRIMARY KEY     | locations        | id                |
| locations    | location_code                 | text                        | YES         | null            | null             | null              |
| locations    | title                         | text                        | YES         | null            | null             | null              |
| occupation   | id                            | bigint                      | NO          | PRIMARY KEY     | occupation       | id                |
| occupation   | name                          | text                        | NO          | null            | null             | null              |
| patients     | created_at                    | timestamp with time zone    | YES         | null            | null             | null              |
| patients     | date_of_birth                 | date                        | YES         | null            | null             | null              |
| patients     | email                         | text                        | YES         | null            | null             | null              |
| patients     | first_name                    | text                        | NO          | null            | null             | null              |
| patients     | gender                        | USER-DEFINED                | YES         | null            | null             | null              |
| patients     | id                            | bigint                      | NO          | PRIMARY KEY     | patients         | id                |
| patients     | is_check_opt_in               | boolean                     | YES         | null            | null             | null              |
| patients     | is_text_opt_in                | boolean                     | YES         | null            | null             | null              |
| patients     | last_name                     | text                        | NO          | null            | null             | null              |
| patients     | last_visit_at                 | timestamp with time zone    | YES         | null            | null             | null              |
| patients     | location_id                   | bigint                      | YES         | FOREIGN KEY     | locations        | id                |
| patients     | patient_code                  | text                        | YES         | null            | null             | null              |
| patients     | phone                         | text                        | YES         | null            | null             | null              |
| patients     | state                         | text                        | YES         | null            | null             | null              |
| patients     | street_address                | text                        | YES         | null            | null             | null              |
| patients     | zip_code                      | text                        | YES         | null            | null             | null              |
| services     | created_at                    | timestamp with time zone    | YES         | null            | null             | null              |
| services     | id                            | bigint                      | NO          | PRIMARY KEY     | services         | id                |
| services     | title_en                      | text                        | NO          | null            | null             | null              |
| services     | title_es                      | text                        | YES         | null            | null             | null              |
| signed_form  | appointment_id                | bigint                      | NO          | UNIQUE          | signed_form      | appointment_id    |
| signed_form  | appointment_id                | bigint                      | NO          | FOREIGN KEY     | appointments     | id                |
| signed_form  | generalsurgery_form_path      | text                        | YES         | null            | null             | null              |
| signed_form  | hipaacompliance_form_path     | text                        | YES         | null            | null             | null              |
| signed_form  | id                            | bigint                      | NO          | PRIMARY KEY     | signed_form      | id                |
| signed_form  | telemedicine_form_path        | text                        | YES         | null            | null             | null              |
| symptoms     | id                            | bigint                      | NO          | PRIMARY KEY     | symptoms         | id                |
| symptoms     | name                          | text                        | NO          | UNIQUE          | symptoms         | name              |