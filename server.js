const express = require('express');
const nodemailer = require('nodemailer');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const DEFAULT_MAIL_TO = 'yixiaoh@kth.se';

app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get('/availability-form', (req, res) => {
  res.sendFile(path.join(__dirname, 'availability-form.html'));
});

app.get('/availability', (req, res) => {
  res.sendFile(path.join(__dirname, 'availability-form.html'));
});

function buildMailHtml(payload) {
  const slotItems = payload.slots
    .map((s) => `<li>${s.date} ${s.start} - ${s.end}</li>`)
    .join('');

  return `
    <h2>New Experiment Availability Submission</h2>
    <p><strong>Name:</strong> ${payload.participantName}</p>
    <p><strong>Email:</strong> ${payload.participantEmail}</p>
    <p><strong>Note:</strong> ${payload.note || 'N/A'}</p>
    <p><strong>Available Time Slots:</strong></p>
    <ul>${slotItems}</ul>
  `;
}

function validatePayload(body) {
  if (!body || typeof body !== 'object') return 'Invalid request body';
  if ('mailTo' in body || 'to' in body || 'recipient' in body) {
    return 'Recipient cannot be specified in the request';
  }
  if (!body.participantName || !body.participantEmail) return 'Name and email are required';
  if (!Array.isArray(body.slots) || body.slots.length === 0) return 'At least one time slot is required';

  for (const slot of body.slots) {
    if (!slot.date || !slot.start || !slot.end) return 'Time slot fields are incomplete';
    if (slot.end <= slot.start) return 'Time slot end time must be later than start time';
  }

  return null;
}

app.post('/api/participant-availability', async (req, res) => {
  const error = validatePayload(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_SECURE,
    SMTP_USER,
    SMTP_PASS,
    MAIL_FROM
  } = process.env;
  const mailTo = process.env.MAIL_TO || DEFAULT_MAIL_TO;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !MAIL_FROM) {
    return res.status(500).json({
      error: 'Email service is not fully configured. Please check environment variables.'
    });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: String(SMTP_SECURE).toLowerCase() === 'true',
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
      }
    });

    const payload = req.body;
    const textSlots = payload.slots
      .map((s, i) => `${i + 1}. ${s.date} ${s.start} - ${s.end}`)
      .join('\n');

    const textBody = [
      'New Experiment Availability Submission',
      `Name: ${payload.participantName}`,
      `Email: ${payload.participantEmail}`,
      `Note: ${payload.note || 'N/A'}`,
      'Available Time Slots:',
      textSlots
    ].join('\n');

    await transporter.sendMail({
      from: MAIL_FROM,
      to: mailTo,
      subject: `Experiment Availability - ${payload.participantName}`,
      text: textBody,
      html: buildMailHtml(payload)
    });

    res.json({ ok: true });
  } catch (e) {
    console.error('Send mail failed:', e);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
