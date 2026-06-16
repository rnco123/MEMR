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

/** Opens the browser print dialog for a patient document (PDF or image). */
export function printPatientDocument(doc: PrintablePatientDocument): void {
  const url = doc.file_url?.trim()
  if (!url) return

  const fileType = doc.file_type || ''

  if (fileType === 'application/pdf') {
    const printWindow = window.open(url, '_blank', 'noopener,noreferrer')
    if (!printWindow) return

    const triggerPrint = () => {
      try {
        printWindow.focus()
        printWindow.print()
      } catch {
        // Browser PDF viewer may block programmatic print; user can print manually.
      }
    }

    printWindow.addEventListener('load', triggerPrint)
    window.setTimeout(triggerPrint, 1500)
    return
  }

  if (fileType.startsWith('image/')) {
    const printWindow = window.open('', '_blank', 'noopener,noreferrer')
    if (!printWindow) return

    const safeTitle = escapeHtml(doc.document_name)
    const safeUrl = url.replace(/"/g, '&quot;')

    printWindow.document.write(`<!DOCTYPE html>
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
    <img src="${safeUrl}" alt="${safeTitle}" onload="window.print()" />
  </body>
</html>`)
    printWindow.document.close()
    return
  }

  window.open(url, '_blank', 'noopener,noreferrer')
}
