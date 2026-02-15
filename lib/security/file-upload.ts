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
 * Maximum file size (10MB)
 */
const MAX_FILE_SIZE = 10 * 1024 * 1024

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

/**
 * Validate file name
 */
function isValidFileName(fileName: string): boolean {
  // Check for path traversal attempts
  if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
    return false
  }

  // Check for null bytes
  if (fileName.includes('\0')) {
    return false
  }

  // Check length
  if (fileName.length > 255) {
    return false
  }

  // Check for only valid characters
  const validPattern = /^[a-zA-Z0-9._-]+$/
  return validPattern.test(fileName.replace(/\s/g, ''))
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
  // Basic content validation - check first few bytes for file signature
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer.slice(0, 8))

  // PNG signature
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  // JPEG signature
  const jpegSignature = [0xff, 0xd8, 0xff]
  // PDF signature
  const pdfSignature = [0x25, 0x50, 0x44, 0x46] // %PDF

  const isPng = bytes.slice(0, 8).every((byte, i) => byte === pngSignature[i])
  const isJpeg = bytes.slice(0, 3).every((byte, i) => byte === jpegSignature[i])
  const isPdf = bytes.slice(0, 4).every((byte, i) => byte === pdfSignature[i])

  if (file.type === 'image/png' && !isPng) {
    return {
      valid: false,
      error: 'File content does not match declared type (PNG)',
    }
  }

  if ((file.type === 'image/jpeg' || file.type === 'image/jpg') && !isJpeg) {
    return {
      valid: false,
      error: 'File content does not match declared type (JPEG)',
    }
  }

  if (file.type === 'application/pdf' && !isPdf) {
    return {
      valid: false,
      error: 'File content does not match declared type (PDF)',
    }
  }

  return { valid: true }
}

/**
 * Generate secure file name
 */
export function generateSecureFileName(originalName: string): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 15)
  const extension = originalName.substring(originalName.lastIndexOf('.'))
  const sanitized = originalName
    .substring(0, originalName.lastIndexOf('.'))
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .substring(0, 50)

  return `${sanitized}_${timestamp}_${random}${extension}`
}
