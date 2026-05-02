# API Surface

All known API route handlers under `app/api/**`.

## Auth and Access

- `app/api/signup/route.ts` - admin PIN-gated signup/create user flow.
- `app/api/auth/signout/route.ts` - terminate current auth session.
- `app/api/auth/test-login/route.ts` - development auth testing helper.

## Health and Diagnostics

- `app/api/health/route.ts` - service/database health probe.
- `app/api/test-db-connection/route.ts` - direct DB connectivity check.
- `app/api/audit/route.ts` - logs auditable client actions.

## Chat

- `app/api/chat/users/route.ts` - list eligible chat users.
- `app/api/chat/conversations/route.ts` - list or resolve user conversations.
- `app/api/chat/messages/route.ts` - fetch/send messages in conversations.
- `app/api/chat/sync-profiles/route.ts` - sync chat profile records.

## Daily / Telemedicine

- `app/api/daily/room/route.ts` - create/join Daily room metadata.
- `app/api/daily/end-room/route.ts` - complete/close room session state.
- `app/api/daily/test/route.ts` - Daily integration smoke endpoint.

## Encounter and Clinical Workflow

- `app/api/encounters/[id]/rooming/route.ts` - rooming/vitals progression.
- `app/api/encounters/[id]/orders/route.ts` - encounter-linked order management.
- `app/api/encounters/[id]/consent-forms/route.ts` - consent forms by encounter.
- `app/api/encounters/[id]/icd-suggestions/route.ts` - ICD suggestion workflow.
- `app/api/encounters/[id]/ai-soapnote/route.ts` - AI SOAP note generation/completion.
- `app/api/post-visit-tasks/route.ts` - create/list post-visit tasks.
- `app/api/post-visit-tasks/[taskId]/route.ts` - task-level updates.
- `app/api/prescriptions/route.ts` - prescription-related operations.
- `app/api/orders/[orderId]/route.ts` - order-level updates.
- `app/api/nurse/risk-alerts/route.ts` - risk-alert generation endpoint.
- `app/api/doctors/availability/route.ts` - provider availability retrieval.
- `app/api/transcripts/save/route.ts` - telemedicine transcript persistence.
- `app/api/soap/complete-soap/route.ts` - external SOAP completion integration.

## Patient Documents

- `app/api/patients/[id]/documents/route.ts` - list/upload patient documents.
- `app/api/patients/[id]/documents/[docId]/route.ts` - delete/manage single document.

## Scope Notes

- Route access is additionally shaped by `middleware.ts` auth + role checks.
- Production middleware disables select diagnostic endpoints.
