# Final Review — Transcript suggestions test script

English spoken dialogue for validating telemedicine transcript → Final Review suggestions end-to-end.

**Cast:** Doctor = you; Patient = colleague or second device.

Speak lines clearly so Daily transcription picks them up (~3 minutes).

---

## Opening

- **Doctor:** Good morning, I am Dr. Smith. What brings you in today?
- **Patient:** I have had a sore throat and fever for three days.

## Vitals / exam (optional filler)

- **Doctor:** Any trouble breathing or chest pain?
- **Patient:** No, just the throat and fever.

## Labs / tests → Pre-Sales tab

- **Doctor:** I am ordering a rapid strep test and a complete metabolic panel, CMP, today.
- **Doctor:** We will also do a flu A and B swab in the clinic.

## Injection → Pre-Sales tab

- **Doctor:** You need a vitamin B12 injection today, one thousand micrograms intramuscular.

## Medications → Pharmacy tab

- **Doctor:** I am prescribing amoxicillin five hundred milligrams, one capsule by mouth three times daily for seven days.
- **Doctor:** Take ibuprofen four hundred milligrams every six hours as needed for pain, with food.

## Follow-up → Followup tab

- **Doctor:** Please come back in two weeks to recheck your blood pressure and review the lab results.
- **Doctor:** If your fever is over one hundred and three or you have trouble swallowing, go to the ER.

## Close

- **Doctor:** Any questions? We will send the prescription to your pharmacy. Goodbye.
- **Patient:** Thank you, doctor.

---

## Expected suggestions (after end call + Final Review open)

| Spoken item | Expected tab |
|-------------|----------------|
| Rapid strep, CMP, flu A/B | Pre-Sales (if MCM catalog has matching product names) |
| Vitamin B12 injection | Pre-Sales |
| Amoxicillin 500 mg … 7 days | Pharmacy |
| Ibuprofen 400 mg PRN | Pharmacy |
| Return in two weeks | Followup date ~14 days out |

## Prerequisites

- `OPENAI_API_KEY` set in environment
- Encounter has transcript rows (end video call as nurse/doctor so flush runs)
- MCM catalog (`EXTERNAL_SUPABASE_URL`) contains products close to: Rapid Strep, CMP, Flu, B12 (or note unmatched in UI)
- Encounter has `pharmacy_id` and assigned doctor before saving Rx

## Test steps

1. Start telemedicine visit for a test encounter; read script aloud.
2. End call → confirm transcript saved (nurse flowboard or doctor flowboard).
3. Open **Final Review** → wait for “Transcript suggestions” panel (spinner OK, 10–30s).
4. Tab 2 (Pre-Sales): review suggestions → **Apply** → verify list grows → **Next** (persists if MCM copied).
5. Tab 3 (Pharmacy): **Apply** meds → edit if AI missed strength → **Next**.
6. Tab 4 (Followup): **Apply** follow-up → confirm date offset ~14 days; note banner that follow-up is not saved to DB.
7. Tab 5: **Complete Final Review**.
8. Optional: **Refresh from transcript** on any tab with suggestions to regenerate (`force=true`).

## Checklist

- [ ] Transcript saved to `telemedicine_transcripts`
- [ ] `encounters.transcript_summary_json` populated after end call
- [ ] `encounters.final_review_suggestions_json` populated after Final Review open
- [ ] Apply appends (does not replace) pre-sales and Rx lines
- [ ] Unmatched tests/meds shown when catalog names do not align
