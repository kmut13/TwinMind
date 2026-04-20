import { transcribeAudioBlob, fetchSuggestions, streamChatAnswer } from "./api.js";
import { getSettings, saveSettings } from "./settings.js";
import { renderTranscript, renderSuggestionBatch, renderChatMessage, setChatLoading, showError, updateMicButton, showSettingsModal, hideSettingsModal } from "./ui.js";

// ── State ────────────────────────────────────────────────────────────────────

const state = {
  isRecording: false,
  transcript: "",           // Full transcript text
  suggestionBatches: [],    // Array of {timestamp, suggestions[]}
  chatHistory: [],          // Array of {role, content, timestamp}
  mediaRecorder: null,
  chunkTimer: null,
  refreshTimer: null,
  audioChunks: [],
  isTranscribing: false,
  isSuggestionsLoading: false,
  isChatLoading: false,
};

// ── Mic / Recording ──────────────────────────────────────────────────────────

export async function toggleMic() {
  if (state.isRecording) {
    stopRecording();
  } else {
    await startRecording();
  }
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Pick the best supported format
    const mimeType = getSupportedMimeType();
    state.mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    state.audioChunks = [];

    state.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) state.audioChunks.push(e.data);
    };

    state.mediaRecorder.onstop = async () => {
      if (state.audioChunks.length === 0) return;
      const blob = new Blob(state.audioChunks, { type: mimeType || "audio/webm" });
      state.audioChunks = [];
      await processAudioChunk(blob);
    };

    // Collect data every 30s while recording
    state.mediaRecorder.start(30000);
    state.isRecording = true;
    updateMicButton(true);

    // Auto-refresh suggestions every 30s
    state.refreshTimer = setInterval(() => {
      if (state.isRecording) triggerRefresh();
    }, 30000);

  } catch (err) {
    showError(`Mic access denied: ${err.message}`);
  }
}

function stopRecording() {
  state.isRecording = false;
  clearInterval(state.refreshTimer);

  if (state.mediaRecorder && state.mediaRecorder.state !== "inactive") {
    state.mediaRecorder.stop();
    state.mediaRecorder.stream.getTracks().forEach((t) => t.stop());
  }

  updateMicButton(false);
}

function getSupportedMimeType() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) || "";
}

// ── Transcription ────────────────────────────────────────────────────────────

async function processAudioChunk(blob) {
  if (state.isTranscribing) return;
  state.isTranscribing = true;

  try {
    const text = await transcribeAudioBlob(blob);
    if (text) {
      state.transcript += (state.transcript ? " " : "") + text;
      renderTranscript(state.transcript);
    }
  } catch (err) {
    showError(err.message);
  } finally {
    state.isTranscribing = false;
  }
}

// ── Suggestions ──────────────────────────────────────────────────────────────

export async function triggerRefresh() {
  if (state.isSuggestionsLoading || !state.transcript.trim()) return;

  // If recording, flush current audio first
  if (state.isRecording && state.mediaRecorder?.state === "recording") {
    await flushCurrentAudio();
  }

  await generateSuggestions();
}

async function flushCurrentAudio() {
  return new Promise((resolve) => {
    const recorder = state.mediaRecorder;
    if (!recorder || recorder.state !== "recording") { resolve(); return; }

    const onStop = async () => {
      const blob = new Blob(state.audioChunks, { type: "audio/webm" });
      state.audioChunks = [];
      await processAudioChunk(blob);
      // Restart recording
      recorder.start(30000);
      resolve();
    };

    recorder.addEventListener("stop", onStop, { once: true });
    recorder.stop();
  });
}

async function generateSuggestions() {
  state.isSuggestionsLoading = true;

  const { suggestionContextWords } = getSettings();
  const words = state.transcript.trim().split(/\s+/);
  const excerpt = words.slice(-suggestionContextWords).join(" ");

  try {
    const suggestions = await fetchSuggestions(excerpt);
    const batch = { timestamp: new Date(), suggestions };
    state.suggestionBatches.unshift(batch);
    renderSuggestionBatch(batch, state.suggestionBatches.length);
  } catch (err) {
    showError(err.message);
  } finally {
    state.isSuggestionsLoading = false;
  }
}

// ── Chat ─────────────────────────────────────────────────────────────────────

export async function sendChatMessage(userMessage) {
  if (state.isChatLoading || !userMessage.trim()) return;
  state.isChatLoading = true;

  const timestamp = new Date();
  state.chatHistory.push({ role: "user", content: userMessage, timestamp });
  renderChatMessage({ role: "user", content: userMessage, timestamp });

  const assistantEntry = { role: "assistant", content: "", timestamp: new Date() };
  const msgEl = renderChatMessage({ role: "assistant", content: "", timestamp: assistantEntry.timestamp, streaming: true });

  const { chatContextWords } = getSettings();
  const words = state.transcript.trim().split(/\s+/);
  const transcriptExcerpt = words.slice(-chatContextWords).join(" ");

  setChatLoading(true);

  try {
    await streamChatAnswer({
      transcript: transcriptExcerpt,
      chatHistory: state.chatHistory.filter((m) => m.role !== "system").slice(-10),
      userMessage,
      onToken: (_token, fullText) => {
        assistantEntry.content = fullText;
        if (msgEl) msgEl.querySelector(".chat-content").textContent = fullText;
      },
      onDone: (fullText) => {
        assistantEntry.content = fullText;
        state.chatHistory.push(assistantEntry);
        if (msgEl) {
          msgEl.querySelector(".chat-content").textContent = fullText;
          msgEl.classList.remove("streaming");
        }
      },
    });
  } catch (err) {
    const errMsg = `Error: ${err.message}`;
    assistantEntry.content = errMsg;
    state.chatHistory.push(assistantEntry);
    if (msgEl) msgEl.querySelector(".chat-content").textContent = errMsg;
    showError(err.message);
  } finally {
    state.isChatLoading = false;
    setChatLoading(false);
  }
}

export function handleSuggestionClick(suggestion) {
  const message = `${suggestion.preview}\n\n${suggestion.detail}`;
  sendChatMessage(message);
}

// ── Settings ─────────────────────────────────────────────────────────────────

export function openSettings() {
  showSettingsModal(getSettings(), (newSettings) => {
    saveSettings(newSettings);
    hideSettingsModal();
  });
}

// ── Export ───────────────────────────────────────────────────────────────────

export function exportSession() {
  const { suggestionBatches, chatHistory, transcript } = state;
  const fmt = (d) => d.toISOString();

  const data = {
    exported_at: fmt(new Date()),
    transcript,
    suggestion_batches: suggestionBatches.map((b) => ({
      timestamp: fmt(b.timestamp),
      suggestions: b.suggestions,
    })),
    chat_history: chatHistory.map((m) => ({
      role: m.role,
      timestamp: fmt(m.timestamp),
      content: m.content,
    })),
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `twinmind-session-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
