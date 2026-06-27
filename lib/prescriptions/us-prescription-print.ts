import {
  formatUsRxDispense,
  formatUsRxMedicationLine,
  formatUsRxSig,
} from '@/lib/prescriptions/format-us-rx-sig'
import { buildUsPrescriptionPdfBlob } from '@/lib/prescriptions/us-prescription-pdf'
import type { PrescriptionPrintContext } from '@/lib/prescriptions/load-prescription-print-context'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function cell(value: string | null | undefined): string {
  const text = (value ?? '').trim()
  return escapeHtml(text || '—')
}

function formatUsDate(dateString: string | null | undefined): string {
  if (!dateString?.trim()) return '—'
  const d = new Date(`${dateString.trim().slice(0, 10)}T12:00:00`)
  if (Number.isNaN(d.getTime())) return dateString.trim()
  return d.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  })
}

function fieldRow(label: string, value: string | null | undefined): string {
  return `<div class="field-row"><span class="field-label">${escapeHtml(label)}</span><span class="field-value">${cell(value)}</span></div>`
}

function prescriptionBlocksHtml(ctx: PrescriptionPrintContext): string {
  return ctx.prescriptions
    .map((rx, index) => {
      const sig = formatUsRxSig(rx)
      const notes = rx.notes?.trim()
      return `
      <section class="rx-block">
        <div class="rx-number">Rx ${index + 1}</div>
        <div class="rx-med">${cell(formatUsRxMedicationLine(rx))}</div>
        ${fieldRow('Sig:', sig)}
        ${fieldRow('Dispense:', formatUsRxDispense(rx))}
        ${fieldRow('Refills:', String(rx.refills ?? 0))}
        ${notes ? fieldRow('Notes:', notes) : ''}
      </section>`
    })
    .join('')
}

export function buildUsPrescriptionPrintHtml(ctx: PrescriptionPrintContext): string {
  const title = `Prescription — ${ctx.patient.name}`
  const dateWritten = formatUsDate(ctx.appointmentDate ?? ctx.printedAt.slice(0, 10))

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${cell(title)}</title>
    <style>
      @page { size: letter; margin: 0.65in; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        font-family: Helvetica, Arial, sans-serif;
        color: #000;
        font-size: 10pt;
        line-height: 1.4;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .sheet {
        max-width: 7.25in;
        margin: 0 auto;
      }
      .sheet-body { flex: 1 1 auto; }

      /* ── Clinic header ── */
      .header {
        border-bottom: 2px solid #000;
        padding-bottom: 12px;
        margin-bottom: 18px;
      }
      .clinic-name {
        font-size: 18pt;
        font-weight: 700;
        letter-spacing: 0.01em;
        margin-bottom: 4px;
      }
      .clinic-meta {
        font-size: 10pt;
        color: #222;
        line-height: 1.5;
      }

      /* ── Title row ── */
      .title-row {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-bottom: 18px;
      }
      .title-bar {
        font-size: 12pt;
        font-weight: 700;
        letter-spacing: 0.06em;
      }
      .date-written {
        font-size: 10pt;
        white-space: nowrap;
      }
      .date-written .label { font-weight: 700; }

      /* ── Two-column info grid ── */
      .info-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0 24px;
        margin-bottom: 18px;
        padding-bottom: 14px;
        border-bottom: 1px solid #000;
      }
      .info-col { min-width: 0; }

      .section-title {
        font-size: 9pt;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        border-bottom: 0.5px solid #000;
        padding-bottom: 3px;
        margin-bottom: 10px;
      }

      .field-row {
        display: flex;
        gap: 6px;
        margin-bottom: 5px;
        font-size: 10pt;
      }
      .field-label {
        flex: 0 0 58px;
        font-weight: 700;
      }
      .field-value {
        flex: 1;
        min-width: 0;
        word-break: break-word;
      }

      /* ── Pharmacy block ── */
      .pharmacy-block {
        margin-bottom: 18px;
        padding-bottom: 14px;
        border-bottom: 1px solid #000;
      }

      /* ── Medications ── */
      .meds-section { margin-bottom: 18px; }
      .rx-block {
        border: 1px solid #000;
        padding: 10px 12px 12px;
        margin-bottom: 10px;
        page-break-inside: avoid;
      }
      .rx-number {
        font-size: 8pt;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #444;
        margin-bottom: 6px;
      }
      .rx-med {
        font-size: 12pt;
        font-weight: 700;
        margin-bottom: 8px;
        line-height: 1.3;
      }
      .rx-block .field-row { margin-bottom: 4px; }
      .rx-block .field-label { flex: 0 0 62px; }

      /* ── Signature ── */
      .signature-block {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 16px;
        padding-top: 14px;
        border-top: 1px solid #000;
        font-size: 10pt;
      }

      .footer {
        margin-top: 24px;
        font-size: 8pt;
        color: #666;
      }

      @media print {
        html, body { height: 100%; }
        .sheet {
          min-height: 100%;
          display: flex;
          flex-direction: column;
        }
        .footer { margin-top: auto; }
      }
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="sheet-body">
      <header class="header">
        <div class="clinic-name">${cell(ctx.clinic.name || 'Clinic')}</div>
        <div class="clinic-meta">
          ${ctx.clinic.address ? `<div>${cell(ctx.clinic.address)}</div>` : ''}
          ${ctx.clinic.phone ? `<div>Tel: ${cell(ctx.clinic.phone)}</div>` : ''}
          ${ctx.clinic.email ? `<div>${cell(ctx.clinic.email)}</div>` : ''}
        </div>
      </header>

      <div class="title-row">
        <div class="title-bar">Prescription</div>
        <div class="date-written"><span class="label">Date written:</span> ${cell(dateWritten)}</div>
      </div>

      <div class="info-grid">
        <div class="info-col">
          <div class="section-title">Patient</div>
          ${fieldRow('Name:', ctx.patient.name)}
          ${fieldRow('DOB:', formatUsDate(ctx.patient.date_of_birth))}
          ${ctx.patient.phone ? fieldRow('Phone:', ctx.patient.phone) : ''}
          ${ctx.patient.address ? fieldRow('Address:', ctx.patient.address) : ''}
        </div>
        <div class="info-col">
          <div class="section-title">Prescriber</div>
          ${fieldRow('Provider:', ctx.doctor.name)}
          ${fieldRow('NPI:', ctx.doctor.npi)}
          ${ctx.doctor.specialty ? fieldRow('Specialty:', ctx.doctor.specialty) : ''}
          ${ctx.doctor.phone ? fieldRow('Phone:', ctx.doctor.phone) : ''}
        </div>
      </div>

      ${
        ctx.pharmacy
          ? `<div class="pharmacy-block">
          <div class="section-title">Pharmacy</div>
          ${fieldRow('Name:', ctx.pharmacy.name)}
          ${ctx.pharmacy.address ? fieldRow('Address:', ctx.pharmacy.address) : ''}
          ${ctx.pharmacy.phone ? fieldRow('Phone:', ctx.pharmacy.phone) : ''}
        </div>`
          : ''
      }

      <div class="meds-section">
        <div class="section-title">Medications</div>
        ${prescriptionBlocksHtml(ctx)}
      </div>

      <div class="signature-block">
        <div><span class="label">Electronically prescribed by:</span> ${cell(ctx.doctor.name)}</div>
        ${ctx.doctor.npi ? `<div><span class="label">NPI:</span> ${cell(ctx.doctor.npi)}</div>` : ''}
      </div>
      </div>

      <div class="footer">Generated from MyclinicMD EMR</div>
    </div>
  </body>
</html>`
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

function scheduleRevokeObjectUrl(url: string): void {
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000)
}

function removePrintIframe(iframe: HTMLIFrameElement): void {
  try {
    document.body.removeChild(iframe)
  } catch {
    /* already removed */
  }
}

/**
 * Full-page HTML wrapper that embeds the PDF in a 100%-sized iframe and triggers
 * the print dialog once it loads. A zero-size iframe renders blank in Chrome, so
 * the viewer must be full-size.
 */
function buildPdfViewerHtml(blobUrl: string, title: string): string {
  const safeTitle = escapeHtml(title)
  const safeSrc = escapeAttr(blobUrl)
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${safeTitle}</title>
    <style>
      html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #525659; }
      iframe { width: 100%; height: 100%; border: 0; }
    </style>
  </head>
  <body>
    <iframe id="rx-frame" src="${safeSrc}" title="${safeTitle}"></iframe>
    <script>
      var frame = document.getElementById('rx-frame');
      function triggerPrint() {
        setTimeout(function () {
          try {
            frame.contentWindow.focus();
            frame.contentWindow.print();
          } catch (e) {
            try { window.focus(); window.print(); } catch (err) {}
          }
        }, 500);
      }
      if (frame.contentWindow && frame.contentWindow.document
          && frame.contentWindow.document.readyState === 'complete') {
        triggerPrint();
      } else {
        frame.addEventListener('load', triggerPrint, { once: true });
      }
    </script>
  </body>
</html>`
}

/** Writes the PDF viewer into an already-opened (user-gesture) window. */
function renderInWindow(target: Window, blobUrl: string, title: string): void {
  try {
    target.document.open()
    target.document.write(buildPdfViewerHtml(blobUrl, title))
    target.document.close()
  } catch {
    // Cross-origin or closed window — point it straight at the PDF instead.
    try {
      target.location.href = blobUrl
    } catch {
      /* nothing else we can do */
    }
  }
}

/** Fallback when no pre-opened window exists: print via a full-size offscreen iframe. */
function printViaHiddenIframe(blobUrl: string): boolean {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('title', 'Prescription print')
  // Off-screen but full-size so Chrome's PDF viewer actually renders it.
  iframe.style.cssText =
    'position:fixed;left:-10000px;top:0;width:800px;height:1130px;border:0;visibility:hidden'
  iframe.src = blobUrl
  document.body.appendChild(iframe)

  iframe.addEventListener(
    'load',
    () => {
      const frameWin = iframe.contentWindow
      if (!frameWin) {
        removePrintIframe(iframe)
        return
      }
      window.setTimeout(() => {
        try {
          frameWin.focus()
          frameWin.print()
        } catch {
          /* user can print manually */
        }
      }, 500)
      window.setTimeout(() => removePrintIframe(iframe), 60_000)
    },
    { once: true }
  )

  return true
}

/**
 * Opens a print dialog with a U.S.-format prescription PDF.
 *
 * `targetWindow` should be a window opened *synchronously* in the click handler
 * (before any `await`) so the browser does not block it as a non-user-initiated
 * popup. If omitted, falls back to an offscreen iframe in the current document.
 */
export async function printUsPrescriptions(
  ctx: PrescriptionPrintContext,
  targetWindow?: Window | null
): Promise<boolean> {
  let blobUrl: string
  try {
    const blob = await buildUsPrescriptionPdfBlob(ctx)
    blobUrl = URL.createObjectURL(blob)
    scheduleRevokeObjectUrl(blobUrl)
  } catch {
    if (targetWindow && !targetWindow.closed) {
      try {
        targetWindow.close()
      } catch {
        /* ignore */
      }
    }
    return false
  }

  const title = `Prescription — ${ctx.patient.name}`

  if (targetWindow && !targetWindow.closed) {
    renderInWindow(targetWindow, blobUrl, title)
    return true
  }

  return printViaHiddenIframe(blobUrl)
}
