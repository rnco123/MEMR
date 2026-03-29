# Hybrid Telemedicine EMR Workflow - Implementation Status

**Excluded from MEMR (other products):** unified QR/public intake portal, payment gateway/checkout, presales POS.

## STAGE 1: DIGITAL CHECK-IN — improved

### Implemented:
- ✅ Intake form (chief complaint, history, meds, allergies) — `intake_form`
- ✅ Basic appointment/encounter flow
- ✅ **Rooming & compliance panel** on encounter detail — identity / location / MA supervision / ready-for-doctor timestamps, pharmacy selection, consent acknowledgments (JSON), MA exam findings (`EncounterRoomingPanel`, `/api/encounters/[id]/rooming`)
- ✅ **Pre-visit summary** on telemedicine sidebar — rule-based summary from intake (`PreVisitSummary`)

### Missing / partial:
- ❌ OTP identity verification (optional product)
- ❌ AI document autofill from PDF/image
- ❌ Dedicated “check-in only” MA board (flowboard + encounter modal used instead)

## STAGE 2: ROOMING — improved

### Implemented:
- ✅ Vitals, Daily.co, encounter status
- ✅ **Rooming attestations** (DB + UI): `identity_verified_at`, `prescribing_location_ack_at`, `ma_supervision_ack_at`, `ready_for_doctor_at`, `pharmacy_id` on encounter

### Missing / partial:
- ❌ Push notification to doctor when “ready” (can add later)
- ❌ Separate enum value `ready_for_doctor` — **timestamp `ready_for_doctor_at` used** instead

## STAGE 3: TELEMEDICINE CONSULT — improved

### Implemented:
- ✅ Video, intake, AI SOAP, doctor SOAP, consultation end
- ✅ **Pre-visit summary** card (structured from intake)

### Missing:
- ❌ Automated differential / ICD-10 / drug–drug (not in scope of this app layer)

## STAGE 4: ORDERS EXECUTION — implemented (MVP)

### Implemented:
- ✅ **`encounter_orders`** table — lab_draw, injection, immunization, poc_test, referral, other
- ✅ **`/dashboard/orders`** — list, filter, log order by encounter, MA status (start/done)
- ✅ **API:** `GET/POST /api/encounters/[id]/orders`, `PATCH /api/orders/[orderId]`

## STAGE 5: CHECKOUT / PAYMENT GATE — excluded

Payment, receipts, pay-to-release Rx handled **outside MEMR** per product split.

### Optional in MEMR later:
- Encounter lock strictly after payment — **not enforced** (no payment here)

## STAGE 6: POST-VISIT MONITORING — implemented (MVP)

### Implemented:
- ✅ **`post_visit_tasks`** — follow-up, lab review, Rx review, escalation, callback
- ✅ **`/dashboard/follow-ups`** — create tasks, status updates
- ✅ **API:** `GET/POST /api/post-visit-tasks`, `PATCH /api/post-visit-tasks/[taskId]`

### Missing (future):
- ❌ Automated lab/Rx polling, SMS/email reminders (integrate when backend ready)

## E-PRESCRIBE / PRESCRIPTIONS — implemented (MVP)

- ✅ **`prescriptions`** table — `prescriber_doctor_id`, `patient_id`, optional **`encounter_id`**, `external_rx_id` for future network sync
- ✅ **`/dashboard/prescriptions`** (doctors only) — list + manual entry
- ✅ **API:** `GET/POST /api/prescriptions`
- ✅ **RLS:** prescribers see **only their own** rows

---

## Overall completion (MEMR-only scope): **~70%** functional MVP

Apply migration: `supabase/migrations/033_memr_workflow_scope.sql`

## Database (new in 033)

| Table | Purpose |
|-------|---------|
| `prescriptions` | Doctor prescriptions; optional link to encounter |
| `encounter_orders` | Clinical orders per encounter |
| `post_visit_tasks` | Post-visit follow-up tasks |

**`encounters` columns added:** rooming timestamps, `ma_exam_findings`, `consent_ack` jsonb, `pharmacy_id` (if missing)
