import { DEFAULTS } from "./prompts.js";

const STORAGE_KEY = "twinmind_settings";

export function getSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return { ...DEFAULTS, ...saved };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(partial) {
  const current = getSettings();
  const updated = { ...current, ...partial };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

export function resetSettings() {
  localStorage.removeItem(STORAGE_KEY);
  return { ...DEFAULTS };
}
