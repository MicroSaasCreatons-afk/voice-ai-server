require('dotenv').config();
const WebSocket = require('ws');
const { createClient, LiveTranscriptionEvents } = require('@deepgram/sdk');
const OpenAI = require('openai').default;

const PORT = process.env.PORT || 8080;
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const wss = new WebSocket.Server({ port: PORT });

console.log(`🚀 WebSocket server running on ws://localhost:${PORT}`);

const script = [
  "Hello! I'm your AI sales assistant. What business do you run?",
  "Interesting. How many calls do you handle each week?",
  "Our system can automate all those calls for you. Want to see how?",
  "Great! I'll send you a trial link. Sound good?",
  "Perfect! Thanks for testing the AI demo."
];

wss.on('connection', async (ws) => {
  console.log('🔗 Client connected');
  
  let step = 0;
  let dgLive = null;
  let keepAliveInterval = null;
  
  try {
    dgLive = deepgram.listen.live({
      model: 'nova-2',
      language: 'en-US',
      smart_format: true,
      interim_results: false,
      encoding: 'linear16',
      sample_rate: 16000,
    });
    
    dgLive.on(LiveTranscriptionEvents.Open, async () => {
      console.log('✅ Deepgram connected');
      
      // Send welcome message
      if (step < script.length) {
        console.log('🤖 Sending welcome:', script[step]);
        ws.send(`AI:${script[step]}`);
        const audio = await textToSpeech(script[step]);
        if (audio) ws.send(audio);
        step++;
      }
      
      // Keep connection alive
      keepAliveInterval = setInterval(() => {
        if (dgLive && dgLive.getReadyState() === 1) {
          dgLive.keepAlive();
        }
      }, 3000);
    });
    
    dgLive.on(LiveTranscriptionEvents.Transcript, async (data) => {
      const transcript = data.channel?.alternatives?.[0]?.transcript;
      
      if (transcript && transcript.trim().length > 2) {
        console.log('👤 User said:', transcript);
        ws.send(`TRANSCRIPT:${transcript}`);
        
        if (step < script.length) {
          const response = script[step];
          console.log('🤖 AI responding:', response);
          ws.send(`AI:${response}`);
          
          const audio = await textToSpeech(response);
          if (audio) {
            console.log('🔊 Sending audio');
            ws.send(audio);
          }
          
          step++;
        } else {
          ws.send('AI:Conversation complete! Thanks for testing.');
        }
      }
    });
    
    dgLive.on(LiveTranscriptionEvents.Error, (error) => {
      console.error('❌ Deepgram error:', error);
    });
    
    dgLive.on(LiveTranscriptionEvents.Close, () => {
      console.log('🔌 Deepgram closed');
      if (keepAliveInterval) clearInterval(keepAliveInterval);
    });
    
    ws.on('message', async (data) => {
      if (dgLive && dgLive.getReadyState() === 1) {
        dgLive.send(data);
      } else {
        console.log('⚠️ Deepgram not ready, state:', dgLive?.getReadyState());
      }
    });
    
    ws.on('close', () => {
      console.log('🔌 Client disconnected');
      if (keepAliveInterval) clearInterval(keepAliveInterval);
      if (dgLive) {
        dgLive.finish();
      }
    });
    
    ws.on('error', (error) => {
      console.error('❌ WebSocket error:', error);
    });
    
  } catch (error) {
    console.error('❌ Setup error:', error);
    if (keepAliveInterval) clearInterval(keepAliveInterval);
    ws.close();
  }
});

async function textToSpeech(text) {
  try {
    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice: "shimmer",
      input: text,
      speed: 1.0
    });
    
    return Buffer.from(await mp3.arrayBuffer());
  } catch (error) {
    console.error('❌ TTS error:', error);
    return null;
  }
}

wss.on('error', (error) => {
  console.error('❌ WebSocket server error:', error);
});

console.log('✅ Server ready for connections');
