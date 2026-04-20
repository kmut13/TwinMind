import { getSettings } from "./settings.js";

// ── Whisper transcription ────────────────────────────────────────────────────

export async function transcribeAudioBlob(blob) {
  const { apiKey, whisperModel } = getSettings();
  if (!apiKey) throw new Error("No API key set. Open Settings and paste your Groq key.");

  const form = new FormData();
  form.append("file", blob, "audio.webm");
  form.append("model", whisperModel);
  form.append("response_format", "text");

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Whisper error ${res.status}: ${err}`);
  }

  return (await res.text()).trim();
}

// ── Suggestions ──────────────────────────────────────────────────────────────

export async function fetchSuggestions(transcriptExcerpt) {
  const { apiKey, model, suggestionPrompt } = getSettings();
  if (!apiKey) throw new Error("No API key set.");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      max_tokens: 1024,
      messages: [
        { role: "system", content: suggestionPrompt },
        {
          role: "user",
          content: `Here is the recent conversation transcript:\n\n"""\n${transcriptExcerpt}\n"""\n\nReturn the 3 suggestions as a raw JSON array.`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Suggestions error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const raw = data.choices[0].message.content.trim();

  // Strip markdown fences if model wraps in ```json
  const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) throw new Error("Not an array");
    return parsed.slice(0, 3);
  } catch {
    throw new Error(`Could not parse suggestions JSON: ${cleaned.slice(0, 200)}`);
  }
}

// ── Chat (streaming) ─────────────────────────────────────────────────────────

export async function streamChatAnswer({ transcript, chatHistory, userMessage, onToken, onDone }) {
  const { apiKey, model, chatPrompt } = getSettings();
  if (!apiKey) throw new Error("No API key set.");

  const systemWithContext = `${chatPrompt}\n\n--- FULL TRANSCRIPT ---\n${transcript || "(No transcript yet.)"}`;

  const messages = [
    { role: "system", content: systemWithContext },
    ...chatHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userMessage },
  ];

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.5,
      max_tokens: 1024,
      stream: true,
      messages,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Chat error ${res.status}: ${err}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));

    for (const line of lines) {
      const payload = line.slice(6).trim();
      if (payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload);
        const token = json.choices?.[0]?.delta?.content;
        if (token) {
          fullText += token;
          onToken(token, fullText);
        }
      } catch {
        // Ignore malformed SSE lines
      }
    }
  }

  onDone(fullText);
}
