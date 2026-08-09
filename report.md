# MEMR (MyclinicMD) — Full Repository Audit

**Last updated:** 2026-08-05
**Repo:** `e:\MEMR` · **Branch:** `resolve/pr-10-qa-merge` · **App:** Next.js 14 App Router EMR/telemedicine, Supabase, HIPAA-relevant PHI.
**Method:** static tracing across the full repo + 4 evidence-gathering agents; top findings personally re-verified against source. Automated checks (type-check, lint, jest, production build, `npm audit`) were **executed** — results in §8. Supabase DB not queried directly by me (a background agent ran staging advisors via MCP; flagged inline).

> This file is kept dated. Re-run the checks in §8 and bump **Last updated** whenever the report is refreshed.

---

## 1. Executive summary

| Metric | Score |
| --- | --- |
| Overall grade | **C− / D+** |
| Production-readiness | **~55%** |
| Security-readiness | **~40%** |
| Maintainability | **~72%** |
| Test-confidence | **~35%** |
| **Verdict** | **UNSAFE TO DEPLOY** until C-1 is fixed; then **NOT PRODUCTION READY** until the H-tier access-control, location-scope, and rate-limit fixes land |

**Basis.** The codebase is, in most places, genuinely well-built: no unauthenticated data endpoints across 113 API routes, disciplined *server-only* service-role usage, a real object-level authorization layer (`assert*Access`/`guard*Access`) used correctly in ~52 routes, strong production security headers/CSP, real (not mocked) integrations, and role always resolved from the `profiles` table (never `user_metadata`). It is **not** heavily "vibe-coded." Type-check, lint, and production build all pass cleanly.

**However**, one **confirmed CRITICAL** privilege-escalation — any authenticated user can promote themselves to global `admin` because the `profiles` UPDATE RLS policy restricts the *row* but not the *columns* — is disqualifying on its own. It sits on top of a coarse RLS model that provides **no DB-level location/tenant isolation**, so each of the several confirmed app-layer authorization gaps (H-2…H-6, M-2) is a full-database PHI exposure with no backstop. The security tests that actually run in CI are mostly source-string greps, so none of this is caught by automation.

---

## 1a. Remediation task board (P0–P4)

Canonical tracker. Each finding has a stable **Task ID** (`MEMR-NN`), a priority (P0 = fix immediately/deploy-blocking → P4 = polish), its finding code (from §3/§5), the primary file(s), and effort (S/M/L). Check the box when done. Detailed rationale for each is in §3, §5, §8, §10.

### P0 — Exploitable now, deploy-blocking (do first)
- [ ] **MEMR-01** · C-1 · Critical · Column-restrict `profiles` UPDATE (`REVOKE UPDATE(role,compliance_access,active)` + BEFORE UPDATE trigger `NEW.role=OLD.role`) · `supabase/migrations/011_…sql` + new migration · **S**
- [ ] **MEMR-02** · SEC · High · Add policies to `lab_orders`/`medication_orders`; `REVOKE EXECUTE` on `is_admin_user()` from `authenticated`; enable Auth leaked-password protection · Supabase (staging+prod) · **S**

### P1 — Confirmed access-control / PHI exposure (before production)
- [ ] **MEMR-03** · C-2 · High · Enforce request body-size limits inside upload handlers · `app/api/patients/[id]/documents`, `.../i693/supporting-documents`, `chat/messages` · **S–M**
- [ ] **MEMR-04** · H-2 · High · Add `assertEncounterAccess` + location scope to nurse/staff branch · `app/api/transcripts/save/route.ts` · **S**
- [ ] **MEMR-05** · H-3 · High · `guardEncounterAccess(...,WRITE)` before `pharmacy_id` reassign · `app/api/pharmacies/registry/route.ts` · **S**
- [ ] **MEMR-06** · H-4 · High · Add `getLocationScopeForUser` + patient-location filter · `app/api/clinical/orders/route.ts` · **S**
- [ ] **MEMR-07** · H-5 · High · Add location scoping to the list query · `app/api/i693/immigration-encounters/route.ts` · **S**
- [ ] **MEMR-08** · H-6 · High · Require `encounter_id` or call `assertPatientAccess` · `app/api/prescriptions/route.ts` · **S**
- [ ] **MEMR-09** · M-2 · Medium · Add `guardEncounterAccess` before ending room · `app/api/daily/end-room/route.ts` · **S**
- [ ] **MEMR-10** · H-7 · High · Add `active !== false` to shared auth helpers; shorten JWT TTL · `lib/auth/*`, `lib/admin-auth.ts`, `lib/nurse/require-nurse.ts` · **S**
- [ ] **MEMR-11** · H-1 · High · Consolidate onto one auth gate; delete/adopt dead `api-auth.ts` · `lib/security/api-auth.ts` + ~70 routes · **M**
- [ ] **MEMR-12** · Mig-130 · High · Commit + apply migration 130 (fixes broken DOB-partial search) · `supabase/migrations/130_patient_search_indexes.sql` · **S**

### P2 — Reliability & security hardening
- [ ] **MEMR-13** · Q-1 · Medium · Add `testPathIgnorePatterns: ['<rootDir>/e2e/']` so `npm test` is green · `jest.config.js` · **S**
- [ ] **MEMR-14** · M-1 · Medium · Shared-store rate limiting on OpenAI-backed + `me/password/verify` routes · `lib/rate-limit.ts` + routes · **M**
- [ ] **MEMR-15** · M-4 · Medium · Scope `chat/users` directory; stop leaking RLS policy names in errors · `app/api/chat/users/route.ts` · **S**
- [ ] **MEMR-16** · M-6 · Medium · `getUser()`-first; drop legacy `supabase.auth.token` cookie path · `lib/chat/auth.ts` · **S**
- [ ] **MEMR-17** · M-7 · Medium · Use `.eq()`-only email lookup in role resolution · `lib/fetch-user-role.ts:36-39` · **S**
- [ ] **MEMR-18** · M-5 · Medium · Remove `test_role`/`test_user` localStorage role override · `lib/auth-context.tsx:213-229,300-317` · **S**
- [ ] **MEMR-19** · INT-TO · Medium · Add `AbortSignal.timeout` (+retry where safe) to all outbound integrations · Daily/OpenAI/Resend/Smarty/Mapbox libs · **M**
- [ ] **MEMR-20** · TURN · Medium · Fail-closed option when `TURNSTILE_SECRET_KEY` unset · `lib/security/turnstile.ts:19-21` · **S**
- [ ] **MEMR-21** · DAILY-PUB · Medium · Set Daily rooms `privacy:'private'`; verify token join flow · `app/api/daily/room/route.ts:113-116` · **S** *(needs runtime verify)*
- [ ] **MEMR-22** · DAILY-KEY · Low · Remove `NEXT_PUBLIC_DAILY_API_KEY` fallback (client-bundle leak) · `lib/config.ts:38`, `app/api/daily/room/route.ts:38` · **S**
- [ ] **MEMR-23** · DEPS-RT · Medium · Bump runtime-reachable vuln deps: `next`, `ws`, `form-data`, `postcss`, `serialize-javascript`, `rollup` · `package.json` · **M**
- [ ] **MEMR-24** · M-3 · Low · Add encounter scoping to `clean-transcript` nurse branch · `app/api/clean-transcript/route.ts:56-106` · **S**

### P3 — Maintainability / hygiene
- [ ] **MEMR-25** · MIG-HYG · Medium · Resolve duplicate migration numbers (two `060_*`, two `082_*`) + establish single source of truth · `supabase/migrations/` · **M**
- [ ] **MEMR-26** · DEAD · Low · Delete empty route dirs (`debug/user-profile`, `test-redis`) + dead `/dashboard/orders`,`/dashboard/follow-ups` · `app/api`, `app/(dashboard)` · **S**
- [ ] **MEMR-27** · DOCS-CI · Low · Rewrite README (correct env names) + fix CI branch triggers to active branches · `README.md`, `.github/workflows/ci.yml` · **S**
- [ ] **MEMR-28** · ENV · Low · Fail-fast (or documented degrade) on missing critical env · `lib/config.ts` · **S**
- [ ] **MEMR-29** · HEALTH · Low · Wire the healthcheck into deploy + throttle the DB probe · `app/api/health/route.ts` · **S**
- [ ] **MEMR-30** · DEPS-BC · Low · Resolve build-chain vulns incl. critical `handlebars` · devDeps · **S**

### P4 — Polish / DX
- [ ] **MEMR-31** · LINT · Low · Clear lint warnings: `no-console` (`lib/i693/*`, `components/I693PdfFormEditor.tsx:263`), `exhaustive-deps`, 1 `jsx-a11y` · various · **S**
- [ ] **MEMR-32** · CSP · Low · Introduce a CSP nonce strategy to drop `'unsafe-inline'`/`'unsafe-eval'` where feasible · `next.config.js:92` · **M**
- [ ] **MEMR-33** · RESIDUE · Low · Remove refactor-residue dead fields (`parsing`/`error`/`searchParse`) · `lib/hooks/use-patient-search-parse.ts:31-37` · **S**

**Progress:** 0 / 33 complete · P0 0/2 · P1 0/10 · P2 0/12 · P3 0/6 · P4 0/3

---

## 2. System architecture map

- **Stack:** Next.js 14.2 (App Router, RSC + route handlers), React 18.2, TypeScript 5.9, Tailwind, Supabase (Postgres + RLS + Auth + Storage), Jest + Playwright, Sentry/PostHog/BetterStack.
- **Entry points:** `middleware.ts` (page auth only — matcher **excludes** `/api/*`); 113 `app/api/**/route.ts` handlers, each self-authorizing.
- **Roles:** `admin`, `doctor`, `fnp`, `pa`, `nurse` (+ legacy `staff`→nurse) — `lib/roles.ts`.
- **Core workflows:** login → role-based redirect (admin shell vs clinician shell); flowboard / nurse-flowboard patient queue; encounter lifecycle (intake → vitals/rooming → telemedicine via Daily → SOAP / AI SOAP → diagnoses/ICD → orders/prescriptions → complete → compliance review); I-693 immigration form fill (Textract OCR + AI draft + PDF fill); patient documents; pharmacy prescription export; support tickets; admin user/location/tenant/forms management.
- **Data flow:** Client → Next route handler → `getUser()` (JWT-verified) → role from `profiles` → object-level guard (`assert*Access`, location scope) → **service-role admin client (RLS bypassed)** executes the query. **Authorization lives in TypeScript, not in RLS.**
- **External deps:** Daily.co (video), OpenAI / AI-SDK (SOAP, ICD, risk, I-693 drafts), AWS Textract (OCR), Resend (email), Smarty + Mapbox (address), Cloudflare Turnstile (captcha), Sentry/PostHog/BetterStack (observability).
- **Deployment:** Railway (nixpacks auto-detect; `npm run build` → `npm run start` via `scripts/next-start.cjs`). No Docker/IaC/vercel.json. Migrations applied out-of-band via `scripts/apply-supabase-migration.cjs` against `DATABASE_URL`.
- **Trust boundaries:** browser (holds Supabase anon/publishable key + user JWT — **can call PostgREST directly**) ↔ Next server (service-role key, server-only) ↔ Postgres (RLS = coarse role gate only) ↔ third parties.
- **Sensitive-data locations:** `patients`, `encounters`, `patient_documents`, `vitals`, `prescriptions`, `telemedicine_transcripts`, `i693_submissions`, `ai_soapnotes`, audit logs, Storage PHI buckets.
- **Doc-vs-reality mismatches:** README describes a "video conferencing application" with wrong env var names (`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_DAILY_API_KEY`, `.env.local.example`) that don't match `.env.example` or current code. `ci.yml` triggers on `main`/`develop` only, but repo branches are `raheel`/`qa`/`dev` — so the main CI likely never fires; e2e (`playwright.yml`) runs only on `qa`.

---

## 3. Critical blockers

| ID | Severity | Confidence | Area | Finding | Evidence | Impact | Required Fix |
| -- | -------- | ---------- | ---- | ------- | -------- | ------ | ------------ |
| C-1 | Critical | **Confirmed** | AuthZ / RLS | `profiles` UPDATE policy restricts row but not columns; no trigger/REVOKE protects `role` | `supabase/migrations/011_fix_all_rls_policies_final.sql:22-26` (`USING`/`WITH CHECK (auth.uid()=uid)`); only BEFORE UPDATE trigger is `update_profiles_updated_at` (`006:60`); no `REVOKE UPDATE(role)` anywhere in 123 migrations | Any authenticated user can `PATCH /rest/v1/profiles?uid=eq.<self> {"role":"admin"}` with the browser's anon key → global admin (all PHI, all locations, `admin/users` account control). Complete access-control bypass. | Column-restrict: `REVOKE UPDATE(role, compliance_access, active) ON public.profiles FROM authenticated` + BEFORE UPDATE trigger asserting `NEW.role = OLD.role` for non-service-role callers. Verify `pg_policies` on prod first. |
| C-2 | High | Confirmed | Infra / API | Request-size validation never runs on `/api/*` | `middleware.ts:206-223` matcher excludes `/api`; `lib/security/request-validator.ts` + `maxRequestBodySizeForPath` (55 MB/90 MB) are dead in practice | Unbounded bodies reach upload routes (`patients/[id]/documents`, `encounters/[id]/i693/supporting-documents`, `chat/messages`) → memory/DoS | Enforce body-size limits inside the upload handlers, or add `/api/:path*` to a size-check middleware. |
| H-2 | High | **Confirmed** | IDOR (write) | `transcripts/save` nurse/staff branch has NO encounter-access check, then inserts via admin client | `app/api/transcripts/save/route.ts:130-134` (empty `else if` block) → `:135-140` `admin.insert` | Any nurse injects transcript rows into ANY encounter at ANY location; feeds AI SOAP/summary → PHI integrity | Add `assertEncounterAccess` + location scope to the nurse branch. |
| H-3 | High | **Confirmed** | IDOR (write) | `pharmacies/registry` POST reassigns any encounter's `pharmacy_id` after only an existence check | `app/api/pharmacies/registry/route.ts:101,120-131`; `loadEncounterForRx` is existence-only | Any staff redirects any encounter's prescriptions to an attacker-created pharmacy | Call `guardEncounterAccess(..., WRITE)` before the `encounters.update`. |
| H-4 | High | **Confirmed** | Tenant / location leak | `clinical/orders` GET uses the admin client with no location filter | `app/api/clinical/orders/route.ts:28,33-44` (gate is only `canViewClinicalEncounterContent`) | Any clinical staff reads the 200 most-recent orders + patient names across ALL locations | Add `getLocationScopeForUser` + patient-location filter (mirror `post-visit-tasks/route.ts:43-48`). |
| H-5 | High | **Confirmed** | Tenant / location leak | `i693/immigration-encounters` GET admin-client query, no location filter | `app/api/i693/immigration-encounters/route.ts:23-48` (patient name + DOB across all locations) | Cross-location immigration-patient PHI disclosure | Add location scoping (sibling `i693/cases/route.ts` does). |
| H-6 | High | **Confirmed** | IDOR (write) | `prescriptions` POST accepts any `patient_id` when `encounter_id` is omitted — no `assertPatientAccess` | `app/api/prescriptions/route.ts:82-92` (patient check only runs `if v.encounter_id != null`) | A physician can create a prescription for any patient regardless of location scope | Require `encounter_id`, or call `assertPatientAccess`/location scope on the patient. |
| H-7 | High | Highly likely | AuthN | Deactivated/banned users keep API access until JWT expiry; only `requireStaffSession` checks `active` | `lib/auth/require-staff-session.ts:34`; `requireAdminUser`/`requireNurseUser`/`fetchUserRole`/`assertEncounterAccess` and middleware don't | Off-boarding not immediate; a banned admin keeps power until token TTL | Add `active !== false` to the shared auth path; shorten JWT TTL. |
| M-2 | Medium | **Confirmed** | IDOR (destructive) | `daily/end-room` ends any room by body `encounterId`, only role-gated | `app/api/daily/end-room/route.ts:34,60-72` (`isClinicalStaffRole` then DELETE `encounter-${id}`) | Any clinical staff terminates any live telemedicine consult | Add `guardEncounterAccess` (as `daily/room` does). |
| SEC | High | Reported (MCP, staging) | RLS gaps | `lab_orders`/`medication_orders` RLS enabled with **zero policies**; `is_admin_user()` SECURITY DEFINER executable by `authenticated`; leaked-password protection off | Supabase advisor scan on staging `bssjlpqdgmtgaxvadwdh` (background agent) — re-confirm on prod | Zero-policy under RLS = deny-all (feature broken) or service-role-only; SECDEF rpc callable by any user | Add explicit policies; `REVOKE EXECUTE` on `is_admin_user()` from `authenticated`; enable Auth leaked-password protection. |

---

## 4. End-to-end workflow matrix

| Workflow | Frontend | Backend | Database | Authorization | Error Handling | Tests | Final Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Login / logout | ✔ | ✔ (IP throttle + Turnstile) | ✔ | ✔ generic errors | ✔ | e2e (skipped off-`qa`) | **Working** (Turnstile fails open if key unset) |
| Role redirect / route protection | ✔ | middleware + page HOC | profiles role | ✔ pages; **C-1 breaks the trust at DB** | ✔ | grep-tests | **Partially working** (C-1) |
| Encounter lifecycle (intake → SOAP → complete) | ✔ | ✔ | ✔ | ✔ `guardEncounterAccess` | ✔ | unit (helpers) | **Working** |
| Telemedicine (Daily) | ✔ | ✔ join guarded | ✔ | join ✔ / **end-room unguarded (M-2)** | ✔ | none | **Partially working** |
| Prescriptions | ✔ | ✔ | ✔ | **H-6 gap w/o encounter_id** | ✔ | unit | **Partially working** |
| Clinical orders list | ✔ | ✔ | ✔ | **H-4 no location scope** | ✔ | none | **Partially working** (leak) |
| I-693 immigration list/fill | ✔ | ✔ Textract + AI | ✔ | **H-5 list unscoped** | ✔ | unit (pdf/registry) | **Partially working** (leak) |
| Transcripts save | ✔ | ✔ | ✔ | **H-2 nurse unguarded** | ✔ | none | **Partially working** |
| Patient search (DOB partial) | ✔ | ✔ local parser | **BROKEN until migration 130 applied** (`date ILIKE` errors) | ✔ scoped | ✔ | unit (parser) | **Partially working** (pending migration) |
| Patient documents up/download | ✔ | ✔ + scan | ✔ | ✔ `guardPatientAccess` | ✔ | some | **Working** (size cap gap C-2) |
| Admin user/location/tenant mgmt | ✔ | ✔ `requireAdminUser` | ✔ | ✔ strong | ✔ | e2e (skipped) | **Working** |
| Support tickets | ✔ | ✔ | ✔ | ✔ ownership | ✔ | none | **Working** |
| Email (SOAP to patient) | ✔ | ✔ Resend (real) | n/a | ✔ | ✔ (no timeout) | none | **Working** |
| Compliance review | ✔ | ✔ location scope | ✔ | ✔ `requireComplianceAccess` | ✔ | none | **Working** |
| Chat / staff directory | ✔ | ✔ | ✔ | ownership; **M-4 full directory exposure** | leaks RLS name | none | **Partially working** |

---

## 5. Security findings (by category)

**Authentication**
- Solid core: `getUser()` (JWT verified) everywhere; role from `profiles`, never `user_metadata` (H-03 discipline verified). Login has per-IP brute-force throttle + optional Turnstile.
- **H-7:** `active` (deactivated/banned) not checked on most auth paths → delayed off-boarding.
- **M-6:** `lib/chat/auth.ts:37-46` prefers `getSession()` (no server-side re-validation) over `getUser()`, and reads a legacy non-httpOnly `supabase.auth.token` cookie (`:6-18`) — XSS token-theft surface.
- Turnstile **fails open** when `TURNSTILE_SECRET_KEY` unset (`lib/security/turnstile.ts:19-21`) — a typo silently disables bot protection (rate-limit still applies).

**Authorization**
- **C-1 (Critical, confirmed):** self-service role escalation via `profiles` UPDATE RLS — see §3.
- API layer is otherwise clean vertically: all `/api/admin/*` call `requireAdminUser()`; ~52 routes use `assert*Access`/`guard*Access` correctly. No mass-assignment (zod strips unknown keys; PATCH routes use field allow-lists).
- Object-level gaps (IDOR): **H-2, H-3, H-6, M-2** (verified); **M-3** (`clean-transcript` nurse branch, mitigated by user-scoped client).
- **M-5:** `lib/auth-context.tsx:213-229,300-317` reads `test_role`/`test_user` from `localStorage` and sets client role — UI-only spoof, leftover test scaffolding in prod (server re-derives role, so not a real escalation, but misleading to reviewers).

**Tenant isolation**
- App is **effectively single-tenant for PHI**. `tenant_id` exists only on `locations`/`forms` (branding/consent grouping), never on `profiles` or any PHI table. The real isolation boundary is **location scope** (`user_locations` → `getLocationScopeForUser`, fail-closed) — enforced in app code only, and inconsistently (H-4/H-5 miss it). `lib/forms/resolve-encounter-tenant.ts` silently falls back to `DEFAULT_TENANT_ID = 1`.
- **No `tenant_id`/location predicate in any RLS policy** → a valid staff JWT calling PostgREST directly bypasses ALL location scoping.

**Input handling**
- zod validation is widespread and good on write routes. `diagnoses` route sanitizes PostgREST `.or()` metacharacters (`normalizeDiagnosisSearch`). No SQL injection surface found (PostgREST parameterizes).
- **M-7:** `lib/fetch-user-role.ts:36-39` email fallback uses `.ilike()` on the auth email — LIKE-metacharacter risk in the *role-resolution* path; harden to `.eq()` only.
- Prompt-injection: user text (transcripts, support text, OCR) is placed in the `user` message with instructions in `system` (correct); outputs are clinician-reviewed drafts (low blast radius).

**Data exposure**
- H-4/H-5 cross-location PHI lists. **M-4:** `chat/users` returns the full staff directory (uid/name/role/email) cross-location; error handler leaks RLS policy names.
- Positives: Sentry replay masks all text/media; no secrets in the client bundle (verified: `SUPABASE_SECRET_KEY`/service-role only in server files, 0 in `'use client'` modules).

**File security**
- Upload validation + scan present on patient documents; but no enforced size limit at runtime (C-2). Textract path enforces 10 MB / 50-page limits. Storage PHI buckets made private in migration `108`.

**API security**
- **M-1:** no rate limiting on 112/113 routes — worst on the 7 OpenAI-backed routes (billable, PHI-forwarding) and `me/password/verify`. `lib/rate-limit.ts` is per-process (ineffective across serverless instances, per its own comment).
- **No outbound timeouts/retries** on ANY integration (Daily, OpenAI ×6+, Resend, Smarty, Mapbox) — a hung upstream holds the request open until the platform kills it.
- No CSRF tokens; relies on `sameSite=lax` + Supabase cookies (implicit, but effective for state-changing POSTs). No app-level CORS (same-origin, good).

**Infrastructure**
- Strong prod security headers/CSP (`next.config.js:40-128`) but **production-only**, and `script-src` allows `'unsafe-inline' 'unsafe-eval'` (needed for Next inline + pdf.js; no nonce strategy). TS/ESLint enforced by default (suppression is opt-in env flags).
- `scripts/next-start.cjs` strips `--disallow-code-generation-from-strings` from `NODE_OPTIONS` — undocumented hard dependency; a direct `next start` crashes.
- Daily rooms use `privacy: 'public'` with predictable name `encounter-${id}` (`daily/room/route.ts:113-116`); `enable_knocking:true` may partially mitigate — **needs runtime verification** whether a non-token holder can join without admission.
- Latent leak: `process.env.DAILY_API_KEY || process.env.NEXT_PUBLIC_DAILY_API_KEY` fallback contradicts its own H-10 warning (`lib/config.ts:38`, `daily/room/route.ts:38`).

**Dependencies** — see §8 for `npm audit`. 32 advisories (1 critical, 17 high). The critical is `handlebars` (transitive, build/tooling chain). Runtime-reachable highs: `next` (14.2.35 — upgrade to latest 14.2.x patch), `ws`, `form-data`, `postcss`, `serialize-javascript`, `rollup`. Many others are dev/build-only (eslint chain, `glob`, `minimatch`, `js-yaml`). Deps are otherwise modern and lockfile-pinned; `postgres` is a devDependency used only by the migration script.

**Logging & monitoring** — Sentry/PostHog/BetterStack wired; `console.error` gated to dev in most places (3 stray `console` warnings flagged by lint, see §8); `app/api/health` exists but nothing references it (unthrottled DB probe when hit).

---

## 6. Vibe-code findings

- **Not heavily vibe-coded.** No mock/dummy/fake data outside `__tests__`/`e2e`; no `console.log` in `app/`/`components/` (a few `console` calls in `lib/i693/*` + `components/I693PdfFormEditor.tsx` — lint warnings); no TODO/FIXME/"coming soon"; no commented-out security checks; no empty/fake button handlers.
- **Dead code:** `lib/security/api-auth.ts` (`requireAuth`/`requireRole`/…) is imported by **zero** routes, yet `middleware.ts:211` cites this file as the reason `/api` is excluded from middleware — the structural root cause of the IDOR drift (**H-1**). Empty leftover route dirs `app/api/debug/user-profile/` and `app/api/test-redis/` (no `route.ts`). `/dashboard/orders` and `/dashboard/follow-ups` are still built (`○` in build output) but always redirected by middleware — dead routes.
- **Refactor residue (harmless):** `lib/hooks/use-patient-search-parse.ts:31-37` returns constant `parsing:false`/`error:null`; `searchParse:'local'` field returned but never read. No broken imports to the deleted OpenAI-parse files (verified).
- **Misleading trust-boundary scaffolding:** `test_role`/`test_user` `localStorage` role override in `lib/auth-context.tsx` (M-5) shipped to prod.
- **Migration hygiene:** duplicate numbers (two `060_*`, two `082_*`), 9 numbering gaps (020, 047-052, 061, 086); the numeric files are NOT the Supabase CLI ledger — migrations are applied out-of-band, and git↔DB drift is acknowledged in-file (`104-113` headers). Two identity schemas (`user_profiles.id` vs `profiles.uid`) reconciled by a chain of "fix RLS" migrations; `039` runtime-detects the column.

---

## 7. File-by-file findings (grouped, deduped)

- **`supabase/migrations/`:** C-1 (`011:22-26` + no column guard); coarse role-only RLS on patients/appointments/encounters/documents (`011:73-101,117,234,353` — the per-nurse restriction from `002` was removed); no PHI-table location/tenant predicate; duplicate/gap numbering; `130` pending/unapplied (DOB search broken until applied).
- **API routes:** `clinical/orders/route.ts` → H-4 · `i693/immigration-encounters/route.ts` → H-5 · `transcripts/save/route.ts` → H-2 · `pharmacies/registry/route.ts` → H-3 · `prescriptions/route.ts` → H-6 · `daily/end-room/route.ts` → M-2 · `daily/room/route.ts` → public rooms + key fallback · `chat/users/route.ts` + `lib/chat/auth.ts` → M-4/M-6.
- **`lib/`:** `security/api-auth.ts` dead (H-1) · `security/request-validator.ts` never runs on API (C-2) · `security/turnstile.ts` fail-open · `fetch-user-role.ts:36-39` `.ilike` role-resolution (M-7) · `auth-context.tsx` (M-5) · `config.ts` never throws on missing env + Daily key fallback.
- **Root/config:** `middleware.ts` excludes `/api` (page-only) · `next.config.js` strong headers (prod-only, `unsafe-inline/eval`) · `scripts/next-start.cjs` NODE_OPTIONS strip dependency · `jest.config.js` matches `e2e/*.spec.ts` (Q-1) · `README.md` stale/wrong env names · `.github/workflows/ci.yml` main/develop only (branches are raheel/qa/dev).

---

## 8. Test & build results (executed 2026-08-05)

| Check | Command | Result | Key output | Confidence |
| --- | --- | --- | --- | --- |
| Type check | `npm run type-check` (`tsc --noEmit`) | **PASS** (exit 0) | No errors | High |
| Lint | `npx next lint` | **PASS** (exit 0) | Warnings only: 3× `no-console` (`lib/i693/generate-pdf.ts:70`, `lib/i693/pdfjs-form-bridge.ts:278,472`, `components/I693PdfFormEditor.tsx:263`), several `react-hooks/exhaustive-deps`, 1 `jsx-a11y` | High |
| Unit tests | `jest --ci` | **279/279 tests pass** (50 suites) — but the **command exits 1** | 18 suites "fail to run" because jest matches `e2e/*.spec.ts` and tries to load Playwright under jsdom (**Q-1**) | High |
| Prod build | `next build` (`NODE_ENV=production`) | **PASS** (exit 0) | All routes compiled; middleware 137 kB; most API routes dynamic (`ƒ`) | High |
| Dependency audit | `npm audit --audit-level=high` | **32 vulns**: 1 critical, 17 high, 11 moderate, 3 low | Critical: `handlebars` (transitive). Runtime-reachable highs incl. `next`, `ws`, `form-data`, `postcss`, `serialize-javascript`, `rollup` | High |
| Migration validation | apply `130` to staging | **NOT RUN** (would mutate staging DB) | Fixes broken DOB-partial search | — |

**Q-1 (test infra, Medium):** `jest.config.js:24-27` `testMatch` includes `**/?(*.)+(spec|test).[jt]s?(x)` with **no `testPathIgnorePatterns`** for `e2e/`, so `npm test` executes Playwright specs under jest and exits non-zero. CI's `test` job (`ci.yml`) would be red — masked only because that CI never fires on the active branches. **Fix:** add `testPathIgnorePatterns: ['<rootDir>/e2e/', '<rootDir>/node_modules/']`.

**Test-quality assessment (static):** ~52 jest + ~20 Playwright specs. **16 jest files assert on source-file TEXT via `readFileSync`/`toContain`** (`__tests__/security/smoke-regression.test.ts`, `get-user-not-session.test.ts`, `audit-logs.test.ts` which defines its *own* local enum, `role-resolution.test.ts` "simulated") — these pass over broken code. Real behavioral authz tests are **e2e only** and `test.skip` when `PLAYWRIGHT_*` env is unset; e2e runs only on `qa`, not the CI branches. **RLS/tenant isolation is untested at the DB level** (no pgTAP/DB integration). Net: automation would NOT catch C-1 through H-6.

---

## 9. Missing tests (priority)

1. **DB-level RLS / privilege tests** (pgTAP or integration): a non-admin cannot UPDATE its own `role`; a staff JWT cannot read other-location `patients`/`encounters`/`encounter_orders` directly via PostgREST. (Covers C-1, H-4/H-5, coarse-RLS.)
2. **Object-level authz integration tests** for H-2/H-3/H-6/M-2: nurse cannot save transcript / end room / reassign pharmacy on a non-owned encounter; physician cannot prescribe for an out-of-scope patient.
3. **Deactivated-user** test: a banned user's token is rejected (H-7).
4. **Rate-limit** tests on OpenAI-backed + password-verify routes (M-1).
5. Replace the grep-tests with real request-level assertions; run the e2e authz suite in the CI branch that actually fires.

---

## 10. Remediation plan

> Canonical checklist with Task IDs and checkboxes is **§1a. Remediation task board (P0–P4)**. This section keeps the grouped rationale (P0–P3 by workstream); the board is the tracker to check off.

### P0 — Immediate security / data-loss blockers
- **C-1** — files: new migration + supersede `supabase/migrations/011...`. `REVOKE UPDATE(role, compliance_access, active)` + BEFORE UPDATE trigger asserting `NEW.role = OLD.role` for non-service-role. Deps: verify prod `pg_policies` first. Regression risk: legitimate self-profile edits (name/avatar) must still work — the trigger must allow non-privileged columns. Tests: RLS test #1. Effort: **Small**.
- **SEC (advisor)** — add policies to `lab_orders`/`medication_orders`; `REVOKE EXECUTE` on `is_admin_user()` from `authenticated`; enable Auth leaked-password protection. Effort: **Small**.
- **C-2** — enforce body-size limits in the upload handlers. Effort: **Small–Medium**.

### P1 — Core functionality / access-control blockers
- **H-2, H-3, H-6, M-2** — add the missing `assertEncounterAccess`/`assertPatientAccess`/`guardEncounterAccess` calls (helpers already exist and are used correctly 52× elsewhere). Effort each: **Small**. Regression risk: low.
- **H-4, H-5** — add `getLocationScopeForUser` + filter (mirror sibling routes). Effort: **Small**.
- **H-7** — add `active !== false` to the shared auth helpers; shorten JWT TTL. Effort: **Small**.
- **H-1** — consolidate onto one auth gate; delete dead `api-auth.ts` or migrate routes to it. Effort: **Medium**.
- **Migration 130** — commit + apply (fixes broken DOB search). Effort: **Small**.

### P2 — Reliability / maintainability
- **Q-1** jest `testPathIgnorePatterns` for `e2e/`. **M-1** shared-store rate limiting on OpenAI + password routes. **M-4/M-6** chat auth (getUser-first, scope the directory, stop leaking RLS names). **M-5** delete `test_role` localStorage. **M-7** `.eq`-only email lookup. Add outbound `AbortSignal.timeout` on all integrations. Turnstile fail-closed option. Remove Daily `NEXT_PUBLIC_*` key fallback + set `privacy:'private'` (verify join flow). `npm audit` remediation (bump `next`, `ws`, `form-data`, `postcss`; the critical `handlebars` is build-chain). Effort: **Medium** overall.

### P3 — Improvements
- Migration numbering cleanup + single source of truth; delete empty/dead route dirs; refactor-residue cleanup; README rewrite + correct CI branch triggers; wire the healthcheck; CSP nonce strategy; resolve lint warnings (`no-console`, exhaustive-deps). Effort: **Medium**.

---

## 11. Safe implementation order

1. Verify prod `pg_policies` (read-only) → **C-1** migration → **SEC** advisor fixes (DB layer first — closes the no-backstop gap).
2. **P1** object-level guards (H-2, H-3, H-6, M-2) + location scope (H-4, H-5) — independent one-liners; land together with tests.
3. **H-7** active-check + JWT TTL.
4. **H-1** auth consolidation (touches many routes — do it after the point fixes, with type-check + e2e green).
5. Commit/apply **migration 130**.
6. **C-2** size limits.
7. **P2/P3** (start with **Q-1** so CI is trustworthy again).

---

## 12. Final verification checklist (before "production ready")

- `npm run type-check`, `npm run lint`, `npm test`, `npm run build`, `npm audit --audit-level=high` all green. *(As of 2026-08-05: type-check/lint/build green; `npm test` red due to Q-1 config; audit has 1 critical + 17 high to triage.)*
- RLS test: a non-admin `PATCH profiles.role='admin'` → **rejected**.
- A staff JWT's direct PostgREST read of other-location `patients`/`encounter_orders`/`encounters` → **empty/denied**.
- Nurse cannot: save transcript / end room / reassign pharmacy on a non-owned encounter. Physician cannot prescribe for an out-of-scope patient.
- Deactivated-user token → 401/403 immediately.
- Apply migration 130 to staging → DOB-partial search works; no `operator does not exist: date ~~*`.
- The e2e authz suite runs in the CI branch that actually fires.

---

## Coverage statement

- **Reviewed:** repo structure, package/lockfile, env config, `middleware.ts`, all 113 API route paths (≈30 traced deeply), core auth/roles/guards libraries, all integration libraries, ≈30 of 123 migrations (core + latest + every profiles/RLS-relevant one), the test inventory, CI workflows, `next.config.js`, deployment scripts.
- **Not fully reviewed:** every one of 123 migrations line-by-line; every React component/page (the frontend deep-dive is partial — reviewed `auth-context`, patient-search, and the key pages/components); every one of 113 routes line-by-line.
- **Executed:** static tracing + grep; **plus** `tsc --noEmit`, `next lint`, `jest --ci`, `next build`, `npm audit` (results in §8).
- **Not executed:** migration `130` apply; Playwright e2e (requires `PLAYWRIGHT_*` creds + a deployed URL); any DB mutation.
- **Still needs runtime confirmation:** C-1 against prod `pg_policies`; whether a non-token holder can join a `public` Daily room without admission; the advisor SEC items against prod (the agent ran staging); H-6 exploitability, which depends on the `prescriptions` INSERT RLS policy.
