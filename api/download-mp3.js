// Serverless API endpoint for generating and downloading MP3 with custom pauses

function createSilentMp3(durationSeconds) {
  // MPEG-2 Layer 3, 24000 Hz, 64 kbps mono frame (384 bytes, 24ms)
  const frameHeader = Buffer.from([0xff, 0xf3, 0x84, 0xc4]);
  const frameLength = 384;
  const frameData = Buffer.alloc(frameLength - 4, 0);
  const singleFrame = Buffer.concat([frameHeader, frameData]);

  const frameDuration = 576 / 24000; // 0.024s per frame
  const frameCount = Math.max(1, Math.round(durationSeconds / frameDuration));
  const frames = [];
  for (let i = 0; i < frameCount; i++) {
    frames.push(singleFrame);
  }
  return Buffer.concat(frames);
}

// Split text into readable sentences while keeping pause tags
function parseScriptIntoItems(text, pauseSec = 3.5, longPauseSec = 9.0) {
  const lines = text.split('\n');
  const items = [];

  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Ignore markdown dividers
    if (/^[=\-_]{4,}$/.test(trimmed)) continue;
    if (/^TTS NOTES:/i.test(trimmed) || /^Full audio script/i.test(trimmed)) continue;

    // Check pause tags
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

    // Split paragraphs into spoken sentences
    const sentences = trimmed.split(/(?<=[.!?])\s+(?=[A-Z0-9"“'‘])/);
    for (let s of sentences) {
      const clean = s.trim();
      if (!clean) continue;
      // Cap individual sentence query to 180 chars for TTS stability
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { text, pauseDuration = 3.5, longPauseDuration = 9.0 } = req.body || {};

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Please provide script text.' });
    }

    const items = parseScriptIntoItems(text, parseFloat(pauseDuration), parseFloat(longPauseDuration));
    if (items.length === 0) {
      return res.status(400).json({ error: 'No readable text found in script.' });
    }

    const audioBuffers = [];

    // Process each item
    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      if (item.type === 'pause') {
        const silentMp3 = createSilentMp3(item.duration);
        audioBuffers.push(silentMp3);
      } else if (item.type === 'text') {
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(item.text)}&tl=en&client=tw-ob`;
        try {
          const ttsRes = await fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });

          if (ttsRes.ok) {
            const buf = Buffer.from(await ttsRes.arrayBuffer());
            audioBuffers.push(buf);
          }
        } catch (fetchErr) {
          console.warn(`TTS fetch error on item ${i}:`, fetchErr.message);
        }

        // Small micro-delay between API fetches to avoid rate limits
        if (i % 5 === 0 && i > 0) {
          await new Promise(r => setTimeout(r, 60));
        }
      }
    }

    const combinedMp3 = Buffer.concat(audioBuffers);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', 'attachment; filename="audiobook.mp3"');
    res.setHeader('Content-Length', combinedMp3.length);
    res.setHeader('Cache-Control', 'public, max-age=3600');

    return res.status(200).send(combinedMp3);
  } catch (err) {
    console.error('MP3 Generation Error:', err);
    return res.status(500).json({ error: 'Failed to generate MP3: ' + err.message });
  }
}
