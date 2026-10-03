# SereneTTS — Ambient & AI-Powered Voice Studio

A specialized, high-performance web app for long-form Text-to-Speech (TTS), guided meditations, affirmations, and audio scripts. Pre-configured for **Uno Router** (`gemini-robotics-er-2-preview:free`) with intelligent pause handling and soothing ambient audio.

---

## ✨ Features

- **Long-Form Audio Narration**:
  - Handles arbitrarily long scripts (20-30+ minutes, 10,000+ words) without browser speech synthesis cutoffs or memory timeouts by automatically splitting text into smooth sentence utterances.
- **Smart Pause Cue Processor**:
  - `[pause]` triggers **3.5 seconds** (customizable) of natural silence.
  - `[long pause]` triggers **9.0 seconds** (customizable) of calming silence for breathing and reflection.
  - `[pause:Xs]` triggers custom timed silences.
- **Embedded Ambient Meditation Soundscape**:
  - Real-time procedural 432Hz ambient synthesizer and gentle low-frequency breath sweep.
  - Independent volume slider and mute toggle.
- **Live Interactive Teleprompter**:
  - Real-time sentence tracking with a gentle gold glow.
  - Auto-scrolls alongside the speaker.
  - **Click-to-Jump**: Click any sentence or section heading to jump straight to that part.
- **Uno Router & Gemini Robotics Studio**:
  - Connected to `https://api.unorouter.com/v1/chat/completions` using your API key and `gemini-robotics-er-2-preview:free`.
  - **Clean & Format**: Cleans markdown tags, standardizes pause syntax, and prepares text for speech.
  - **Expressive Pauses**: Asks Gemini to insert breathing pauses at emotional beats.
  - **5-Min Condensed**: Condenses 30-minute scripts into 5-minute meditation versions.
  - **Custom Prompt**: Ask the model any instruction to tailor your script.
  - **Rate Limit Guard**: Detects the 1 req/min free-tier limit and shows an automated live countdown.
- **Voice Customization**:
  - Auto-detects all browser and OS voices (Microsoft Natural, Google Neural, Siri, etc.).
  - Speed/Reading Pace knob (presets for slow calm reading `0.85x`).
  - Warmth/Pitch knob (`0.95x` default for warm grounded tone).
  - Word counter and dynamic estimated duration calculation.

---

## 🚀 How to Run

1. Open PowerShell or Terminal in `c:\Users\Admin\Desktop\simple-tts`.
2. Start the local server:
   ```bash
   npm start
   ```
   *(Or run `node server.js` directly)*
3. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

---

## ⚙️ Configuration

Your Uno Router credentials are saved locally in the app:
- **Endpoint**: `https://api.unorouter.com/v1/chat/completions`
- **Model**: `gemini-robotics-er-2-preview:free`
- **API Key**: `sk-UE7RO864vd28guRe8sGAp3W6HfsiZgG3ktSNwlZHrNH9k21C`

You can change any of these settings at any time by clicking the **⚙️ Uno Router Config** button in the header.
