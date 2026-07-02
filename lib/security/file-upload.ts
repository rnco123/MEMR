/**
 * Enhanced file upload security
 */

export interface FileValidationResult {
  valid: boolean
  error?: string
}

/**
 * Allowed MIME types for document uploads
 */
const ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
]

/**
 * Allowed file extensions
 */
const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.pdf', '.doc', '.docx']

/**
 * Maximum file size (10MB) — chat and general uploads
 */
const MAX_FILE_SIZE = 10 * 1024 * 1024

/** Patient chart documents (PDF / images) */
export const PATIENT_DOCUMENT_MAX_BYTES = 50 * 1024 * 1024

const PATIENT_DOCUMENT_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.pdf'] as const

const PATIENT_DOCUMENT_MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.pdf': 'application/pdf',
}

const PATIENT_DOCUMENT_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'application/pdf',
])

function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  if (dot < 0) return ''
  return fileName.slice(dot).toLowerCase()
}

/** Resolve content type from browser MIME and/or file extension (Windows often omits MIME). */
export function resolvePatientDocumentContentType(file: File): string | null {
  const ext = fileExtension(file.name)
  if (file.type) {
    if (file.type === 'image/jpg') return 'image/jpeg'
    if (PATIENT_DOCUMENT_MIMES.has(file.type)) return file.type
  }
  return PATIENT_DOCUMENT_MIME_BY_EXT[ext] ?? null
}

/**
 * Validate file upload
 */
export function validateFileUpload(file: File): FileValidationResult {
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / 1024 / 1024}MB`,
    }
  }

  if (file.size === 0) {
    return {
      valid: false,
      error: 'File is empty',
    }
  }

  // Check MIME type
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `File type not allowed. Allowed types: ${ALLOWED_EXTENSIONS.join(', ')}`,
    }
  }

  // Check file extension
  const fileName = file.name.toLowerCase()
  const extension = fileName.substring(fileName.lastIndexOf('.'))
  
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return {
      valid: false,
      error: `File extension not allowed. Allowed extensions: ${ALLOWED_EXTENSIONS.join(', ')}`,
    }
  }

  // Validate file name
  if (!isValidFileName(file.name)) {
    return {
      valid: false,
      error: 'Invalid file name. File name contains invalid characters.',
    }
  }

  // Check for suspicious file names
  if (isSuspiciousFileName(file.name)) {
    return {
      valid: false,
      error: 'File name is not allowed',
    }
  }

  return { valid: true }
}

/** Validate patient chart document uploads (50MB, PDF/PNG/JPEG). */
export function validatePatientDocumentUpload(file: File): FileValidationResult {
  if (file.size === 0) {
    return { valid: false, error: 'File is empty' }
  }
  if (file.size > PATIENT_DOCUMENT_MAX_BYTES) {
    return {
      valid: false,
      error: `File size exceeds maximum allowed size of ${PATIENT_DOCUMENT_MAX_BYTES / 1024 / 1024}MB`,
    }
  }

  const ext = fileExtension(file.name)
  if (!PATIENT_DOCUMENT_EXTENSIONS.includes(ext as (typeof PATIENT_DOCUMENT_EXTENSIONS)[number])) {
    return {
      valid: false,
      error: 'Invalid file type. Please upload PDF, PNG, JPEG, or JPG files only.',
    }
  }

  if (!resolvePatientDocumentContentType(file)) {
    return {
      valid: false,
      error: 'Invalid file type. Please upload PDF, PNG, JPEG, or JPG files only.',
    }
  }

  if (!isValidFileName(file.name)) {
    return {
      valid: false,
      error: 'Invalid file name. File name contains invalid characters.',
    }
  }

  if (isSuspiciousFileName(file.name)) {
    return { valid: false, error: 'File name is not allowed' }
  }

  return { valid: true }
}

/**
 * Validate file name
 */
function isValidFileName(fileName: string): boolean {
  if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
    return false
  }
  if (fileName.includes('\0') || /[\x00-\x1f]/.test(fileName)) {
    return false
  }
  if (fileName.length > 255) {
    return false
  }
  return true
}

/**
 * Check for suspicious file names
 */
function isSuspiciousFileName(fileName: string): boolean {
  const suspiciousPatterns = [
    /\.(exe|bat|cmd|com|pif|scr|vbs|js|jar|app|deb|rpm)$/i,
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i,
    /^\.(htaccess|htpasswd|ini|php|asp|aspx|jsp)$/i,
  ]

  return suspiciousPatterns.some((pattern) => pattern.test(fileName))
}

/**
 * Scan file content for malicious patterns (basic check)
 * In production, use a proper antivirus/security scanner
 */
export async function scanFileContent(file: File): Promise<FileValidationResult> {
  const contentType = file.type || null
  return scanFileContentByType(file, contentType)
}

/** Content signature check for patient chart uploads (uses extension when MIME is missing). */
export async function scanPatientDocumentContent(file: File): Promise<FileValidationResult> {
  const contentType = resolvePatientDocumentContentType(file)
  if (!contentType) {
    return { valid: false, error: 'Invalid file type' }
  }
  return scanFileContentByType(file, contentType)
}

async function scanFileContentByType(
  file: File,
  contentType: string | null
): Promise<FileValidationResult> {
  if (!contentType) return { valid: true }

  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer.slice(0, 8))

  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  const jpegSignature = [0xff, 0xd8, 0xff]
  const pdfSignature = [0x25, 0x50, 0x44, 0x46]

  const isPng = bytes.slice(0, 8).every((byte, i) => byte === pngSignature[i])
  const isJpeg = bytes.slice(0, 3).every((byte, i) => byte === jpegSignature[i])
  const isPdf = bytes.slice(0, 4).every((byte, i) => byte === pdfSignature[i])

  if (contentType === 'image/png' && !isPng) {
    return { valid: false, error: 'File content does not match declared type (PNG)' }
  }

  if (contentType === 'image/jpeg' && !isJpeg) {
    return { valid: false, error: 'File content does not match declared type (JPEG)' }
  }

  if (contentType === 'application/pdf' && !isPdf) {
    return { valid: false, error: 'File content does not match declared type (PDF)' }
  }

  return { valid: true }
}

/**
 * Generate secure file name
 */
// Storage paths must be unguessable — prefer CSPRNG over Math.random().
function secureRandomSuffix(): string {
  const c = globalThis.crypto
  if (typeof c?.randomUUID === 'function') {
    return c.randomUUID().replace(/-/g, '').slice(0, 13)
  }
  if (typeof c?.getRandomValues === 'function') {
    const bytes = c.getRandomValues(new Uint8Array(8))
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 13)
  }
  // Last resort for environments without WebCrypto
  return Math.random().toString(36).substring(2, 15)
}

export function generateSecureFileName(originalName: string): string {
  const timestamp = Date.now()
  const random = secureRandomSuffix()
  const extension = originalName.substring(originalName.lastIndexOf('.'))
  const sanitized = originalName
    .substring(0, originalName.lastIndexOf('.'))
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .substring(0, 50)

  return `${sanitized}_${timestamp}_${random}${extension}`
}
