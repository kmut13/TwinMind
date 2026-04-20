import { toggleMic, triggerRefresh, sendChatMessage, handleSuggestionClick, openSettings, exportSession } from "./app.js";

const TYPE_LABELS = {
  question_to_ask: "💬 Ask",
  talking_point:   "📌 Point",
  answer:          "✅ Answer",
  fact_check:      "🔍 Fact",
  clarification:   "💡 Clarify",
};

// ── Boot ─────────────────────────────────────────────────────────────────────

export function boot() {
  document.getElementById("mic-btn").addEventListener("click", toggleMic);
  document.getElementById("refresh-btn").addEventListener("click", triggerRefresh);
  document.getElementById("export-btn").addEventListener("click", exportSession);
  document.getElementById("settings-btn").addEventListener("click", openSettings);

  const chatInput = document.getElementById("chat-input");
  const chatSend = document.getElementById("chat-send");

  chatSend.addEventListener("click", () => {
    const val = chatInput.value.trim();
    if (val) { sendChatMessage(val); chatInput.value = ""; }
  });

  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const val = chatInput.value.trim();
      if (val) { sendChatMessage(val); chatInput.value = ""; }
    }
  });
}

// ── Transcript ───────────────────────────────────────────────────────────────

export function renderTranscript(text) {
  const el = document.getElementById("transcript-text");
  el.textContent = text || "";
  el.scrollTop = el.scrollHeight;
}

// ── Suggestions ──────────────────────────────────────────────────────────────

export function renderSuggestionBatch(batch, batchNumber) {
  const container = document.getElementById("suggestions-container");
  const emptyState = container.querySelector(".empty-state");
  if (emptyState) emptyState.remove();

  const batchEl = document.createElement("div");
  batchEl.className = "suggestion-batch";

  const header = document.createElement("div");
  header.className = "batch-header";
  header.textContent = `${formatTime(batch.timestamp)} · Batch ${batchNumber}`;
  batchEl.appendChild(header);

  batch.suggestions.forEach((s) => {
    const card = document.createElement("div");
    card.className = `suggestion-card type-${s.type}`;

    const label = document.createElement("span");
    label.className = "suggestion-type";
    label.textContent = TYPE_LABELS[s.type] || s.type;

    const preview = document.createElement("p");
    preview.className = "suggestion-preview";
    preview.textContent = s.preview;

    card.appendChild(label);
    card.appendChild(preview);

    card.addEventListener("click", () => {
      document.querySelectorAll(".suggestion-card").forEach((c) => c.classList.remove("active"));
      card.classList.add("active");
      handleSuggestionClick(s);
    });

    batchEl.appendChild(card);
  });

  // Newest batch goes on top
  container.insertBefore(batchEl, container.firstChild);
}

// ── Chat ─────────────────────────────────────────────────────────────────────

export function renderChatMessage({ role, content, timestamp, streaming = false }) {
  const container = document.getElementById("chat-messages");
  const emptyState = container.querySelector(".empty-state");
  if (emptyState) emptyState.remove();

  const el = document.createElement("div");
  el.className = `chat-message ${role}${streaming ? " streaming" : ""}`;

  const meta = document.createElement("div");
  meta.className = "chat-meta";
  meta.textContent = `${role === "user" ? "You" : "Copilot"} · ${formatTime(timestamp)}`;

  const contentEl = document.createElement("div");
  contentEl.className = "chat-content";
  contentEl.textContent = content;

  el.appendChild(meta);
  el.appendChild(contentEl);
  container.appendChild(el);
  el.scrollIntoView({ behavior: "smooth", block: "end" });

  return el;
}

export function setChatLoading(loading) {
  document.getElementById("chat-send").disabled = loading;
  document.getElementById("chat-input").disabled = loading;
}

// ── Mic Button ───────────────────────────────────────────────────────────────

export function updateMicButton(isRecording) {
  const btn = document.getElementById("mic-btn");
  btn.classList.toggle("recording", isRecording);
  btn.querySelector(".mic-label").textContent = isRecording ? "Stop" : "Record";
}

// ── Error ────────────────────────────────────────────────────────────────────

export function showError(msg) {
  const el = document.getElementById("error-toast");
  el.textContent = msg;
  el.classList.add("visible");
  setTimeout(() => el.classList.remove("visible"), 5000);
}

// ── Settings Modal ───────────────────────────────────────────────────────────

export function showSettingsModal(settings, onSave) {
  document.getElementById("settings-modal").classList.add("open");

  const fields = {
    apiKey:                document.getElementById("s-api-key"),
    suggestionContextWords: document.getElementById("s-suggestion-ctx"),
    chatContextWords:      document.getElementById("s-chat-ctx"),
    suggestionPrompt:      document.getElementById("s-suggestion-prompt"),
    chatPrompt:            document.getElementById("s-chat-prompt"),
  };

  // Populate
  fields.apiKey.value                 = settings.apiKey || "";
  fields.suggestionContextWords.value = settings.suggestionContextWords;
  fields.chatContextWords.value       = settings.chatContextWords;
  fields.suggestionPrompt.value       = settings.suggestionPrompt;
  fields.chatPrompt.value             = settings.chatPrompt;

  document.getElementById("settings-save").onclick = () => {
    onSave({
      apiKey:                fields.apiKey.value.trim(),
      suggestionContextWords: parseInt(fields.suggestionContextWords.value) || 600,
      chatContextWords:      parseInt(fields.chatContextWords.value) || 2000,
      suggestionPrompt:      fields.suggestionPrompt.value.trim(),
      chatPrompt:            fields.chatPrompt.value.trim(),
    });
  };
}

export function hideSettingsModal() {
  document.getElementById("settings-modal").classList.remove("open");
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
