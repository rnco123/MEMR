# Browser-Side Supabase Query Audit

**Date:** 2026-06-28  
**Scope:** Direct Supabase queries from the browser via `@/lib/supabase/client` (`createBrowserClient`). Excludes `/api/*` routes and server-side `@/lib/supabase/server` usage.

**Protection model:** RLS on the publishable/anon key is the primary gate for all client queries. None of these reads go through server-side `assertEncounterAccess` / `guardPatientAccess`.

---

## Summary

| Category | Count |
|----------|-------|
| Files importing browser client | 17 |
| Files with table queries (`.from(...)`) | 9 (+ `lib/status-timeline.ts` helper) |
| Sensitive-table `.select('*')` sites | ~20 |
| Unbounded list queries | 6 patterns |
| Realtime channels | 6 (1 wide-open on admin ticket list) |
| Existing API routes duplicated by client reads | 7+ |

---

## Files with auth/realtime only (no table queries)

| File | Browser Supabase usage |
|------|------------------------|
| `lib/auth-context.tsx` | `auth.getSession`, `onAuthStateChange`, `signUp`/`signOut` only |
| `lib/user-profile-context.tsx` | `auth.onAuthStateChange`; profile from `/api/me/profile` |
| `app/(dashboard)/dashboard/patients-history/page.tsx` | **Unused** `createClient()` — all data from `/api/clinical/patients-history` |
| `components/EncounterConsentFormsTab.tsx` | `auth.getSession` → `/api/encounters/[id]/consent-forms` |
| `app/test-soap-complete/page.tsx` | `auth.getSession` → `/api/soap/complete-soap` + `/api/encounters/[id]/ai-soapnote` |
| `components/Chat.tsx` | Realtime + `/api/chat/*` for data |
| `app/(dashboard)/dashboard/support/page.tsx` | Realtime + `/api/support/tickets` for data |
| `app/(admin)/admin/support/page.tsx` | Realtime + `/api/support/tickets` for data |

---

## Full inventory

### `components/PatientFileView.tsx`

| Line | Table | Select | Limit/pagination | Extra filtering | Duplicate API/context |
|------|-------|--------|------------------|-----------------|----------------------|
| 246 | `patients` | `*, locations(...)` | `.single()` | `.eq('id', patientId)` | No `GET /api/patients/[id]` |
| 305 | `appointments` | `id` | None | `.eq('patient_id', patientId)` | Re-implements chain used in 445, 513 |
| 325 | `encounters` | `id, appointment_id` | None | `.in('appointment_id', …)` | Encounters tab uses `/api/patients/[id]/encounters` (273) |
| 347 | `intake_form` | `*` | None | `.in('appointment_id', …)` | No patient-history API |
| 361 | `vitals` | `*` | None | `.in('encounter_id', …)` | No API |
| 445 | `appointments` | `id` | None | `.eq('patient_id', …)` | Duplicate of 305 |
| 463 | `encounters` | specific cols | `.limit(1)` | `.in(...)`, `.not('pharmacy_id', 'is', null)` | — |
| 483 | `pharmacy` | `*` | `.maybeSingle()` | `.eq('id', …)` | — |
| 513 | `appointments` | `id` | None | `.eq('patient_id', …)` | Duplicate of 305 |
| 533 | `intake_form` | `current_medications, …` | None | `.in('appointment_id', …)` | — |

Documents/forms/encounters list correctly use `/api/patients/...` and `/api/encounters/...`.

---

### `components/EncounterDetailModal.tsx`

| Line | Table | Select | Limit | Extra filtering | Duplicate API |
|------|-------|--------|-------|-----------------|---------------|
| 255 | `appointments` | nested `patients`, `services` | `.single()` | `.eq('id', appointmentId)` | Overlaps `/api/encounters/[id]/patient-info` |
| 285 | `encounters` | `*` | `.single()` | `.eq('id', encounterId)` | — |
| 294 | `pharmacy` | specific cols | **None** | `.or('is_active…')` | No registry list API |
| 306, 315 | `intake_form` | `*` | `.maybeSingle()` | by `intake_id` / `appointment_id` | — |
| 328–331 | — | — | — | Vitals via **`/api/encounters/[id]/vitals`** | Partial migration |
| 348, 358 | `ai_soapnotes` | `*` | `.limit(1)` | by `encounter_id` / `appointment_id` | `/api/encounters/[id]/ai-soapnote` |
| 382 | `pharmacy` | `*` | `.maybeSingle()` | `.eq('id', …)` | — |
| 417 | `pharmacy` | specific cols | **None** | active filter | Same registry fetch again |
| 427, 952, 968 | `encounters` | `*` | `.single()` | `.eq('id', …)` | — |
| 435 | `pharmacy` | `*` | `.maybeSingle()` | `.eq('id', …)` | — |

---

### `components/FinalReviewModal.tsx`

| Line | Table | Select | Limit | Extra filtering | Duplicate API |
|------|-------|--------|-------|-----------------|---------------|
| 299 | `patients` | `*` | `.single()` | `.eq('id', patientId)` | `/api/encounters/[id]/patient-info` |
| 300 | `encounters` | `*` | `.single()` | `.eq('id', encounterId)` | — |
| 324, 332 | `intake_form` | `*` | `.maybeSingle()` | by id / appointment | — |
| 342 | — | — | — | Vitals via `/api/encounters/[id]/vitals` | — |
| 344 | `ai_soapnotes` | `*` | `.limit(1)` | `.eq('encounter_id', …)` | `/api/encounters/[id]/ai-soapnote` |
| 350 | `pre_sales` | specific cols | None | `.eq('encounter_id', …)` | — |
| 359 | `pharmacy` | `*` | `.maybeSingle()` | `.eq('id', …)` | — |
| 379 | `products` | specific cols | None | `.in('product_id', …)` | `/api/mcm/catalog` (fallback at 387+) |
| 415 | `prescriptions` | `*` | None | `.eq('encounter_id', …)` | `GET /api/encounters/[id]/prescriptions` |

**Writes (client):** 631 `pre_sales` insert, 697 `prescriptions` insert, 801 `encounters` update, 813–818 `status_timeline` via helper.

---

### `app/video/page.tsx`

| Line | Table | Select | Limit | Extra filtering | Duplicate API |
|------|-------|--------|-------|-----------------|---------------|
| 445 | `encounters` | `*` | `.single()` | `.eq('id', …)` | — |
| 460 | `appointments` | specific cols | `.maybeSingle()` | `.eq('id', …)` | — |
| 479 | `patients` | `*` | `.maybeSingle()` | `.eq('id', …)` | patient-info API |
| 493, 501 | `intake_form` | specific cols | `.maybeSingle()` | scoped | Good column pruning |
| 509 | — | — | — | Vitals via `/api/encounters/[id]/vitals` | — |
| 517, 526, 537 | `ai_soapnotes` | SOAP cols only | `.limit(1)` | scoped | `/api/encounters/[id]/ai-soapnote` |
| 549 | `doctors` | `id` | `.maybeSingle()` | `.eq('user_id', authUser.id)` | — |
| 556 | `doctor_soapnotes` | SOAP cols | `.maybeSingle()` | `.eq('encounter_id', …)` | `/api/encounters/[id]/doctor-soap` |
| 579 | `profiles` | `full_name` | `.maybeSingle()` | `.eq('uid', authUser.id)` | `useUserProfile()` / `/api/me/profile` |
| 608 | `encounters` | `status` | `.maybeSingle()` | poll by id | — |

**Writes:** 1029/1063 `doctor_soapnotes` upsert, 1074 `encounters` update, 1084–1089 `status_timeline`.

---

### `app/(dashboard)/dashboard/page.tsx`

| Line | Table | Select | Limit | Extra filtering | Duplicate API |
|------|-------|--------|-------|-----------------|---------------|
| 134 | `doctors` | `id` | `.single()` | `.eq('user_id', user.id)` | — |
| 146 | `encounters` | `id, appointment_id, status` | **None** | `.eq('doctor_id', …)` | Subset of `/api/clinical/flowboard` |
| 160 | `appointments` | specific cols | `.limit(5)` | `.in('id', …)`, date filter | — |
| 175 | `patients` | `first_name, last_name` | None | `.in('id', patientIds)` | — |
| 204 | `encounters` | update | — | `.eq('id', …)` | Could use encounter complete/rooming APIs |

---

### `app/(dashboard)/dashboard/flowboard/page.tsx`

| Line | Table | Select | Limit | Extra filtering | Duplicate API |
|------|-------|--------|-------|-----------------|---------------|
| 155, 691 | `encounters` | `id, status` | `.maybeSingle()` | `.eq('appointment_id', …)` | List from `/api/clinical/flowboard` (182) already includes encounters |

---

### `app/(dashboard)/dashboard/nurse-flowboard/page.tsx`

| Line | Table | Select | Limit | Extra filtering | Duplicate API |
|------|-------|--------|-------|-----------------|---------------|
| 177 | `doctors` | specific cols | **None** | `.order('full_name')` | `GET /api/doctors/availability` (location-scoped) |
| 195 | `doctor_availability` | `doctor_id, is_available` | None | `.in('doctor_id', …)` | Same API |
| 226 | — | — | — | List via `/api/clinical/flowboard` | — |
| 406 | `appointments` | `patient_id` | `.maybeSingle()` | `.eq('id', …)` | — |
| 420 | `appointments` | update | — | `.eq('id', …)` | Batch path uses `/api/nurse/batch-assign-provider` |
| 431, 452, 464 | `encounters` | read/insert/update | `.maybeSingle()` / `.single()` | by appointment | Single-assign bypasses batch API |
| 484–489 | `profiles` + `status_timeline` | via `getProfileId` / insert | — | current user | — |

---

### `app/(dashboard)/dashboard/orders/page.tsx`

| Line | Table | Select | Limit | Extra filtering | Duplicate API |
|------|-------|--------|-------|-----------------|---------------|
| 42 | `encounter_orders` | specific + `patients` join | `.limit(200)` | status filter in JS | No global orders API; create uses `/api/encounters/[id]/orders` |

---

### `components/VitalsFormModal.tsx`

| Line | Table | Op | Limit | Extra filtering | Duplicate API |
|------|-------|-----|-------|-----------------|---------------|
| 169 | `encounters` | select `id` | `.single()` | `.eq('id', …)` | — |
| 197 | `vitals` | **insert** | — | — | `POST /api/encounters/[id]/vitals` exists |
| 224 | `encounters` | **update** status | — | `.eq('id', …)` | rooming/vitals API |
| 237–242 | `profiles` + `status_timeline` | via helpers | — | current user | — |

---

### `lib/status-timeline.ts` (called from browser)

| Line | Table | Select | Limit | Scoped | Duplicate |
|------|-------|--------|-------|--------|-----------|
| 28–47 | `profiles` | `id` / `uid` | `.maybeSingle()` | `.eq('id'/'uid', authUserId)` | Profile id could come from `useUserProfile()` |
| 72 | `status_timeline` | **insert** | — | encounter + profile | Server routes do this too |

**Call sites:** `VitalsFormModal`, `nurse-flowboard`, `video/page`, `FinalReviewModal`.

---

## Realtime subscriptions

| File | Line | Table | Filter | User-scoped? |
|------|------|-------|--------|--------------|
| `components/Chat.tsx` | 392–400 | `messages` | `conversation_id=eq.{selectedConversation.id}` | Per-conversation ✓ |
| `app/(dashboard)/dashboard/support/page.tsx` | 92–96 | `support_ticket_messages` | `ticket_id=eq.{activeTicket.id}` | Per-ticket ✓ |
| same | 107–111 | `support_tickets` | `id=eq.{activeTicket.id}` | Per-ticket ✓ |
| `app/(admin)/admin/support/page.tsx` | 87–91 | `support_ticket_messages` | `ticket_id=eq.{activeTicket.id}` | Per-ticket ✓ |
| same | 102–106 | `support_tickets` | `id=eq.{activeTicket.id}` | Per-ticket ✓ |
| same | **119–123** | `support_tickets` | **None (all events `*`)** | **Wide open** — relies on Realtime + RLS |

---

## Anti-pattern flags

### `.select('*')` on sensitive tables (browser)

| Location | Tables |
|----------|--------|
| `PatientFileView.tsx:246` | `patients` |
| `PatientFileView.tsx:347` | `intake_form` |
| `PatientFileView.tsx:361` | `vitals` |
| `EncounterDetailModal.tsx:285, 306, 315, 348, 358, 427, 952, 968` | `encounters`, `intake_form`, `ai_soapnotes` |
| `FinalReviewModal.tsx:299–300, 324, 332, 344, 415` | `patients`, `encounters`, `intake_form`, `ai_soapnotes`, `prescriptions` |
| `app/video/page.tsx:445, 479` | `encounters`, `patients` |

`doctor_soapnotes` and `profiles` in the video page use column lists, not `*`.

### Unbounded reads (no `.limit()` / pagination)

| Location | Risk |
|----------|------|
| `PatientFileView` history chain (305→361) | All appointments → all encounters → all intake forms + vitals |
| `EncounterDetailModal` pharmacy registry (294, 417) | Entire `pharmacy` table (RLS: authenticated can view all) |
| `nurse-flowboard` (177, 195) | All doctors + availability rows |
| `dashboard/page.tsx` (146) | All encounters for a doctor |
| `orders/page.tsx` (42) | Cap 200 only — no cursor pagination |

### `profiles` / `patients` without user/location scoping

| Location | Verdict |
|----------|---------|
| `video/page.tsx:579` | `profiles` — scoped `.eq('uid', authUser.id)` ✓ |
| `lib/status-timeline.ts:28–47` | `profiles` — scoped to current auth user ✓ |
| All `patients` queries | Scoped by `patientId` prop — relies on RLS (`Doctors can view all patients`) |

No unscoped `.from('patients')` or `.from('profiles')` list queries found.

### Redundant round trips vs context/API

| Location | Redundancy |
|----------|------------|
| `video/page.tsx:579` | `profiles.full_name` vs `useUserProfile()` |
| `getProfileId()` (4 call sites) | Re-queries `profiles` on every status change |
| `EncounterDetailModal` / `FinalReviewModal` / `video` | Duplicate of `/api/encounters/[id]/doctor-soap`, `/ai-soapnote`, `/patient-info`, `/vitals` |
| `PatientFileView` history tab | Re-fetches appointments/encounters client-side; encounters tab uses API |
| `flowboard` (155, 691) | Re-queries `encounters` by `appointment_id` though flowboard API has encounter data |
| `patients-history/page.tsx` | Dead `createClient` import |

---

## Prioritized findings

### Critical — data exposure risk

1. **`EncounterDetailModal`, `FinalReviewModal`, `video/page`, `PatientFileView`** — multiple `.select('*')` on `patients`, `encounters`, `intake_form`, and `ai_soapnotes`. Full rows visible in DevTools; RLS only. Highest concentration: `EncounterDetailModal` and `FinalReviewModal`.

2. **`PatientFileView` medical-history tab (347, 361)** — unbounded `intake_form` + `vitals` for every appointment of a long-tenure patient.

3. **`EncounterDetailModal` pharmacy registry (294, 417)** — unfiltered read of active pharmacies. Migration `026`: **"Authenticated users can view pharmacy"**.

4. **Client-side clinical writes** (`video` doctor SOAP upsert, `VitalsFormModal`, `nurse-flowboard` mutations, `FinalReviewModal` prescriptions/pre_sales) — authorization/audit bypass if RLS misconfigured.

5. **Admin support Realtime (`admin/support/page.tsx:119–123`)** — all `support_tickets` events, no row filter.

### High — performance

1. **`PatientFileView`** — triple duplicate appointment fetch; unbounded intake + vitals history.
2. **`nurse-flowboard` doctors + availability (177, 195)** — full-table read; `/api/doctors/availability` is location-scoped.
3. **`EncounterDetailModal`** — full pharmacy registry on every modal open.
4. **`dashboard/page.tsx:146`** — all doctor encounters unbounded before slicing to 5 upcoming.
5. **`orders/page.tsx`** — 200-row cap without pagination.

### Medium — redundancy / architecture drift

1. Partial API migration — vitals use API; SOAP/patient/encounter still hit Supabase directly beside existing routes.
2. `video/page.tsx:579` — redundant `profiles` fetch vs `useUserProfile()`.
3. `getProfileId()` — repeated `profiles` lookup.
4. `flowboard` encounter lookup (155, 691) — duplicate of flowboard API payload.
5. `nurse-flowboard` single assign — client writes; batch uses `/api/nurse/batch-assign-provider`.
6. `patients-history/page.tsx` — unused Supabase client import.

---

## Recommended direction

1. Route encounter/patient bundles through existing guarded API routes (`/api/encounters/[id]/patient-info`, `/ai-soapnote`, `/doctor-soap`, `/vitals`, `/prescriptions`).
2. Replace `select('*')` with explicit column lists on sensitive tables.
3. Add limits on history/registry queries.
4. Move remaining writes (vitals, SOAP, nurse assign) behind API handlers using `assertEncounterAccess` / `guardPatientAccess`.
5. Remove dead `createClient()` import from `patients-history/page.tsx`.
