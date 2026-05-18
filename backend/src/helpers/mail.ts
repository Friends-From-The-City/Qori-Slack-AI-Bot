// helpers/mail.ts
import { createTransport, createTestAccount, getTestMessageUrl } from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

const {
  NODE_ENV,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASSWORD,
  DEFAULT_MAIL_SENDER,
} = process.env;

interface MailPayload {
  from?: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  [key: string]: unknown;
}

async function getTransporter(): Promise<Transporter<SMTPTransport.SentMessageInfo>> {
  if (NODE_ENV !== 'production') {
    const testAccount = await createTestAccount();
    return createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
  }

  return createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASSWORD,
    },
  });
}

export async function sendMail(mail: MailPayload): Promise<SMTPTransport.SentMessageInfo> {
  const payload = { ...mail };
  if (!payload.from) {
    payload.from = DEFAULT_MAIL_SENDER;
  }

  const transporter = await getTransporter();
  const mailInfo = await transporter.sendMail(payload);

  if (NODE_ENV !== 'production') {
    console.log(`Mail Preview URL is ${getTestMessageUrl(mailInfo)}`);
  }

  return mailInfo;
}
