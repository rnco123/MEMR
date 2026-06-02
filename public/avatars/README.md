# Staff preset avatars

Six illustrated healthcare worker avatars (3 male, 3 female):

| ID | Role |
|----|------|
| `hw-male-doctor` | Male doctor |
| `hw-male-nurse` | Male nurse |
| `hw-male-medic` | Male paramedic |
| `hw-female-doctor` | Female doctor |
| `hw-female-nurse` | Female nurse |
| `hw-female-surgeon` | Female surgeon |

## Database

Run migration `059_staff_avatars.sql` (adds `profiles.avatar_id` and `staff-avatars` storage bucket).

## Upload to Supabase Storage

```bash
npm run seed:avatars
```

Requires `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.

Until seeded, the app serves these files from `/avatars/*.svg`.

## User selection

Staff choose an avatar under **My profile** (`/dashboard/profile` or `/admin/profile`).
The selected `avatar_id` is stored on `profiles`.
