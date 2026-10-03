import { AmbientAudioGenerator } from './ambient.js';

// Application State
const state = {
  script: '',
  queue: [],
  currentIndex: 0,
  isPlaying: false,
  isPaused: false,
  pauseTimer: null,
  currentUtterance: null,
  voices: [],
  selectedVoice: null,
  rate: 1.0,
  pitch: 0.95,
  volume: 1.0,
  ambientVolume: 0.25,
  ambientEnabled: true,
  pauseDurations: {
    pause: 1.0,
    longPause: 2.0
  },
  unoConfig: {
    endpoint: 'https://api.unorouter.com/v1/chat/completions',
    apiKey: 'sk-UE7RO864vd28guRe8sGAp3W6HfsiZgG3ktSNwlZHrNH9k21C',
    model: 'gemini-robotics-er-2-preview:free'
  },
  rateLimitCountdown: 0,
  rateLimitTimer: null,
  startTime: null,
  elapsedInterval: null,
  mp3AbortController: null
};

// Ambient audio engine
const ambient = new AmbientAudioGenerator();

// DOM Elements
const elements = {
  scriptInput: document.getElementById('scriptInput'),
  teleprompter: document.getElementById('teleprompter'),
  playBtn: document.getElementById('playBtn'),
  pauseBtn: document.getElementById('pauseBtn'),
  stopBtn: document.getElementById('stopBtn'),
  prevBtn: document.getElementById('prevBtn'),
  nextBtn: document.getElementById('nextBtn'),
  clearBtn: document.getElementById('clearBtn'),
  voiceSelect: document.getElementById('voiceSelect'),
  rateSlider: document.getElementById('rateSlider'),
  rateVal: document.getElementById('rateVal'),
  pitchSlider: document.getElementById('pitchSlider'),
  pitchVal: document.getElementById('pitchVal'),
  ambientToggle: document.getElementById('ambientToggle'),
  ambientSlider: document.getElementById('ambientSlider'),
  ambientVal: document.getElementById('ambientVal'),
  pauseDurationInput: document.getElementById('pauseDurationInput'),
  longPauseDurationInput: document.getElementById('longPauseDurationInput'),
  wordCountBadge: document.getElementById('wordCountBadge'),
  estTimeBadge: document.getElementById('estTimeBadge'),
  playbackStatus: document.getElementById('playbackStatus'),
  progressBar: document.getElementById('progressBar'),
  currentTimeDisplay: document.getElementById('currentTimeDisplay'),
  // Uno Router UI
  apiKeyInput: document.getElementById('apiKeyInput'),
  endpointInput: document.getElementById('endpointInput'),
  modelInput: document.getElementById('modelInput'),
  toggleSettingsBtn: document.getElementById('toggleSettingsBtn'),
  settingsDrawer: document.getElementById('settingsDrawer'),
  aiFormatBtn: document.getElementById('aiFormatBtn'),
  aiPausesBtn: document.getElementById('aiPausesBtn'),
  aiShortenBtn: document.getElementById('aiShortenBtn'),
  aiCustomBtn: document.getElementById('aiCustomBtn'),
  aiPromptModal: document.getElementById('aiPromptModal'),
  aiPromptInput: document.getElementById('aiPromptInput'),
  aiSubmitBtn: document.getElementById('aiSubmitBtn'),
  aiCancelBtn: document.getElementById('aiCancelBtn'),
  rateLimitBanner: document.getElementById('rateLimitBanner'),
  rateLimitSeconds: document.getElementById('rateLimitSeconds'),
  // MP3 Download UI
  downloadMp3Btn: document.getElementById('downloadMp3Btn'),
  mp3ProgressModal: document.getElementById('mp3ProgressModal'),
  mp3ModalTitle: document.getElementById('mp3ModalTitle'),
  mp3ModalSub: document.getElementById('mp3ModalSub'),
  cancelMp3Btn: document.getElementById('cancelMp3Btn')
};

// Initialize Application
function init() {
  loadSavedSettings();
  initVoices();
  bindEvents();

  // Input starts empty
  elements.scriptInput.value = '';
  parseAndBuildQueue();
  updatePlaybackUI();
}

// Restore saved settings
function loadSavedSettings() {
  const savedKey = localStorage.getItem('tts_uno_api_key');
  const savedEndpoint = localStorage.getItem('tts_uno_endpoint');
  const savedModel = localStorage.getItem('tts_uno_model');
  const savedRate = localStorage.getItem('tts_rate');
  const savedPitch = localStorage.getItem('tts_pitch');
  const savedAmbient = localStorage.getItem('tts_ambient_vol');
  const savedAmbientEnabled = localStorage.getItem('tts_ambient_enabled');

  if (savedKey) state.unoConfig.apiKey = savedKey;
  if (savedEndpoint) state.unoConfig.endpoint = savedEndpoint;
  if (savedModel) state.unoConfig.model = savedModel;

  elements.apiKeyInput.value = state.unoConfig.apiKey;
  elements.endpointInput.value = state.unoConfig.endpoint;
  elements.modelInput.value = state.unoConfig.model;

  if (savedRate && savedRate !== '0.85') {
    state.rate = parseFloat(savedRate);
    elements.rateSlider.value = state.rate;
    elements.rateVal.textContent = `${state.rate}x`;
  } else {
    state.rate = 1.0;
    elements.rateSlider.value = 1.0;
    elements.rateVal.textContent = '1.0x';
  }
  if (savedPitch) {
    state.pitch = parseFloat(savedPitch);
    elements.pitchSlider.value = state.pitch;
    elements.pitchVal.textContent = `${state.pitch}x`;
  }
  if (savedAmbient) {
    state.ambientVolume = parseFloat(savedAmbient);
    elements.ambientSlider.value = Math.round(state.ambientVolume * 100);
    elements.ambientVal.textContent = `${Math.round(state.ambientVolume * 100)}%`;
  }
  if (savedAmbientEnabled !== null) {
    state.ambientEnabled = savedAmbientEnabled === 'true';
    elements.ambientToggle.checked = state.ambientEnabled;
  }
}

// Populate system voices
function initVoices() {
  if (!('speechSynthesis' in window)) {
    alert('Web Speech API is not supported in this browser. Please use Chrome, Edge, or Safari.');
    return;
  }

  function populate() {
    state.voices = window.speechSynthesis.getVoices();
    elements.voiceSelect.innerHTML = '';

    // Filter to English voices only
    const englishVoices = state.voices.filter(v => /^en[-_]/i.test(v.lang));

    if (englishVoices.length === 0) {
      const opt = document.createElement('option');
      opt.textContent = 'Default System Voice';
      elements.voiceSelect.appendChild(opt);
      return;
    }

    const isUk = (v) => /en[-_]gb/i.test(v.lang);
    const isUkFemale = (v) => isUk(v) && (/female|libby|sonia|maisie|hazel|susan|stephanie|fiona|serena|martha|kate|victoria/i.test(v.name) || !/male|george|ryan|oliver|alfie|brian|arthur/i.test(v.name));

    // Sort: UK Female Neural first, then other UK voices, then other English Neural, then rest
    const sorted = [...englishVoices].sort((a, b) => {
      const aUkFem = isUkFemale(a);
      const bUkFem = isUkFemale(b);
      if (aUkFem && !bUkFem) return -1;
      if (!aUkFem && bUkFem) return 1;

      const aIsNeural = /natural|neural|online|google/i.test(a.name);
      const bIsNeural = /natural|neural|online|google/i.test(b.name);
      if (aIsNeural && !bIsNeural) return -1;
      if (!aIsNeural && bIsNeural) return 1;

      return a.name.localeCompare(b.name);
    });

    sorted.forEach((voice) => {
      const opt = document.createElement('option');
      opt.value = voice.name;
      const isNeural = /natural|neural|online|google/i.test(voice.name);
      // Clean up the display name
      const shortName = voice.name
        .replace(/^Microsoft\s+/i, '')
        .replace(/\s+Online\s*\(Natural\)/i, '')
        .replace(/\s*-\s*English\s*\(.*?\)/i, '');
      const dialect = voice.lang.replace('en-', '').toUpperCase();
      opt.textContent = `${shortName} (${dialect})${isNeural ? ' ✨ Neural' : ''}`;
      elements.voiceSelect.appendChild(opt);
    });

    // Default to UK English Female voice
    const preferred = sorted.find(v => isUkFemale(v) && /natural|neural|google/i.test(v.name))
      || sorted.find(v => isUkFemale(v))
      || sorted.find(v => isUk(v))
      || sorted.find(v => /natural|neural/i.test(v.name))
      || sorted[0];

    if (preferred) {
      elements.voiceSelect.value = preferred.name;
      state.selectedVoice = preferred;
    }
  }

  populate();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = populate;
  }
}

// Parse text into playback queue
function parseAndBuildQueue() {
  const rawText = elements.scriptInput.value;
  state.script = rawText;
  state.queue = [];

  const pauseSec = parseFloat(elements.pauseDurationInput.value) || 1.0;
  const longPauseSec = parseFloat(elements.longPauseDurationInput.value) || 2.0;
  state.pauseDurations.pause = pauseSec;
  state.pauseDurations.longPause = longPauseSec;

  if (!rawText.trim()) {
    renderTeleprompter([]);
    updateBadges(0, 0);
    return;
  }

  const lines = rawText.split('\n');
  let currentSection = '';
  let queueIndex = 0;
  let totalWordCount = 0;
  let estimatedTotalSeconds = 0;

  for (let line of lines) {
    let trimmed = line.trim();
    if (!trimmed) continue;

    if (/^[=\-_]{4,}$/.test(trimmed)) continue;

    if (/^(PART|OPENING|YOUR NEXT STEPS|CONCLUSION|OUTRO|INTRO)/i.test(trimmed)) {
      currentSection = trimmed.replace(/[=]/g, '').trim();
      state.queue.push({
        type: 'header',
        text: currentSection,
        index: queueIndex++
      });
      continue;
    }

    if (/^TTS NOTES:/i.test(trimmed) || /^Full audio script/i.test(trimmed)) {
      continue;
    }

    if (/\[pause\]/i.test(trimmed)) {
      state.queue.push({
        type: 'pause',
        duration: pauseSec,
        label: `[pause ${pauseSec}s]`,
        section: currentSection,
        index: queueIndex++
      });
      estimatedTotalSeconds += pauseSec;
      continue;
    }

    if (/\[long pause\]/i.test(trimmed)) {
      state.queue.push({
        type: 'pause',
        duration: longPauseSec,
        label: `[long pause ${longPauseSec}s]`,
        section: currentSection,
        index: queueIndex++
      });
      estimatedTotalSeconds += longPauseSec;
      continue;
    }

    const customPauseMatch = trimmed.match(/\[pause:\s*([0-9.]+)s?\]/i);
    if (customPauseMatch) {
      const dur = parseFloat(customPauseMatch[1]) || 3.0;
      state.queue.push({
        type: 'pause',
        duration: dur,
        label: `[pause ${dur}s]`,
        section: currentSection,
        index: queueIndex++
      });
      estimatedTotalSeconds += dur;
      continue;
    }

    if (trimmed === '[END]') continue;

    const sentences = splitIntoSentences(trimmed);
    for (let s of sentences) {
      const cleanSentence = s.trim();
      if (!cleanSentence) continue;

      const words = cleanSentence.split(/\s+/).filter(Boolean);
      totalWordCount += words.length;

      const wordsPerSecond = (130 * state.rate) / 60;
      estimatedTotalSeconds += words.length / wordsPerSecond;

      state.queue.push({
        type: 'text',
        text: cleanSentence,
        section: currentSection,
        index: queueIndex++
      });
    }
  }

  renderTeleprompter(state.queue);
  updateBadges(totalWordCount, estimatedTotalSeconds);
}

function splitIntoSentences(text) {
  const raw = text.split(/(?<=[.!?])\s+(?=[A-Z0-9"“'‘])/);
  if (raw.length === 1 && raw[0].length > 250) {
    return raw[0].split(/(?<=[,;:])\s+/);
  }
  return raw;
}

// Render Teleprompter
function renderTeleprompter(items) {
  elements.teleprompter.innerHTML = '';
  if (items.length === 0) {
    elements.teleprompter.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">✎</div>
        <p>Paste your script into the editor to view the interactive teleprompter.</p>
      </div>`;
    return;
  }

  items.forEach((item) => {
    if (item.type === 'header') {
      const h = document.createElement('h3');
      h.className = 'teleprompter-header';
      h.textContent = item.text;
      elements.teleprompter.appendChild(h);
      return;
    }

    const chunk = document.createElement('span');
    chunk.id = `chunk-${item.index}`;
    chunk.dataset.index = item.index;

    if (item.type === 'pause') {
      chunk.className = 'chunk-unit chunk-pause';
      chunk.innerHTML = `<span>⏳ ${item.label}</span>`;
    } else {
      chunk.className = 'chunk-unit chunk-text';
      chunk.textContent = item.text + ' ';
    }

    chunk.addEventListener('click', () => {
      jumpToChunk(item.index);
    });

    elements.teleprompter.appendChild(chunk);
  });
}

function updateBadges(words, seconds) {
  elements.wordCountBadge.textContent = `${words.toLocaleString()} words`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  elements.estTimeBadge.textContent = `~${mins}m ${secs}s`;
}

// Play / Pause / Stop Handlers
function togglePlayPause() {
  if (state.isPlaying) {
    pause();
  } else {
    play();
  }
}

function play() {
  if (state.queue.length === 0) {
    parseAndBuildQueue();
    if (state.queue.length === 0) {
      alert('Please paste some text into the editor first.');
      return;
    }
  }

  // Cancel any lingering utterances to avoid browser deadlocks
  window.speechSynthesis.cancel();

  state.isPlaying = true;
  state.isPaused = false;
  state.currentIndex = state.currentIndex || 0;
  updatePlaybackUI();

  if (state.ambientEnabled) {
    ambient.setVolume(state.ambientVolume);
    ambient.start();
  }

  startElapsedTimer();
  playNextChunk();
}

function playNextChunk() {
  if (!state.isPlaying || state.isPaused) return;

  if (state.currentIndex >= state.queue.length) {
    finishPlayback();
    return;
  }

  const currentItem = state.queue[state.currentIndex];
  highlightChunk(state.currentIndex);
  updateProgress();

  if (currentItem.type === 'header') {
    state.currentIndex++;
    playNextChunk();
    return;
  }

  if (currentItem.type === 'pause') {
    elements.playbackStatus.textContent = `Silence for ${currentItem.duration}s...`;
    const pulseChunk = document.getElementById(`chunk-${currentItem.index}`);
    if (pulseChunk) pulseChunk.classList.add('active-pause');

    state.pauseTimer = setTimeout(() => {
      if (pulseChunk) pulseChunk.classList.remove('active-pause');
      if (state.isPlaying && !state.isPaused) {
        state.currentIndex++;
        playNextChunk();
      }
    }, currentItem.duration * 1000);
    return;
  }

  elements.playbackStatus.textContent = `Speaking: "${truncate(currentItem.text, 40)}"`;

  const utterance = new SpeechSynthesisUtterance(currentItem.text);
  state.currentUtterance = utterance;

  const voiceName = elements.voiceSelect.value;
  const voice = state.voices.find(v => v.name === voiceName);
  if (voice) utterance.voice = voice;

  utterance.rate = state.rate;
  utterance.pitch = state.pitch;
  utterance.volume = state.volume;

  utterance.onend = () => {
    // Only advance if we are actively playing
    if (state.isPlaying && !state.isPaused) {
      state.currentIndex++;
      playNextChunk();
    }
  };

  utterance.onerror = (e) => {
    console.warn('Utterance event:', e.error);
    // Don't auto-advance if user paused or stopped!
    if (state.isPlaying && !state.isPaused && e.error !== 'canceled' && e.error !== 'interrupted') {
      state.currentIndex++;
      playNextChunk();
    }
  };

  window.speechSynthesis.speak(utterance);
}

function pause() {
  state.isPlaying = false;
  state.isPaused = true;

  if (state.pauseTimer) {
    clearTimeout(state.pauseTimer);
    state.pauseTimer = null;
  }

  // Cancel speech synthesis so audio stops immediately without browser hang
  window.speechSynthesis.cancel();
  ambient.stop();
  clearInterval(state.elapsedInterval);

  updatePlaybackUI();
  elements.playbackStatus.textContent = 'Paused';
}

function stopAll() {
  state.isPlaying = false;
  state.isPaused = false;
  state.currentIndex = 0;

  if (state.pauseTimer) {
    clearTimeout(state.pauseTimer);
    state.pauseTimer = null;
  }

  window.speechSynthesis.cancel();
  ambient.stop();
  clearInterval(state.elapsedInterval);
  clearHighlights();
  updatePlaybackUI();
  updateProgress();
  elements.playbackStatus.textContent = 'Ready';
  elements.currentTimeDisplay.textContent = '00:00';
}

function jumpToChunk(index) {
  if (index < 0 || index >= state.queue.length) return;
  const wasPlaying = state.isPlaying;

  if (state.pauseTimer) {
    clearTimeout(state.pauseTimer);
    state.pauseTimer = null;
  }
  window.speechSynthesis.cancel();

  state.currentIndex = index;
  highlightChunk(index);

  if (wasPlaying) {
    playNextChunk();
  } else {
    play();
  }
}

function finishPlayback() {
  stopAll();
  elements.playbackStatus.textContent = '✨ Completed';
}

function highlightChunk(index) {
  clearHighlights();
  const el = document.getElementById(`chunk-${index}`);
  if (el) {
    el.classList.add('active-sentence');
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function clearHighlights() {
  document.querySelectorAll('.chunk-unit.active-sentence').forEach(el => {
    el.classList.remove('active-sentence');
  });
}

function updateProgress() {
  if (state.queue.length === 0) {
    elements.progressBar.style.width = '0%';
    return;
  }
  const pct = Math.round((state.currentIndex / state.queue.length) * 100);
  elements.progressBar.style.width = `${pct}%`;
}

function startElapsedTimer() {
  if (!state.startTime) state.startTime = Date.now();
  clearInterval(state.elapsedInterval);

  state.elapsedInterval = setInterval(() => {
    if (!state.isPlaying) return;
    const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
    const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const s = String(elapsed % 60).padStart(2, '0');
    elements.currentTimeDisplay.textContent = `${m}:${s}`;
  }, 1000);
}

// Update Play/Pause/Stop UI dynamically
function updatePlaybackUI() {
  if (state.isPlaying) {
    // Show Pause Icon in Hero button
    elements.playBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <rect x="6" y="4" width="4" height="16"/>
        <rect x="14" y="4" width="4" height="16"/>
      </svg>
    `;
    elements.playBtn.title = 'Pause Narration';
    elements.pauseBtn.disabled = false;
    elements.stopBtn.disabled = false;
  } else {
    // Show Play Icon in Hero button
    elements.playBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <polygon points="5 3 19 12 5 21 5 3"/>
      </svg>
    `;
    elements.playBtn.title = state.isPaused ? 'Resume Narration' : 'Start Narration';
    elements.pauseBtn.disabled = true;
    elements.stopBtn.disabled = !state.isPaused;
  }
}

// MP3 Audio Download Handler
async function downloadMp3Audio() {
  const text = elements.scriptInput.value.trim();
  if (!text) {
    alert('Please paste a script into the editor before downloading.');
    return;
  }

  elements.mp3ProgressModal.classList.remove('hidden');
  elements.mp3ModalTitle.textContent = 'Generating MP3 File';
  elements.mp3ModalSub.textContent = 'Synthesizing voice chunks and timing silences...';
  elements.downloadMp3Btn.disabled = true;

  state.mp3AbortController = new AbortController();

  try {
    const pauseDuration = elements.pauseDurationInput.value || 1.0;
    const longPauseDuration = elements.longPauseDurationInput.value || 2.0;

    const res = await fetch('/api/download-mp3', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        pauseDuration,
        longPauseDuration
      }),
      signal: state.mp3AbortController.signal
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed with status ${res.status}`);
    }

    elements.mp3ModalSub.textContent = 'Assembling final MP3 stream...';
    const blob = await res.blob();

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audiobook-${Date.now()}.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    elements.playbackStatus.textContent = '✓ MP3 Downloaded successfully!';
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error('MP3 Generation Error:', err);
      alert(`MP3 Generation Error: ${err.message}`);
    }
  } finally {
    elements.mp3ProgressModal.classList.add('hidden');
    elements.downloadMp3Btn.disabled = false;
    state.mp3AbortController = null;
  }
}

// Uno Router AI Assistant
async function callUnoRouter(promptText, customInstruction = '') {
  const apiKey = elements.apiKeyInput.value.trim() || state.unoConfig.apiKey;
  const endpoint = elements.endpointInput.value.trim() || state.unoConfig.endpoint;
  const model = elements.modelInput.value.trim() || state.unoConfig.model;

  if (!apiKey) {
    alert('Please enter your Uno Router API key in the settings drawer.');
    elements.settingsDrawer.classList.add('open');
    return null;
  }

  localStorage.setItem('tts_uno_api_key', apiKey);
  localStorage.setItem('tts_uno_endpoint', endpoint);
  localStorage.setItem('tts_uno_model', model);

  elements.playbackStatus.textContent = `Connecting to Uno Router (${model})...`;

  try {
    const res = await fetch('/api/unorouter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint,
        apiKey,
        model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert Voice Director and TTS Audio Script Producer. Format scripts for smooth narration, preserve pause cues [pause] and [long pause], eliminate harsh markdown symbols, and keep output clean for speech.'
          },
          {
            role: 'user',
            content: `${customInstruction}\n\nSCRIPT:\n${promptText}`
          }
        ]
      })
    });

    const data = await res.json();

    if (res.status === 429) {
      handleRateLimitError(data.error?.message || 'Rate limit exceeded');
      return null;
    }

    if (!res.ok) {
      throw new Error(data.error?.message || `HTTP error ${res.status}`);
    }

    const content = data.choices?.[0]?.message?.content;
    return content;
  } catch (err) {
    console.error('Uno Router Error:', err);
    alert(`Uno Router Error: ${err.message}`);
    elements.playbackStatus.textContent = `Error: ${err.message}`;
    return null;
  }
}

function handleRateLimitError(msg) {
  const match = msg.match(/retry in (\d+)s/i);
  let seconds = match ? parseInt(match[1], 10) : 60;
  state.rateLimitCountdown = seconds;

  elements.rateLimitSeconds.textContent = seconds;
  elements.rateLimitBanner.classList.remove('hidden');

  clearInterval(state.rateLimitTimer);
  state.rateLimitTimer = setInterval(() => {
    state.rateLimitCountdown--;
    if (state.rateLimitCountdown <= 0) {
      clearInterval(state.rateLimitTimer);
      elements.rateLimitBanner.classList.add('hidden');
      elements.playbackStatus.textContent = 'Uno Router ready for new request!';
    } else {
      elements.rateLimitSeconds.textContent = state.rateLimitCountdown;
    }
  }, 1000);
}

// Event Bindings
function bindEvents() {
  elements.scriptInput.addEventListener('input', parseAndBuildQueue);

  // Play button toggles play and pause
  elements.playBtn.addEventListener('click', togglePlayPause);
  // Dedicated Pause and Stop buttons
  elements.pauseBtn.addEventListener('click', pause);
  elements.stopBtn.addEventListener('click', stopAll);

  elements.prevBtn.addEventListener('click', () => {
    jumpToChunk(Math.max(0, state.currentIndex - 2));
  });

  elements.nextBtn.addEventListener('click', () => {
    jumpToChunk(Math.min(state.queue.length - 1, state.currentIndex + 1));
  });

  elements.clearBtn.addEventListener('click', () => {
    stopAll();
    elements.scriptInput.value = '';
    parseAndBuildQueue();
    elements.playbackStatus.textContent = 'Cleared';
  });

  // MP3 Download button
  elements.downloadMp3Btn.addEventListener('click', downloadMp3Audio);
  elements.cancelMp3Btn.addEventListener('click', () => {
    if (state.mp3AbortController) state.mp3AbortController.abort();
    elements.mp3ProgressModal.classList.add('hidden');
  });

  // Sliders
  elements.rateSlider.addEventListener('input', (e) => {
    state.rate = parseFloat(e.target.value);
    elements.rateVal.textContent = `${state.rate}x`;
    localStorage.setItem('tts_rate', state.rate);
    parseAndBuildQueue();
  });

  elements.pitchSlider.addEventListener('input', (e) => {
    state.pitch = parseFloat(e.target.value);
    elements.pitchVal.textContent = `${state.pitch}x`;
    localStorage.setItem('tts_pitch', state.pitch);
  });

  elements.ambientToggle.addEventListener('change', (e) => {
    state.ambientEnabled = e.target.checked;
    localStorage.setItem('tts_ambient_enabled', state.ambientEnabled);
    if (!state.ambientEnabled) {
      ambient.stop();
    } else if (state.isPlaying) {
      ambient.start();
    }
  });

  elements.ambientSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    state.ambientVolume = val / 100;
    elements.ambientVal.textContent = `${val}%`;
    localStorage.setItem('tts_ambient_vol', state.ambientVolume);
    ambient.setVolume(state.ambientVolume);
  });

  elements.pauseDurationInput.addEventListener('change', parseAndBuildQueue);
  elements.longPauseDurationInput.addEventListener('change', parseAndBuildQueue);

  elements.toggleSettingsBtn.addEventListener('click', () => {
    elements.settingsDrawer.classList.toggle('open');
  });

  // AI Uno Router Actions
  elements.aiFormatBtn.addEventListener('click', async () => {
    const raw = elements.scriptInput.value;
    if (!raw.trim()) return alert('Paste a script first.');
    elements.aiFormatBtn.disabled = true;
    elements.aiFormatBtn.textContent = 'Formatting...';

    const result = await callUnoRouter(
      raw,
      'Optimize this meditation/audio script for Text-to-Speech reading. Clean up extraneous markers while keeping sections readable, standardize all pauses to [pause] and [long pause], and return the clean narrated script.'
    );

    elements.aiFormatBtn.disabled = false;
    elements.aiFormatBtn.innerHTML = '<span>✨ Clean &amp; Format</span>';
    if (result) {
      elements.scriptInput.value = result;
      parseAndBuildQueue();
      elements.playbackStatus.textContent = 'Script formatted with Gemini!';
    }
  });

  elements.aiPausesBtn.addEventListener('click', async () => {
    const raw = elements.scriptInput.value;
    if (!raw.trim()) return alert('Paste a script first.');
    elements.aiPausesBtn.disabled = true;
    elements.aiPausesBtn.textContent = 'Directing pauses...';

    const result = await callUnoRouter(
      raw,
      'Analyze the emotional and breathing cadence of this script. Insert [pause] (3-4 seconds) after introspective moments, and [long pause] (8-10 seconds) after deep breaths or reflections. Keep the rest of the text untouched.'
    );

    elements.aiPausesBtn.disabled = false;
    elements.aiPausesBtn.innerHTML = '<span>⏸ Insert Expressive Pauses</span>';
    if (result) {
      elements.scriptInput.value = result;
      parseAndBuildQueue();
      elements.playbackStatus.textContent = 'Expressive pauses added!';
    }
  });

  elements.aiShortenBtn.addEventListener('click', async () => {
    const raw = elements.scriptInput.value;
    if (!raw.trim()) return alert('Paste a script first.');
    elements.aiShortenBtn.disabled = true;
    elements.aiShortenBtn.textContent = 'Condensing...';

    const result = await callUnoRouter(
      raw,
      'Condense this audio script into a focused 5-minute guided meditation version. Keep the core affirmations, breathing cues, and [pause] tags.'
    );

    elements.aiShortenBtn.disabled = false;
    elements.aiShortenBtn.innerHTML = '<span>⏱ 5-Min Version</span>';
    if (result) {
      elements.scriptInput.value = result;
      parseAndBuildQueue();
      elements.playbackStatus.textContent = '5-minute version generated!';
    }
  });

  elements.aiCustomBtn.addEventListener('click', () => {
    elements.aiPromptModal.classList.remove('hidden');
  });

  elements.aiCancelBtn.addEventListener('click', () => {
    elements.aiPromptModal.classList.add('hidden');
  });

  elements.aiSubmitBtn.addEventListener('click', async () => {
    const prompt = elements.aiPromptInput.value.trim();
    if (!prompt) return;
    elements.aiPromptModal.classList.add('hidden');
    elements.playbackStatus.textContent = 'Sending custom request to Gemini...';

    const result = await callUnoRouter(elements.scriptInput.value, prompt);
    if (result) {
      elements.scriptInput.value = result;
      parseAndBuildQueue();
      elements.playbackStatus.textContent = 'Custom AI modifications applied!';
    }
  });
}

function truncate(str, len) {
  return str.length > len ? str.substring(0, len) + '...' : str;
}

window.addEventListener('DOMContentLoaded', init);
