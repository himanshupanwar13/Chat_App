function buildOtpEmailTemplate(otp, purpose = 'signup') {
  const purposeText = String(purpose || 'signup').replace(/[-_]/g, ' ');

  return {
    subject: 'ChatterFlow Verification Code',

    text: `ChatterFlow

Verify your email for ${purposeText}.

Your verification code is: ${otp}

This code expires in 5 minutes.

If you did not request this code, you can safely ignore this email.`,

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

            <h1 style="margin:0 0 16px;font-size:32px;line-height:1.2;color:#111827;text-align:center;">
              Verify your email
            </h1>

            <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#4b5563;text-align:center;">
              Your verification code is:
            </p>

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

async function sendViaBrevo({ email, subject, text, html }) {
  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.EMAIL_FROM;
  const fromName = process.env.EMAIL_FROM_NAME || 'ChatterFlow';

  if (!apiKey) {
    throw new Error('BREVO_API_KEY is not configured.');
  }

  if (!fromEmail) {
    throw new Error('EMAIL_FROM is not configured.');
  }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',

    headers: {
      accept: 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json',
    },

    body: JSON.stringify({
      sender: {
        name: fromName,
        email: fromEmail,
      },

      to: [
        {
          email,
        },
      ],

      subject,
      textContent: text,
      htmlContent: html,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error('Brevo API error:', data);

    throw new Error(
      data?.message ||
        `Brevo API failed with status ${response.status}`
    );
  }

  return {
    ok: true,
    messageId: data.messageId,
  };
}

async function sendOtpEmail({ email, otp, purpose = 'signup' }) {
  const provider = String(
    process.env.EMAIL_PROVIDER || ''
  ).toLowerCase();

  const template = buildOtpEmailTemplate(otp, purpose);

  if (provider === 'brevo') {
    return sendViaBrevo({
      email,
      ...template,
    });
  }

  throw new Error(
    'No supported email provider configured. Set EMAIL_PROVIDER=brevo.'
  );
}

module.exports = {
  sendOtpEmail,
};