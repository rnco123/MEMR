# External Supabase Setup

This project now supports connecting a second Supabase project for table read/write operations (without using external auth).

## 1) Environment Variables

Add these to `.env`:

- `EXTERNAL_SUPABASE_URL`
- `EXTERNAL_SUPABASE_PUBLISHABLE_KEY`
- `EXTERNAL_SUPABASE_SECRET_KEY`

Optional:

- `EXTERNAL_SUPABASE_ALLOWED_TABLES` (comma-separated table allowlist)
- Legacy keys:
  - `EXTERNAL_SUPABASE_ANON_KEY`
  - `EXTERNAL_SUPABASE_SERVICE_ROLE_KEY`

## 2) Available Helpers

- Server privileged client:
  - `lib/supabase/external-admin.ts` -> `createExternalAdminClient()`
- Browser client (publishable key):
  - `lib/supabase/external-client.ts` -> `createExternalClient()`
- Key helpers:
  - `lib/supabase/external-keys.ts`

## 3) Generic API Proxy

Endpoint:

- `POST /api/external-supabase`

Auth:

- Requires current app authenticated user.
- Uses external project secret key server-side.

### Read Example

```json
{
  "mode": "read",
  "table": "patients",
  "columns": "*",
  "filters": [{ "column": "id", "value": 1018 }],
  "limit": 50,
  "orderBy": { "column": "created_at", "ascending": false }
}
```

### Write Examples

Insert:

```json
{
  "mode": "write",
  "table": "patients",
  "action": "insert",
  "payload": { "id": 1018, "first_name": "Resky", "last_name": "Meera" }
}
```

Update:

```json
{
  "mode": "write",
  "table": "patients",
  "action": "update",
  "payload": { "phone": "+1231232312" },
  "match": [{ "column": "id", "value": 1018 }]
}
```

Delete:

```json
{
  "mode": "write",
  "table": "patients",
  "action": "delete",
  "match": [{ "column": "id", "value": 1018 }]
}
```

## Security Notes

- Do not expose `EXTERNAL_SUPABASE_SECRET_KEY` to client code.
- Prefer setting `EXTERNAL_SUPABASE_ALLOWED_TABLES` to a strict list.
- If you use the browser external client, enforce strict RLS policies on the external project.
