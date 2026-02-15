# Supabase Realtime Setup for Doctor Availability

## Enable Realtime for `doctor_availability` Table

To enable realtime updates for the `doctor_availability` table, follow these steps:

### Step 1: Enable Realtime in Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to **Database** → **Replication**
3. Find the `doctor_availability` table in the list
4. Toggle the switch to enable replication for this table
5. Click **Save**

### Step 2: Verify Realtime is Enabled

You can verify realtime is enabled by:
- Checking the **Replication** tab shows `doctor_availability` as enabled
- The table should show a green indicator or checkmark

### Step 3: Test Realtime Updates

Once enabled:
- When a doctor toggles their availability, nurses will see the update immediately
- No page refresh needed
- The available doctors list updates in real-time

## How It Works

The nurse flowboard page subscribes to realtime changes on the `doctor_availability` table:
- Listens for INSERT, UPDATE, and DELETE events
- Filters for doctors with `is_available = true`
- Automatically refreshes the available doctors list when changes occur

## Notes

- Realtime subscriptions work automatically once enabled in Supabase
- The code is already set up to handle realtime updates
- No additional configuration needed after enabling replication
