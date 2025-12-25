require('dotenv').config();
const http = require('http');
const WebSocket = require('ws');
const { createClient } = require('@deepgram/sdk');
const OpenAI = require('openai').default;

const PORT = process.env.PORT || 8080;

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Create HTTP server
const server = http.createServer((req, res) => {
  console.log('Incoming request:', req.method, req.url);
  
  // Return TwiML to connect via WebSocket
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://voice-ai-server-production-3814.up.railway.app/stream" />
  </Connect>
</Response>`;
  
  res.writeHead(200, { 'Content-Type': 'text/xml' });
  res.end(twiml);
});

// Create WebSocket server
const wss = new WebSocket.Server({ server, path: '/stream' });

console.log(`🚀 Server running on port ${PORT}`);

const script = [
  "Hello! I'm your AI sales assistant. What business do you run?",
  "Interesting. How many calls do you handle each week?",
  "Our system can automate all those calls for you. Want to see how?",
  "Great! I'll send you a trial link. Sound good?",
  "Perfect! Thanks for testing the AI demo."
];

wss.on('connection', async (ws) => {
  console.log('🔗 Twilio Call Connected via WebSocket');
  
  let step = 0;
  let dgLive = null;
  
  try {
    dgLive = deepgram.listen.live({
      model: 'nova-2',
      language: 'en-US',
      smart_format: true,
      interim_results: false,
      encoding: 'mulaw',
      sample_rate: 8000,
    });
    
    dgLive.on('open', async () => {
      console.log('✅ Deepgram ready');
      
      // Send welcome message
      if (step < script.length) {
        const welcomeAudio = await textToSpeech(script[step]);
        if (welcomeAudio) {
          ws.send(JSON.stringify({
            event: 'media',
            media: { payload: welcomeAudio.toString('base64') }
          }));
          console.log('🎤 Sent welcome message');
        }
        step++;
      }
    });
    
    dgLive.on('Results', async (data) => {
      const transcript = data.channel?.alternatives?.[0]?.transcript;
      
      if (transcript && transcript.trim().length > 2) {
        console.log('👤 User said:', transcript);
        
        if (step < script.length) {
          const response = script[step];
          console.log('🤖 AI Response:', response);
          
          const audio = await textToSpeech(response);
          if (audio) {
            ws.send(JSON.stringify({
              event: 'media',
              media: { payload: audio.toString('base64') }
            }));
            console.log('🎤 Sent AI response');
          }
          step++;
        }
      }
    });
    
    dgLive.on('error', (error) => {
      console.error('❌ Deepgram error:', error);
    });
    
  } catch (error) {
    console.error('❌ Setup error:', error);
    ws.close();
  }
  
  ws.on('message', async (message) => {
    try {
      const msg = JSON.parse(message);
      
      if (msg.event === 'media' && msg.media.payload) {
        const audioBuffer = Buffer.from(msg.media.payload, 'base64');
        if (dgLive && dgLive.getReadyState() === 1) {
          dgLive.send(audioBuffer);
        }
      }
      
      if (msg.event === 'start') {
        console.log('📞 Call started');
      }
    } catch (error) {
      console.error('Message error:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('🔌 Call closed');
    if (dgLive) dgLive.finish();
  });
});

async function textToSpeech(text) {
  try {
    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice: "nova",
      input: text,
      response_format: "pcm",
      speed: 1.0
    });
    return Buffer.from(await mp3.arrayBuffer());
  } catch (error) {
    console.error('❌ TTS error:', error);
    return null;
  }
}

server.listen(PORT, () => {
  console.log(`✅ Server ready for connections on port ${PORT}`);
});
