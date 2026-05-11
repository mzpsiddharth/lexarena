// api/rag.js — Vercel Serverless RAG Function
// Receives a user argument, embeds it with Nomic,
// searches Pinecone for relevant Indian law sections,
// returns top 3 sections as plain text for injection into Groq prompt.

const INDEX_HOST = 'https://lexarena-laws-g6ytlqa.svc.aped-4627-b74a.pinecone.io';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query } = req.body;
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return res.status(400).json({ error: 'query is required' });
  }

  const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
  const NOMIC_API_KEY    = process.env.NOMIC_API_KEY;

  if (!PINECONE_API_KEY || !NOMIC_API_KEY) {
    console.error('RAG: Missing env vars');
    // Return empty — RAG failure should never break the main chat
    return res.status(200).json({ sections: [] });
  }

  try {
    // Step 1: Embed the user's query with Nomic
    const embedResponse = await fetch('https://api-atlas.nomic.ai/v1/embedding/text', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Bearer ' + NOMIC_API_KEY
      },
      body: JSON.stringify({
        model:     'nomic-embed-text-v1.5',
        texts:     [query.trim()],
        task_type: 'search_query'   // query task type for retrieval
      })
    });

    if (!embedResponse.ok) {
      console.error('RAG: Nomic error', embedResponse.status);
      return res.status(200).json({ sections: [] });
    }

    const embedData  = await embedResponse.json();
    const queryVector = embedData.embeddings[0];

    // Step 2: Search Pinecone for top 3 matching sections
    const searchResponse = await fetch(INDEX_HOST + '/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Api-Key':      PINECONE_API_KEY
      },
      body: JSON.stringify({
        vector:          queryVector,
        topK:            3,
        includeMetadata: true,
        namespace:       'indian-law'
      })
    });

    if (!searchResponse.ok) {
      console.error('RAG: Pinecone error', searchResponse.status);
      return res.status(200).json({ sections: [] });
    }

    const searchData = await searchResponse.json();
    const matches    = searchData.matches || [];

    // Step 3: Return sections with score > 0.5 (relevance threshold)
    // Below 0.5 means the section is not actually relevant — don't inject noise
    const sections = matches
      .filter(m => m.score > 0.5)
      .map(m => ({
        act:     m.metadata.act,
        section: m.metadata.section,
        title:   m.metadata.title,
        text:    m.metadata.text,
        score:   Math.round(m.score * 100) / 100
      }));

    return res.status(200).json({ sections });

  } catch (error) {
    console.error('RAG error:', error);
    // Always return 200 with empty sections — RAG is enhancement, not critical path
    return res.status(200).json({ sections: [] });
  }
};