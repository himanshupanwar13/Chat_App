const nodemailer = require('nodemailer');

function buildOtpEmailTemplate(otp, purpose = 'signup') {
  const purposeText = String(purpose || 'signup').replace(/[-_]/g, ' ');

  return {
    subject: 'ChatterFlow Verification Code',
    text: `ChatterFlow\n\nVerify your email for ${purposeText}.\n\nYour verification code is: ${otp}\n\nThis code expires in 5 minutes.\n\nIf you did not request this code, you can safely ignore this email.`,
    html: `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>ChatterFlow Verification</title>
        </head>
        <body style="margin:0;padding:0;background:#f5f3ff;font-family:Arial,sans-serif;">
          <div style="max-width:600px;margin:40px auto;background:#ffffff;border-radius:16px;padding:32px;border:1px solid #e9d5ff;">
            <div style="text-align:center;margin-bottom:20px;">
              <div style="display:inline-block;padding:10px 16px;border-radius:999px;background:#f3e8ff;color:#6d28d9;font-weight:700;letter-spacing:0.08em;font-size:12px;">
                ChatterFlow
              </div>
            </div>
            <h1 style="margin:0 0 16px;font-size:32px;line-height:1.2;color:#111827;text-align:center;">Verify your email</h1>
            <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#4b5563;text-align:center;">Your verification code is:</p>
            <div style="text-align:center;margin:24px 0;">
              <div style="display:inline-block;padding:18px 28px;border-radius:12px;background:#f3e8ff;color:#4c1d95;font-size:32px;font-weight:700;letter-spacing:0.3em;">
                ${otp}
              </div>
            </div>
            <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#6b7280;text-align:center;">
              This code expires in 5 minutes.
            </p>
            <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280;text-align:center;">
              If you did not request this code, you can safely ignore this email.
            </p>
          </div>
        </body>
      </html>
    `,
  };
}

function createGmailTransport() {
  const gmailUser = process.env.GMAIL_USER;
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;

  if (!gmailUser || !gmailAppPassword) {
    throw new Error(
      'Email provider is not configured (GMAIL_USER and GMAIL_APP_PASSWORD are required for Gmail).'
    );
  }

  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: gmailUser,
      pass: gmailAppPassword,
    },
  });
}

async function sendViaGmail({ email, subject, text, html }) {
  const fromEmail = process.env.EMAIL_FROM;

  if (!fromEmail) {
    throw new Error('Email provider is not configured (EMAIL_FROM is required).');
  }

  const transporter = createGmailTransport();
  await transporter.sendMail({
    from: fromEmail,
    to: email,
    subject,
    text,
    html,
  });

  return { ok: true };
}

async function sendOtpEmail({ email, otp, purpose = 'signup' }) {
  const provider = (process.env.EMAIL_PROVIDER || '').toLowerCase();
  const template = buildOtpEmailTemplate(otp, purpose);

  if (provider === 'gmail') {
    return sendViaGmail({ email, ...template });
  }

  throw new Error(
    'No supported email provider configured. Set EMAIL_PROVIDER to "gmail" and configure Gmail SMTP credentials.'
  );
}

module.exports = {
  sendOtpEmail,
};
