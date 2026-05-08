// api/chat.js — Vercel Serverless Proxy for Groq
// Adds server-side IP rate limiting on top of the client-side 3s cooldown.
// In-memory store is per-instance, which is fine for Vercel's single-instance
// serverless functions — resets on cold start, but cold starts are rare enough
// that this provides meaningful protection against abuse.

// ── RATE LIMIT CONFIG ─────────────────────
const WINDOW_MS   = 60 * 1000;  // 1-minute rolling window
const MAX_REQUESTS = 20;         // max requests per IP per minute
                                 // (20 req/min >> any legitimate user's pace;
                                 //  a script bypassing client cooldown hits this fast)

// In-memory map: ip → { count, windowStart }
const ipMap = new Map();

function isRateLimited(ip) {
  const now    = Date.now();
  const record = ipMap.get(ip);

  if (!record || now - record.windowStart > WINDOW_MS) {
    // New window
    ipMap.set(ip, { count: 1, windowStart: now });
    return false;
  }

  record.count++;
  if (record.count > MAX_REQUESTS) return true;
  return false;
}

// Clean up old entries every 5 minutes to prevent memory leak
setInterval(function() {
  const now = Date.now();
  for (const [ip, record] of ipMap.entries()) {
    if (now - record.windowStart > WINDOW_MS * 2) ipMap.delete(ip);
  }
}, 5 * 60 * 1000);


// ── HANDLER ───────────────────────────────
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get real IP — Vercel sets x-forwarded-for
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
               .split(',')[0].trim();

  if (isRateLimited(ip)) {
    console.warn('[RateLimit] IP blocked:', ip);
    return res.status(429).json({
      error: 'Too many requests. Please wait before sending again.'
    });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error('GROQ_API_KEY environment variable is not set');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Basic request validation — don't forward garbage to Groq
  const body = req.body;
  if (!body || !body.model || !Array.isArray(body.messages) || body.messages.length === 0) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  // Whitelist allowed models — prevents the proxy being used as a general Groq relay
  const allowedModels = [
    'llama-3.3-70b-versatile',
    'llama-3.2-11b-vision-preview'
  ];
  if (!allowedModels.includes(body.model)) {
    return res.status(400).json({ error: 'Model not allowed' });
  }

  try {
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify(body)
    });

    const data = await groqResponse.json();
    return res.status(groqResponse.status).json(data);

  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(500).json({ error: 'Failed to reach Groq API' });
  }
};