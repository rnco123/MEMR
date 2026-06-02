# I-693 Mapping Priority — Phase 6

Generated from `reports/i693-coverage-report.md` and `reports/i693-registry-audit.json` (2026-06-01).

## Executive answer: is 109/432 “poor”?

**No — if measured against all widget instances.**  
**Yes — if measured against clinically meaningful, exportable data.**

| Metric | Count | Notes |
| ------ | ----: | ----- |
| Total widget annotations | 446 | Includes 14 PDF417 barcode fields |
| Non-barcode widgets | 432 | Effective fillable surface |
| Currently mapped (export) | 109 | 25% of widget instances |
| Unmapped widget instances | 323 | 75% of instances |
| **Realistic meaningful target** | **~175–210** | After exclusions below |
| **Stretch target (full vax grid)** | **~240–280** | Requires vaccination table schema |

Header mirrors (`Pt1Line1a_FamilyName`, `Pt1Line1b_GivenName`, `Pt1Line1c_MiddleName`, `Pt1Line3e_AlienNumber` on pages 2–14) are **not** in the unmapped list because they share short names with Part 1 fields already in `WIDGET_TEXT_TO_KEY`. MuPDF export fills **every** widget instance when the short name matches — mirror instances are covered by export without extra bindings. PDF.js registry intentionally binds page-1 only.

---

## Current coverage baseline

| Type | PDF total | Mapped | Missing |
| ---- | --------: | -----: | ------: |
| text | 289 | 101 | 188 |
| checkbox | 138 | 6 | 132 |
| radio | 0 | 0 | 0 |
| dropdown | 5 | 2 | 3 |

Mapped today: applicant Part 1, contact, interpreter, preparer (partial), civil surgeon core (Part 7), limited TB/STI text, summary finding checkboxes.

---

## Unmapped widgets by section (323 instances)

| Section | Widget instances | Unique short names | Primary disposition |
| ------- | ---------------: | -----------------: | ------------------- |
| Vaccination table (Part 13) | 130 | 118 | **mapped** (needs table schema) |
| Civil surgeon (Parts 6–7, 9–11) | 64 | 30 | **mapped** + read-only signatures |
| TB screening (Part 8A) | 39 | 21 | **mapped** + checkbox groups |
| Syphilis / STI (Part 8B–C) | 31 | 24 | **mapped** + checkbox groups |
| Other medical findings (8D–5) | 23 | 14 | **mapped** (remarks / narrative) |
| Additional information (Part 11) | 16 | 16 | **ignored** or low priority |
| Signatures | 5 | 5 | **read-only** |
| Applicant demographics | 3 | 1 | **derived** (unit type) |
| Preparer / interpreter gaps | 3 | 3 | **mapped** |
| Miscellaneous | 9 | 4 | case-by-case |

---

## Section recommendations

### 1. Applicant demographics (3 unmapped)

| Widget | Recommendation | Rationale |
| ------ | -------------- | --------- |
| `Pt1Line2_Unit[0..2]` (APT/STE/FLR) | **derived** | Map from `applicant.apt` text or new `applicant.unit_type` enum; 3 checkboxes are mutually exclusive |

**Semantic bindings (proposed):**

```ts
// WIDGET_CHECKBOX_BINDINGS
{ widget: 'Pt1Line2_Unit', index: 0, key: 'applicant.unit_type', when: 'apt' }
{ widget: 'Pt1Line2_Unit', index: 1, key: 'applicant.unit_type', when: 'ste' }
{ widget: 'Pt1Line2_Unit', index: 2, key: 'applicant.unit_type', when: 'flr' }
```

Requires `applicant.unit_type` in `I693FormData` (or parse from apt field).

---

### 2. Signatures (5 unmapped)

| Widget | Recommendation |
| ------ | -------------- |
| `Pt2Line6_ApplicantSignature` | **read-only** |
| `Pt3Line7_Signature` | **read-only** |
| `Pt4Line8_Signature` | **read-only** |
| `Pt7Line7_CivilSurgeonSignature` | **read-only** |
| `Pt9Line3_Signature` | **read-only** |

Ink signatures are not in MEMR JSON today. Do not map to text export unless capturing signature images later.

---

### 3. Interpreter (1 unmapped)

| Widget | Recommendation | Internal key |
| ------ | -------------- | ------------ |
| `Pt3Line_NameOfLanguage` | **mapped** | `interpreter.language` (new field) |

---

### 4. Preparer (2 unmapped)

| Widget | Recommendation | Internal key |
| ------ | -------------- | ------------ |
| `Pt5Line1_ApplicantFormOfID` | **mapped** | `applicant_contact.id_document_type` (new) |
| `Pt5Line2_IDNumber` | **mapped** | `applicant_contact.id_document_number` (new) |

---

### 5. Vaccination table (130 unmapped) — **Priority 1**

USCIS Part 13 is a fixed grid: DT/Td, MMR, Hib, Hep B, Varicella, Pneumo, Influenza, etc., each with date received (×4), date given, contra, insufficient, not-age, complete series.

| Pattern | Count (approx) | Recommendation |
| ------- | -------------- | -------------- |
| `Pt10Line*_DateReceived*` | ~48 | **mapped** via `vaccinations[]` or new `vaccination_grid` |
| `Pt10Line*_DateGiven*` | ~12 | **mapped** |
| `Pt10Line*_ContraCheckBox*` | ~13 | **mapped** (boolean per vaccine row) |
| `Pt10Line*_InsufficientCheckBox*` | ~13 | **mapped** |
| `Pt10Line*_NotAge*` | ~12 | **mapped** |
| `Pt10Line*_CompleteSeries` | ~8 | **mapped** |
| `P10_VaccineCheckBox` / `P9_TDVaccineCheckBox` | ~6 | **mapped** (vaccine administered flag) |
| `P10_Results` (page 13) | 3 | **mapped** → `civil_surgeon.vaccinations_complete` or results enum |

**Do not** map 130 widgets as 130 independent string keys. Use a **generated** row model:

```ts
type I693VaccineRowKey =
  | 'dt' | 'td' | 'mmr' | 'hib' | 'hep_b' | 'varicella' | 'pneumo' | 'influenza' | 'meningococcal' | ...

type I693VaccinationGridRow = {
  vaccine: I693VaccineRowKey
  dates_received: [string, string, string, string]
  date_given: string
  complete_series: string
  not_medically_appropriate: boolean
  insufficient_time: boolean
  contraindication: boolean
  not_age_appropriate: boolean
}
```

**High-value semantic bindings (first wave — dates only, ~24 widgets):**

| Short name | Internal key | Notes |
| ---------- | ------------ | ----- |
| `Pt10Line1_DTDateReceived1` | `vaccination_grid.dt.dates_received[0]` | |
| `Pt10Line2_TdDateReceived1` | `vaccination_grid.td.dates_received[0]` | |
| `Pt10Line6_HBDateReceived1` | `vaccination_grid.hep_b.dates_received[0]` | |
| `Pt10Line1_DTDateGiven` | `vaccination_grid.dt.date_given` | |
| `P10_Results[0..2]` | `civil_surgeon.vaccination_result` | enum: complete / incomplete / waived |

Keep existing `vaccinations: I693VaccinationRow[]` for free-text rows; grid fills USCIS table.

---

### 6. TB screening (39 unmapped) — **Priority 2**

| Widget group | Recommendation | Internal key |
| ------------ | -------------- | ------------ |
| `Pt8Line1A7_Remarks` | **mapped** | `tb_screening.remarks` |
| `Pt8Line1A3_XrayTakenDate` | **mapped** | `tb_screening.chest_xray_date` (new) |
| `Pt8Line1A3_XrayReadDate` | **mapped** | `tb_screening.chest_xray_read_date` (new) |
| `Pt8Line1A1_TSDate` / `QFDate` | **mapped** | already partially mapped; dedupe |
| `Pt8Line1A6_TBClassification[0..6]` | **mapped** | `tb_screening.classification` → checkbox index |
| `Pt8Line1A1_Result`, `InitialScreening`, `Results` | **mapped** | extend `tb_screening` enums |
| `Pt8Line1A3_*` (Infiltrate, Hilar, …) | **derived** | from structured TB impression or **ignored** if narrative-only |
| `Pt8Line1A_GammarRelease` | **mapped** | `tb_screening.gamma_release` (new boolean) |
| `Pt8Line1A4_SputumSmearsCultures` | **mapped** | `tb_screening.sputum` enum |

**Checkbox bindings (TB classification — example):**

```ts
{ widget: 'Pt8Line1A6_TBClassification', index: 0, key: 'tb_screening.classification', when: 'no_class' }
{ widget: 'Pt8Line1A6_TBClassification', index: 1, key: 'tb_screening.classification', when: 'class_b_ltb' }
// ... map all 7 indices per USCIS edition export values (verify against PDF exportValue)
```

---

### 7. Syphilis / STI (31 unmapped) — **Priority 3**

| Widget | Recommendation | Internal key |
| ------ | -------------- | ------------ |
| `Pt8Line1B1b_DateNontrepoemaltest` | **mapped** | `syphilis_sti.syphilis_date` |
| `Pt8Line1B1c_DateNontreponemalTest` | **mapped** | `syphilis_sti.syphilis_date` (dedupe) |
| `Pt8Line1B1c_SyphilisScreen[0/1]` | **mapped** | `syphilis_sti.syphilis_result` reactive/non-reactive |
| `Pt8Line1B1d_TreponemalReactiveNon` | **mapped** | treponemal result |
| `Pt8Line1B3_Remarks` | **mapped** | `syphilis_sti.remarks` |
| `Pt8Line1B3_Drug/Dosage/startDate/endDate` | **mapped** | `syphilis_sti.treatment` (new object) |
| `Pt8Line1C1a_name`, dates, `Pt8Line1C1c` | **mapped** | `syphilis_sti.gonorrhea_*` |
| `Pt7Line1B1d_name` (×18) | **ignored** or **generated** | repeat rows in PDF layout; fill from single lab name |

---

### 8. Civil surgeon sections (64 unmapped) — **Priority 1**

| Widget | Recommendation | Internal key |
| ------ | -------------- | ------------ |
| `Pt6Line3_DateofExam1/2/3` | **mapped** | `civil_surgeon.exam_dates[]` or map exam1 → `date_signed` |
| `Pt7Line4_StreetNumberName` … `ZipCode` | **mapped** | duplicate practice location → same `civil_surgeon.*` or `civil_surgeon.mailing_*` |
| `Pt7Line4_State` | **mapped** | `civil_surgeon.state` (dropdown) |
| `Pt7Line6_MobilePhone` | **mapped** | `civil_surgeon.mobile_phone` (new) |
| `Pt7Line7_CivilSurgeonSignature` | **read-only** | |
| `Pt9Line*` (Part 9 reviewer block) | **mapped** | new `health_department` section or **ignored** if unused |
| `Pt8Line5*` (referral block) | **mapped** | `tb_screening.referral` (new) |

**High-value text bindings:**

```ts
Pt7Line4_StreetNumberName: { key: 'civil_surgeon.street' }  // second address block — confirm PDF intent
Pt7Line4_CityOrTown: { key: 'civil_surgeon.city' }
Pt7Line4_ZipCode: { key: 'civil_surgeon.zip' }
Pt7Line6_MobilePhone: { key: 'civil_surgeon.phone' }  // or mobile_phone slot
Pt6Line3_DateofExam1: { key: 'civil_surgeon.date_signed', format: 'date' }
```

---

### 9. Medical findings — physical/mental, drug, other (23 unmapped) — **Priority 2**

| Widget | Recommendation | Internal key |
| ------ | -------------- | ------------ |
| `Pt8Line2A_Disorders[0..4]` | **mapped** | `physical_mental.class_a` / `class_b` checkboxes |
| `Pt8Line2B_Remarks` | **mapped** | `physical_mental.remarks` |
| `Pt8Line3A_Findings` | **mapped** | `drug_abuse.class_a` / `class_b` |
| `Pt8Line3B_Remarks` | **mapped** | `drug_abuse.remarks` |
| `Pt8Line4_ListOtherMedConditions` | **mapped** | `other_conditions.conditions` |
| `Pt8Line1D1_Findings` | **mapped** | other STI / exam findings |

---

### 10. Additional information pages (16 unmapped)

| Widget | Recommendation |
| ------ | -------------- |
| `Pt11Line*_PageNumber/PartNumber/ItemNumber/AdditionalInfo` | **ignored** unless building Part 11 overflow UI |

Low clinical value for automated export from current `I693FormData`.

---

### 11. Administrative / USCIS-only (14 ignored today)

| Widget | Recommendation |
| ------ | -------------- |
| `PDF417BarCode2` (×14 pages) | **ignored** — USCIS machine-readable; never user-edited |

---

## Priority table

| Priority | Widget Count | Section | Reason |
| -------- | -----------: | ------- | ------ |
| P0 | 14 | Administrative / barcode | Already ignored; keep out of coverage denominator |
| P1 | 130 | Vaccination table | Largest gap; core civil surgeon deliverable; needs grid schema not flat strings |
| P1 | 64 | Civil surgeon | Missing exam dates, secondary address, mobile, Part 9 blocks; aligns with `civil_surgeon` in DB |
| P2 | 39 | TB screening | High clinical value; many checkboxes need `exportValue` → enum mapping |
| P2 | 31 | Syphilis / STI | Results + dates + treatment lines map to existing `syphilis_sti` |
| P2 | 23 | Medical findings (8D–5) | Maps to `physical_mental`, `drug_abuse`, `other_conditions` |
| P3 | 16 | Additional information | Optional overflow; no fields in form JSON today |
| P3 | 9 | Unit / misc checkboxes | Derived from apt/unit_type |
| P4 | 5 | Signatures | Read-only in digital workflow |
| P4 | 3 | Interpreter / preparer / ID | Small count; quick wins after P1–P2 |

---

## Realistic maximum coverage estimate

### Exclusions from “meaningful” denominator

| Category | Widget instances | Treatment |
| -------- | ---------------: | --------- |
| PDF417 barcode | 14 | **ignored** |
| Signatures | 5 | **read-only** |
| Additional info (Part 11) | 16 | **ignored** (until overflow UI exists) |
| Header mirrors (pages 2–14) | ~39 | **derived** — already filled on export via short-name map |
| **Adjusted meaningful denominator** | **~358** | 432 − 14 − 5 − 16 − 39 ≈ 358 (mirrors may overlap mapped set) |

Note: Mirror instances are often **already counted in the 109 mapped** because they share `Pt1Line1a_FamilyName` etc. The export loop fills them without appearing in “unmapped.”

### Projected coverage after phased mapping

| Phase | New mapped instances (est.) | Cumulative mapped | % of 432 | % of ~358 meaningful |
| ----- | --------------------------: | ----------------: | -------: | -------------------: |
| Current | — | 109 | 25% | 30% |
| P1 civil surgeon text/dropdown | +15 | 124 | 29% | 35% |
| P2 TB + STI text + key checkboxes | +35 | 159 | 37% | 44% |
| P3 medical findings checkboxes | +20 | 179 | 41% | 50% |
| P1 vaccination grid (dates + flags) | +80 | 259 | 60% | 72% |
| P2 vaccination grid (full) | +40 | 299 | 69% | 83% |
| **Realistic target** | | **~175–210** | **41–49%** | **49–59%** |
| **Stretch (full vax + all TB/STI boxes)** | | **~240–280** | **56–65%** | **67–78%** |

### Conclusion

- **109/432 is not a failure** for Part 1–2 and civil surgeon header data; it is a **widget-instance** metric inflated by vaccination grid repetition and TB checkbox lattices.
- The **true meaningful export target is ~175–210 mapped instances** (~50% of actionable widgets) without building a full Part 11 overflow or signature capture.
- **150–200 unique semantic fields** is the right planning number — not 432.
- Pursuing **280+** requires full vaccination grid modeling and exhaustive checkbox `exportValue` tables.

---

## High-value semantic bindings (implementation-ready)

See `reports/i693-semantic-bindings-proposed.json` for machine-readable bindings to add in Phase 7.

Summary of immediate adds to `pdf-widget-map.ts` (no schema change):

| Short name | Type | Internal key | Notes |
| ---------- | ---- | ------------ | ----- |
| `Pt8Line1A7_Remarks` | text | `tb_screening.remarks` | |
| `Pt8Line1A3_XrayTakenDate` | text | `tb_screening.chest_xray` | date in remarks today |
| `Pt8Line1B1b_DateNontrepoemaltest` | text | `syphilis_sti.syphilis_date` | format date |
| `Pt8Line1B3_Remarks` | text | `syphilis_sti.remarks` | |
| `Pt8Line2B_Remarks` | text | `physical_mental.remarks` | |
| `Pt8Line3B_Remarks` | text | `drug_abuse.remarks` | |
| `Pt8Line4_ListOtherMedConditions` | text | `other_conditions.conditions` | |
| `Pt7Line4_CityOrTown` | text | `civil_surgeon.city` | verify PDF block |
| `Pt7Line4_ZipCode` | text | `civil_surgeon.zip` | |
| `Pt7Line6_MobilePhone` | text | `civil_surgeon.phone` | |
| `Pt7Line4_State` | dropdown | `civil_surgeon.state` | |
| `P10_Remarks` | text | `civil_surgeon.vaccination_remarks` | page 13 |

Checkbox groups require Phase 7 with verified PDF `exportValue` per index (run `scripts/debug-i693-widget-coords.mjs` or pdf.js annotation dump).

---

## Next steps (Phase 7)

1. Add `reports/i693-semantic-bindings-proposed.json` entries to `pdf-widget-map.ts` in priority order.
2. Extend `I693FormData` for `vaccination_grid`, `applicant.unit_type`, TB/STI enums.
3. Regenerate `pdf-field-registry.ts` via `npm run generate:i693-pdf-registry`.
4. Add checkbox `exportValue` verification script.
5. Re-run `npm run audit:i693-registry` and `npm run test:i693-export`.
