# MEMR Knowledge Base

This folder contains a full-project knowledge base for the `e:/MEMR` workspace, organized for fast onboarding, debugging, and implementation work.

## Coverage Contract

- Source code, API routes, migrations, tests, scripts, and docs are cataloged.
- Every first-party project file discovered in the workspace scan is listed in `FILE_MANIFEST.md`.
- Large generated/vendor trees are accounted for by scope and counts:
  - `node_modules`: 43,799 files
  - `.next`: 121 files

## Documents

- `SYSTEM_CONTEXT.md` - architecture, runtime flow, auth, security, and app behavior.
- `API_SURFACE.md` - all API routes and what each endpoint owns.
- `DATABASE_MIGRATIONS.md` - migration-by-migration database evolution summary.
- `FILE_MANIFEST.md` - exhaustive file inventory for the project workspace (first-party files).

## How To Use This KB

1. Start with `SYSTEM_CONTEXT.md` for overall mental model.
2. Use `API_SURFACE.md` when changing backend behavior.
3. Use `DATABASE_MIGRATIONS.md` for schema or RLS impact analysis.
4. Use `FILE_MANIFEST.md` to locate exact files quickly.
