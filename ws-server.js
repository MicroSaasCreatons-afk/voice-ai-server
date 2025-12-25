require('dotenv').config();
const http = require('http');
const WebSocket = require('ws');
const { createClient, LiveTranscriptionEvents } = require('@deepgram/sdk');
const OpenAI = require('openai').default;

const PORT = process.env.PORT || 8080;
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

// 1. Create the server and handle the Twilio Handshake immediately
const server = http.createServer((req, res) => {
  console.log(`Incoming request: ${req.method} ${req.url}`);
  
  // Twilio hits the root "/" or "/voice"
  res.writeHead(200, { 'Content-Type': 'text/xml' });
  res.end(`<?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Say>Hi! Connecting you to your AI sales assistant.</Say>
      <Connect>
        <Stream url="wss://${req.headers.host}/streams" />
      </Connect>
    </Response>`);
});

// 2. Setup the WebSocket on the same server
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('🔗 Twilio Call Connected via WebSocket');
  
  const dgLive = deepgram.listen.live({
    model: 'nova-2',
    language: 'en-US',
    smart_format: true,
    encoding: 'mulaw', 
    sample_rate: 8000,
  });

  dgLive.on(LiveTranscriptionEvents.Open, () => {
    console.log('✅ Deepgram ready');
  });

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.event === 'media') {
        dgLive.send(Buffer.from(data.media.payload, 'base64'));
      }
    } catch (e) {
      // Ignore non-json messages
    }
  });

  dgLive.on(LiveTranscriptionEvents.Transcript, (data) => {
    const transcript = data.channel?.alternatives?.[0]?.transcript;
    if (transcript && transcript.trim().length > 1) {
      console.log('👤 User said:', transcript);
    }
  });

  ws.on('close', () => {
    console.log('🔌 Call closed');
    dgLive.finish();
  });
});

// 3. Start the server and keep it running
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 AI Server actively listening on port ${PORT}`);
});