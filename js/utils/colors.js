export const BLACK_UNLOCK_ADS = 1000;

/**
 * Цвет с сервера (`#RRGGBB` / `0xRRGGBB` / число) → uint для PIXI tint / lineStyle.
 */
export function toPixiColor(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return (value >>> 0) & 0xffffff;
  }
  if (value == null) return 0xffffff;
  const s = String(value).trim();
  if (!s) return 0xffffff;
  if (s[0] === "#") {
    const hex = s.slice(1);
    if (hex.length === 3) {
      const r = hex[0] + hex[0];
      const g = hex[1] + hex[1];
      const b = hex[2] + hex[2];
      return parseInt(r + g + b, 16) & 0xffffff;
    }
    return (parseInt(hex.slice(0, 6), 16) || 0xffffff) & 0xffffff;
  }
  if (s.startsWith("0x") || s.startsWith("0X")) {
    return (parseInt(s, 16) || 0xffffff) & 0xffffff;
  }
  const asNum = Number(s);
  if (Number.isFinite(asNum)) return (asNum >>> 0) & 0xffffff;
  return 0xffffff;
}
