# I-693 Registry Migration Plan

## Recommendation

Use `reports/i693-proposed-registry.ts` as the seed for a single source of truth.
Keep full PDF field names for PDF.js annotation storage and MuPDF widget writes, while retaining short names and indexes for compatibility with existing mappings.

## Migration Steps

1. Promote the proposed registry into `lib/i693/` after review.
2. Add semantic bindings for every intentionally supported field: `internalKey`, `when`, `slot`, `formatter`, and `parser`.
3. Mark unsupported fields explicitly as `ignored` with a reason instead of letting them be implicitly unmapped.
4. Generate `pdf-field-registry.ts` and `pdf-widget-map.ts` compatibility views from the single registry.
5. Switch `fillAcroformI693PdfMupdf()` to resolve widgets by full name first, falling back to short-name compatibility only during migration.
6. Add CI checks that fail when the PDF fingerprint, widget count, or unmapped-supported count changes.

## Compatibility Risks

- Existing saved JSON uses MEMR internal keys, so `internalKey` names must remain stable or be migrated.
- Header mirrors currently render in PDF.js but are skipped by the registry generator; the single registry must model them explicitly.
- USCIS Designer PDFs are hybrid AcroForm/XFA, so pdf-lib field enumeration cannot be treated as authoritative.
- Checkbox groups are exposed as checkboxes, not radio buttons; each export value needs explicit `when` semantics.
- The vaccination table has many repeated fields and needs row/column metadata before it can be safely auto-filled.
