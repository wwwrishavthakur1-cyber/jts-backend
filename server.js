const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const pino = require('pino');
const qrcodeImg = require('qrcode');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

let sock;
let latestQr = '';
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

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      latestQr = qr;
      console.log('📸 New QR Code generated! Open your /qr link in browser to scan.');
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`Connection closed: ${lastDisconnect?.error}. Reconnecting: ${shouldReconnect}`);
      if (shouldReconnect) {
        setTimeout(connectToWhatsApp, 5000);
      } else {
        try { fs.rmSync('auth_info_baileys', { recursive: true, force: true }); } catch (e) {}
        setTimeout(connectToWhatsApp, 3000);
      }
    } else if (connection === 'open') {
      latestQr = '';
      console.log('✅ WhatsApp connected successfully as Janakpur Technical Solution!');
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

// Web page route to view and scan the QR code easily
app.get('/qr', async (req, res) => {
  if (!latestQr) {
    return res.send(`
      <div style="text-align: center; font-family: sans-serif; margin-top: 50px;">
        <h2>WhatsApp is either connected already or generating the code...</h2>
        <p>Please wait 10 seconds and refresh this page.</p>
      </div>
    `);
  }
  try {
    const qrDataUrl = await qrcodeImg.toDataURL(latestQr);
    res.send(`
      <div style="text-align: center; font-family: sans-serif; margin-top: 40px;">
        <h2>Scan this QR Code with WhatsApp</h2>
        <p>Open WhatsApp on your phone -> Linked Devices -> Link a Device</p>
        <img src="${qrDataUrl}" alt="WhatsApp QR Code" style="width: 320px; height: 320px; margin-top: 20px; border: 5px solid #25D366; border-radius: 10px;" />
        <p style="margin-top: 20px; color: #666;">Refresh this page if the code expires.</p>
      </div>
    `);
  } catch (err) {
    res.status(500).send('Error generating QR image');
  }
});

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
