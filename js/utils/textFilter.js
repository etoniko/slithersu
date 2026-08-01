/**
 * Ники/чат: a-z, 0-9, а-я, пробел и -=_<>!.
 * Всё остальное (невидимые, спецсимволы) вырезаем.
 */
// `-` в конце класса, чтобы не было диапазона
const ALLOWED = /[^a-zA-Zа-яА-ЯёЁ0-9 =_<>!.\-]/g;

/** Политические личности — блокируем для модерации Яндекс Игр (п. 3.4.4). */
const BLOCKED_NICK = /(путин|зеленск|трамп|байден|навал|сталин|ленин|гитлер|hitler|putin|trump|biden|медведев|шойгу|lavrov|лавров)/i;

export function sanitizeSafeText(raw, maxLen = 24) {
  return String(raw || "")
    .replace(ALLOWED, "")
    .slice(0, maxLen);
}

export function sanitizeNick(raw) {
  let n = sanitizeSafeText(raw, 24).trim();
  if (!n || BLOCKED_NICK.test(n)) n = "Игрок";
  return n;
}

export function sanitizeChatInput(raw) {
  return String(raw || "")
    .replace(ALLOWED, "")
    .slice(0, 80);
}

export function sanitizeChat(raw) {
  return sanitizeChatInput(raw).replace(/ {2,}/g, " ").trim();
}
