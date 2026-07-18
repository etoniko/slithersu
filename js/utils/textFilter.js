/**
 * Ники/чат: a-z, 0-9, а-я, пробел и -=_<>!.
 * Всё остальное (невидимые, спецсимволы) вырезаем.
 */
// `-` в конце класса, чтобы не было диапазона
const ALLOWED = /[^a-zA-Zа-яА-ЯёЁ0-9 =_<>!.\-]/g;

export function sanitizeSafeText(raw, maxLen = 24) {
  return String(raw || "")
    .replace(ALLOWED, "")
    .slice(0, maxLen);
}

export function sanitizeNick(raw) {
  const n = sanitizeSafeText(raw, 24).trim();
  return n || "Игрок";
}

export function sanitizeChatInput(raw) {
  return String(raw || "")
    .replace(ALLOWED, "")
    .slice(0, 80);
}

export function sanitizeChat(raw) {
  return sanitizeChatInput(raw).replace(/ {2,}/g, " ").trim();
}
