// Serverless API for single TTS audio chunk (fast, reliable, zero timeouts)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const text = (req.query && req.query.text) || (req.body && req.body.text) || '...';
  const tl = (req.query && req.query.tl) || (req.body && req.body.tl) || 'en-gb';

  try {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${encodeURIComponent(tl)}&client=tw-ob`;
    const ttsRes = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!ttsRes.ok) {
      return res.status(ttsRes.status).json({ error: 'Upstream TTS error ' + ttsRes.status });
    }

    const buf = Buffer.from(await ttsRes.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).send(buf);
  } catch (err) {
    console.error('TTS Chunk Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
