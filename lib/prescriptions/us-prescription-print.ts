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

function prescriptionBlocksHtml(ctx: PrescriptionPrintContext): string {
  return ctx.prescriptions
    .map((rx, index) => {
      const sig = formatUsRxSig(rx)
      const notes = rx.notes?.trim()
      return `
      <section class="rx-block">
        <div class="rx-number">Rx ${index + 1}</div>
        <div class="rx-med">${cell(formatUsRxMedicationLine(rx))}</div>
        <div class="rx-line"><span class="label">Sig:</span> ${cell(sig)}</div>
        <div class="rx-line"><span class="label">Dispense:</span> ${cell(formatUsRxDispense(rx))}</div>
        <div class="rx-line"><span class="label">Refills:</span> ${escapeHtml(String(rx.refills ?? 0))}</div>
        ${notes ? `<div class="rx-line"><span class="label">Notes:</span> ${cell(notes)}</div>` : ''}
      </section>`
    })
    .join('')
}

export function buildUsPrescriptionPrintHtml(ctx: PrescriptionPrintContext): string {
  const title = `Prescription — ${ctx.patient.name} — Encounter #${ctx.encounterId}`
  const dateWritten = formatUsDate(ctx.appointmentDate ?? ctx.printedAt.slice(0, 10))

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${cell(title)}</title>
    <style>
      @page { size: letter; margin: 0.6in; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Times New Roman", Times, serif;
        color: #111;
        font-size: 12pt;
        line-height: 1.35;
      }
      .sheet {
        max-width: 7.5in;
        margin: 0 auto;
      }
      .sheet-body {
        flex: 1 1 auto;
      }
      .header {
        border-bottom: 2px solid #111;
        padding-bottom: 10px;
        margin-bottom: 14px;
      }
      .clinic-name {
        font-size: 16pt;
        font-weight: 700;
        letter-spacing: 0.02em;
      }
      .clinic-meta, .meta-row {
        font-size: 10.5pt;
        color: #222;
      }
      .title-bar {
        margin: 14px 0 10px;
        font-size: 13pt;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px 24px;
        margin-bottom: 16px;
      }
      .section-title {
        font-size: 10pt;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        border-bottom: 1px solid #999;
        margin: 0 0 6px;
        padding-bottom: 2px;
      }
      .field { margin: 2px 0; }
      .label {
        font-weight: 700;
      }
      .rx-block {
        border: 1px solid #333;
        padding: 10px 12px;
        margin-bottom: 10px;
        page-break-inside: avoid;
      }
      .rx-number {
        font-size: 10pt;
        font-weight: 700;
        text-transform: uppercase;
        margin-bottom: 4px;
      }
      .rx-med {
        font-size: 13pt;
        font-weight: 700;
        margin-bottom: 6px;
      }
      .rx-line { margin: 3px 0; }
      .signature-block {
        margin-top: 24px;
        padding-top: 12px;
        border-top: 1px solid #999;
      }
      .footer {
        margin-top: 18px;
        font-size: 9pt;
        color: #555;
      }
      @media print {
        html, body {
          height: 100%;
        }
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .sheet {
          min-height: 100%;
          display: flex;
          flex-direction: column;
        }
        .footer {
          margin-top: auto;
        }
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
          ${ctx.clinic.phone ? `<div>Phone: ${cell(ctx.clinic.phone)}</div>` : ''}
          ${ctx.clinic.email ? `<div>Email: ${cell(ctx.clinic.email)}</div>` : ''}
        </div>
      </header>

      <div class="title-bar">Prescription — U.S. Format</div>
      <div class="meta-row"><span class="label">Date written:</span> ${cell(dateWritten)}</div>
      <div class="meta-row"><span class="label">Encounter #:</span> ${escapeHtml(String(ctx.encounterId))}</div>

      <div class="grid">
        <div>
          <div class="section-title">Patient</div>
          <div class="field"><span class="label">Name:</span> ${cell(ctx.patient.name)}</div>
          <div class="field"><span class="label">DOB:</span> ${cell(formatUsDate(ctx.patient.date_of_birth))}</div>
          ${ctx.patient.phone ? `<div class="field"><span class="label">Phone:</span> ${cell(ctx.patient.phone)}</div>` : ''}
          ${ctx.patient.address ? `<div class="field"><span class="label">Address:</span> ${cell(ctx.patient.address)}</div>` : ''}
        </div>
        <div>
          <div class="section-title">Prescriber</div>
          <div class="field"><span class="label">Provider:</span> ${cell(ctx.doctor.name)}</div>
          <div class="field"><span class="label">NPI:</span> ${cell(ctx.doctor.npi)}</div>
          ${ctx.doctor.specialty ? `<div class="field"><span class="label">Specialty:</span> ${cell(ctx.doctor.specialty)}</div>` : ''}
          ${ctx.doctor.phone ? `<div class="field"><span class="label">Phone:</span> ${cell(ctx.doctor.phone)}</div>` : ''}
        </div>
      </div>

      ${
        ctx.pharmacy
          ? `<div style="margin-bottom:14px;">
          <div class="section-title">Pharmacy</div>
          <div class="field"><span class="label">Name:</span> ${cell(ctx.pharmacy.name)}</div>
          ${ctx.pharmacy.address ? `<div class="field"><span class="label">Address:</span> ${cell(ctx.pharmacy.address)}</div>` : ''}
          ${ctx.pharmacy.phone ? `<div class="field"><span class="label">Phone:</span> ${cell(ctx.pharmacy.phone)}</div>` : ''}
        </div>`
          : ''
      }

      <div class="section-title">Medications</div>
      ${prescriptionBlocksHtml(ctx)}

      <div class="signature-block">
        <div class="field"><span class="label">Electronically prescribed by:</span> ${cell(ctx.doctor.name)}</div>
        ${ctx.doctor.npi ? `<div class="field"><span class="label">NPI:</span> ${cell(ctx.doctor.npi)}</div>` : ''}
      </div>
      </div>

      <div class="footer">Generated from MyclinicMD EMR.</div>
    </div>
  </body>
</html>`
}

function schedulePrint(target: Window): void {
  const run = () => {
    try {
      target.focus()
      target.print()
    } catch {
      // User can print manually from the preview tab.
    }
  }
  if (target.document.readyState === 'complete') {
    setTimeout(run, 400)
  } else {
    target.addEventListener('load', () => setTimeout(run, 400), { once: true })
  }
}

const PRESCRIPTION_PRINT_STORAGE_PREFIX = 'prescription-print:'

function removePrintIframe(iframe: HTMLIFrameElement): void {
  try {
    document.body.removeChild(iframe)
  } catch {
    /* already removed */
  }
}

function scheduleRevokeObjectUrl(url: string): void {
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000)
}

function printPdfBlob(blob: Blob): boolean {
  const blobUrl = URL.createObjectURL(blob)
  scheduleRevokeObjectUrl(blobUrl)

  const iframe = document.createElement('iframe')
  iframe.setAttribute('title', 'Prescription print')
  iframe.style.cssText =
    'position:fixed;width:0;height:0;border:0;clip:rect(0,0,0,0);overflow:hidden'
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
      schedulePrint(frameWin)
      window.setTimeout(() => removePrintIframe(iframe), 60_000)
    },
    { once: true }
  )

  return true
}

/** Opens a print dialog with a U.S.-format prescription sheet (fax-style layout). */
export async function printUsPrescriptions(ctx: PrescriptionPrintContext): Promise<boolean> {
  try {
    const blob = await buildUsPrescriptionPdfBlob(ctx)
    return printPdfBlob(blob)
  } catch {
    /* fall through to HTML print tab */
  }

  try {
    const storageKey = `${PRESCRIPTION_PRINT_STORAGE_PREFIX}${Date.now()}`
    sessionStorage.setItem(storageKey, JSON.stringify(ctx))
    const printUrl = new URL('/print/prescription', window.location.origin)
    printUrl.searchParams.set('key', storageKey)
    const printWindow = window.open(printUrl.toString(), '_blank')
    return printWindow != null
  } catch {
    return false
  }
}
