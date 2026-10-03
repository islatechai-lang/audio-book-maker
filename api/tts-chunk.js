// Serverless API for single TTS audio chunk (reliable Google APIs gateway with gtx client & fallbacks)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Parse query params safely in any environment (Vercel, Express, native Node)
  let text = '';
  let tl = 'en-gb';

  try {
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    text = urlObj.searchParams.get('text') || '';
    tl = urlObj.searchParams.get('tl') || 'en-gb';
  } catch (e) {}

  if (!text && req.query) {
    text = req.query.text || '';
    if (req.query.tl) tl = req.query.tl;
  }
  if (!text && req.body) {
    text = req.body.text || '';
    if (req.body.tl) tl = req.body.tl;
  }
  if (!text) text = '...';

  // Strategy 1: translate.googleapis.com (gtx client)
  const targetUrls = [
    `https://translate.googleapis.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${encodeURIComponent(tl)}&client=gtx`,
    `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${encodeURIComponent(tl)}&client=tw-ob`
  ];

  let audioBuffer = null;
  let lastError = null;

  for (const targetUrl of targetUrls) {
    try {
      const ttsRes = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://translate.google.com/'
        }
      });

      if (ttsRes.ok) {
        const rawBuf = await ttsRes.arrayBuffer();
        if (rawBuf.byteLength > 100) {
          audioBuffer = Buffer.from(rawBuf);
          break;
        }
      } else {
        lastError = `Upstream HTTP ${ttsRes.status}`;
      }
    } catch (fetchErr) {
      lastError = fetchErr.message;
    }
  }

  if (audioBuffer) {
    res.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length,
      'Cache-Control': 'public, max-age=86400'
    });
    return res.end(audioBuffer);
  }

  console.error(`TTS Chunk Generation Failed for "${text.substring(0, 30)}":`, lastError);
  res.writeHead(502, { 'Content-Type': 'application/json' });
  return res.end(JSON.stringify({ error: `TTS Synthesis failed: ${lastError}` }));
}
