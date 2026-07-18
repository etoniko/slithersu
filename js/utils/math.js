const getXp = level => ~~(100 * (level ** 2 / 2));

const getLevel = xp => ~~((xp / 100 * 2) ** .5);

const normalizeFractlPart = n => {
  const t = Math.PI * 2;
  let x = Number(n);
  if (!Number.isFinite(x)) return 0;
  x = Math.abs(x) % t;
  return x / t;
};

function foodHash01(id, salt) {
  const n = (id | 0) >>> 0;
  const x = Math.sin(n * 12.9898 + (salt | 0) * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Позиция еды по id — внутри круглой карты (как на сервере). */
function foodPositionFromId(id, border) {
  const u = foodHash01(id, 1);
  const v = foodHash01(id, 2);
  const w = border.width || (border.right - border.left) || 0;
  const h = border.height || (border.bottom - border.top) || 0;
  const radius = Math.min(w, h) / 2;
  const margin = 150;
  const maxR = Math.max(50, radius - margin);
  const angle = u * Math.PI * 2;
  const r = Math.sqrt(Math.max(0, Math.min(1, v))) * maxR;
  const cx = border.centerX ?? ((border.left + border.right) / 2) ?? 0;
  const cy = border.centerY ?? ((border.top + border.bottom) / 2) ?? 0;
  return {
    x: cx + Math.cos(angle) * r,
    y: cy + Math.sin(angle) * r
  };
}

export { getXp, getLevel, normalizeFractlPart, foodPositionFromId };
