# TwinMind Live Suggestions Copilot

A live meeting copilot that transcribes your mic, surfaces 3 contextual suggestions every ~30 seconds, and answers questions with full transcript context.

## Live Demo

[Deploy URL here]

## Setup

1. Get a free Groq API key at [console.groq.com](https://console.groq.com)
2. Open the app in your browser
3. Click **⚙ Settings** and paste your Groq key
4. Hit **Record** — suggestions appear automatically every 30 seconds

No install, no build step. Pure HTML/CSS/JS with ES modules.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Vanilla HTML/JS (ES modules) | Zero build step, instant Netlify drop, no framework overhead |
| Transcription | Groq Whisper Large V3 | Required by spec; fast and accurate |
| Suggestions + Chat | `moonshotai/kimi-k2-instruct` on Groq | Required by spec (GPT-OSS 120B) |
| Styling | Custom CSS (DM Sans + DM Mono) | Full control, no Tailwind purging issues |
| Hosting | Netlify drop | Static files, 30-second deploy |

## File Structure

```
index.html    — Layout, settings modal, boot script
style.css     — Three-column dark UI, tokens, animations
app.js        — Mic recording, state, orchestration
api.js        — Groq API calls (Whisper, suggestions, chat streaming)
ui.js         — All DOM rendering and event wiring
settings.js   — localStorage-backed settings manager
prompts.js    — Default prompts and parameter values
```

## Prompt Strategy

### Suggestions Prompt

The core design decision: **the model chooses the right type of suggestion based on what's actually happening**, rather than always returning the same mix.

The prompt gives the model 5 typed categories:
- `question_to_ask` — a useful question the speaker could raise
- `talking_point` — a relevant angle or insight worth mentioning
- `answer` — a direct answer to something just asked in the conversation
- `fact_check` — verifying a claim that was just made
- `clarification` — clearing up ambiguous terminology or intent

**Contextual rules baked into the prompt:**
- If a question was just asked → surface an `answer`
- If a factual claim was made → surface a `fact_check`
- If the conversation seems shallow or one-sided → surface a `talking_point`
- Always include at least one `question_to_ask` unless the conversation is already question-heavy
- Never return 3 of the same type

**Preview quality:** The prompt explicitly instructs that the preview alone must deliver value — users shouldn't need to click to get something useful. This is the hardest constraint to prompt-engineer well.

**Context window:** 600 words (last ~4-5 minutes of a normal conversation). This is enough to understand the recent topic without confusing the model with stale context from 20 minutes ago.

The model is asked to return raw JSON only — no markdown fences, no preamble. We strip any accidental backtick wrapping before parsing.

### Chat Prompt

The chat prompt injects the full transcript (up to 2000 words) as a system message, positioning the model as someone who was listening the whole time. Key principles:
- Lead with the answer, then explain
- Be specific to the transcript — don't give generic advice
- Use bullets only for 4+ distinct items
- Acknowledge uncertainty when present

Streaming is used for chat responses so the user sees the first token within ~300ms.

## Tradeoffs

**No backend:** All API calls go directly from the browser. This means the API key is in localStorage (not server-side). Acceptable for a demo/assignment; in production you'd proxy through a backend and store keys server-side.

**30-second audio chunks:** `MediaRecorder` collects data every 30s. This means there's up to a 30s lag between speech and transcript appearance during recording. The manual Refresh button flushes the current chunk immediately, which is the right UX for "I just said something important, surface suggestions now."

**No conversation threading in suggestions:** Each suggestion batch uses only the last 600 words of transcript. This is intentional — suggestions should be about what's happening *right now*, not a full-session summary.

**Single-file export:** The export is a clean JSON blob with timestamps on every event. This makes it easy to replay a session or audit what suggestions were surfaced and when.

## Local Development

Since this uses ES modules, you need a local server (browsers block `file://` module imports):

```bash
npx serve .
# or
python3 -m http.server 8080
```

Then open `http://localhost:8080`.
