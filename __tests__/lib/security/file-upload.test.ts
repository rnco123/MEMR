import {
  DOCX_MIME_TYPE,
  PATIENT_DOCUMENT_ACCEPT,
  resolvePatientDocumentContentType,
  scanPatientDocumentContent,
  validateFileUpload,
  validatePatientDocumentUpload,
} from '@/lib/security/file-upload'

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]

function makeFile(name: string, type: string, magic: number[] = ZIP_MAGIC): File {
  const bytes = new Uint8Array([...magic, 0x00, 0x00, 0x00, 0x00])
  const file = new File([bytes], name, { type })
  // jsdom's File has no arrayBuffer(); the content scan needs it.
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => bytes.buffer.slice(0),
  })
  return file
}

describe('docx uploads', () => {
  it('offers .docx in the patient document picker filter', () => {
    expect(PATIENT_DOCUMENT_ACCEPT).toContain('.docx')
    expect(PATIENT_DOCUMENT_ACCEPT).toContain(DOCX_MIME_TYPE)
  })

  it('accepts a .docx patient document', () => {
    const file = makeFile('discharge-summary.docx', DOCX_MIME_TYPE)
    expect(validatePatientDocumentUpload(file)).toEqual({ valid: true })
  })

  it('resolves the docx content type from the extension when the browser omits the MIME', () => {
    const file = makeFile('referral.docx', '')
    expect(resolvePatientDocumentContentType(file)).toBe(DOCX_MIME_TYPE)
    expect(validatePatientDocumentUpload(file)).toEqual({ valid: true })
  })

  it('accepts a .docx chat/support attachment', () => {
    const file = makeFile('notes.docx', DOCX_MIME_TYPE)
    expect(validateFileUpload(file)).toEqual({ valid: true })
  })

  it('rejects a .docx whose content is not a zip container', async () => {
    const file = makeFile('fake.docx', DOCX_MIME_TYPE, PDF_MAGIC)
    const result = await scanPatientDocumentContent(file)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('DOCX')
  })

  it('passes the content scan for a real zip-backed .docx', async () => {
    const file = makeFile('real.docx', DOCX_MIME_TYPE)
    await expect(scanPatientDocumentContent(file)).resolves.toEqual({ valid: true })
  })

  it('still rejects unrelated file types', () => {
    const file = makeFile('macro.docm', 'application/vnd.ms-word.document.macroEnabled.12')
    expect(validatePatientDocumentUpload(file).valid).toBe(false)
  })
})
