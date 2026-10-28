const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const pino = require('pino');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

let sock;
const otpStore = {};

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'www.rishavthakur1@gmail.com',
    pass: 'YOUR_GMAIL_APP_PASSWORD'
  }
});

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['Ubuntu', 'Chrome', '20.0.04']
  });

  if (!sock.authState.creds.registered) {
    setTimeout(async () => {
      try {
        const phoneNumber = '9779707997960'; // Your phone number with country code
        const code = await sock.requestPairingCode(phoneNumber);
        console.log('\n========================================');
        console.log(`📱 YOUR WHATSAPP PAIRING CODE IS: ${code}`);
        console.log('========================================\n');
      } catch (err) {
        console.error('Error generating pairing code:', err.message);
      }
    }, 4000);
  }

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`Connection closed: ${lastDisconnect?.error}. Reconnecting: ${shouldReconnect}`);
      if (shouldReconnect) {
        setTimeout(connectToWhatsApp, 10000);
      } else {
        try { fs.rmSync('auth_info_baileys', { recursive: true, force: true }); } catch (e) {}
        setTimeout(connectToWhatsApp, 5000);
      }
    } else if (connection === 'open') {
      console.log('✅ WhatsApp connected successfully as Janakpur Technical Solution!');
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

app.post('/send-whatsapp-otp', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ success: false, message: 'Phone is required' });
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const fullPhone = `977${phone}@s.whatsapp.net`;
  otpStore[phone] = otp;
  const msg = `*Janakpur Technical Solution*\nYour verification code is: *${otp}*\nThis code is valid for 10 minutes.`;
  try {
    if (!sock) throw new Error('WhatsApp not initialized');
    await sock.sendMessage(fullPhone, { text: msg });
    console.log(`✅ WhatsApp OTP sent to +977 ${phone}: ${otp}`);
    res.json({ success: true, message: 'WhatsApp OTP sent successfully' });
  } catch (err) {
    console.error('❌ WhatsApp Send Error:', err.message);
    res.status(500).json({ success: false, error: err.message, fallbackOtp: otp });
  }
});

app.post('/send-email-otp', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, message: 'Email required' });
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore[email] = otp;
  const mailOptions = {
    from: '"Janakpur Technical Solution" <www.rishavthakur1@gmail.com>',
    to: email,
    subject: 'Your JTS Verification Code',
    text: `Your verification code is: ${otp}`
  };
  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Email OTP sent to ${email}: ${otp}`);
    res.json({ success: true, message: 'Email OTP sent' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 JTS Auth Server running on port ${PORT}`);
  connectToWhatsApp();
});
