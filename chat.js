// ══════════════════════════════════════════
// /api/chat.js — Vercel Serverless Proxy
// ══════════════════════════════════════════
// Sits between the browser and Groq so the
// API key never appears in frontend JS.
//
// Deploy: just push this file. Vercel picks
// up anything in /api/ automatically.
//
// Set env var in Vercel dashboard:
//   Settings → Environment Variables
//   Name:  GROQ_API_KEY
//   Value: gsk_...your key...
//   Environments: Production, Preview, Development
// ══════════════════════════════════════════

export default async function handler(req, res) {
  // Only accept POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error('GROQ_API_KEY environment variable is not set');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify(req.body)
    });

    const data = await groqResponse.json();

    // Forward Groq's status code (handles 429, 503, etc. automatically)
    return res.status(groqResponse.status).json(data);

  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(500).json({ error: 'Failed to reach Groq API' });
  }
}