// Serverless API endpoint for Uno Router proxy

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { endpoint, apiKey, model, messages, prompt, modalities, audio, temperature } = req.body || {};

    const targetKey = apiKey || process.env.UNO_API_KEY || req.headers['authorization']?.replace('Bearer ', '') || 'sk-UE7RO864vd28guRe8sGAp3W6HfsiZgG3ktSNwlZHrNH9k21C';
    if (!targetKey) {
      return res.status(400).json({ error: 'Missing Uno Router API key' });
    }

    const targetEndpoint = endpoint || process.env.UNO_ENDPOINT || 'https://api.unorouter.com/v1/chat/completions';
    const targetModel = model || process.env.UNO_MODEL || 'gemini-robotics-er-2-preview:free';

    const requestBody = {
      model: targetModel,
      messages: messages || [{ role: 'user', content: prompt || 'Hello' }]
    };

    if (modalities) requestBody.modalities = modalities;
    if (audio) requestBody.audio = audio;
    if (temperature !== undefined) requestBody.temperature = temperature;

    const unorouterRes = await fetch(targetEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${targetKey.trim()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    const status = unorouterRes.status;
    const data = await unorouterRes.text();

    res.setHeader('Content-Type', unorouterRes.headers.get('content-type') || 'application/json');
    return res.status(status).send(data);
  } catch (err) {
    console.error('Uno Router Proxy Error:', err);
    return res.status(500).json({
      error: {
        message: 'Failed to communicate with Uno Router: ' + err.message,
        code: 'PROXY_ERROR'
      }
    });
  }
}
