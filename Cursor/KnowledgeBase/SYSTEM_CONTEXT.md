# System Context

## Product Identity

- Project: `myclinicmd` (EMR + telemedicine workflow).
- Stack: Next.js 14 App Router + React 18 + TypeScript + Supabase + Daily.co + Sentry.
- Main domain: patient intake, encounters, provider workflow, documents, chat, and video visits.

## Runtime Architecture

- **Frontend**: App Router pages in `app/`, UI modules in `components/`.
- **Backend**: Route handlers under `app/api/**/route.ts`.
- **Data layer**: Supabase Postgres with RLS policies managed through SQL migrations.
- **Auth**: Supabase SSR auth + middleware session handling + role enforcement.
- **Observability**: Sentry client/server/edge configs + instrumentation hook + health endpoint.

## Core Route Areas

- Public/auth pages: `/`, `/login`, `/signup`.
- Dashboard route group: `/dashboard/*` (doctor, nurse, staff scoped).
- Feature pages:
  - `/video`
  - `/patient-file/[id]`
  - testing/dev pages: `/test-daily`, `/test-consent-forms`, `/test-soap-complete`, `/openai`, `/sentry-test`

## API Domain Breakdown

- Auth/admin: `/api/signup`, `/api/auth/signout`, `/api/auth/test-login`
- Health/ops: `/api/health`, `/api/test-db-connection`, `/api/audit`
- Chat: `/api/chat/{users,conversations,messages,sync-profiles}`
- Daily workflow: `/api/daily/{room,end-room,test}`
- Clinical workflow:
  - `/api/encounters/[id]/{rooming,orders,consent-forms,icd-suggestions,ai-soapnote}`
  - `/api/post-visit-tasks` (+ `[taskId]`)
  - `/api/prescriptions`
  - `/api/orders/[orderId]`
  - `/api/nurse/risk-alerts`
  - `/api/doctors/availability`
  - `/api/transcripts/save`
- Patient documents:
  - `/api/patients/[id]/documents`
  - `/api/patients/[id]/documents/[docId]`

## Security Model

- Middleware enforces:
  - request validation (`lib/security/request-validator.ts`)
  - API rate limiting (`lib/rate-limit.ts`)
  - auth redirects and role-based page guards
  - production lockout of diagnostic routes/endpoints
- Next.js headers add CSP, HSTS, frame/security policies in production (`next.config.js`).
- Input/attack surface controls in:
  - `lib/validation.ts`
  - `lib/sanitize.ts`
  - `lib/security/*`
- Audit trail implemented through `lib/audit.ts` + `/api/audit`.

## Role and Access

- Role primitives in `lib/roles.ts` and `lib/utils/role-utils.ts`.
- Client auth/session context in `lib/auth-context.tsx`.
- Page-level role guard helper: `lib/hoc/withRoleProtection.tsx`.
- Middleware path-role mapping:
  - Doctor-only: selected flowboard/prescriptions routes.
  - Nurse/Staff scoped: nurse flowboard and shared dashboard routes.

## Configuration and Secrets

- Centralized env handling in `lib/config.ts`.
- Supabase key compatibility supports legacy/new key names.
- Build-time bypass switches:
  - `NEXT_IGNORE_TYPECHECK=1`
  - `NEXT_IGNORE_ESLINT=1`

## Database Posture

- Migration files in `supabase/migrations/001...036`.
- Schema includes patient, appointment, encounter, intake, chat, docs, audit, and form-signing support.
- RLS is a first-class concern across migrations; several migrations are policy corrections/hardening.

## Important Existing Documentation (Root)

- `FULL_CONTEXT.md`
- `API_DOCUMENTATION.md`
- `schema.md`
- security hardening docs:
  - `SECURITY.md`
  - `SECURITY_SUMMARY.md`
  - `SECURITY_ASSESSMENT.md`
  - `SECURITY_ENHANCEMENTS.md`
  - `OWASP_TOP10_MAPPING.md`
