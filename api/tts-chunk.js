// Serverless API for single TTS audio chunk (reliable Google APIs gateway with gtx client)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const text = (req.query && req.query.text) || (req.body && req.body.text) || '...';
  const tl = (req.query && req.query.tl) || (req.body && req.body.tl) || 'en-gb';

  try {
    const url = `https://translate.googleapis.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${encodeURIComponent(tl)}&client=gtx`;
    const ttsRes = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://translate.google.com/'
      }
    });

    if (!ttsRes.ok) {
      res.writeHead(ttsRes.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `TTS gateway error HTTP ${ttsRes.status}` }));
      return;
    }

    const buf = Buffer.from(await ttsRes.arrayBuffer());
    
    // Ensure raw binary audio is returned directly without stringification
    res.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Content-Length': buf.length,
      'Cache-Control': 'public, max-age=86400'
    });
    res.end(buf);
  } catch (err) {
    console.error('TTS Chunk Error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}
