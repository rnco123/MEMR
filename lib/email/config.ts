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

export function formatFromAddress(): string {
  const { fromEmail, fromName } = emailConfig
  if (!fromEmail) return ''
  if (!fromName) return fromEmail
  return `${fromName} <${fromEmail}>`
}
