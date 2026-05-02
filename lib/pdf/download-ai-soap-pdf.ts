export interface AiSoapPdfRow {
  label: string
  value: string
}

export interface AiSoapPdfSection {
  title: string
  body: string
}

export interface AiSoapPdfOptions {
  title: string
  generatedLine: string
  patientSectionTitle: string
  patientRows: AiSoapPdfRow[]
  visitSectionTitle: string
  visitRows: AiSoapPdfRow[]
  sections: AiSoapPdfSection[]
}

function plainText(s: string): string {
  return s.replace(/\*\*/g, '').replace(/\r\n/g, '\n').trim()
}

/** Client-only: builds a letter-size PDF and triggers download. */
export async function downloadAiSoapPdf(options: AiSoapPdfOptions, filename: string): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const left = 48
  const maxW = 515
  let y = 44
  const bottom = 765

  const newPageIfNeeded = (h: number) => {
    if (y + h > bottom) {
      doc.addPage()
      y = 44
    }
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text(options.title, left, y)
  y += 20

  doc.setFont('helvetica', 'italic')
  doc.setFontSize(9)
  doc.setTextColor(90, 90, 90)
  doc.text(options.generatedLine, left, y)
  doc.setTextColor(0, 0, 0)
  y += 22

  const writeBoldHeading = (text: string) => {
    newPageIfNeeded(20)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text(text, left, y)
    y += 14
  }

  const writeWrapped = (text: string, fontSize: number) => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(fontSize)
    const lines = doc.splitTextToSize(plainText(text), maxW)
    for (const line of lines) {
      newPageIfNeeded(fontSize + 4)
      doc.text(line, left, y)
      y += fontSize + 2
    }
  }

  const writeKeyValueBlock = (heading: string, rows: AiSoapPdfRow[]) => {
    writeBoldHeading(heading)
    for (const { label, value } of rows) {
      const line = `${label}: ${value}`
      writeWrapped(line, 10)
    }
    y += 6
  }

  writeKeyValueBlock(options.patientSectionTitle, options.patientRows)
  writeKeyValueBlock(options.visitSectionTitle, options.visitRows)

  for (const sec of options.sections) {
    writeBoldHeading(sec.title)
    writeWrapped(sec.body || '—', 10)
    y += 6
  }

  doc.save(filename)
}
