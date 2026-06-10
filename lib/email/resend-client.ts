import { Resend } from 'resend'
import { AppError } from '@/lib/api-error-handler'
import { emailConfig, formatFromAddress, isResendConfigured } from '@/lib/email/config'

let client: Resend | null = null

function getResendClient(): Resend {
  if (!isResendConfigured()) {
    throw new AppError(
      'Email is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL.',
      503,
      'EMAIL_NOT_CONFIGURED'
    )
  }
  if (!client) {
    client = new Resend(emailConfig.resendApiKey)
  }
  return client
}

export type SendEmailInput = {
  to: string
  subject: string
  html: string
  text?: string
  replyTo?: string
}

export async function sendEmail(input: SendEmailInput): Promise<{ id: string }> {
  const resend = getResendClient()
  const from = formatFromAddress()

  const { data, error } = await resend.emails.send({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    replyTo: input.replyTo,
  })

  if (error) {
    throw new AppError(error.message || 'Failed to send email', 502, 'EMAIL_SEND_FAILED')
  }

  if (!data?.id) {
    throw new AppError('Email provider returned no message id', 502, 'EMAIL_SEND_FAILED')
  }

  return { id: data.id }
}
