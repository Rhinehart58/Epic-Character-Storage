import nodemailer from 'nodemailer'
import type { SmtpStatusResult } from '../shared/character-types'

type MailResult = {
  ok: boolean
  message: string
}

function smtpConfigFromEnv():
  | {
      host: string
      port: number
      secure: boolean
      user: string
      pass: string
      from: string
    }
  | null {
  const host = process.env.SMTP_HOST?.trim()
  const portRaw = process.env.SMTP_PORT?.trim()
  const user = process.env.SMTP_USER?.trim()
  const pass = process.env.SMTP_PASS?.trim()
  const from = process.env.SMTP_FROM?.trim()
  const secureRaw = process.env.SMTP_SECURE?.trim().toLowerCase()

  if (!host || !portRaw || !user || !pass || !from) return null
  const port = Number.parseInt(portRaw, 10)
  if (!Number.isFinite(port)) return null
  const secure = secureRaw === 'true' || secureRaw === '1' || port === 465
  return { host, port, secure, user, pass, from }
}

export function getSmtpStatus(): SmtpStatusResult {
  const required = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'] as const
  const missing = required.filter((key) => !process.env[key]?.trim())
  if (missing.length > 0) {
    return {
      ok: false,
      configured: false,
      message: `SMTP missing: ${missing.join(', ')}`,
      missing: [...missing]
    }
  }
  return {
    ok: true,
    configured: true,
    message: 'SMTP appears configured.',
    missing: []
  }
}

export async function sendAccountConfirmationEmail(input: {
  email: string
  displayName: string
}): Promise<MailResult> {
  const config = smtpConfigFromEnv()
  if (!config) {
    return {
      ok: false,
      message:
        'Account created, but confirmation email not sent. Configure SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_FROM.'
    }
  }

  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass
      }
    })

    await transporter.sendMail({
      from: config.from,
      to: input.email,
      subject: 'Welcome to EPIC CHARACTER STORAGE',
      text: `Hi ${input.displayName}, your account was created successfully for EPIC CHARACTER STORAGE.`,
      html: `<p>Hi ${input.displayName},</p><p>Your account was created successfully for <strong>EPIC CHARACTER STORAGE</strong>.</p>`
    })

    return { ok: true, message: 'Account created and confirmation email sent.' }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown email error'
    return {
      ok: false,
      message: `Account created, but confirmation email failed: ${reason}`
    }
  }
}

export async function sendTestEmail(toEmail: string): Promise<MailResult> {
  const config = smtpConfigFromEnv()
  if (!config) {
    return {
      ok: false,
      message:
        'SMTP is not configured. Set SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_FROM first.'
    }
  }

  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass
      }
    })

    await transporter.sendMail({
      from: config.from,
      to: toEmail,
      subject: 'EPIC CHARACTER STORAGE SMTP Test',
      text: 'This is a test email from EPIC CHARACTER STORAGE.',
      html: '<p>This is a test email from <strong>EPIC CHARACTER STORAGE</strong>.</p>'
    })

    return { ok: true, message: `Test email sent to ${toEmail}.` }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown email error'
    return { ok: false, message: `Test email failed: ${reason}` }
  }
}

