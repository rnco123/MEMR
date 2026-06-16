# MEMR Security & PWA Remediation — Handoff

**Assessment source:** Static application security review (June 13, 2026)  
**App-layer status:** Complete (June 2026)  
**Database status:** Deferred — deal with later  
**Detailed task checklist:** `Pentesting tasks.md` (original spec)

---

## Executive summary

All **application-layer** pentesting remediations and **mobile/PWA** work are done. Automated tests pass and production build succeeds.

**Only remaining work is database-level:** apply migration `079`, then design/apply broader PHI RLS (H-06) and storage policies (H-07). Nothing else is blocking deploy from an app-code perspective.

| Layer | Status |
|-------|--------|
| API routes & auth guards | Done |
| Config / env hardening | Done |
| PWA + mobile adaptive UX | Done |
| Jest security tests | Done (84 tests) |
| `next build` | Passes |
| Supabase migrations (RLS / storage) | **Not applied — deferred** |

---

## Verification (last run)

```bash
npx tsc --noEmit
npx jest --no-coverage
npx next build
```

- **84** Jest tests passing  
- Typecheck clean  
- Production build clean  

Security tests live in `__tests__/security/`.

---

## Environment variables

Update production (and local `.env`) before/after deploy:

| Variable | Required | Notes |
|----------|----------|-------|
| `DAILY_API_KEY` | **Yes (prod)** | Server-only. Replaces `NEXT_PUBLIC_DAILY_API_KEY`. |
| `NEXT_PUBLIC_DAILY_DOMAIN` | Yes | Unchanged. |
| `ADMIN_SIGNUP_PIN` | Yes | Unchanged. |
| `EXTERNAL_SUPABASE_ALLOWED_TABLES` | Recommended | Comma-separated allowlist for **`/api/external-supabase` proxy only**. **Empty = deny all.** See table list below. |
| `EXTERNAL_SUPABASE_ALLOW_WRITE` | Optional | Default **off**. Only affects the **admin proxy** — not MCM sync routes (those use service role directly). |
| `EXTERNAL_SUPABASE_COLUMNS_<table>` | Optional | Per-table column allowlist for proxy, e.g. `EXTERNAL_SUPABASE_COLUMNS_products=product_id,product_name,category_id` |

See `.env.example` for copy-paste values.

**Action:** Remove or stop relying on `NEXT_PUBLIC_DAILY_API_KEY` in production. `lib/config.ts` now expects `DAILY_API_KEY`.

---

## External Supabase — tables in use

The secondary project (MCM / legacy Clinica San Miguel) is accessed in **two ways**:

| Access path | Gated by `ALLOWED_TABLES` / `ALLOW_WRITE`? |
|-------------|---------------------------------------------|
| **`POST /api/external-supabase`** (admin-only generic proxy) | **Yes** |
| **Server routes** using `createExternalAdminClient()` directly | **No** — uses `EXTERNAL_SUPABASE_SECRET_KEY` service role |

So **`EXTERNAL_SUPABASE_ALLOW_WRITE` only matters for the admin proxy**. MCM sync, pre-sales, catalog, and location sync write via dedicated API routes regardless of that flag.

### Recommended `EXTERNAL_SUPABASE_ALLOWED_TABLES`

All tables the app touches on the external project (read and/or write):

```env
EXTERNAL_SUPABASE_ALLOWED_TABLES=categories,category_memr,products,product_memr,encounter,pre_sales,Appoinments,allpatients,intake_form,tenants,Locations
```

> **Case-sensitive:** MCM legacy tables use `Appoinments` and `Locations` (PascalCase). Include both spellings if your external DB has them.

### Table inventory (by feature)

| Table | Access | Used by | Notes |
|-------|--------|---------|-------|
| `categories` | **Read** | `GET /api/mcm/catalog`, Final Review AI | Primary MCM catalog |
| `category_memr` | **Read** | Same (fallback) | If `categories` missing |
| `products` | **Read** | Same | Primary product catalog |
| `product_memr` | **Read** | Same (fallback) | If `products` missing |
| `encounter` | **Read + Write** | `mcm-sync`, `mcm-presales` | MCM encounter row (singular name) |
| `pre_sales` | **Write (insert)** | `POST …/mcm-presales` | Final Review product lines |
| `Appoinments` | **Read + Write** | `POST …/mcm-sync` | Legacy typo in MCM schema |
| `allpatients` | **Read + Write** | `POST …/mcm-sync` | MCM patient records |
| `intake_form` | **Read + Write** | `POST …/mcm-sync` | Intake copied to MCM |
| `tenants` | **Write (upsert)** | Admin location sync | `lib/locations/external-sync.ts` |
| `Locations` | **Write (insert/update)** | Admin location sync | Legacy PascalCase location table |

### Read-only vs write (for proxy config)

If you enable **`EXTERNAL_SUPABASE_ALLOW_WRITE=true`** on the admin proxy, these are the tables that **actually receive writes** in production flows:

| Write needed | Tables |
|--------------|--------|
| **MCM clinical sync** | `encounter`, `Appoinments`, `allpatients`, `intake_form`, `pre_sales` |
| **Admin location sync** | `tenants`, `Locations` |
| **Read only** | `categories`, `category_memr`, `products`, `product_memr` |

**Recommended proxy settings:**

```env
# Allow admin proxy to read all external tables the app uses
EXTERNAL_SUPABASE_ALLOWED_TABLES=categories,category_memr,products,product_memr,encounter,pre_sales,Appoinments,allpatients,intake_form,tenants,Locations

# Leave OFF unless admins use POST /api/external-supabase for manual writes
EXTERNAL_SUPABASE_ALLOW_WRITE=false
```

MCM sync and location sync **keep working** with `ALLOW_WRITE=false` because they bypass the proxy.

### Optional column allowlists (proxy read hardening)

Example — restrict catalog reads to display fields only:

```env
EXTERNAL_SUPABASE_COLUMNS_categories=category_id,category_name
EXTERNAL_SUPABASE_COLUMNS_products=product_id,product_name,category_id,archived
EXTERNAL_SUPABASE_COLUMNS_encounter=id,appointment_id,intake_id
EXTERNAL_SUPABASE_COLUMNS_pre_sales=id,encounter_id,product_id,product_quantity,status
```

---

## Completed — application layer

### Critical & high (API)

| ID | Item | Key files / behavior |
|----|------|----------------------|
| C-01 | Signup role restriction | `lib/validation.ts`, `app/api/signup/route.ts` — roles `doctor\|nurse` only; minimal response |
| C-02 | External Supabase proxy | `app/api/external-supabase/route.ts`, `lib/supabase/external-keys.ts` — admin-only, deny-by-default tables, writes gated, column allowlists |
| H-01 | Encounter IDOR | `lib/encounters/assert-access.ts`, `lib/encounters/guard.ts` — all encounter API routes guarded |
| H-02 | Patient documents | `app/api/patients/[id]/documents/**` — auth + `guardPatientAccess` |
| H-03 | Role trust | `lib/admin-auth.ts`, `middleware.ts` — profiles.role first; metadata removed from doctor availability POST |
| H-04 | Chat sync-profiles | `app/api/chat/sync-profiles/route.ts` — admin-only |
| H-05 | complete-soap | `app/api/soap/complete-soap/route.ts` — getUser, role, encounter access |
| H-08 | Post-visit & orders | `app/api/post-visit-tasks/**`, `app/api/orders/[orderId]/route.ts`, encounter orders — location scope + guards; `ordered_by_doctor_id` from session |
| H-10 | Daily API key | Server-only `DAILY_API_KEY`; not required in client bundle |
| H-11 | OpenAI test route | Auth required; blocked in prod middleware |
| H-12b | Audit API validation | `app/api/audit/route.ts` — enum validation for action/resource_type |

### Medium & low

| ID | Item | Key files |
|----|------|-----------|
| M-02 | Admin middleware | `/admin` → admin role only in `middleware.ts` |
| M-04 | getSession → getUser | API routes + `lib/encounters/auth-from-request.ts` |
| M-05 | Search injection | `sanitizePatientSearchTerm` on admin/clinical search routes |
| M-07 | Nurse search | Removed cross-location OR in nurse patient search |
| M-08 | Login rate limit | 5 attempts / 15 min per IP |
| L-02 | Health endpoint | Minimal JSON in production |
| L-03 | Doctor availability GET | `app/api/doctors/availability/route.ts` — self / same-location / admin |
| L-04 | Daily room | `app/api/daily/room/route.ts` — `encounterId` required; `guardEncounterAccess` |

### Access guard pattern

After auth, before data access:

```typescript
import { guardEncounterAccess, guardPatientAccess } from '@/lib/encounters/guard'

await guardEncounterAccess(user.id, encounterId)
await guardPatientAccess(user.id, patientId)
```

Rules (non-admin):

- Encounter/patient must resolve to a **location in the user's scope**
- **Null location → denied**
- **Doctors** must be assigned to the encounter (when applicable)

### PWA & mobile

| Item | Location |
|------|----------|
| Web manifest | `public/manifest.webmanifest` |
| Service worker (PHI-safe caching) | `public/sw.js` |
| SW registration | `components/pwa/ServiceWorkerRegister.tsx` |
| Install prompt (Android + iOS hint) | `components/pwa/InstallPromptBanner.tsx` |
| Offline page | `app/offline/page.tsx` |
| Mobile breakpoint | `lg` (1024px) via `useIsMobile()` |

Desktop UX unchanged; mobile adaptations at phone/tablet breakpoints only.

---

## Deferred — database only

Do **not** apply until you are ready to test clinical flows against RLS. App code is written assuming service-role/admin paths still work for admin APIs; direct browser Supabase client access is what RLS will lock down.

### Step 1 — Ready migration (apply first)

**File:** `supabase/migrations/079_security_audit_tenant_location_rls.sql`

| Task | What it does |
|------|--------------|
| **H-12a** | Audit log INSERT: `WITH CHECK (user_id = auth.uid())` — blocks forged audit rows |
| **H-09** | Enables RLS on `locations` and `tenants`; admin full access; clinical read scoped to assigned locations |

**How to apply (when ready):**

```bash
# Local
supabase db push
# or
supabase migration up

# Remote — via Supabase CLI linked to project, or paste SQL in Dashboard → SQL Editor
```

**After apply — smoke test:**

- [ ] Legitimate `POST /api/audit` still creates rows (user_id matches session)
- [ ] Admin can manage locations via `/api/admin/locations`
- [ ] Nurse/doctor can read own assigned locations (flowboard, profile scope)
- [ ] Direct client insert to `audit_logs` with wrong `user_id` fails (RLS)

---

### Step 2 — H-06 PHI table RLS (not yet written)

Scope direct Supabase client access by location/tenant. Requires new migration(s).

**Tables to scope (from pentest spec):**

- `patients` — SELECT/UPDATE by location
- `encounters`, `appointments` — by location
- `patient_documents`, `vitals`, transcripts, SOAP tables
- `prescriptions`, `encounter_orders`, `post_visit_tasks`
- Immigration / I-693 tables

**Helper pattern (already used in app):**

- Join `user_locations` and staff `location_id` (`doctors`, `nurses`)
- Reuse or mirror `user_assigned_location_ids()` from migration 079

**Tests (when DB exists):** `__tests__/security/rls-location-scope.test.ts` (planned in `Pentesting tasks.md`)

---

### Step 3 — H-07 Storage bucket isolation (not yet written)

Align storage policies with location scope.

**Buckets / paths:**

- `patient-documents` — path prefix must match patient/location scope
- `signed_forms` — review `036_forms_and_signed_forms.sql` policies

**Tests (when DB exists):** `__tests__/security/storage-policies.test.ts` (planned)

---

## Post-DB manual verification

From `Pentesting tasks.md` — run after migrations:

| Check | Test |
|-------|------|
| V-06 | Nurse JWT cannot `select` patients at another location |
| V-07 | Storage: cannot fetch object for other-location patient |
| V-08 | Audit log spoof via direct client insert fails |

Also re-run full smoke as doctor, nurse, and admin on staging:

- Flowboard load
- Encounter detail / SOAP save
- Patient document upload/download
- Telemedicine room join (in-scope encounter)
- I-693 upload (if used)

---

## Reference files

| Purpose | Path |
|---------|------|
| Original task spec | `Pentesting tasks.md` |
| Encounter access logic | `lib/encounters/assert-access.ts` |
| Route guard wrappers | `lib/encounters/guard.ts` |
| Location scoping | `lib/locations/scope.ts` |
| Production config | `lib/config.ts` |
| Pending DB migration | `supabase/migrations/079_security_audit_tenant_location_rls.sql` |
| Security tests | `__tests__/security/` |

---

## Notes for later DB sprint

1. Apply **079 first** on staging; validate admin + clinical flows before production.
2. H-06 is large — consider one migration per table group (patients → encounters → documents → clinical artifacts).
3. Walk-in encounters with **null location** are intentionally denied at the API layer for non-admins; RLS design should align with that.
4. Admin APIs use service role and should remain unaffected by clinical RLS policies.
5. Do not commit `.env` — rotate keys if ever exposed.

---

*App remediation complete. Database work tracked above — pick up when ready.*
