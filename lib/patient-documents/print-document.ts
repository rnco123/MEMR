export type PrintablePatientDocument = {
  file_url: string
  file_type: string
  document_name: string
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeAttr(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

function scheduleRevokeObjectUrl(url: string): void {
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000)
}

function isSameOriginDocumentUrl(url: string): boolean {
  if (url.startsWith('/')) return true
  try {
    return new URL(url, window.location.origin).origin === window.location.origin
  } catch {
    return false
  }
}

async function fetchDocumentBlob(url: string): Promise<Response> {
  const init: RequestInit | undefined = isSameOriginDocumentUrl(url)
    ? { credentials: 'include' }
    : undefined
  return fetch(url, init)
}

function openPrintWindow(html: string): Window | null {
  const printWindow = window.open('', '_blank')
  if (!printWindow) return null
  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
  return printWindow
}

function writePrintWindow(printWindow: Window, html: string): void {
  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
}

function showPreparingDocument(printWindow: Window, title: string): void {
  writePrintWindow(
    printWindow,
    `<!DOCTYPE html><html><head><title>${escapeHtml(title)}</title></head>` +
      '<body style="font-family:sans-serif;color:#444;padding:24px">Preparing document for print…</body></html>'
  )
}

function buildPdfPrintHtml(blobUrl: string, title: string): string {
  const safeTitle = escapeHtml(title)
  const safeSrc = escapeAttr(blobUrl)
  return `<!DOCTYPE html>
<html>
  <head>
    <title>${safeTitle}</title>
    <style>
      html, body { margin: 0; width: 100%; height: 100%; }
      iframe { width: 100%; height: 100%; border: 0; }
    </style>
  </head>
  <body>
    <iframe id="print-frame" src="${safeSrc}"></iframe>
    <script>
      var frame = document.getElementById('print-frame');
      frame.onload = function () {
        setTimeout(function () {
          try {
            frame.contentWindow.focus();
            frame.contentWindow.print();
          } catch (e) {
            window.focus();
            window.print();
          }
        }, 400);
      };
    </script>
  </body>
</html>`
}

function buildImagePrintHtml(blobUrl: string, title: string): string {
  const safeTitle = escapeHtml(title)
  const safeSrc = escapeAttr(blobUrl)
  return `<!DOCTYPE html>
<html>
  <head>
    <title>${safeTitle}</title>
    <style>
      @page { margin: 0.5in; }
      body { margin: 0; display: flex; justify-content: center; align-items: flex-start; }
      img { max-width: 100%; height: auto; }
    </style>
  </head>
  <body>
    <img src="${safeSrc}" alt="${safeTitle}" onload="setTimeout(function(){ window.focus(); window.print(); }, 100)" />
  </body>
</html>`
}

/** Opens the browser print dialog for an in-memory PDF blob. */
export function printPdfBlob(
  blob: Blob,
  title: string,
  targetWindow?: Window | null
): boolean {
  const blobUrl = URL.createObjectURL(blob)
  scheduleRevokeObjectUrl(blobUrl)
  const html = buildPdfPrintHtml(blobUrl, title)

  if (targetWindow && !targetWindow.closed) {
    targetWindow.document.open()
    targetWindow.document.write(html)
    targetWindow.document.close()
    return true
  }

  return openPrintWindow(html) != null
}

/** Opens the browser print dialog for a patient document (PDF or image). */
export async function printPatientDocument(
  doc: PrintablePatientDocument,
  targetWindow?: Window | null
): Promise<boolean> {
  const url = doc.file_url?.trim()
  if (!url) return false

  // Open synchronously while the click still has browser user activation. Opening
  // only after fetch() is a common reason print windows are blocked.
  const printWindow = targetWindow ?? window.open('', '_blank')
  if (!printWindow) return false
  showPreparingDocument(printWindow, doc.document_name)

  const fileType = doc.file_type || ''

  try {
    const response = await fetchDocumentBlob(url)
    if (!response.ok) {
      printWindow.location.replace(url)
      return true
    }

    const blob = await response.blob()
    const blobUrl = URL.createObjectURL(blob)
    scheduleRevokeObjectUrl(blobUrl)

    const resolvedType = (fileType || blob.type || '').toLowerCase()
    const isPdf =
      resolvedType.split(';', 1)[0]?.trim() === 'application/pdf' ||
      blob.type.toLowerCase().split(';', 1)[0]?.trim() === 'application/pdf' ||
      /\.pdf(?:$|[?#])/i.test(url)
    const isImage = resolvedType.startsWith('image/') || blob.type.startsWith('image/')

    if (isPdf) {
      writePrintWindow(printWindow, buildPdfPrintHtml(blobUrl, doc.document_name))
      return true
    }

    if (isImage) {
      writePrintWindow(printWindow, buildImagePrintHtml(blobUrl, doc.document_name))
      return true
    }

    printWindow.location.replace(blobUrl)
    return true
  } catch {
    if (!printWindow.closed) {
      printWindow.location.replace(url)
      return true
    }
    return false
  }
}
