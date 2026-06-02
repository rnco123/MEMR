# USCIS Form I-693 PDF template

Place your **official USCIS Form I-693** PDF here (Edition **01/20/25** or compatible):

- **Required filename:** `i-693-template.pdf`
- Alternates: `i693-template.pdf`, `uscis-i-693.pdf`

The copy from your desktop (`i-693.pdf`) has been installed as `i-693-template.pdf`.

## Flat vs fillable PDF

| Type | Behavior |
|------|----------|
| **Fillable AcroForm** (USCIS official PDF) | **MuPDF** fills native widgets; editor inputs snap to widget boxes (`lib/i693/pdf-widget-map.ts`) |
| **Flat PDF** (no form fields) | MEMR **renders each page** and **overlays text** at calibrated coordinates (`lib/i693/pdf-overlay-uscis-012025.ts`) |

The installed **01/20/25** template includes **432 AcroForm widgets**. Export uses **acroform mode** (not coordinate overlay).

There is no embeddable Adobe Acrobat npm package; alignment comes from the PDF’s own field geometry via [MuPDF](https://mupdf.readthedocs.io/) (already in this project).

## Export from the app

1. Complete the digital form (AI fill or manual).
2. Click **Export to PDF** on Form I-693.
3. Download is `I-693-encounter-{id}.pdf` with Part 1, contact, medical summary, and vaccinations filled where mapped.

## Tune field positions

Coordinates in `lib/i693/pdf-overlay-uscis-012025.ts` use **PDF points** with origin **bottom-left**. Each `y` is the **top edge of the fill box** (not the text baseline). The editor and export share `lib/i693/pdf-editor-layout.ts` for CSS/baseline conversion.

To recalibrate against your template:

```bash
node scripts/calibrate-i693-overlay.mjs
```

Run a local test (requires `npx tsx`):

```bash
npx tsx scripts/test-i693-pdf-fill.mjs
```

Output: `public/forms/i-693-filled-test.pdf`
