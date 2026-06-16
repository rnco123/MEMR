function getOptionalEnv(key: string): string {
  return process.env[key]?.trim() ?? ''
}

export const emailConfig = {
  resendApiKey: getOptionalEnv('RESEND_API_KEY'),
  fromEmail: getOptionalEnv('RESEND_FROM_EMAIL'),
  fromName: getOptionalEnv('RESEND_FROM_NAME') || 'MyClinicMD',
} as const

export function isResendConfigured(): boolean {
  return Boolean(emailConfig.resendApiKey && emailConfig.fromEmail)
}

export function formatFromAddress(options?: { fromName?: string; fromEmail?: string }): string {
  const email = options?.fromEmail?.trim() || emailConfig.fromEmail
  if (!email) return ''
  const name = options?.fromName?.trim() || emailConfig.fromName
  if (!name) return email
  return `${name} <${email}>`
}
