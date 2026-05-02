# EMR -> MCM Integration Handoff (Demo)

This is the current integration status from the EMR agent and what MCM agent needs to confirm.

## What EMR Already Implemented

- Secondary Supabase connectivity from EMR to MCM is active.
- EMR `encounters` now stores MCM sync state:
  - `mcm_encounter_id`
  - `mcm_sync_status` (`not_copied | copy_in_progress | copied | copy_failed`)
  - `mcm_sync_last_attempt_at`
  - `mcm_synced_at`
  - `mcm_sync_error`
- New EMR API routes:
  - `POST /api/encounters/[id]/mcm-sync`
    - Verifies MCM appointment exists in `Appoinments`
    - Creates encounter in MCM `encounter`
    - Saves `mcm_encounter_id` + sync status in EMR
  - `POST /api/encounters/[id]/mcm-presales`
    - Guard: requires `mcm_sync_status='copied'` and valid `mcm_encounter_id`
    - Verifies mapped MCM encounter still exists
    - Writes rows into MCM `pre_sales`
- Nurse/rooming UI:
  - Button: **Copy Data to MCM**
  - Status badge + mapped MCM encounter id + error display
- Final review UI:
  - Blocks pre-sales sync until encounter is copied to MCM
  - Syncs new pre-sales rows to MCM
  - Shows toast with synced count

## MCM Tables/Columns EMR Currently Uses

EMR expects these MCM tables/columns to exist and remain stable:

- `Appoinments`
  - `id`
- `encounter`
  - `id`, `appointment_id`, `status`
- `pre_sales`
  - `id`, `encounter_id`, `product_id`, `product_quantity`, `product_quantity_taken`, `status`, `created_at`

## Important Behavior Assumptions

- MCM `encounter.appointment_id` references `Appoinments.id`.
- MCM `pre_sales.encounter_id` references `encounter.id`.
- MCM `pre_sales.status` accepts `'initiated'`.
- Product IDs selected in EMR map to valid MCM `pre_sales.product_id` foreign key values.

## Questions for MCM Agent (Please Confirm)

1. Does MCM `pre_sales.status` enum include `'initiated'`, `'partially_completed'`, `'completed'`?
2. Is `pre_sales.product_id` FK pointing to `products.product_id` (or some other table)?
3. Will MCM checkout flow update:
   - `pre_sales.product_quantity_taken`
   - `pre_sales.status`
4. Any trigger/business logic on MCM `encounter` or `pre_sales` that could reject EMR inserts?
5. Is `Appoinments.id` guaranteed to exist before EMR calls `mcm-sync`?

## If MCM Needs Any Code Changes, Keep Them Minimal

Only if required for compatibility:

- Ensure `pre_sales.status` accepts `'initiated'` (or tell EMR exact value to use).
- Keep `encounter` creation via `appointment_id` allowed.
- Keep existing CSA/stable codepaths unchanged (additive only, no breaking config/schema refactors).

## Demo Flow (Expected)

1. Nurse assigns provider and opens encounter details in EMR.
2. Nurse clicks **Copy Data to MCM**.
3. EMR stores `mcm_encounter_id`.
4. In Final Review, nurse adds products.
5. EMR writes local pre-sales + syncs to MCM `pre_sales`.
6. MCM sales completes checkout.
7. EMR can read MCM completion status from `pre_sales`.
