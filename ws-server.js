require('dotenv').config();
const http = require('http');
const WebSocket = require('ws');
const { createClient, LiveTranscriptionEvents } = require('@deepgram/sdk');
const OpenAI = require('openai').default;

const PORT = process.env.PORT || 8080;
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// This block handles the initial "Handshake" from Twilio
const server = http.createServer((req, res) => {
  // Listen for the root path to prevent 404 errors
  if (req.url === '/' || req.url === '/voice') {
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(`<?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Say>Hi! Connecting you to your AI assistant.</Say>
        <Connect>
          <Stream url="wss://${req.headers.host}/streams" />
        </Connect>
      </Response>`);
  } else {
    res.writeHead(404);
    res.end();
  }
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('🔗 Twilio Phone Call Connected'); // This will now show in Railway logs
  
  // Setup Deepgram for Phone Audio (8000Hz mulaw)
  const dgLive = deepgram.listen.live({
    model: 'nova-2',
    language: 'en-US',
    smart_format: true,
    encoding: 'mulaw', 
    sample_rate: 8000,
  });

  dgLive.on(LiveTranscriptionEvents.Open, () => {
    console.log('✅ Deepgram ready to transcribe your voice');
  });

  // Relay audio packets from Twilio to Deepgram
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.event === 'media') {
        dgLive.send(Buffer.from(data.media.payload, 'base64'));
      }
    } catch (e) {
      console.error('Error parsing Twilio message:', e);
    }
  });

  dgLive.on(LiveTranscriptionEvents.Transcript, (data) => {
    const transcript = data.channel?.alternatives?.[0]?.transcript;
    if (transcript && transcript.trim().length > 1) {
      console.log('👤 User said:', transcript); // You will see your speech here
    }
  });

  ws.on('close', () => {
    console.log('🔌 Twilio call disconnected');
    dgLive.finish();
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 AI Server listening on port ${PORT}`);
});