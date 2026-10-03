import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.mjs': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg'
};

let cachedSilenceBuf = null;
async function getSilenceBuffer() {
  if (cachedSilenceBuf) return cachedSilenceBuf;
  try {
    const url = 'https://translate.googleapis.com/translate_tts?ie=UTF-8&q=' + encodeURIComponent('...') + '&tl=en-gb&client=gtx';
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://translate.google.com/'
      }
    });
    cachedSilenceBuf = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    console.warn('Failed to fetch silence buffer:', e.message);
  }
  return cachedSilenceBuf;
}

function parseScriptIntoItems(text, pauseSec = 1.0, longPauseSec = 2.0) {
  const lines = text.split('\n');
  const items = [];
  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^[=\-_]{4,}$/.test(trimmed)) continue;
    if (/^TTS NOTES:/i.test(trimmed) || /^Full audio script/i.test(trimmed)) continue;

    if (/\[pause\]/i.test(trimmed)) {
      items.push({ type: 'pause', duration: pauseSec });
      continue;
    }
    if (/\[long pause\]/i.test(trimmed)) {
      items.push({ type: 'pause', duration: longPauseSec });
      continue;
    }
    const customMatch = trimmed.match(/\[pause:\s*([0-9.]+)s?\]/i);
    if (customMatch) {
      items.push({ type: 'pause', duration: parseFloat(customMatch[1]) || pauseSec });
      continue;
    }
    if (trimmed === '[END]') continue;

    const sentences = trimmed.split(/(?<=[.!?])\s+(?=[A-Z0-9"“'‘])/);
    for (let s of sentences) {
      const clean = s.trim();
      if (!clean) continue;
      if (clean.length > 180) {
        const parts = clean.match(/.{1,180}(\s|$)/g) || [clean];
        for (let p of parts) {
          if (p.trim()) items.push({ type: 'text', text: p.trim() });
        }
      } else {
        items.push({ type: 'text', text: clean });
      }
    }
  }
  return items;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const reqUrl = new URL(req.url, `http://${req.headers.host}`);

  // API: Single TTS Chunk (Zero timeout, used for client-side progressive generation)
  if (reqUrl.pathname === '/api/tts-chunk') {
    const text = reqUrl.searchParams.get('text') || '...';
    const tl = reqUrl.searchParams.get('tl') || 'en-gb';
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
        res.end(JSON.stringify({ error: `TTS upstream error HTTP ${ttsRes.status}` }));
        return;
      }
      const buf = Buffer.from(await ttsRes.arrayBuffer());
      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Content-Length': buf.length,
        'Cache-Control': 'public, max-age=86400'
      });
      res.end(buf);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // API: Download MP3 (Batch generation)
  if (reqUrl.pathname === '/api/download-mp3' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 15 * 1024 * 1024) req.destroy();
    });

    req.on('end', async () => {
      try {
        const { text, pauseDuration = 1.0, longPauseDuration = 2.0 } = JSON.parse(body || '{}');
        if (!text || !text.trim()) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Please provide script text.' }));
          return;
        }

        const items = parseScriptIntoItems(text, parseFloat(pauseDuration), parseFloat(longPauseDuration));
        const audioBuffers = [];
        const silence = await getSilenceBuffer();

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.type === 'pause') {
            if (silence) {
              const repeatCount = Math.max(1, Math.round(item.duration / 0.72));
              for (let r = 0; r < repeatCount; r++) {
                audioBuffers.push(silence);
              }
            }
          } else {
            const url = `https://translate.googleapis.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(item.text)}&tl=en-gb&client=gtx`;
            try {
              const ttsRes = await fetch(url, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  'Referer': 'https://translate.google.com/'
                }
              });
              if (ttsRes.ok) {
                const buf = Buffer.from(await ttsRes.arrayBuffer());
                audioBuffers.push(buf);
              }
            } catch (e) {
              console.warn(`TTS fetch error at chunk ${i}:`, e.message);
            }
            if (i % 5 === 0 && i > 0) {
              await new Promise(r => setTimeout(r, 40));
            }
          }
        }

        const combinedMp3 = Buffer.concat(audioBuffers);
        res.writeHead(200, {
          'Content-Type': 'audio/mpeg',
          'Content-Disposition': 'attachment; filename="audiobook.mp3"',
          'Content-Length': combinedMp3.length,
          'Cache-Control': 'public, max-age=3600'
        });
        res.end(combinedMp3);
      } catch (err) {
        console.error('MP3 Error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to generate MP3: ' + err.message }));
      }
    });
    return;
  }

  // API: Uno Router Proxy
  if (reqUrl.pathname === '/api/unorouter' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) req.destroy();
    });

    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        const endpoint = payload.endpoint || process.env.UNO_ENDPOINT || 'https://api.unorouter.com/v1/chat/completions';
        const apiKey = payload.apiKey || process.env.UNO_API_KEY || req.headers['authorization']?.replace('Bearer ', '') || 'sk-UE7RO864vd28guRe8sGAp3W6HfsiZgG3ktSNwlZHrNH9k21C';

        if (!apiKey) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing API key' }));
          return;
        }

        const requestBody = {
          model: payload.model || process.env.UNO_MODEL || 'gemini-robotics-er-2-preview:free',
          messages: payload.messages || [{ role: 'user', content: payload.prompt || 'Hello' }]
        };

        if (payload.modalities) requestBody.modalities = payload.modalities;
        if (payload.audio) requestBody.audio = payload.audio;
        if (payload.temperature !== undefined) requestBody.temperature = payload.temperature;

        const unorouterRes = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey.trim()}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        });

        const status = unorouterRes.status;
        const data = await unorouterRes.text();

        res.writeHead(status, {
          'Content-Type': unorouterRes.headers.get('content-type') || 'application/json'
        });
        res.end(data);
      } catch (err) {
        console.error('Proxy Error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: {
            message: 'Failed to communicate with Uno Router: ' + err.message,
            code: 'PROXY_ERROR'
          }
        }));
      }
    });
    return;
  }

  // Health check
  if (reqUrl.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
    return;
  }

  // Static file serving
  let filePath = path.join(PUBLIC_DIR, reqUrl.pathname === '/' ? 'index.html' : reqUrl.pathname);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 Internal Server Error');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });
});

server.listen(PORT, () => {
  console.log(`TTS Web App running at http://localhost:${PORT}`);
});
