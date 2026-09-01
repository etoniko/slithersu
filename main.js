/* Slither Su — bundled static main.js */
(function () {
"use strict";

/* --- js/config/servers.js --- */
/** Единственный игровой сервер (WSS через прокси sixz.ru). */
const SERVER_HOST = "sixz.ru:6009";
const SERVER_WS_URL = `wss://${SERVER_HOST}`;
const servers = {
  [SERVER_HOST]: { name: "FFA" }
};


/* --- js/utils/array.js --- */
function removeFromArray(arr, item) {
  const i = arr.indexOf(item);
  return i !== -1 && arr.splice(i, 1);
}


/* --- js/utils/colors.js --- */
const BLACK_UNLOCK_ADS = 1000;

/**
 * Цвет с сервера (`#RRGGBB` / `0xRRGGBB` / число) → uint 0xRRGGBB.
 */
function toRgbInt(value) {
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

/** uint 0xRRGGBB → CSS rgb/rgba. */
function colorToCss(value, alpha = 1) {
  const n = (typeof value === "number" ? value : toRgbInt(value)) >>> 0;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  if (alpha >= 1) return `rgb(${r},${g},${b})`;
  return `rgba(${r},${g},${b},${alpha})`;
}


/* --- js/utils/math.js --- */
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


/* --- js/utils/binary.js --- */
const prepareData = a => new DataView(new ArrayBuffer(a));

class BinaryReader {
    constructor(view) {
        this.view = view;
        this.byteLength = view.byteLength;
    }
    get canRead() {
        return this.offset < this.byteLength;
    }
    uint8() {
        return this.view.getUint8(this.offset++);
    }
    int8() {
        return this.view.getInt8(this.offset++);
    }
    uint16() {
        return this.view.getUint16((this.offset += 2) - 2, true);
    }
    int16() {
        return this.view.getInt16((this.offset += 2) - 2, true);
    }
    uint32() {
        return this.view.getUint32((this.offset += 4) - 4, true);
    }
    int32() {
        return this.view.getInt32((this.offset += 4) - 4, true);
    }
    utf16() {
        let str = "";
        let char;
        while (this.canRead && (char = this.uint16())) str += String.fromCharCode(char);
        return str;
    }
    utf8() {
        let text = "";

        for (let byte1; byte1 = this.canRead && this.view.getUint8(this.offset++);) {
            if (byte1 <= 0x7F)
                text += String.fromCharCode(byte1);
            else if (byte1 <= 0xDF)
                text += String.fromCharCode(((byte1 & 0x1F) << 6) | (this.view.getUint8(this.offset++) & 0x3F));
            else if (byte1 <= 0xEF)
                text += String.fromCharCode(((byte1 & 0x0F) << 12) | ((this.view.getUint8(this.offset++) & 0x3F) << 6) | (this.view.getUint8(this.offset++) & 0x3F));
            else {
                let codePoint = ((byte1 & 0x07) << 18) | ((this.view.getUint8(this.offset++) & 0x3F) << 12) | ((this.view.getUint8(this.offset++) & 0x3F) << 6) | (this.view.getUint8(this.offset++) & 0x3F);

                if (codePoint >= 0x10000) {
                    codePoint -= 0x10000;
                    text += String.fromCharCode(0xD800 | (codePoint >> 10), 0xDC00 | (codePoint & 0x3FF));
                }
                else text += String.fromCharCode(codePoint);
            }
        }

        return text;
    }
};
BinaryReader.prototype.offset = 0;
class Writer {
    constructor(littleEndian = true) {
        this.writer = true;
        this.tmpBuf = new DataView(new ArrayBuffer(8));
        this._e = littleEndian;
        this.reset();
        return this;
    }
    reset(littleEndian = this._e) {
        this._e = littleEndian;
        this._b = [];
        this._o = 0;
    }
    setUint8(a) {
        if (a >= 0 && a < 256) this._b.push(a);
        return this;
    }
    setInt8(a) {
        if (a >= -128 && a < 128) this._b.push(a);
        return this;
    }
    setUint16(a) {
        this.tmpBuf.setUint16(0, a, this._e);
        this._move(2);
        return this;
    }
    setInt16(a) {
        this.tmpBuf.setInt16(0, a, this._e);
        this._move(2);
        return this;
    }
    setUint32(a) {
        this.tmpBuf.setUint32(0, a, this._e);
        this._move(4);
        return this;
    }
    setInt32(a) {
        this.tmpBuf.setInt32(0, a, this._e);
        this._move(4);
        return this;
    }
    setFloat32(a) {
        this.tmpBuf.setFloat32(0, a, this._e);
        this._move(4);
        return this;
    }
    setFloat64(a) {
        this.tmpBuf.setFloat64(0, a, this._e);
        this._move(8);
        return this;
    }
    _move(b) {
        for (let i = 0; i < b; i++) this._b.push(this.tmpBuf.getUint8(i));
    }
    setStringUTF8(s) {
        const bytesStr = unescape(encodeURIComponent(s));
        for (let i = 0, l = bytesStr.length; i < l; i++) this._b.push(bytesStr.charCodeAt(i));
        this._b.push(0);
        return this;
    }

    setStringUTF16(s) {
        for (let i = 0; i < s.length; i++) {
            this.setUint16(s.charCodeAt(i));
        }
        this.setUint16(0);
        return this;
    }

    build() {
        return new Uint8Array(this._b);
    }
}
class Reader {
    constructor(view, offset, littleEndian) {
        this.reader = true;
        this._e = littleEndian;
        if (view) this.repurpose(view, offset);
    }
    repurpose(view, offset) {
        this.view = view;
        this._o = offset || 0;
    }
    getUint8() {
        return this.view.getUint8(this._o++, this._e);
    }
    getInt8() {
        return this.view.getInt8(this._o++, this._e);
    }
    getUint16() {
        return this.view.getUint16((this._o += 2) - 2, this._e);
    }
    getInt16() {
        return this.view.getInt16((this._o += 2) - 2, this._e);
    }
    getUint32() {
        return this.view.getUint32((this._o += 4) - 4, this._e);
    }
    getInt32() {
        return this.view.getInt32((this._o += 4) - 4, this._e);
    }
    getFloat32() {
        return this.view.getFloat32((this._o += 4) - 4, this._e);
    }
    getFloat64() {
        return this.view.getFloat64((this._o += 8) - 8, this._e);
    }
    getStringUTF8() {
        let s = '', b;
        while ((b = this.view.getUint8(this._o++)) !== 0) s += String.fromCharCode(b);
        return decodeURIComponent(escape(s));
    }
    getStringUTF16() {
        let s = '', b;
        while ((b = this.view.getUint16(this._o, true)) !== 0) {
            this._o += 2;
            s += String.fromCharCode(b);
        }
        this._o += 2;
        return s;
    }
}


/* --- js/utils/textFilter.js --- */
/**
 * Ники/чат: a-z, 0-9, а-я, пробел и -=_<>!.
 * Всё остальное (невидимые, спецсимволы) вырезаем.
 */
// `-` в конце класса, чтобы не было диапазона
const ALLOWED = /[^a-zA-Zа-яА-ЯёЁ0-9 !?<>\/.,#$%^&*()_+{}[\];:"']/g;

/** Политические личности — блокируем для модерации Яндекс Игр (п. 3.4.4). */
const BLOCKED_NICK = /(путин|зеленск|трамп|байден|навал|сталин|ленин|гитлер|hitler|putin|trump|biden|медведев|шойгу|lavrov|лавров)/i;function sanitizeSafeText(raw, maxLen = 24) {
  return String(raw || "")
    .replace(ALLOWED, "")
    .slice(0, maxLen);
}function sanitizeNick(raw) {
  let n = sanitizeSafeText(raw, 24).trim();
  if (!n || BLOCKED_NICK.test(n)) n = "Игрок";
  return n;
}function sanitizeChatInput(raw) {
  return String(raw || "")
    .replace(ALLOWED, "")
    .slice(0, 80);
}function sanitizeChat(raw) {
  return sanitizeChatInput(raw).replace(/ {2,}/g, " ").trim();
}


/* --- js/game/boostConstants.js --- */
/** Должно совпадать с server/boost.js (BOOST_SEGMENTS). */
const BOOST_SEGMENTS = 8;

/** Минимальный общий score (масса всей змейки) для boost. */
const BOOST_MIN_SCORE = 100;
function snapBoostEnergy(energy) {
    const e = Math.max(0, Math.min(1, energy));
    const lit = Math.round(e * BOOST_SEGMENTS);
    return lit / BOOST_SEGMENTS;
}

/** Сколько чёрных квадратов (потраченный boost) — справа налево. */
function energyToBlackCount(energy) {
    return BOOST_SEGMENTS - Math.round(Math.max(0, Math.min(1, snapBoostEnergy(energy))) * BOOST_SEGMENTS);
}


/* --- js/game/minimap.js --- */
/** Дефолтный CSS-размер миникарты (desktop #minimap-grid = 180px). */
const MINIMAP_SIZE = 180;

/**
 * Мировые координаты → позиция маркера на миникарте.
 * border.left/top/right/bottom — с сервера (minx, miny, maxx, maxy).
 */
function worldToMinimap(worldX, worldY, border, size = MINIMAP_SIZE) {
    if (!border?.width || !border?.height) {
        return { x: size / 2, y: size / 2 };
    }

    const nx = (worldX - border.left) / border.width;
    const ny = (worldY - border.top) / border.height;

    return {
        x: Math.max(0, Math.min(size, nx * size)),
        y: Math.max(0, Math.min(size, ny * size))
    };
}


/* --- js/game/segments.js --- */
/** Сегменты игрока: id1 (мин.) — голова/камера, id2 следует за id1, id3 за id2, … */function sortSegmentIds(ids) {
    return ids.slice().sort((a, b) => a - b);
}

/** Главный сегмент — наименьший node id. */function getMainSegmentId(segmentIds) {
    if (!segmentIds.length) return null;
    return sortSegmentIds(segmentIds)[0];
}

/** Индекс сегмента в цепочке: 0 = голова, 1 = второй, … */function getSegmentIndex(segmentIds, cellId) {
    const sorted = sortSegmentIds(segmentIds);
    const idx = sorted.indexOf(cellId);
    return idx >= 0 ? idx : sorted.length;
}

/** z-index: голова (меньший id) поверх хвоста; не зависит от массы. */function segmentZIndex(segmentIndex, segmentCount, cellNodeId) {
    const base = 10000;
    if (segmentCount > 0 && segmentIndex >= 0) {
        return base + (segmentCount - segmentIndex) * 4;
    }
    return base + (cellNodeId % 1000000);
}


/* --- js/game/cellSync.js --- */
/** Синхронизация позиции клетки с сервером. */

/** Длительность lerp: чуть длиннее тика сервера → нет «заморозки» между пакетами. */
const CELL_INTERP_MS = 100;
function isValidCellCoord(n) {
    return typeof n === "number" && Number.isFinite(n);
}
function isValidCellState(posX, posY, size) {
    return isValidCellCoord(posX) && isValidCellCoord(posY) && isValidCellCoord(size) && size >= 0 && size < 100000;
}

/** Резкий скачок координат (спавн, граница карты). */
function shouldSnapCell(cell, posX, posY, border) {
    if (!cell || !border?.width) return false;
    const dx = Math.abs(posX - cell.x);
    const dy = Math.abs(posY - cell.y);
    return dx > border.width * 0.45 || dy > border.height * 0.45;
}

/**
 * @param {boolean} instant — сразу x/y/r без интерполяции
 */
function applyServerCellState(cell, posX, posY, size, now, instant = false) {
    if (!isValidCellState(posX, posY, size)) {
        return false;
    }

    if (instant) {
        cell.x = cell.ox = cell.nx = posX;
        cell.y = cell.oy = cell.ny = posY;
        cell.r = cell.or = cell.nr = size;
    } else {
        // Продолжаем от текущего кадра — без экстраполяции и смены скорости
        cell.ox = cell.x;
        cell.oy = cell.y;
        cell.or = cell.r;
        cell.nx = posX;
        cell.ny = posY;
        cell.nr = size;
    }

    cell.updated = now;
    cell._lastScale = cell.r / 256;
    return true;
}
function snapCameraTo(app, x, y) {
    app.posX = x;
    app.posY = y;
    app.camera.x = x;
    app.camera.y = y;
    app.camera.target = app.camera.target || { x: 1, y: 1, s: 1 };
    app.camera.target.x = x;
    app.camera.target.y = y;
}


/* --- js/net/pow.js --- */
/**
 * Клиентский PoW: расшифровать строку сервера и найти nonce.
 * Ключ должен совпадать с server/pow.js.
 */
const OBFUSCATE_KEY = new TextEncoder().encode('Z9k#mQ2$vL8pR4nX7w');

function deobfuscate(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
        out[i] = bin.charCodeAt(i) ^ OBFUSCATE_KEY[i % OBFUSCATE_KEY.length] ^ ((i * 13) & 0xff);
    }
    return new TextDecoder().decode(out);
}

/** Компактный sync SHA-256 — быстрее SubtleCrypto для ~65k попыток. */
function sha256Hex(str) {
    const K = new Uint32Array([
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ]);
    const enc = new TextEncoder().encode(str);
    const l = enc.length;
    const bitLen = l * 8;
    const withPad = ((l + 9 + 63) & ~63);
    const msg = new Uint8Array(withPad);
    msg.set(enc);
    msg[l] = 0x80;
    const dv = new DataView(msg.buffer);
    // length in bits as big-endian 64-bit (high 32 always 0 for our sizes)
    dv.setUint32(withPad - 4, bitLen >>> 0, false);

    let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
    let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
    const w = new Uint32Array(64);

    for (let i = 0; i < withPad; i += 64) {
        for (let j = 0; j < 16; j++) {
            w[j] = dv.getUint32(i + j * 4, false);
        }
        for (let j = 16; j < 64; j++) {
            const s0 = ((w[j - 15] >>> 7) | (w[j - 15] << 25)) ^ ((w[j - 15] >>> 18) | (w[j - 15] << 14)) ^ (w[j - 15] >>> 3);
            const s1 = ((w[j - 2] >>> 17) | (w[j - 2] << 15)) ^ ((w[j - 2] >>> 19) | (w[j - 2] << 13)) ^ (w[j - 2] >>> 10);
            w[j] = (w[j - 16] + s0 + w[j - 7] + s1) >>> 0;
        }
        let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
        for (let j = 0; j < 64; j++) {
            const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
            const ch = (e & f) ^ (~e & g);
            const t1 = (h + S1 + ch + K[j] + w[j]) >>> 0;
            const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const t2 = (S0 + maj) >>> 0;
            h = g; g = f; f = e; e = (d + t1) >>> 0;
            d = c; c = b; b = a; a = (t1 + t2) >>> 0;
        }
        h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
        h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
    }

    const hex = (n) => n.toString(16).padStart(8, '0');
    return hex(h0) + hex(h1) + hex(h2) + hex(h3) + hex(h4) + hex(h5) + hex(h6) + hex(h7);
}

/**
 * @param {string} blob base64 с сервера
 * @param {(p: number) => void} [onProgress]
 * @returns {Promise<{ challenge: string, difficulty: number, nonce: number }>}
 */async function solvePowBlob(blob, onProgress) {
    const raw = deobfuscate(blob);
    const data = JSON.parse(raw);
    const challenge = String(data.c || '');
    const difficulty = Math.max(3, Math.min(6, data.d | 0));
    if (!challenge) throw new Error('bad pow payload');

    const prefix = '0'.repeat(difficulty);
    const expect = 16 ** difficulty;
    let nonce = 0;

    while (true) {
        const batchEnd = nonce + 800;
        for (; nonce < batchEnd; nonce++) {
            if (sha256Hex(`${challenge}:${nonce}`).startsWith(prefix)) {
                onProgress?.(1);
                return { challenge, difficulty, nonce };
            }
        }
        onProgress?.(Math.min(0.95, nonce / expect));
        await new Promise((r) => setTimeout(r, 0));
    }
}


/* --- js/settings/Storage.js --- */
class Storage {
    get settings() {
        const defaultSettings = {
            names: true,
            mass: false,
            background: true,
            sectors: false,
            border: true
        };

        let parsedSettings = {};
        try {
            const raw = localStorage.getItem("cigar3-settings");
            if (raw) parsedSettings = JSON.parse(raw) || {};
        } catch (_) {
            parsedSettings = {};
        }

        // Скины отключены — убираем старый ключ из сохранённых настроек
        delete parsedSettings.skins;
        // Массу на клетках больше не показываем
        parsedSettings.mass = false;

        const normalized = { ...defaultSettings };
        for (const key of Object.keys(defaultSettings)) {
            if (key in parsedSettings) normalized[key] = parsedSettings[key];
        }
        localStorage.setItem("cigar3-settings", JSON.stringify(normalized));
        return normalized;
    }

    set settings(settings) {
        localStorage.setItem("cigar3-settings", JSON.stringify(settings))
    }

    get name() {
        return localStorage.getItem("cigar3-name")
    }

    set name(name) {
        localStorage.setItem("cigar3-name", name)
    }

}


/* --- js/settings/Settings.js --- */
class Settings {
    constructor(core) {
        this.core = core
        this._settings = this.core.store.settings
    }

    get rawSettings() {
        return this._settings
    }

    get skins() {
        return false;
    }

    set skins(_value) {
        // скины отключены
    }

    get names() {
        return this.rawSettings.names
    }

    set names(value) {
        for (const cell of this.core.app.cells) cell.hasChanged = true
        this.rawSettings.names = value
    }

    get mass() {
        return this.rawSettings.mass
    }

    set mass(value) {
        for (const cell of this.core.app.cells) cell.hasChanged = true
        this.rawSettings.mass = value
    }

    get background() {
        return this.rawSettings.background
    }

    set background(value) {
        this.rawSettings.background = value;
    }

    get sectors() {
        return this.rawSettings.sectors
    }

    set sectors(value) {
        this.rawSettings.sectors = value
    }

    get border() {
        return this.rawSettings.border !== false
    }

    set border(value) {
        this.rawSettings.border = value
    }
}


/* --- js/ui/ModalSystem.js --- */
class ModalSystem {
    constructor() {
        this.modals = new Map();
        this.count = 0;
    }

    getContainer() {
        let container = document.getElementById("modals-container");
        if (!container) {
            container = document.createElement("div");
            container.id = "modals-container";
            document.body.appendChild(container);
        }
        // Всегда на body — поверх меню (не внутри #user-interface с transform)
        if (container.parentElement !== document.body) {
            document.body.appendChild(container);
        }
        return container;
    }

    refresh() {
        const container = this.getContainer();
        container.style.display = "none";
        container.innerHTML = "";
        this.modals.forEach((modal) => {
            container.style.display = "flex";
            const title = modal.title
                ? `<div class="modal-title">${modal.title}</div>`
                : `<div class="modal-title"></div>`;
            const modalStr = `
        <div class="modal-background" data-modal-bg="${modal.id}"></div>
        <div class="modal" role="dialog" aria-modal="true" data-modal-id="${modal.id}">
            <div class="modal-header">
                ${title}
                <button type="button" id="${modal.id}-close" class="modal-close" aria-label="Закрыть">×</button>
            </div>
            <div class="modal-body">
                ${modal.content}
            </div>
        </div>`;
            container.insertAdjacentHTML("beforeend", modalStr);

            document.getElementById(`${modal.id}-close`)?.addEventListener("click", () => {
                this.removeModal(modal.id);
            });
            container.querySelector(`[data-modal-bg="${modal.id}"]`)?.addEventListener("click", () => {
                this.removeModal(modal.id);
            });
        });
    }

    /**
     * @param {number|null} width unused (layout via CSS)
     * @param {number|null} height unused
     * @param {string} content
     * @param {{ title?: string }} [opts]
     */
    addModal(width, height, content, opts = {}) {
        this.modals.set(++this.count, {
            id: this.count,
            width,
            height,
            content,
            title: opts.title || ""
        });
        this.refresh();
        return this.count;
    }

    removeModal(id) {
        this.modals.delete(id);
        this.refresh();
    }
}


/* --- js/yandex/YandexSDK.js --- */
/**
 * Обёртка SDK Яндекс Игр.
 * Платформы: desktop / mobile / tv.
 */const LEADERBOARD_NAME = "score";

let ysdk = null;
let player = null;
let ready = false;
/** @type {'desktop'|'mobile'|'tv'} */
let deviceType = "desktop";

function waitForYaGames(timeoutMs = 4000) {
    if (typeof YaGames !== "undefined") return Promise.resolve(true);
    return new Promise((resolve) => {
        const t0 = Date.now();
        const id = setInterval(() => {
            if (typeof YaGames !== "undefined") {
                clearInterval(id);
                resolve(true);
            } else if (Date.now() - t0 > timeoutMs) {
                clearInterval(id);
                resolve(false);
            }
        }, 50);
    });
}

function detectLocalDeviceType() {
    try {
        const coarse = window.matchMedia("(pointer: coarse)").matches;
        const narrow = window.matchMedia("(max-width: 900px)").matches;
        if (coarse || narrow) return "mobile";
    } catch (_) {}
    return "desktop";
}

function readDeviceType() {
    try {
        const info = ysdk?.deviceInfo;
        if (!info) return detectLocalDeviceType();
        if (typeof info.isTV === "function" && info.isTV()) return "tv";
        if (typeof info.isMobile === "function" && info.isMobile()) return "mobile";
        if (typeof info.isDesktop === "function" && info.isDesktop()) return "desktop";
        const t = String(info.type || "").toLowerCase();
        if (t === "tv" || t === "mobile" || t === "desktop") return t;
    } catch (_) {}
    return detectLocalDeviceType();
}

function applyPlatformClass(type) {
    document.body.classList.remove("platform-desktop", "platform-mobile", "platform-tv");
    document.body.classList.add(`platform-${type}`);
}function getYsdk() {
    return ysdk;
}function getYandexPlayer() {
    return player;
}function isYandexReady() {
    return ready;
}function getDeviceType() {
    return deviceType;
}function isTV() {
    return deviceType === "tv";
}function isMobileDevice() {
    return deviceType === "mobile";
}function isDesktopDevice() {
    return deviceType === "desktop";
}

let gameReadySent = false;

/** LoadingAPI.ready — один раз, когда меню уже интерактивно (п. 1.19). */function signalGameReady() {
    if (gameReadySent) return;
    gameReadySent = true;
    try {
        ysdk?.features?.LoadingAPI?.ready();
        console.log("[Yandex] LoadingAPI.ready");
    } catch (e) {
        console.warn("[Yandex] LoadingAPI.ready:", e);
    }
}async function initYandex() {
    if (ready) return { ysdk, player, deviceType };

    const hasSdk = await waitForYaGames(8000);
    if (!hasSdk || typeof YaGames === "undefined") {
        console.log("[Yandex] SDK не найден — локальный режим");
        deviceType = detectLocalDeviceType();
        applyPlatformClass(deviceType);
        ready = true;
        return { ysdk: null, player: null, deviceType };
    }

    try {
        ysdk = await YaGames.init();
        deviceType = readDeviceType();
        applyPlatformClass(deviceType);

        try {
            player = await ysdk.getPlayer();
        } catch (e) {
            console.warn("[Yandex] getPlayer:", e);
            player = null;
        }

        ready = true;
        console.log("[Yandex] SDK ready", {
            device: deviceType,
            uid: player?.getUniqueID?.(),
            auth: player?.isAuthorized?.()
        });
        return { ysdk, player, deviceType };
    } catch (e) {
        console.warn("[Yandex] init failed:", e);
        deviceType = detectLocalDeviceType();
        applyPlatformClass(deviceType);
        ready = true;
        return { ysdk: null, player: null, deviceType };
    }
}function getIdentity() {
    if (!player) {
        // Локальный гость — прогресс рекламы на этом устройстве
        let guest = "";
        try {
            guest = localStorage.getItem("guestUid") || "";
            if (!guest) {
                guest = "guest_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
                localStorage.setItem("guestUid", guest);
            }
        } catch (_) {}
        return { uid: guest, yaName: "", authorized: false };
    }
    let uid = "";
    let yaName = "";
    try {
        uid = String(player.getUniqueID?.() || "");
    } catch (_) {}
    try {
        yaName = String(player.getName?.() || "");
    } catch (_) {}
    let authorized = false;
    try {
        authorized = !!player.isAuthorized?.();
    } catch (_) {}
    if (!authorized && yaName && yaName !== "anonymous" && yaName !== "Аноним") {
        authorized = true;
    }
    return { uid, yaName, authorized };
}function needsYandexAuthButton() {
    if (!ysdk || !player) return false;
    if (isTV()) return false; // на ТВ диалог входа неудобен
    return !getIdentity().authorized;
}async function openYandexAuth() {
    if (!ysdk?.auth?.openAuthDialog) return false;
    try {
        await ysdk.auth.openAuthDialog();
        player = await ysdk.getPlayer();
        return true;
    } catch (_) {
        return false;
    }
}async function submitYandexScore(score, snakeNick) {
    const s = score | 0;
    if (s <= 0 || !ysdk?.leaderboards) return false;

    try {
        const available = await ysdk.isAvailableMethod?.("leaderboards.setScore");
        if (available === false) return false;
    } catch (_) {}

    try {
        const nick = String(snakeNick || "").slice(0, 48);
        await ysdk.leaderboards.setScore(LEADERBOARD_NAME, s, nick);
        return true;
    } catch (e) {
        console.warn("[Yandex] setScore:", e);
        return false;
    }
}function gameplayStart() {
    try {
        ysdk?.features?.GameplayAPI?.start();
    } catch (_) {}
}function gameplayStop() {
    try {
        ysdk?.features?.GameplayAPI?.stop();
    } catch (_) {}
}

/** Полноэкранная реклама (при входе в игру). */function showFullscreenAd() {
    return new Promise((resolve) => {
        if (!ysdk?.adv?.showFullscreenAdv) {
            resolve({ shown: false, error: "no-sdk" });
            return;
        }
        try {
            gameplayStop();
            ysdk.adv.showFullscreenAdv({
                callbacks: {
                    onOpen: () => {},
                    onClose: (wasShown) => {
                        resolve({ shown: !!wasShown });
                    },
                    onError: (err) => {
                        resolve({ shown: false, error: err });
                    }
                }
            });
        } catch (e) {
            resolve({ shown: false, error: e });
        }
    });
}

/** Rewarded video — награда только в onRewarded. */function showRewardedAd() {
    return new Promise((resolve) => {
        if (!ysdk?.adv?.showRewardedVideo) {
            resolve({ rewarded: false, error: "no-sdk" });
            return;
        }
        let rewarded = false;
        try {
            gameplayStop();
            ysdk.adv.showRewardedVideo({
                callbacks: {
                    onOpen: () => {},
                    onRewarded: () => {
                        rewarded = true;
                    },
                    onClose: () => {
                        resolve({ rewarded });
                    },
                    onError: (err) => {
                        resolve({ rewarded: false, error: err });
                    }
                }
            });
        } catch (e) {
            resolve({ rewarded: false, error: e });
        }
    });
}

/**
 * Полноэкранный режим (Яндекс Games SDK).
 * Вызывать сразу по клику «Играть» — до await.
 */async function requestFullscreen() {
    // API Яндекс Игр — десктоп / мобайл / ТВ
    try {
        const fs = ysdk?.screen?.fullscreen;
        if (fs && typeof fs.request === "function") {
            const status = fs.status;
            if (status !== "on" && status !== fs.STATUS_ON) {
                await fs.request();
            }
            return true;
        }
    } catch (e) {
        console.warn("[Yandex] fullscreen.request:", e);
    }

    // Fallback native: мобилки / ТВ (на десктопе без SDK Esc ломает окно)
    if (isDesktopDevice()) return false;
    try {
        const el = document.documentElement;
        if (document.fullscreenElement) return true;
        if (el.requestFullscreen) await el.requestFullscreen();
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
        return true;
    } catch (_) {
        return false;
    }
}

/**
 * Back на ТВ-пульте.
 * @param {() => void} handler
 * @returns {() => void} unsubscribe
 */function onHistoryBack(handler) {
    if (!ysdk?.on || !ysdk?.EVENTS?.HISTORY_BACK) return () => {};
    try {
        return ysdk.on(ysdk.EVENTS.HISTORY_BACK, handler) || (() => {});
    } catch (_) {
        return () => {};
    }
}

/** Подтверждённый выход из игры (ТВ). */function dispatchExit() {
    try {
        if (ysdk?.EVENTS?.EXIT) {
            ysdk.dispatchEvent(ysdk.EVENTS.EXIT);
            return true;
        }
    } catch (_) {}
    return false;
}

/** Локальный debug: ?tv=1 в URL имитирует ТВ. */function applyDebugPlatformOverride() {
    try {
        const q = new URLSearchParams(location.search);
        if (q.get("tv") === "1") {
            deviceType = "tv";
            applyPlatformClass("tv");
        } else if (q.get("mobile") === "1") {
            deviceType = "mobile";
            applyPlatformClass("mobile");
        }
    } catch (_) {}
}


/* --- js/input/coordinates.js --- */
/**
 * Координаты мыши как в smain.js:
 * - rawMouse в пикселях canvas (с учётом devicePixelRatio)
 * - на сервер: смещение от центра (dx, dy), не мировые X/Y
 * - для спектатора локально: мировые X/Y через viewZoom и nodeX/nodeY
 */
function getRawMouse(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    rawX: (clientX - rect.left) * scaleX,
    rawY: (clientY - rect.top) * scaleY,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height
  };
}

/** Смещение от центра экрана — то, что уходит на сервер (opcode 0x10, 21 байт). */
function getMouseDelta(core) {
  const canvas = core.app.view;
  const { x, y } = core.ui.mouse;
  const { rawX, rawY, canvasWidth, canvasHeight } = getRawMouse(canvas, x, y);
  return {
    dx: rawX - canvasWidth / 2,
    dy: rawY - canvasHeight / 2
  };
}

/** Мировые координаты под курсором (спектатор / прицел камеры, как smain X/Y). */
function getMouseWorld(core) {
  const app = core.app;
  const canvas = app.view;
  const { x, y } = core.ui.mouse;
  const rect = canvas.getBoundingClientRect();
  const screenX = x - rect.left;
  const screenY = y - rect.top;
  const viewZoom = app.camera.s;
  const nodeX = app.camera.x;
  const nodeY = app.camera.y;

  const worldX = (screenX - rect.width / 2) / viewZoom + nodeX;
  const worldY = (screenY - rect.height / 2) / viewZoom + nodeY;

  return clampToBorder({ x: worldX, y: worldY }, core.net.border);
}
function clampToBorder(world, border) {
  if (!border || border.right === undefined) return world;
  return {
    x: Math.max(border.left, Math.min(border.right, world.x)),
    y: Math.max(border.top, Math.min(border.bottom, world.y))
  };
}
function centerRawMouse(core) {
  const canvas = core.app.view;
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  core.ui.mouse.x = rect.left + cx / scaleX;
  core.ui.mouse.y = rect.top + cy / scaleY;
}


/* --- js/game/skins.js --- */
/**
 * PNG-скины: skinlist.txt → nick:123456 → skins/123456.png
 * transparent.txt — ники без цветной заливки.
 * gwel.txt — ники с поворотом скина головы (как rotation.txt в agar.su).
 */

const PI2 = Math.PI * 2;
const BAKE_SIZE = 96;
const ID_RE = /^\d{6}$/;
const SKINS_DIR = "./skins/";

/** @type {Map<string, string>} nick → id */
const nickToSkin = new Map();
/** @type {{ nick: string, id: string }[]} порядок как в skinlist.txt */
let skinCatalog = [];
/** @type {Map<number, string>} playerId → id */
const playerSkin = new Map();
/** @type {Set<string>} ники без color-fill */
const transparentNicks = new Set();
/** @type {Map<number, boolean>} */
const transparentPlayers = new Map();
/** @type {Set<string>} ники с вращением головы */
const gwelNicks = new Set();
/** @type {Map<number, boolean>} */
const gwelPlayers = new Map();
/** @type {Map<string, { canvas: HTMLCanvasElement, color: string }>} */
const diskCache = new Map();
/** @type {Set<string>} */
const loadedIds = new Set();
function isSkinId(id) {
    return ID_RE.test(String(id || ""));
}
function normalizeSkinNick(name) {
    return String(name || "")
        .trim()
        .replace(/#.*$/, "")
        .toLowerCase();
}
function resolveSkinId(name) {
    const key = normalizeSkinNick(name);
    if (!key) return null;
    return nickToSkin.get(key) || null;
}
function isTransparentNick(name) {
    return transparentNicks.has(normalizeSkinNick(name));
}

/** Без заливки color на голове/сегментах (список transparent.txt). */
function isTransparentPlayer(playerId, name) {
    const pid = playerId | 0;
    const key = normalizeSkinNick(name);
    // Есть ник — пересчитываем (при смене ника флаги не «липнут»)
    if (key) {
        const on = transparentNicks.has(key);
        if (pid) transparentPlayers.set(pid, on);
        return on;
    }
    return !!transparentPlayers.get(pid);
}
function isGwelNick(name) {
    return gwelNicks.has(normalizeSkinNick(name));
}

/** Голова крутится за направлением (gwel.txt / agar.su rotation). */
function isGwelPlayer(playerId, name) {
    const pid = playerId | 0;
    const key = normalizeSkinNick(name);
    if (key) {
        const on = gwelNicks.has(key);
        if (pid) gwelPlayers.set(pid, on);
        return on;
    }
    return !!gwelPlayers.get(pid);
}
function skinIdForPlayer(playerId, name) {
    const fromName = resolveSkinId(name);
    const pid = playerId | 0;
    if (fromName) {
        if (pid) playerSkin.set(pid, fromName);
        isTransparentPlayer(pid, name);
        isGwelPlayer(pid, name);
        return fromName;
    }
    // Ник без скина — сбрасываем кэш, чтобы старый скин не оставался
    const key = normalizeSkinNick(name);
    if (key && pid) {
        playerSkin.delete(pid);
        transparentPlayers.set(pid, false);
        gwelPlayers.set(pid, false);
        return null;
    }
    return playerSkin.get(pid) || null;
}
function clearPlayerSkins() {
    playerSkin.clear();
    transparentPlayers.clear();
    gwelPlayers.clear();
}
function hasSkinDef(skinId) {
    return isSkinId(skinId) && diskCache.has(String(skinId));
}
function listSkinIds() {
    return [...loadedIds];
}

/** Каталог для UI: [{ nick, id }, ...] */
function getSkinCatalog() {
    return skinCatalog;
}
function skinImageUrl(id) {
    return SKINS_DIR + String(id) + ".png";
}
function getSkinColor(skinId) {
    return diskCache.get(String(skinId))?.color || null;
}

function parseNickLines(text, intoSet) {
    intoSet.clear();
    const lines = String(text || "").split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line || line[0] === "#") continue;
        const hash = line.indexOf("#");
        if (hash > 0) line = line.slice(0, hash).trim();
        const nick = normalizeSkinNick(line);
        if (nick) intoSet.add(nick);
    }
}
function parseSkinList(text) {
    nickToSkin.clear();
    skinCatalog = [];
    const lines = String(text || "").split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line || line[0] === "#") continue;
        const hash = line.indexOf("#");
        if (hash > 0) line = line.slice(0, hash).trim();
        const colon = line.indexOf(":");
        if (colon <= 0) continue;
        const displayNick = line.slice(0, colon).trim();
        const nick = normalizeSkinNick(displayNick);
        const id = line.slice(colon + 1).trim();
        if (!nick || !isSkinId(id)) continue;
        if (nickToSkin.has(nick)) continue;
        nickToSkin.set(nick, id);
        skinCatalog.push({ nick: displayNick, id });
    }
}
function parseTransparentList(text) {
    parseNickLines(text, transparentNicks);
}
function parseGwelList(text) {
    parseNickLines(text, gwelNicks);
}

/**
 * Плавный поворот без скачка на ±π (как в agar.su main.js).
 * @returns {number} текущий угол в радианах
 */
function updateSkinRotation(state, vx, vy) {
    if (!state) {
        state = { target: 0, current: 0, lastAngle: null };
    }
    let rawAngle;
    if (Math.abs(vx) < 1e-6 && Math.abs(vy) < 1e-6) {
        rawAngle = state.lastAngle ?? state.current;
    } else {
        rawAngle = Math.atan2(vy, vx);
    }

    if (state.lastAngle == null) {
        state.lastAngle = rawAngle;
        state.target = rawAngle;
        state.current = rawAngle;
    } else {
        let d = rawAngle - state.lastAngle;
        if (d > Math.PI) d -= 2 * Math.PI;
        if (d < -Math.PI) d += 2 * Math.PI;
        state.target += d;
        state.lastAngle = rawAngle;
    }

    state.current += (state.target - state.current) * 0.12;
    return state.current;
}

function sampleAvgColor(img, size = 16) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 16) continue;
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        n++;
    }
    if (!n) return "#888888";
    r = (r / n) | 0;
    g = (g / n) | 0;
    b = (b / n) | 0;
    return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

/** Круг с сохранением альфы PNG (дыры/края не заливаются цветом). */
function bakeFromImage(img) {
    const s = BAKE_SIZE;
    const canvas = document.createElement("canvas");
    canvas.width = s;
    canvas.height = s;
    const ctx = canvas.getContext("2d");

    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const scale = Math.max(s / iw, s / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.drawImage(img, (s - dw) * 0.5, (s - dh) * 0.5, dw, dh);

    // обрезаем квадрат в круг, альфа PNG внутри круга остаётся
    ctx.globalCompositeOperation = "destination-in";
    ctx.beginPath();
    ctx.arc(s * 0.5, s * 0.5, s * 0.5 - 0.5, 0, PI2);
    ctx.closePath();
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";

    return {
        canvas,
        color: sampleAvgColor(img)
    };
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.decoding = "async";
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("fail " + src));
        img.src = src;
    });
}

async function ensureSkin(id) {
    id = String(id);
    if (!isSkinId(id) || diskCache.has(id)) return diskCache.get(id) || null;
    try {
        const img = await loadImage(SKINS_DIR + id + ".png");
        if (img.decode) {
            try { await img.decode(); } catch (_) {}
        }
        const entry = bakeFromImage(img);
        diskCache.set(id, entry);
        loadedIds.add(id);
        return entry;
    } catch (err) {
        console.warn("[skins] не загружен", id, err?.message || err);
        return null;
    }
}

async function fetchText(url, fallback = "") {
    try {
        const res = await fetch(url, { cache: "no-cache" });
        if (!res.ok) throw new Error(String(res.status));
        return await res.text();
    } catch (_) {
        return fallback;
    }
}
async function loadSkinList(
    skinUrl = "./skinlist.txt",
    transparentUrl = "./transparent.txt",
    gwelUrl = "./gwel.txt"
) {
    diskCache.clear();
    loadedIds.clear();
    transparentPlayers.clear();
    gwelPlayers.clear();

    const [skinText, trText, gwelText] = await Promise.all([
        fetchText(skinUrl, "собака:123456\nбублик:654321\n"),
        fetchText(transparentUrl, "бублик\n"),
        fetchText(gwelUrl, "бублик\n")
    ]);
    parseSkinList(skinText);
    parseTransparentList(trText);
    parseGwelList(gwelText);

    const ids = [...new Set(nickToSkin.values())];
    await Promise.all(ids.map((id) => ensureSkin(id)));
}

/**
 * @returns {boolean}
 */
function drawSkinnedCell(ctx, skinId, x, y, r, opts = {}) {
    const disk = diskCache.get(String(skinId));
    if (!disk || r <= 0) return false;

    // transparent-ники: никогда не заливаем solid color, только PNG
    if (opts.simple && !opts.noColorFill) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, PI2);
        ctx.fillStyle = disk.color;
        ctx.fill();
        return true;
    }

    if (opts.rotate && Number.isFinite(opts.angle)) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(opts.angle);
        ctx.drawImage(disk.canvas, -r, -r, r * 2, r * 2);
        ctx.restore();
    } else {
        ctx.drawImage(disk.canvas, x - r, y - r, r * 2, r * 2);
    }
    return true;
}


/* --- js/game/SessionStats.js --- */
/** Статистика одной жизни — время, масса, буст, убийства. */class SessionStats {
    constructor() {
        this.reset();
    }

    reset() {
        this.active = false;
        this.startTime = 0;
        this.endTime = 0;
        this.kills = 0;
        this.boostMs = 0;
        this._boostOn = false;
        this._boostStartedAt = 0;
        this.massSamples = [];
        this.peakMass = 0;
        this.finalScore = 0;
        this._lastSampleAt = 0;
    }

    start() {
        this.reset();
        this.active = true;
        this.startTime = Date.now();
        this._lastSampleAt = 0;
    }

    setKills(n) {
        if (!this.active) return;
        this.kills = Math.max(0, n | 0);
    }

    tick(mass, boosting) {
        if (!this.active) return;
        const now = Date.now();
        const m = Math.max(0, mass | 0);

        if (boosting) {
            if (!this._boostOn) {
                this._boostOn = true;
                this._boostStartedAt = now;
            }
        } else if (this._boostOn) {
            this.boostMs += now - this._boostStartedAt;
            this._boostOn = false;
        }

        if (now - this._lastSampleAt >= 350) {
            this._lastSampleAt = now;
            this.massSamples.push({ t: now - this.startTime, m });
            if (this.massSamples.length > 360) this.massSamples.shift();
            if (m > this.peakMass) this.peakMass = m;
        }
    }

    stop(score = 0) {
        if (!this.active) return this.snapshot();
        const now = Date.now();
        if (this._boostOn) {
            this.boostMs += now - this._boostStartedAt;
            this._boostOn = false;
        }
        this.endTime = now;
        this.finalScore = Math.max(0, score | 0);
        if (this.massSamples.length === 0) {
            this.massSamples.push({ t: 0, m: 0 });
            this.massSamples.push({ t: Math.max(1, now - this.startTime), m: this.peakMass });
        }
        this.active = false;
        return this.snapshot();
    }

    snapshot() {
        const end = this.endTime || Date.now();
        const start = this.startTime || end;
        return {
            durationMs: Math.max(0, end - start),
            kills: this.kills | 0,
            boostMs: this.boostMs | 0,
            peakMass: this.peakMass | 0,
            score: this.finalScore | 0,
            massSamples: this.massSamples.slice()
        };
    }
}function formatPlayTime(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h} ч ${m} мин`;
    if (m > 0) return `${m} мин ${String(s).padStart(2, "0")} с`;
    return `${s} с`;
}


/* --- js/input/MobileControls.js --- */
/**
 * Мобильное управление:
 * - свободный джойстик (появляется под пальцем)
 * - двойное касание джойстика + удержание второго пальца = буст
 * - квадратный курсор направления
 * - pinch двумя пальцами = зум
 */class MobileControls {
    constructor(ui) {
        this.ui = ui;
        this.root = document.getElementById("mobile-controls");
        this.stick = document.getElementById("mobile-stick");
        this.stickKnob = document.getElementById("mobile-stick-knob");
        this.cursor = document.getElementById("mobile-cursor");
        this.boostTouchId = null;
        this.lastStickTapAt = 0;
        this.boostHintShown = false;

        this.stickTouchId = null;
        this.stickTouchOnUi = false;
        this.radius = 48;
        this.stickSize = 112;
        this.aimPixels = 110;
        this.originX = 0;
        this.originY = 0;
        this._nx = 0;
        this._ny = 0;
        this._active = false;

        this.pinchTouchIds = null;
        this.pinchStartDist = 0;
        this.pinchStartZoom = 1;

        if (!this.root) return;

        this.onTouchStart = this.onTouchStart.bind(this);
        this.onTouchMove = this.onTouchMove.bind(this);
        this.onTouchEnd = this.onTouchEnd.bind(this);
        this.showBoostHintOnce = this.showBoostHintOnce.bind(this);

        addEventListener("touchstart", this.onTouchStart, { passive: false, capture: true });
        addEventListener("touchmove", this.onTouchMove, { passive: false, capture: true });
        addEventListener("touchend", this.onTouchEnd, { passive: false, capture: true });
        addEventListener("touchcancel", this.onTouchEnd, { passive: false, capture: true });

        this.hideStick();
        this.hide();
    }

    isMobileLayout() {
        if (isTV() || document.body.classList.contains("platform-tv")) return false;
        return window.matchMedia("(max-width: 900px), (pointer: coarse)").matches;
    }

    shouldShow() {
        if (!this.root) return false;
        if (!this.isMobileLayout()) return false;
        if (this.ui._deathStatsOpen) return false;
        return true;
    }

    syncVisibility() {
        if (this.shouldShow()) this.show();
        else this.hide();
    }

    show() {
        if (!this.root || this._active) return;
        this._active = true;
        this.root.hidden = false;
        document.body.classList.add("mobile-play");
        this.showBoostHintOnce();
        this.applyAim();
        this.updateCursor();
    }

    hide() {
        if (!this.root) return;
        const was = this._active;
        this._active = false;
        this.root.hidden = true;
        document.body.classList.remove("mobile-play");
        this.stickTouchId = null;
        this.stickTouchOnUi = false;
        this.boostTouchId = null;
        this.pinchTouchIds = null;
        this.hideStick();
        if (was) this.ui.stopBoost();
    }

    isUiTarget(target) {
        if (!target || !target.closest) return false;
        return !!target.closest(
            ".hud-chat, #leaderboard, #chat-compose, #mobile-chat, input, textarea, button, .menu-rating, #user-interface, #death-stats, .modal-background, .modal"
        );
    }

    onTouchStart(e) {
        if (!this._active) return;

        const t = e.changedTouches[0];
        if (!t) return;
        if (this.pinchTouchIds) return;

        // Джойстик имеет приоритет и запускается даже при касании UI.
        // Для кнопок не блокируем нативный click, чтобы они оставались рабочими.
        const isUiTouch = this.isUiTarget(e.target);
        if (!isUiTouch) e.preventDefault();
        const now = Date.now();
        if (this.stickTouchId != null) return;
        const isDoubleTap = now - this.lastStickTapAt < 350;
        this.lastStickTapAt = now;
        this.stickTouchId = t.identifier;
        this.stickTouchOnUi = isUiTouch;
        if (isDoubleTap) {
            this.boostTouchId = t.identifier;
            this.ui.startBoost();
            this.showBoostHintOnce();
        }

        // База стика со смещением: палец = прошлое положение ручки → без прыжка в центр
        this.showStickAt(t.clientX, t.clientY);
        this.moveStick(t.clientX, t.clientY);
    }

    onTouchMove(e) {
        if (!this._active) return;

        if (this.pinchTouchIds && e.touches.length >= 2) {
            e.preventDefault();
            const a = this.findTouch(e.touches, this.pinchTouchIds[0]);
            const b = this.findTouch(e.touches, this.pinchTouchIds[1]);
            if (a && b) this.updatePinch(a, b);
            return;
        }

        if (this.stickTouchId == null) return;
        if (!this.stickTouchOnUi) e.preventDefault();
        for (const t of e.changedTouches) {
            if (t.identifier === this.stickTouchId) {
                this.moveStick(t.clientX, t.clientY);
                break;
            }
        }
    }

    onTouchEnd(e) {
        if (!this._active) return;

        if (this.pinchTouchIds) {
            const still = [];
            for (const t of e.touches) still.push(t.identifier);
            const [idA, idB] = this.pinchTouchIds;
            if (!still.includes(idA) || !still.includes(idB)) {
                this.pinchTouchIds = null;
            }
            // если остался один палец — можно начать стик заново на следующем touchstart
            return;
        }

        if (this.boostTouchId != null) {
            for (const t of e.changedTouches) {
                if (t.identifier === this.boostTouchId) {
                    if (!this.stickTouchOnUi) e.preventDefault();
                    this.boostTouchId = null;
                    this.ui.stopBoost();
                    this.stickTouchId = null;
                    this.hideStick();
                    this.applyAim();
                    this.updateCursor();
                    return;
                }
            }
        }
        if (this.stickTouchId == null) return;
        for (const t of e.changedTouches) {
            if (t.identifier === this.stickTouchId) {
                if (!this.stickTouchOnUi) e.preventDefault();
                this.stickTouchId = null;
                this.stickTouchOnUi = false;
                this.hideStick();
                this.applyAim();
                this.updateCursor();
                break;
            }
        }
    }

    beginPinch(t0, t1) {
        this.pinchTouchIds = [t0.identifier, t1.identifier];
        this.pinchStartDist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY) || 1;
        this.pinchStartZoom = this.ui.core.app.zoom || 1;
    }

    updatePinch(t0, t1) {
        const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY) || 1;
        const ratio = dist / this.pinchStartDist;
        // пальцы врозь → приближение; вместе → отдаление
        let z = this.pinchStartZoom * ratio;
        const lim = this.ui.core.app.zoomLimits?.player || { min: 0.2, max: 8 };
        z = Math.max(lim.min, Math.min(lim.max, z));
        this.ui.core.app.zoom = z;
    }

    findTouch(touchList, id) {
        for (const t of touchList) {
            if (t.identifier === id) return t;
        }
        return null;
    }

    showStickAt(clientX, clientY) {
        if (!this.stick) return;
        const half = this.stickSize / 2;
        // Прошлое направление как смещение ручки
        const ox = this._nx * this.radius;
        const oy = this._ny * this.radius;
        // Центр базы: палец сразу в точке прошлой ручки (не в нуле)
        this.originX = clientX - ox;
        this.originY = clientY - oy;
        this.stick.hidden = false;
        this.stick.style.left = `${this.originX - half}px`;
        this.stick.style.top = `${this.originY - half}px`;
        if (this.stickKnob) {
            this.stickKnob.style.transform = `translate(${ox}px, ${oy}px)`;
        }
    }

    hideStick() {
        if (this.stick) this.stick.hidden = true;
        if (this.stickKnob) {
            this.stickKnob.style.transform = "translate(0px, 0px)";
        }
    }

    moveStick(clientX, clientY) {
        let dx = clientX - this.originX;
        let dy = clientY - this.originY;
        const len = Math.hypot(dx, dy) || 0;
        const max = this.radius;
        if (len > max) {
            dx = (dx / len) * max;
            dy = (dy / len) * max;
        }
        this._nx = max > 0 ? dx / max : 0;
        this._ny = max > 0 ? dy / max : 0;
        if (this.stickKnob) {
            this.stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
        }
        this.applyAim();
        this.updateCursor();
    }

    applyAim() {
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        const px = this.aimPixels;
        this.ui.mouse.x = cx + this._nx * px;
        this.ui.mouse.y = cy + this._ny * px;
    }

    updateCursor() {
        if (!this.cursor || !this._active) return;
        this.cursor.style.left = `${this.ui.mouse.x}px`;
        this.cursor.style.top = `${this.ui.mouse.y}px`;
    }

    showBoostHintOnce() {
        if (this.boostHintShown || localStorage.getItem("slither-mobile-boost-hint")) return;
        this.boostHintShown = true;
        localStorage.setItem("slither-mobile-boost-hint", "1");
        const hint = document.createElement("div");
        hint.className = "mobile-boost-hint";
        hint.textContent = "Дважды коснитесь джойстика и удерживайте второе касание — буст";
        document.body.appendChild(hint);
        setTimeout(() => hint.remove(), 4500);
    }

}


/* --- js/input/TvControls.js --- */
/**
 * Управление на ТВ-пульте:
 * стрелки = направление змейки, OK/Enter/Space = буст.
 * В меню/после смерти — навигация по кнопкам (п. 1.6.3.2 / 1.14).
 */const ARROWS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
const ARROW_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Up", "Down", "Left", "Right"]);

function normalizeArrow(e) {
    const code = e.code || "";
    const key = e.key || "";
    if (ARROWS.has(code)) return code;
    if (key === "ArrowUp" || key === "Up") return "ArrowUp";
    if (key === "ArrowDown" || key === "Down") return "ArrowDown";
    if (key === "ArrowLeft" || key === "Left") return "ArrowLeft";
    if (key === "ArrowRight" || key === "Right") return "ArrowRight";
    // Некоторые ТВ отдают keyCode
    const kc = e.keyCode | 0;
    if (kc === 38) return "ArrowUp";
    if (kc === 40) return "ArrowDown";
    if (kc === 37) return "ArrowLeft";
    if (kc === 39) return "ArrowRight";
    return null;
}class TvControls {
    constructor(ui) {
        this.ui = ui;
        this._nx = 0;
        this._ny = -1;
        this._held = new Set();
        this._raf = 0;
        this._hint = null;
        this._focusIdx = 0;

        this.onKeyDown = this.onKeyDown.bind(this);
        this.onKeyUp = this.onKeyUp.bind(this);

        addEventListener("keydown", this.onKeyDown, true);
        addEventListener("keyup", this.onKeyUp, true);
        this._tick = this._tick.bind(this);
        this._raf = requestAnimationFrame(this._tick);

        // Стартовое направление вниз по экрану (вперёд)
        this.applyAim();
    }

    enabled() {
        return isTV() || document.body.classList.contains("platform-tv");
    }

    inGameplay() {
        if (!this.enabled()) return false;
        if (this.ui.userInterface?.style.display !== "none") return false;
        if (this.ui._deathStatsOpen) return false;
        if (this.ui._tvExitOpen) return false;
        if (this.ui.core.app.isSpectating) return false;
        return this.ui.core.app.ownedCells.length > 0;
    }

    inMenu() {
        if (!this.enabled()) return false;
        if (this.ui._tvExitOpen) return true;
        if (this.ui._deathStatsOpen) return true;
        return this.ui.userInterface?.style.display !== "none";
    }

    focusableButtons() {
        if (this.ui._tvExitOpen) {
            return [
                document.getElementById("tv-exit-no"),
                document.getElementById("tv-exit-yes")
            ].filter(Boolean);
        }
        if (this.ui._deathStatsOpen) {
            return [
                document.getElementById("death-revive"),
                document.getElementById("death-play"),
                document.getElementById("death-spectate")
            ].filter((el) => el && !el.disabled && el.offsetParent !== null);
        }
        return [
            document.getElementById("play"),
            document.getElementById("spectate"),
            document.getElementById("settings"),
            document.getElementById("yandex-auth")
        ].filter((el) => el && el.offsetParent !== null && getComputedStyle(el).display !== "none");
    }

    moveFocus(dir) {
        const btns = this.focusableButtons();
        if (!btns.length) return;
        this._focusIdx = ((this._focusIdx + dir) % btns.length + btns.length) % btns.length;
        const el = btns[this._focusIdx];
        try {
            el.focus({ preventScroll: true });
        } catch (_) {
            el.focus();
        }
        btns.forEach((b) => b.classList.toggle("tv-focus", b === el));
    }

    activateFocused() {
        const btns = this.focusableButtons();
        if (!btns.length) return;
        const el = btns[this._focusIdx] || btns[0] || document.activeElement;
        if (el && typeof el.click === "function") el.click();
    }

    onKeyDown(e) {
        if (!this.enabled()) return;
        if (this.ui?.isTypingInField?.()) return;

        const arrow = normalizeArrow(e);
        const code = e.code || "";

        if (this.inMenu()) {
            if (arrow === "ArrowUp" || arrow === "ArrowLeft") {
                e.preventDefault();
                e.stopPropagation();
                this.moveFocus(-1);
                return;
            }
            if (arrow === "ArrowDown" || arrow === "ArrowRight") {
                e.preventDefault();
                e.stopPropagation();
                this.moveFocus(1);
                return;
            }
            if (code === "Enter" || code === "NumpadEnter" || code === "Space" || e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                this.activateFocused();
                return;
            }
            return;
        }

        if (!this.inGameplay()) return;

        if (arrow) {
            e.preventDefault();
            e.stopPropagation();
            this._held.add(arrow);
            this._recomputeDir();
            this.applyAim();
            // форс-отправка направления
            this.ui.core?.net?.sendMouseMove?.(true);
            return;
        }

        if (code === "Enter" || code === "NumpadEnter" || code === "Space" || e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            this.ui.startBoost();
        }
    }

    onKeyUp(e) {
        if (!this.enabled()) return;
        if (this.ui?.isTypingInField?.()) return;
        const arrow = normalizeArrow(e);
        const code = e.code || "";

        if (arrow) {
            this._held.delete(arrow);
            this._recomputeDir();
            this.applyAim();
            return;
        }

        if (code === "Enter" || code === "NumpadEnter" || code === "Space" || e.key === "Enter") {
            this.ui.stopBoost();
        }
    }

    _recomputeDir() {
        let x = 0;
        let y = 0;
        if (this._held.has("ArrowLeft")) x -= 1;
        if (this._held.has("ArrowRight")) x += 1;
        if (this._held.has("ArrowUp")) y -= 1;
        if (this._held.has("ArrowDown")) y += 1;
        if (x === 0 && y === 0) return;
        const len = Math.hypot(x, y) || 1;
        this._nx = x / len;
        this._ny = y / len;
    }

    applyAim() {
        const cx = innerWidth * 0.5;
        const cy = innerHeight * 0.5;
        const dist = Math.min(innerWidth, innerHeight) * 0.35;
        this.ui.mouse.x = cx + this._nx * dist;
        this.ui.mouse.y = cy + this._ny * dist;
    }

    _tick() {
        this._raf = requestAnimationFrame(this._tick);
        if (!this.enabled()) {
            this.hideHint();
            return;
        }
        if (this.inMenu()) {
            this.hideHint();
            // Убедиться, что есть фокус на кнопке
            const ae = document.activeElement;
            const btns = this.focusableButtons();
            if (btns.length && (!ae || !btns.includes(ae))) {
                this._focusIdx = 0;
                this.moveFocus(0);
            }
            return;
        }
        if (!this.inGameplay()) {
            this.hideHint();
            return;
        }
        this.applyAim();
        this.showHint();
    }

    showHint() {
        if (this._hint) return;
        const el = document.createElement("div");
        el.id = "tv-hint";
        el.textContent = "←↑↓→ направление · OK буст · Back меню";
        document.body.appendChild(el);
        this._hint = el;
    }

    hideHint() {
        if (!this._hint) return;
        this._hint.remove();
        this._hint = null;
    }
}


/* --- js/game/Cell.js --- */
class Cell {
    static NAME_CACHE = new Map();

    constructor(core, id, x, y, r, name, color) {
        this.core = core;
        this.id = id;
        this.x = this.nx = this.ox = x;
        this.y = this.ny = this.oy = y;
        this.r = this.nr = this.or = r;
        this._color = color;
        this._colorNum = toRgbInt(color);
        this._drawColor = this._colorNum;
        this._name = name;
        this.updated = performance.now();
        this.hasChanged = true;
        this._lastScale = r / 256;
        this._lastZIndex = id;
        this._visible = true;
        this.alpha = 1;
        this.drawScale = 1;
        this.labelAlpha = 1;
        this.playerId = 0;
        this.segmentIndex = -1;
        this._segmentZ = id;
        this.isFood = false;
        this.isDeathFood = false;
        this._foodSimple = true;
        this.boostEnergy = 0;
        this.boostEnergyTarget = 0;
        this.boostEnergyVisual = 0;
        this.boostBoosting = false;
        this.boostStateKnown = false;
        this._boostTintActive = false;
        this._showBoostRing = false;
        this._boostRingAlpha = 0;
        this._boostFlash = 0;
        this._fadingOut = false;
        this._fadeStart = 0;
        this._fadeDuration = 280;
        this._fadeStartScale = 1;
        this.destroyed = false;
        this.diedBy = 0;
        this.dead = 0;
        this._showName = false;
        this._waitVisualContact = false;
        this._contactDeadline = 0;
        this._skinId = null;
        this._skinNickKey = "";
        this._noColorFill = false;
        this._gwelRotate = false;
        this._rot = null;
        this._resolveSkin();
    }

    setPlayerId(playerId) {
        const pid = playerId | 0;
        if (this.playerId === pid) return;
        this.playerId = pid;
        this._skinNickKey = "";
        this._resolveSkin();
    }

    setAsFood() {
        this.isFood = true;
        this.isDeathFood = false;
        this._segmentZ = 2;
        this._foodSimple = null;
        this._updateFoodLod(true);
    }

    setAsDeathFood() {
        this.isFood = true;
        this.isDeathFood = true;
        this.playerId = 0;
        this._segmentZ = 3;
        this._name = "";
        this._showName = false;
        this._hideSpeedEdge();

        const foodMax = this.core?.net?.foodMaxSize || 12;
        this._foodVisualCap = foodMax * 1.55 + 2;

        if (this.r > this._foodVisualCap) {
            this.r = this.or = this.nr = this._foodVisualCap;
            this._lastScale = this.r / 256;
        }

        this._foodSimple = null;
        this._updateFoodLod(true);
    }

    _updateFoodLod(force = false) {
        if (!this.isFood) return;
        const camS = this.core?.app?.camera?.s ?? 1;
        const r = Number.isFinite(this.r) ? this.r : this.nr || 0;
        const screenR = r * camS;
        // 1) обычная еда карты — упрощается раньше
        // 2) крупная от мёртвых — только при ещё большем отдалении
        const simple = this.isDeathFood
            ? (camS < 0.30 || screenR < 3.8)
            : (camS < 0.55 || screenR < 5.5);
        if (!force && this._foodSimple === simple) return;
        this._foodSimple = simple;
        this._drawColor = this._colorNum >>> 0;
    }

    setSegmentOrder(segmentIndex, segmentCount) {
        const prevIndex = this.segmentIndex;
        this.segmentIndex = segmentIndex;
        const z = segmentCount > 0 && segmentIndex >= 0
            ? 10000 + (segmentCount - segmentIndex) * 4
            : this.id;
        if (this._segmentZ !== z) {
            this._segmentZ = z;
            this._lastZIndex = z;
        }
        if (prevIndex !== segmentIndex) {
            this.syncLabelVisibility();
        }
    }

    isPrimaryDisplayCell() {
        if (!this.playerId) return true;
        const ownerId = this.core?.net?.ownerPlayerId ?? 0;
        const mainId = this.core?.app?.mainCell?.id;
        if (ownerId && this.playerId === ownerId && mainId != null) {
            return this.id === mainId;
        }
        return this.segmentIndex <= 0;
    }

    shouldShowNameAndMass() {
        if (this.isFood) return false;
        return this.isPrimaryDisplayCell();
    }

    getDisplayMass() {
        return this._mass ?? Math.round(this.r * this.r / 100);
    }

    shouldShowBoostBar() {
        return false;
    }

    setBoostState(energy, boosting) {
        const e = Math.max(0, Math.min(1, energy ?? 0));
        this.boostEnergy = e;
        this.boostEnergyTarget = e;
        this.boostEnergyVisual = e;
        this.boostBoosting = !!boosting;
        this.boostStateKnown = true;
    }

    syncLabelVisibility() {
        const showName = this.shouldShowNameAndMass();
        const namesOn = !!this.core.settings?.names;
        const visKey = `${showName ? 1 : 0}|${this._name}|${namesOn ? 1 : 0}`;
        if (this._labelVisKey === visKey) return;
        this._labelVisKey = visKey;

        this._showName = !!(showName && this._name && (namesOn || this.playerId));
        this.setLabelAlpha(this.core.app.isSpectating ? 0.5 : 1);
    }

    _hideSpeedEdge() {
        this._showBoostRing = false;
        this._boostRingAlpha = 0;
        this._boostFlash = 0;
        this._clearBoostTint();
    }

    _clearBoostTint() {
        if (!this._boostTintActive) return;
        this._drawColor = this._colorNum >>> 0;
        this._boostTintActive = false;
    }

    _mixBoostTint(t) {
        t = t < 0 ? 0 : (t > 1 ? 1 : t);
        const c = this._colorNum >>> 0;
        const r = (c >> 16) & 255;
        const g = (c >> 8) & 255;
        const b = c & 255;
        const nr = (r + (255 - r) * t) | 0;
        const ng = (g + (255 - g) * t) | 0;
        const nb = (b + (255 - b) * t) | 0;
        return (nr << 16) | (ng << 8) | nb;
    }

    _updateSpeedEdgeEffect(time) {
        const boosting = this.boostBoosting || this._isNetworkBoosting();
        if (!boosting || !this.playerId || this._visible === false) {
            this._hideSpeedEdge();
            return;
        }

        const segIdx = Math.max(0, this.segmentIndex);
        // Волна света: от головы (0) к хвосту (со скином — цвет клеток, без скина — белый тинт)
        const phase = time * 0.015 - segIdx * 0.16;
        const wave = 0.5 + 0.5 * Math.sin(phase);
        const camS = this.core?.app?.camera?.s ?? 1;
        const far = camS < 0.32;
        const skinned = !!this._skinId;

        if (segIdx > 0) {
            this._showBoostRing = false;
            if (far) {
                this._boostFlash = 0;
                this._clearBoostTint();
                return;
            }
            const t = 0.08 + 0.42 * (wave * wave);
            if (skinned) {
                this._clearBoostTint();
                this._boostFlash = t;
                return;
            }
            this._boostFlash = 0;
            this._drawColor = this._mixBoostTint(t);
            this._boostTintActive = true;
            return;
        }

        if (far) {
            this._showBoostRing = false;
            if (skinned) {
                this._clearBoostTint();
                this._boostFlash = 0.12 + 0.28 * wave;
                return;
            }
            this._boostFlash = 0;
            this._drawColor = this._mixBoostTint(0.15 + 0.35 * wave);
            this._boostTintActive = true;
            return;
        }

        if (skinned) {
            // Со скином цветное кольцо буста на голове не рисуем
            this._showBoostRing = false;
            this._boostRingAlpha = 0;
            this._clearBoostTint();
            this._boostFlash = 0.14 + 0.3 * wave;
            return;
        }
        this._showBoostRing = true;
        this._boostRingAlpha = 0.5 + 0.5 * wave;
        this._boostFlash = 0;
        this._drawColor = this._mixBoostTint(0.18 + 0.32 * wave);
        this._boostTintActive = true;
    }

    _isNetworkBoosting() {
        if (!this.playerId) return false;
        const st = this.core.net.playerBoost.get(this.playerId);
        return !!(st && st.boosting);
    }

    setLabelAlpha(alpha) {
        this.labelAlpha = alpha;
    }

    /** Ник внутри головы: белый + чёрная обводка, высокий DPR чтобы края не пикселили. */
    static _getNameCanvas(name) {
        const key = `inw3|${name}`;
        if (Cell.NAME_CACHE.has(key)) return Cell.NAME_CACHE.get(key);

        const fontSize = 96;
        const font = `800 ${fontSize}px Nunito, sans-serif`;
        const measure = document.createElement("canvas").getContext("2d");
        measure.font = font;
        const textW = Math.ceil(measure.measureText(name).width);
        const strokeW = 10;
        const padX = 18 + strokeW;
        const padY = 14 + strokeW;
        const cssW = textW + padX * 2;
        const cssH = fontSize + padY * 2;

        const dpr = 3;
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(cssW * dpr);
        canvas.height = Math.ceil(cssH * dpr);
        const ctx = canvas.getContext("2d");
        ctx.scale(dpr, dpr);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.font = font;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineJoin = "round";
        ctx.miterLimit = 2;
        ctx.lineWidth = strokeW;
        ctx.strokeStyle = "#000000";
        ctx.fillStyle = "#ffffff";
        const cx = cssW / 2;
        const cy = cssH / 2;
        ctx.strokeText(name, cx, cy);
        ctx.fillText(name, cx, cy);

        const entry = { canvas, cssW, cssH };
        Cell.NAME_CACHE.set(key, entry);
        return entry;
    }

    _resolveSkin() {
        if (this.isFood || !this.playerId) {
            this._skinId = null;
            this._skinNickKey = "";
            this._noColorFill = false;
            this._gwelRotate = false;
            return;
        }
        const next = skinIdForPlayer(this.playerId, this._name);
        const noFill = isTransparentPlayer(this.playerId, this._name);
        const gwel = isGwelPlayer(this.playerId, this._name);
        const key = `${this.playerId}|${this._name || ""}|${next || ""}|${noFill ? 1 : 0}|${gwel ? 1 : 0}`;
        if (key === this._skinNickKey) return;
        this._skinNickKey = key;
        this._skinId = next;
        this._noColorFill = noFill;
        this._gwelRotate = gwel;
    }

    /** Угол головы по вектору движения — одинаково для себя и для зрителей (agar.su / gwel). */
    _gwelHeadAngle() {
        if (!this._rot) {
            this._rot = { target: 0, current: 0, lastAngle: null };
        }
        const vx = this.nx - this.ox;
        const vy = this.ny - this.oy;
        return updateSkinRotation(this._rot, vx, vy);
    }

    set name(value) {
        if (!this.hasChanged) return;
        this._name = value;
        this._resolveSkin();
        this.syncLabelVisibility();
    }

    get name() {
        return this._name;
    }

    set color(value) {
        if (!this.hasChanged) return;
        this._color = value;
        this._colorNum = toRgbInt(value);
        this._drawColor = this._colorNum;
    }

    get color() {
        return this._color;
    }

    get colorNum() {
        return this._colorNum >>> 0;
    }

    get mass() {
        return this._mass;
    }

    set mass(value) {
        this._mass = value;
    }

    update(time) {
        // Один и тот же интервал для головы и сегментов — иначе тело дёргается относительно камеры
        const delta = Math.max(0, Math.min(1, (time - this.updated) / CELL_INTERP_MS));

        if (this.hasChanged) {
            this.color = this.color;
            this.name = this.name;
            this.hasChanged = false;
        }

        this.x = this.ox + (this.nx - this.ox) * delta;
        this.y = this.oy + (this.ny - this.oy) * delta;
        this.r = this.or + (this.nr - this.or) * delta;
        this._lastScale = this.r / 256;
        this.drawScale = 1;

        if (this.isFood) {
            this._updateFoodLod();
            return;
        }

        this._mass = Math.round(this.r * this.r / 100);
        this._lastZIndex = this._segmentZ;

        // Скин следует за ником: смена ника / кэш головы → обновить сегменты
        if (this.playerId) this._resolveSkin();

        this.boostBoosting = this._isNetworkBoosting();
        this._updateSpeedEdgeEffect(time);
    }

    draw(ctx) {
        if (!this._visible && !this._fadingOut) return;

        const r = this.r * (this.drawScale || 1);
        if (r <= 0) return;

        // Далеко / мелко — еда-точка, без бликов; совсем крошечную не рисуем
        if (this.isFood && this._foodSimple) {
            const camS = this.core?.app?.camera?.s ?? 1;
            if (r * camS < 1.15) return;
        }

        const alpha = this.alpha;
        ctx.save();
        if (alpha < 1) ctx.globalAlpha = alpha;

        if (this.isFood && !this._foodSimple) {
            const color = this._drawColor >>> 0;
            ctx.beginPath();
            ctx.arc(this.x, this.y, r * 1.25, 0, Math.PI * 2);
            ctx.fillStyle = colorToCss(color, 0.35);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(this.x, this.y, r * 1.1, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(255,255,255,0.18)";
            ctx.fill();
        }

        let skinned = false;
        if (this._skinId && this.playerId && !this.isFood) {
            // Скин никогда не теряется от zoom — всегда PNG
            const isHead = this.segmentIndex <= 0;
            const rotate = isHead && this._gwelRotate;
            skinned = drawSkinnedCell(ctx, this._skinId, this.x, this.y, r, {
                simple: false,
                noColorFill: this._noColorFill,
                rotate,
                angle: rotate ? this._gwelHeadAngle() : 0
            });
        }
        // Ники из transparent.txt — без цветной заливки головы/сегментов
        if (!skinned && !this._noColorFill) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
            ctx.fillStyle = colorToCss(this._drawColor);
            ctx.fill();
        }

        if (this.isFood && !this._foodSimple) {
            ctx.beginPath();
            ctx.arc(this.x - r * 0.27, this.y - r * 0.35, r * 0.27, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(255,255,255,0.55)";
            ctx.fill();
            ctx.beginPath();
            ctx.arc(this.x + r * 0.35, this.y + r * 0.39, r * 0.16, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(255,255,255,0.25)";
            ctx.fill();
        }

        // Волна буста поверх скина — цвет клетки (_colorNum), не усреднение PNG
        if (this._boostFlash > 0) {
            ctx.globalAlpha = alpha * Math.min(0.75, this._boostFlash);
            ctx.beginPath();
            ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
            ctx.fillStyle = colorToCss(this._colorNum);
            ctx.fill();
            ctx.globalAlpha = alpha;
        }

        // Кольцо на голове — поверх скина
        if (this._showBoostRing) {
            const cellColor = this._colorNum >>> 0;
            ctx.globalAlpha = alpha * this._boostRingAlpha;
            ctx.beginPath();
            ctx.arc(this.x, this.y, r + r * 0.055, 0, Math.PI * 2);
            ctx.strokeStyle = colorToCss(cellColor, 0.35);
            ctx.lineWidth = r * 0.14;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(this.x, this.y, r + r * 0.016, 0, Math.PI * 2);
            ctx.strokeStyle = colorToCss(cellColor, 0.95);
            ctx.lineWidth = r * 0.07;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(this.x, this.y, r + r * 0.008, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(255,255,255,0.35)";
            ctx.lineWidth = r * 0.03;
            ctx.stroke();
            ctx.globalAlpha = alpha;
        }

        if (this._showName && this._name) {
            const entry = Cell._getNameCanvas(this._name);
            let dh = r * 0.85;
            let dw = entry.cssW * (dh / entry.cssH);
            const maxW = r * 1.85;
            if (dw > maxW) {
                const s = maxW / dw;
                dw *= s;
                dh *= s;
            }
            ctx.globalAlpha = alpha * this.labelAlpha;
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            ctx.drawImage(entry.canvas, this.x - dw / 2, this.y - dh / 2, dw, dh);
        }

        ctx.restore();
    }

    destroy(killerId, opts) {
        if (this._fadingOut || this.destroyed) return;
        this._fadingOut = true;
        this.destroyed = true;
        this.dead = performance.now();
        this._fadeStart = this.dead;
        this._fadeStartScale = this._lastScale || (this.r / 256) || 1;

        if (killerId && !this.diedBy) {
            this.diedBy = killerId;
            this.ox = this.x;
            this.oy = this.y;
            this.updated = this.dead;

            // Еда: ждём визуального касания головы, иначе «съелось раньше, чем видно»
            if (this.isFood) {
                this._waitVisualContact = true;
                this._contactDeadline = this.dead + 240;
                this._fadeDuration = 200;
                this.alpha = 1;
                this.drawScale = 1;
            }
        }

        this.core.app.cellsByID.delete(this.id);

        const app = this.core.app;
        const ownedIdx = app.ownedCells.indexOf(this.id);
        if (ownedIdx !== -1 && !app.snakeEnded) {
            const headId = app.headCellId ?? getMainSegmentId(app.ownedCells);
            const headDied = this.id === headId;
            app.ownedCells.splice(ownedIdx, 1);
            if (headDied || app.ownedCells.length === 0) {
                if (app.endOwnedSnake()) {
                    this.core.ui.onPlayerDied();
                }
            } else {
                app.refreshHeadCellId();
            }
        }

        removeFromArray(this.core.app.cells, this);
        this._hideSpeedEdge();
        this._showName = false;

        if (opts && opts.instant) {
            this._finishDestroy();
            return;
        }

        if (!this.core.app.dyingCells) this.core.app.dyingCells = [];
        this.core.app.dyingCells.push(this);
    }

    updateFade(now) {
        if (!this._fadingOut) return true;

        if (this._waitVisualContact && this.diedBy) {
            const killer = this.core.app.cellsByID.get(this.diedBy);
            if (killer && !killer.destroyed) {
                const dx = killer.x - this.x;
                const dy = killer.y - this.y;
                const dist = Math.hypot(dx, dy);
                const touchR = Math.max(4, killer.r * 0.92 + this.r * 0.4);

                if (dist > touchR && now < this._contactDeadline) {
                    // Мягко подтягиваем, если уже рядом — без телепорта к голове
                    if (dist < killer.r * 5) {
                        const pull = Math.min(0.22, 10 / Math.max(dist, 1));
                        this.x += dx * pull;
                        this.y += dy * pull;
                    }
                    this.alpha = 1;
                    this.drawScale = 1;
                    this.ox = this.x;
                    this.oy = this.y;
                    return false;
                }
            }

            this._waitVisualContact = false;
            this._fadeStart = now;
            this.ox = this.x;
            this.oy = this.y;
        }

        const dur = this._fadeDuration || 280;
        const t = Math.max(0, Math.min(1, (now - this._fadeStart) / dur));
        const ease = 1 - (1 - t) * (1 - t);
        const fade = 1 - t;

        this.alpha = fade;
        this.drawScale = Math.max(0.01, 0.45 + 0.55 * fade);

        if (this.diedBy) {
            const killer = this.core.app.cellsByID.get(this.diedBy);
            if (killer && !killer.destroyed) {
                this.x = this.ox + (killer.x - this.ox) * ease;
                this.y = this.oy + (killer.y - this.oy) * ease;
            }
        }

        if (t >= 1) {
            this._finishDestroy();
            return true;
        }
        return false;
    }

    _finishDestroy() {
        this._fadingOut = false;
        this._waitVisualContact = false;
        this.alpha = 0;
        this._visible = false;
    }
}


/* --- js/game/Application.js --- */
const OUTSIDE_CSS = "#ffe8a8";
const GOLD_CSS = "#f0c84a";
const GRID_CSS = "rgba(168,212,232,0.55)";
const SECTOR_LINE = "rgba(126,184,208,0.35)";
const SECTOR_LABEL = "#6a9fb0";
const CYR_ROWS = ["А", "Б", "В", "Г", "Д"];
class Application {
    constructor(core) {
        this.core = core;

        this.initRenderer();
        this.initMinimap();

        this.cells = [];
        this.cellsByID = new Map();
        this.ownedCells = [];
        this.dyingCells = [];
        this.camera = {
            x: 1,
            y: 1,
            s: 1,
            w: 1,
            score: 0,
            mass: 0,
            target: { x: 1, y: 1, s: 1 }
        };
        this.zoomLimits = {
            player: { min: 0.2, max: 8 },
            spectate: { min: 0.04, max: 8 }
        };
        this.zoom = 0.7;
        this.viewZoom = 1;
        this._fpsFrames = 0;
        this._fpsLast = performance.now();
        this._fpsUpdateMs = 500;
        this.core.stats = this.core.stats || {};
        this.core.stats.fps = 0;
        this._viewCssW = 0;
        this._viewCssH = 0;
        this._ownedSet = new Set();
        this._ownedSetKey = "";
        this._minimapFrame = 0;
        this._layersFrame = 0;
        this._drawList = [];
        this.mapReady = false;
        this.mainCell = null;
        this.mainCellLockTime = 0;
        this.posX = 0;
        this.posY = 0;
        this.posSize = 1;
        this.isSpectating = false;
        this.boostEnergy = 1;
        this.isBoostActive = false;
        this.headCellId = null;
        this.snakeEnded = false;
        this.loop = this.loop.bind(this);

        this.loop();
    }

    enterSpectateMode() {
        this.isSpectating = true;
        this.mainCell = null;
        this.applySpectateLabelAlpha();
    }

    exitSpectateMode() {
        this.isSpectating = false;
        this.core.net._lastSpectateX = null;
        this.core.net._lastSpectateY = null;
        this.applySpectateLabelAlpha();
    }

    prepareNewLife() {
        this.snakeEnded = false;
        this.headCellId = null;
        this.ownedCells = [];
        this.mainCell = null;
    }

    endOwnedSnake() {
        if (this.snakeEnded && this.ownedCells.length === 0) {
            return false;
        }
        this.snakeEnded = true;
        this.ownedCells = [];
        this.mainCell = null;
        this.headCellId = null;
        return true;
    }

    refreshHeadCellId() {
        this.headCellId = getMainSegmentId(this.ownedCells);
    }

    setSpectateTarget(x, y) {
        this.posX = x;
        this.posY = y;
    }

    applySpectateLabelAlpha() {
        const alpha = this.isSpectating ? 0.5 : 1;
        for (let i = 0; i < this.cells.length; i++) {
            this.cells[i].setLabelAlpha(alpha);
        }
    }

    viewRange() {
        const w = this._viewCssW || this.view?.clientWidth || innerWidth;
        const h = this._viewCssH || this.view?.clientHeight || innerHeight;
        const ratio = Math.max(h / 1080, w / 1920);
        return ratio * this.zoom;
    }

    calcViewZoom() {
        if (!this.mainCell || this.mainCell.destroyed) return;
        // nr — серверный размер, без микродрожания от lerp радиуса
        const size = Number.isFinite(this.mainCell.nr) ? this.mainCell.nr : this.mainCell.r;
        const score = (size * size) / 100;
        const scale = Math.log(score + 2);
        const newViewZoom = Math.pow(1 / scale, 0.2) * this.viewRange();
        this.viewZoom = (9 * this.viewZoom + newViewZoom) / 10;
    }

    pruneOwnedCells() {
        for (let i = this.ownedCells.length - 1; i >= 0; i--) {
            const cell = this.cellsByID.get(this.ownedCells[i]);
            if (!cell || cell.destroyed) {
                this.ownedCells.splice(i, 1);
            }
        }
        if (!this.ownedCells.length) {
            this.mainCell = null;
        }
    }

    pickMainCell() {
        this.pruneOwnedCells();
        this.ownedCells = sortSegmentIds(this.ownedCells);
        const mainId = getMainSegmentId(this.ownedCells);
        this.mainCell = mainId != null ? this.cellsByID.get(mainId) : null;
        if (this.mainCell?.destroyed) {
            this.mainCell = null;
        }
    }

    applySegmentLayers() {
        const byPlayer = new Map();

        for (let i = 0, len = this.cells.length; i < len; i++) {
            const cell = this.cells[i];
            if (!cell || cell.destroyed || !cell.playerId) continue;
            if (!byPlayer.has(cell.playerId)) {
                byPlayer.set(cell.playerId, []);
            }
            byPlayer.get(cell.playerId).push(cell);
        }

        for (const group of byPlayer.values()) {
            group.sort((a, b) => a.id - b.id);
            const count = group.length;
            for (let s = 0; s < count; s++) {
                const cell = group[s];
                cell.setSegmentOrder(s, count);
                cell._segPrev = s > 0 ? group[s - 1] : null;
                cell._segNext = s + 1 < count ? group[s + 1] : null;
            }
        }

        for (let i = 0, len = this.cells.length; i < len; i++) {
            const cell = this.cells[i];
            if (!cell || cell.destroyed || cell.playerId) continue;
            const z = cell.isDeathFood ? 3 : (cell.isFood ? 2 : 1);
            if (cell._segmentZ !== z) {
                cell._segmentZ = z;
                cell._lastZIndex = z;
            }
        }
    }

    updateOwnedCells(now) {
        for (let i = 0; i < this.ownedCells.length; i++) {
            const cell = this.cellsByID.get(this.ownedCells[i]);
            if (cell && !cell.destroyed) {
                cell.update(now);
            }
        }
    }

    getCameraTargetPos() {
        this.pickMainCell();
        const main = this.mainCell;
        if (main && !main.destroyed && Number.isFinite(main.x) && Number.isFinite(main.y)) {
            return { x: main.x, y: main.y };
        }

        let sumX = 0;
        let sumY = 0;
        let count = 0;
        for (let i = 0; i < this.ownedCells.length; i++) {
            const cell = this.cellsByID.get(this.ownedCells[i]);
            if (!cell || cell.destroyed) continue;
            const px = Number.isFinite(cell.x) ? cell.x : cell.nx;
            const py = Number.isFinite(cell.y) ? cell.y : cell.ny;
            sumX += px;
            sumY += py;
            count++;
        }
        if (count > 0) {
            return { x: sumX / count, y: sumY / count };
        }
        return { x: this.posX, y: this.posY };
    }

    /** Кэш размеров карты после пакета границ (рисуем в drawWorld). */
    drawBorder() {
        this.mapReady = !!(this.core.net?.border?.width);
    }

    drawBackground() {
        this.mapReady = !!(this.core.net?.border?.width);
    }

    drawGrid() {
        this.mapReady = !!(this.core.net?.border?.width);
    }

    drawSectors() {
        this.mapReady = !!(this.core.net?.border?.width);
    }

    drawMinimapBorder() {
        this._minimapNeedsBorder = true;
    }

    initMinimap() {
        const view = this.minimapView = document.getElementById("minimap-view");
        if (!view) return;
        this.minimapCtx = view.getContext("2d");
        this.minimapCssSize = MINIMAP_SIZE;
        this.syncMinimapSize();
    }

    /** Подгоняем буфер канваса под CSS-размер #minimap-grid (180 desktop / 72 mobile). */
    syncMinimapSize() {
        const view = this.minimapView;
        if (!view) return;
        const grid = document.getElementById("minimap-grid");
        const css = Math.max(1, Math.round(grid?.clientWidth || view.clientWidth || MINIMAP_SIZE));
        this.minimapCssSize = css;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.minimapDpr = dpr;
        const bw = Math.max(1, Math.floor(css * dpr));
        if (view.width !== bw || view.height !== bw) {
            view.width = bw;
            view.height = bw;
        }
        // Не трогаем style.width — .hud-minimap растягивается на сетку (иначе 200≠180)
        view.style.width = "";
        view.style.height = "";
    }

    renderMinimap() {
        const ctx = this.minimapCtx;
        const border = this.core?.net?.border;
        if (!ctx || !border?.width) return;

        this.syncMinimapSize();
        const size = this.minimapCssSize || MINIMAP_SIZE;
        const dpr = this.minimapDpr || 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, size, size);

        ctx.fillStyle = OUTSIDE_CSS;
        ctx.fillRect(0, 0, size, size);

        if (border.centerX != null) {
            const r = Math.min(border.width, border.height) / 2;
            const cx = ((border.centerX - border.left) / border.width) * size;
            const cy = ((border.centerY - border.top) / border.height) * size;
            const rr = r * (size / Math.max(border.width, border.height));

            ctx.beginPath();
            ctx.arc(cx, cy, rr, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(255,255,255,0.25)";
            ctx.fill();
            ctx.strokeStyle = GOLD_CSS;
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        const ownerId = this.core?.net?.ownerPlayerId >>> 0;
        const serverDots = this.core?.net?.minimapPlayers || [];
        ctx.fillStyle = "rgba(138,138,138,0.95)";
        for (let i = 0; i < serverDots.length; i++) {
            const d = serverDots[i];
            if (!d) continue;
            if (ownerId && (d.pID >>> 0) === ownerId) continue;
            const p = worldToMinimap(d.x, d.y, border, size);
            ctx.beginPath();
            ctx.arc(p.x, p.y, Math.max(2, size * 0.015), 0, Math.PI * 2);
            ctx.fill();
        }

        const self = worldToMinimap(this.posX, this.posY, border, size);
        const mark = Math.max(6, size * 0.04);
        ctx.fillStyle = "#ff4444";
        ctx.fillRect(self.x - mark / 2, self.y - mark / 2, mark, mark);
    }

    updateMinimap() {
        this.renderMinimap();
    }

    static computeRenderDpr() {
        const raw = Math.max(window.devicePixelRatio || 1, 1);
        const ua = navigator.userAgent || "";
        const isTv = document.body.classList.contains("platform-tv")
            || /SmartTV|TV Safari|Web0S|Tizen|VIDAA|CrKey|AppleTV/i.test(ua);
        if (isTv) return 1;
        const isMobile = /iPhone|iPad|iPod|Android/i.test(ua)
            || (navigator.maxTouchPoints > 1 && /Macintosh/i.test(ua));
        const cap = isMobile ? 3 : 1.5;
        return Math.min(raw, cap);
    }

    resizeCanvas(cssW, cssH) {
        const dpr = Application.computeRenderDpr();
        this.renderDpr = dpr;
        this._viewCssW = cssW;
        this._viewCssH = cssH;
        const bw = Math.max(1, Math.floor(cssW * dpr));
        const bh = Math.max(1, Math.floor(cssH * dpr));
        if (this.view.width !== bw) this.view.width = bw;
        if (this.view.height !== bh) this.view.height = bh;
        this.view.style.width = cssW + "px";
        this.view.style.height = cssH + "px";
    }

    initRenderer() {
        const view = this.view = document.getElementById("view");
        const w = Math.max(1, Math.floor(window.visualViewport?.width || innerWidth));
        const h = Math.max(1, Math.floor(window.visualViewport?.height || innerHeight));
        this.ctx = view.getContext("2d", { alpha: false });
        this.resizeCanvas(w, h);
    }

    _syncOwnedSet() {
        const key = this.ownedCells.length
            ? this.ownedCells.join(",")
            : "";
        if (key === this._ownedSetKey) return this._ownedSet;
        this._ownedSetKey = key;
        this._ownedSet.clear();
        for (let i = 0; i < this.ownedCells.length; i++) {
            this._ownedSet.add(this.ownedCells[i]);
        }
        return this._ownedSet;
    }

    _applyCameraTransform(ctx) {
        const dpr = this.renderDpr || 1;
        const cssW = this._viewCssW || innerWidth;
        const cssH = this._viewCssH || innerHeight;
        const s = this.camera.s;
        ctx.setTransform(
            s * dpr, 0,
            0, s * dpr,
            (cssW / 2) * dpr,
            (cssH / 2) * dpr
        );
        ctx.translate(-this.camera.x, -this.camera.y);
    }

    _paintBackground(ctx, border) {
        const mapW = border.width;
        const mapH = border.height;
        const cx = border.centerX ?? 0;
        const cy = border.centerY ?? 0;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(mapW, mapH) * 0.55);
        grad.addColorStop(0, "rgb(184,235,250)");
        grad.addColorStop(1, "rgb(140,209,199)");
        ctx.fillStyle = grad;
        ctx.fillRect(-mapW / 2, -mapH / 2, mapW, mapH);
    }

    _paintGrid(ctx, border) {
        const left = -border.width / 2;
        const top = -border.height / 2;
        const step = 50;
        ctx.strokeStyle = GRID_CSS;
        ctx.lineWidth = 5;
        ctx.beginPath();
        for (let x = left; x <= left + border.width; x += step) {
            ctx.moveTo(x, top);
            ctx.lineTo(x, top + border.height);
        }
        for (let y = top; y <= top + border.height; y += step) {
            ctx.moveTo(left, y);
            ctx.lineTo(left + border.width, y);
        }
        ctx.stroke();
    }

    _paintSectors(ctx, border) {
        const sectorSize = border.width / 5;
        const originX = -sectorSize * 5 / 2;
        const originY = -sectorSize * 5 / 2;
        ctx.strokeStyle = SECTOR_LINE;
        ctx.lineWidth = 40;
        ctx.fillStyle = SECTOR_LABEL;
        ctx.font = "700 720px Nunito, Ubuntu, Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (let row = 0; row < 5; row++) {
            for (let col = 0; col < 5; col++) {
                const x = originX + col * sectorSize;
                const y = originY + row * sectorSize;
                ctx.strokeRect(x, y, sectorSize, sectorSize);
                ctx.fillText(
                    CYR_ROWS[row] + (col + 1),
                    x + sectorSize / 2,
                    y + sectorSize / 2
                );
            }
        }
    }

    _paintOutsideAndBorder(ctx, border) {
        const radius = Math.min(border.width, border.height) / 2;
        const cx = border.centerX ?? 0;
        const cy = border.centerY ?? 0;
        const extent = Math.max(radius * 6, border.width * 3, 30000);

        ctx.save();
        ctx.beginPath();
        ctx.rect(cx - extent, cy - extent, extent * 2, extent * 2);
        ctx.arc(cx, cy, radius, 0, Math.PI * 2, true);
        ctx.fillStyle = OUTSIDE_CSS;
        ctx.fill("evenodd");
        ctx.restore();

        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.strokeStyle = GOLD_CSS;
        ctx.lineWidth = 28;
        ctx.stroke();
    }

    drawWorld() {
        const ctx = this.ctx;
        if (!ctx) return;

        const dpr = this.renderDpr || 1;
        const cssW = this._viewCssW || innerWidth;
        const cssH = this._viewCssH || innerHeight;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = OUTSIDE_CSS;
        ctx.fillRect(0, 0, cssW * dpr, cssH * dpr);

        this._applyCameraTransform(ctx);

        const border = this.core.net?.border;
        const settings = this.core.settings;
        if (border?.width && this.mapReady) {
            if (settings?.background) {
                this._paintBackground(ctx, border);
            }
            if (settings?.rawSettings?.grid && !this.tvPerfMode) {
                this._paintGrid(ctx, border);
            }
            if (settings?.sectors && !this.tvPerfMode) {
                this._paintSectors(ctx, border);
            }
        }

        const foodList = this._drawList;
        foodList.length = 0;
        const snakeList = this._drawListSnakes || (this._drawListSnakes = []);
        snakeList.length = 0;

        for (let i = 0, len = this.cells.length; i < len; i++) {
            const cell = this.cells[i];
            if (!cell || cell.destroyed || !cell._visible) continue;
            if (cell.playerId) snakeList.push(cell);
            else foodList.push(cell);
        }
        for (let i = 0; i < this.dyingCells.length; i++) {
            const cell = this.dyingCells[i];
            if (!cell || !cell._fadingOut) continue;
            if (cell.playerId) snakeList.push(cell);
            else foodList.push(cell);
        }

        foodList.sort((a, b) => (a._segmentZ || 0) - (b._segmentZ || 0));
        snakeList.sort((a, b) => (a._segmentZ || 0) - (b._segmentZ || 0));

        for (let i = 0; i < foodList.length; i++) {
            foodList[i].draw(ctx);
        }

        if (border?.width && this.mapReady && settings?.border !== false) {
            this._paintOutsideAndBorder(ctx, border);
        }

        for (let i = 0; i < snakeList.length; i++) {
            snakeList[i].draw(ctx);
        }
    }

    loop(now = performance.now()) {
        // Один clock с сетевым apply — иначе lerp дёргается из‑за рассинхрона Date/performance
        this.now = now;

        const ownedSet = this._syncOwnedSet();
        if ((++this._layersFrame % 6) === 0) {
            this.applySegmentLayers();
        }

        // Сначала позиции, потом камера от головы — голова всегда в центре экрана
        this.updateOwnedCells(now);

        for (let i = 0; i < this.ownedCells.length; i++) {
            const cell = this.cellsByID.get(this.ownedCells[i]);
            if (cell && !cell.destroyed) {
                cell._visible = true;
            }
        }

        this.updateCamera();

        const cam = this.camera;
        const cssW = this._viewCssW || this.view.clientWidth || innerWidth;
        const cssH = this._viewCssH || this.view.clientHeight || innerHeight;
        const viewWidth = cssW / cam.s;
        const viewHeight = cssH / cam.s;
        const viewLeft = cam.x - viewWidth / 2;
        const viewRight = cam.x + viewWidth / 2;
        const viewTop = cam.y - viewHeight / 2;
        const viewBottom = cam.y + viewHeight / 2;

        for (let i = 0, len = this.cells.length; i < len; i++) {
            const cell = this.cells[i];
            if (!cell || cell.destroyed) continue;
            if (ownedSet.has(cell.id)) continue;

            const cx = Number.isFinite(cell.nx) ? cell.nx : cell.x;
            const cy = Number.isFinite(cell.ny) ? cell.ny : cell.y;
            const cr = (Number.isFinite(cell.nr) ? cell.nr : cell.r) || 0;
            const margin = Math.max(80, cr * 2);
            const isVisible = !(cx + cr < viewLeft - margin || cx - cr > viewRight + margin ||
                cy + cr < viewTop - margin || cy - cr > viewBottom + margin);

            const isSnake = !!cell.playerId;
            if (isVisible || isSnake) {
                cell.update(now);
            }
            cell._visible = isVisible;
        }

        if (this.dyingCells.length) {
            for (let i = this.dyingCells.length - 1; i >= 0; i--) {
                const cell = this.dyingCells[i];
                if (!cell || cell.updateFade(now)) {
                    this.dyingCells.splice(i, 1);
                }
            }
        }

        this.drawWorld();

        if ((++this._minimapFrame & 1) === 0) {
            this.updateMinimap();
        }

        this._fpsFrames++;
        const dt = now - this._fpsLast;
        if (dt >= this._fpsUpdateMs) {
            this.core.stats.fps = (this._fpsFrames * 1000) / dt;
            this._fpsFrames = 0;
            this._fpsLast = now;
        }

        requestAnimationFrame(this.loop);
    }

    clear() {
        this.exitSpectateMode();
        for (let i = 0; i < (this.dyingCells?.length || 0); i++) {
            this.dyingCells[i]?._finishDestroy?.();
        }
        this.dyingCells = [];
        this.cells = [];
        this.cellsByID = new Map();
        this.ownedCells = [];
        this.mainCell = null;
        this.headCellId = null;
        this.snakeEnded = false;
        this.mapReady = false;
        clearPlayerSkins();
    }

    updateCamera() {
        const ownedCount = this.ownedCells.length;
        let mass = 0;

        if (ownedCount > 0) {
            const target = this.getCameraTargetPos();
            this.posX = target.x;
            this.posY = target.y;
            for (let i = 0; i < ownedCount; i++) {
                const cell = this.cellsByID.get(this.ownedCells[i]);
                if (cell && !cell.destroyed) {
                    mass += ~~((cell.r * cell.r) / 100);
                }
            }
            this.calcViewZoom();
            // Камера жёстко на голове — без follow-lag (он и давал дрожание мира)
            this.camera.x = this.posX;
            this.camera.y = this.posY;
            this.posSize = this.viewZoom;
        } else if (this.isSpectating) {
            this.mainCell = null;
            this.camera.x = (29 * this.camera.x + this.posX) / 30;
            this.camera.y = (29 * this.camera.y + this.posY) / 30;
            const targetZoom = this.posSize * this.viewRange();
            this.viewZoom = (9 * this.viewZoom + targetZoom) / 10;
        } else {
            this.mainCell = null;
            this.camera.x = (29 * this.camera.x + this.posX) / 30;
            this.camera.y = (29 * this.camera.y + this.posY) / 30;
            const targetZoom = this.posSize * this.viewRange();
            this.viewZoom = (9 * this.viewZoom + targetZoom) / 10;
        }

        this.camera.s = this.viewZoom;
        this.camera.mass = mass;
    }
}


/* --- js/net/Network.js --- */
class Network {
    static SERVER_TO_CLIENT = {
        UPDATE_PING: 2,
        UPDATE_NODES: 16,
        SPECTATE_CAMERA: 17,
        // CLEAR_ALL: 300,
        CLEAR_OWNED_CELLS: 20,
        LEADERBOARD_UPDATE: 49,
        BORDER: 64,
        CHAT_MESSAGE: 99,
        UPDATE_EXP: 114,
        BOOST_PLAYERS: 115,
        UPDATE_SCORE: 116,
        UPDATE_MINIMAP: 117,
        POW_CHALLENGE: 118,
        AD_PROGRESS: 123
    }

    static CLIENT_TO_SERVER = {
        SPAWN: 0,
        SPECTATE: 0x1,
        MOUSE: 0x10,
        SPLIT_PLAYER: 0x11,
        BOOST_START: 17,
        BOOST_STOP: 18,
        SPLIT_MINION: 0x16,
        EJECT_PLAYER: 0x15,
        EJECT_MINION: 0x17,
        CHAT: 99
    }

    constructor(core) {
        this.core = core;

        this.protocol = "eSejeKSVdysQvZs0ES1H";

        this.onOpen = this.onOpen.bind(this)
        this.onMessage = this.onMessage.bind(this)
        this.onClose = this.onClose.bind(this)
        this.onError = this.onError.bind(this)

        this.leaderboardItems = []
        this.messages = []
        this.border = {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            centerX: 0,
            centerY: 0,
            width: 0,
            height: 0
        }
        this.foodMinSize = 0
        this.foodMaxSize = 0
        this.ownerPlayerId = 0
        this.ping = 0
        this.pingstamp = 0
        this.oldMouseDx = 0
        this.oldMouseDy = 0
        this._lastSpectateX = null
        this._lastSpectateY = null
        this.playerBoost = new Map()
        this.minimapPlayers = [] // [{ pID, x, y }] — все головы с сервера
        this.mapReady = false
        this.adProgress = { ads: 0, blackUnlocked: false, reviveWaitMs: 0 }
        this.connectionStatus = "connecting"
    }

    setConnectionStatus(status) {
        this.connectionStatus = status;
        this.core.ui?.updateConnectionStatus?.(status);
    }

    connect(addr) {
        this.setConnectionStatus("connecting");
        const params = "?token=";
        if (this.ws) this.reset();
        const ws = (this.ws = new WebSocket(addr + params, this.protocol));
        ws.binaryType = "arraybuffer";
        ws.onopen = this.onOpen;
        ws.onmessage = this.onMessage;
        ws.onclose = this.onClose;
        ws.onerror = this.onError;
    }





    reset() {
        if (this.ws) this.ws.close()
        this.ws = null
        this.messages = []
        this.core?.ui?.updateChat?.()
        this.border = {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            centerX: 0,
            centerY: 0,
            width: 0,
            height: 0
        }
        this.foodMinSize = 0
        this.foodMaxSize = 0
        this.ownerPlayerId = 0
        this.ping = 0
        this.pingstamp = 0
        this.oldMouseDx = 0
        this.oldMouseDy = 0
        this._lastSpectateX = null
        this._lastSpectateY = null
        this.playerBoost.clear()
        this.minimapPlayers = []
        this.mapReady = false
        this.adProgress = { ads: 0, blackUnlocked: false, reviveWaitMs: 0 }
        clearInterval(this.pingInterval)
        clearInterval(this.mouseMoveInterval)
    }

    send(data) {
        if (!this.ws || this.ws.readyState !== 1) return
        if (data.build) this.ws.send(data.build())
        else this.ws.send(data)
    }

    sendUint8(a) {
        const msg = prepareData(1);
        msg.setUint8(0, a);
        this.send(msg);
    }
    sendAccountToken() {
        const token = localStorage.accountToken;
        if (token) {
            const msg = prepareData(1 + 2 * token.length);
            msg.setUint8(0, 114);
            for (var i = 0; i < token.length; ++i) msg.setUint16(1 + 2 * i, token.charCodeAt(i), true);
            this.send(msg.buffer);
        }
        this.sendYandexIdentity();
    }

    /** Opcode 120: uid + yaName (utf16 null-terminated). */
    sendYandexIdentity() {
        const id = this.core.yandex || {};
        let uid = String(id.uid || "").trim();
        let yaName = String(id.yaName || "").trim().slice(0, 64);
        if (!uid) return;

        // Только безопасные символы для сервера
        if (!/^[a-zA-Z0-9_\-./+=]+$/.test(uid)) return;

        const uidLen = uid.length;
        const nameLen = yaName.length;
        const msg = prepareData(1 + (uidLen + 1) * 2 + (nameLen + 1) * 2);
        let o = 0;
        msg.setUint8(o++, 120);
        for (let i = 0; i < uidLen; i++) msg.setUint16(o + i * 2, uid.charCodeAt(i), true);
        o += uidLen * 2;
        msg.setUint16(o, 0, true);
        o += 2;
        for (let i = 0; i < nameLen; i++) msg.setUint16(o + i * 2, yaName.charCodeAt(i), true);
        o += nameLen * 2;
        msg.setUint16(o, 0, true);
        this.send(msg);
    }

    onOpen() {
        console.log("[Game] Connected to server");
        this.setConnectionStatus("online");
        this._powBusy = false;
        this.sendAccountToken();

        this.send(new Uint8Array([254, 5, 0, 0, 0]))
        this.send(new Uint8Array([255, 0, 0, 0, 0]))

        // Панель не трогаем: коннект идёт по Играть — меню уже скрыто
        this.core.ui?.setPowLoading?.(true, "Проверка…");
        this.pingInterval = setInterval(() => {

            if (!document.hidden) {
                this.pingstamp = Date.now();
                this.send(new Uint8Array([2]).buffer); // ping
            }

        }, 3000);
        this.mouseMoveInterval = setInterval(() => this.sendMouseMove(), 40);
    }

    async onPowChallenge(reader) {
        if (this._powBusy) return;
        this._powBusy = true;
        try {
            const len = reader.getUint16();
            let blob = '';
            for (let i = 0; i < len; i++) {
                blob += String.fromCharCode(reader.getUint8());
            }
            this.core.ui?.setPowLoading?.(true, "Загрузка защиты…");
            const solved = await solvePowBlob(blob, (p) => {
                const pct = Math.floor((p || 0) * 100);
                this.core.ui?.setPowLoading?.(true, `Загрузка защиты… ${pct}%`);
            });
            const msg = prepareData(5);
            msg.setUint8(0, 119);
            msg.setUint32(1, solved.nonce >>> 0, true);
            this.send(msg);
            this.core.ui?.setPowLoading?.(true, "Подключение…");
        } catch (err) {
            console.warn("[Game] PoW failed:", err);
            this.core.ui?.setPowLoading?.(true, "Ошибка проверки");
        } finally {
            this._powBusy = false;
        }
    }

    onMessage({ data }) {
        this.now = performance.now();

        let reader;
        let opcode;
        try {
            reader = new Reader(new DataView(data), 0, true);
            opcode = reader.getUint8();
        } catch (err) {
            console.warn("[Game] Bad packet header:", err);
            return;
        }

        try {
        switch (opcode) {
            case Network.SERVER_TO_CLIENT.UPDATE_PING: {
                this.ping = Date.now() - this.pingstamp;
                break
            }
            case Network.SERVER_TO_CLIENT.UPDATE_NODES: {
                const reader = new BinaryReader(
                    new DataView(data)
                );
                reader.offset++; // skip messageType
                this.onNodesUpdate(reader)

                break
            }
            case Network.SERVER_TO_CLIENT.CLEAR_OWNED_CELLS: {
                this.onClearOwnedCells()
                break
            }
            // case Network.SERVER_TO_CLIENT.CLEAR_ALL: { // TODO
            //     this.onClearAll()
            //     break
            // }
            case Network.SERVER_TO_CLIENT.BORDER: {
                this.onBorder(reader)
                break
            }
            case Network.SERVER_TO_CLIENT.SPECTATE_CAMERA: {
                this.onSpectateCamera(reader)
                break
            }
            case Network.SERVER_TO_CLIENT.LEADERBOARD_UPDATE: {
                this.onLoaderboard(reader)
                break
            }
            case Network.SERVER_TO_CLIENT.CHAT_MESSAGE: {
                this.onChatMessage(reader)
                break;
            }
            case Network.SERVER_TO_CLIENT.BOOST_PLAYERS: {
                this.onBoostPlayers(reader);
                break;
            }
            case Network.SERVER_TO_CLIENT.UPDATE_SCORE: {
                this.onScore(reader);
                break;
            }
            case Network.SERVER_TO_CLIENT.UPDATE_MINIMAP: {
                this.onMinimap(reader);
                break;
            }
            case Network.SERVER_TO_CLIENT.POW_CHALLENGE: {
                this.onPowChallenge(reader);
                break;
            }
            case Network.SERVER_TO_CLIENT.AD_PROGRESS: {
                this.onAdProgress(reader);
                break;
            }
            default:
                break;
        }
        } catch (err) {
            console.warn("[Game] Packet", opcode, "error:", err);
        }
    }

    onBoostPlayers(reader) {
        if (!this.mapReady || !reader?.view) return;
        const count = Math.min(reader.getUint16(), 256);
        // count уже прочитан — осталось count * (4 pID + 2 energy + 1 boosting)
        const need = count * 7;
        if (reader._o + need > reader.view.byteLength) {
            console.warn("[Game] Boost packet truncated");
            return;
        }
        const seen = new Set();
        for (let i = 0; i < count; i++) {
            const pID = reader.getUint32();
            const energy = reader.getUint16() / 65535;
            const boosting = reader.getUint8() === 1;
            seen.add(pID);
            this.playerBoost.set(pID, { energy, boosting });
        }
        for (const pID of this.playerBoost.keys()) {
            if (!seen.has(pID)) this.playerBoost.delete(pID);
        }
        this.applyBoostToCells();
    }

    applyBoostToCells() {
        const app = this.core.app;
        for (let i = 0; i < app.cells.length; i++) {
            const cell = app.cells[i];
            if (!cell || cell.destroyed || !cell.playerId) continue;
            const st = this.playerBoost.get(cell.playerId);
            cell.boostBoosting = !!(st && st.boosting);
            if (st && cell.isPrimaryDisplayCell()) {
                cell.setBoostState(st.energy, st.boosting);
            }
        }
    }

    onClose() {
        console.warn("[Game] Disconnected from server");
        this._powBusy = false;
        this.core.ui?.setPowLoading?.(false);
        this.core.ui?.failReadyWaiters?.("disconnected");
        this.setConnectionStatus("offline");
        this.core.app.clear();
        this.core.ui.setPanelState(true);
    }
    onError() {
        console.warn("[Game] Connection error");
        this._powBusy = false;
        this.core.ui?.setPowLoading?.(false);
        this.core.ui?.failReadyWaiters?.("error");
        this.setConnectionStatus("error");
        this.core.app.clear();
        this.core.ui.setPanelState(true);
    }

    addCell(id, x, y, r, name, color, playerId = 0, cellType = 0) {
        let cellsByID = this.core.app.cellsByID
        let cells = this.core.app.cells

        const cell = new Cell(this.core, id, x, y, r, name, color);
        if (playerId) cell.setPlayerId(playerId);
        if (cellType === 1) cell.setAsFood();
        else if (cellType === 3) cell.setAsDeathFood();
        if (this.core.app.isSpectating) {
            cell.setLabelAlpha(0.5);
        }
        cellsByID.set(id, cell);
        cells.push(cell);
    }

    spawn() {
        this.sendNickname(this.core.store.name);
    }

    /** Смена ника: opcode 0. Цвет всегда назначает сервер. */
    sendNickname(name) {
        const nick = sanitizeNick(name) + "#";
        const msg = prepareData(4 + 2 * nick.length);
        let offset = 0;
        msg.setUint8(offset++, 0);
        msg.setUint8(offset++, 0); // colorId игнорируется сервером
        for (let i = 0; i < nick.length; i++) {
            msg.setUint16(offset, nick.charCodeAt(i), true);
            offset += 2;
        }
        msg.setUint16(offset, 0, true);
        this.send(msg);
    }

    /** Серверу: засчитан просмотр рекламы. */
    reportAdWatched() {
        this.sendUint8(121);
    }

    /** Запрос revive 30% после rewarded. */
    requestRevive() {
        this.sendUint8(122);
    }

    onAdProgress(reader) {
        const ads = reader.getUint32();
        const blackUnlocked = !!reader.getUint8();
        const reviveWaitMs = reader.getUint32();
        this.adProgress = { ads, blackUnlocked, reviveWaitMs };
        this.core.ui?.onAdProgress?.(this.adProgress);
    }

    spectate() {
        const writer = new Writer(true)
        writer.setUint8(Network.CLIENT_TO_SERVER.SPECTATE)
        this.send(writer)
    }

    /** Точка обзора в наблюдении — только по клику (мировые координаты). */
    sendSpectateTarget(x, y) {
        if (!this.ws || this.ws.readyState !== 1) return;

        const rx = Math.round(x);
        const ry = Math.round(y);

        if (
            this._lastSpectateX != null &&
            Math.abs(rx - this._lastSpectateX) < 1 &&
            Math.abs(ry - this._lastSpectateY) < 1
        ) {
            return;
        }

        this._lastSpectateX = rx;
        this._lastSpectateY = ry;

        const msg = prepareData(13);
        msg.setUint8(0, Network.CLIENT_TO_SERVER.MOUSE);
        msg.setInt32(1, rx, true);
        msg.setInt32(5, ry, true);
        msg.setUint32(9, 0, true);
        this.send(msg.buffer);
    }

    sendMouseMove(force = false) {
        if (!this.ws || this.ws.readyState !== 1) return;
        if (this.core.app.isSpectating) return;

        // Игра: смещение от центра экрана (направление змейки)
        const { dx, dy } = getMouseDelta(this.core);

        if (
            !force &&
            (
                dx * dx + dy * dy < 64 ||
                (Math.abs(this.oldMouseDx - dx) < 0.01 && Math.abs(this.oldMouseDy - dy) < 0.01)
            )
        ) {
            return;
        }

        this.oldMouseDx = dx;
        this.oldMouseDy = dy;

        const msg = prepareData(21);
        msg.setUint8(0, Network.CLIENT_TO_SERVER.MOUSE);
        msg.setFloat64(1, dx, true);
        msg.setFloat64(9, dy, true);
        msg.setUint32(17, 0, true);
        this.send(msg.buffer);
    }

    sendChatMessage(text) {
        const writer = new Writer()
        writer.setUint8(Network.CLIENT_TO_SERVER.CHAT)
        writer.setUint8(0)
        writer.setStringUTF16(text)
        this.send(writer)
    }

    onChatMessage(reader) {
        const flagMask = reader.getUint8();
        const color = {
            r: reader.getUint8(),
            g: reader.getUint8(),
            b: reader.getUint8()
        }
        const playerXp = reader.getUint32(); // TODO...

        const pId = reader.getUint16(); // TODO...

        const name = reader.getStringUTF16()
        const content = reader.getStringUTF16()

        const lvl = playerXp ? getLevel(playerXp) : -1;
        const nameWithLvl = lvl >= 0 ? `${name} [ур. ${lvl}]` : name;

        this.messages.push({
            color,
            name: nameWithLvl,
            content
        });
        if (this.messages.length > 50) {
            this.messages.splice(0, this.messages.length - 50);
        }
        this.core.ui.updateChat()
    }

    onSpectateCamera(reader) {
        this.core.app.camera.target.s = 0.2;
    }

    /** Очки за еду с сервера — не сбрасываем в 0 при смерти/обзоре. */
    onScore(reader) {
        const score = reader.getUint32() >>> 0;
        let kills = 0;
        if (reader.view && reader._o + 4 <= reader.view.byteLength) {
            kills = reader.getUint32() >>> 0;
        }
        const app = this.core.app;
        if (app.ownedCells.length > 0) {
            app.camera.score = score;
            this.core.ui?.sessionStats?.setKills(kills);
            return;
        }
        if (score > 0) app.camera.score = score;
        if (kills > 0) this.core.ui?.sessionStats?.setKills(kills);
    }

    /** Головы всех игроков/ботов на карте (для миникарты вне обзора). */
    onMinimap(reader) {
        const count = reader.getUint16();
        const list = [];
        for (let i = 0; i < count; i++) {
            const pID = reader.getUint32() >>> 0;
            const x = reader.getInt32();
            const y = reader.getInt32();
            list.push({ pID, x, y });
        }
        this.minimapPlayers = list;
    }

    onLoaderboard(reader) {
        this.leaderboardItems = []
        const count = reader.getUint32()
        for (let i = 0; i < count; ++i) {
            const playerId = reader.getUint32() // pID игрока с сервера
            const name = reader.getStringUTF16()
            const playerXp = reader.getUint32();
            const playerLevel = playerXp ? getLevel(playerXp) : -1; // TODO...
            this.leaderboardItems.push({ id: playerId, playerId, name: name, level: playerLevel })
        }
        this.core.ui.updateLeaderboard()
    }

    onBorder(reader) {
        this.core.ui?.setPowLoading?.(false);
        const firstBorder = !this.mapReady;
        this.mapReady = true;

        this.border.left = reader.getFloat64()
        this.border.top = reader.getFloat64()
        this.border.right = reader.getFloat64()
        this.border.bottom = reader.getFloat64()
        // Размеры еды: сервер отправляет радиус напрямую (как и для клеток игроков)
        // Убираем умножение на 100 и sqrt, так как это радиус, а не масса
        const rawMinSize = reader.getUint16();
        const rawMaxSize = reader.getUint16();
        // Ограничение: еда обычно должна быть маленькой (5-15 пикселей в радиусе)
        const MAX_FOOD_RADIUS = 15;
        this.foodMinSize = Math.min(rawMinSize, MAX_FOOD_RADIUS);
        this.foodMaxSize = Math.min(rawMaxSize, MAX_FOOD_RADIUS);
        // Убеждаемся, что min <= max
        if (this.foodMinSize > this.foodMaxSize) {
            this.foodMaxSize = this.foodMinSize;
        }
        this.ownerPlayerId = reader.getUint32()
        this.border.width = this.border.right - this.border.left
        this.border.height = this.border.bottom - this.border.top
        this.border.centerX = (this.border.left + this.border.right) / 2
        this.border.centerY = (this.border.top + this.border.bottom) / 2
        // clear сносит stage — сначала clear, потом рисуем декорации карты
        if (firstBorder) {
            this.core.app.clear();
            console.log("[Game] Map loaded, playerId:", this.ownerPlayerId);
        }
        this.core.app.drawBackground()
        this.core.app.drawGrid()
        this.core.app.drawBorder()
        this.core.app.drawSectors()
        this.core.app.drawMinimapBorder()

        if (firstBorder) {
            this.core.ui?.onServerReady?.();
        }

        // Если мы не владеем клетками (спектатор/до спавна) — ставим камеру в центр.
        if (this.core.app.ownedCells.length === 0 && !this.core.app.isSpectating) {
            const app = this.core.app;
            app.posX = this.border.centerX;
            app.posY = this.border.centerY;
            app.posSize = 1;
            app.camera.x = app.posX;
            app.camera.y = app.posY;
            app.viewZoom = app.posSize;
            app.camera.s = app.viewZoom;
        }
    }


    sendSplit() {
        const writer = new Writer(true)
        writer.setUint8(Network.CLIENT_TO_SERVER.SPLIT_PLAYER)
        this.send(writer)
    }

    sendBoost(active) {
        const writer = new Writer(true);
        writer.setUint8(active ? Network.CLIENT_TO_SERVER.BOOST_START : Network.CLIENT_TO_SERVER.BOOST_STOP);
        this.send(writer);
    }

    sendE() {
        const writer = new Writer(true)
        writer.setUint8(22)
        this.send(writer)
    }

    sendR() {
        const writer = new Writer(true)
        writer.setUint8(23)
        this.send(writer)
    }

    sendT() {
        const writer = new Writer(true)
        writer.setUint8(24)
        this.send(writer)
    }

    sendP() {
        const writer = new Writer(true)
        writer.setUint8(25)
        this.send(writer)
    }

    sendEject() {
        const writer = new Writer(true)
        writer.setUint8(Network.CLIENT_TO_SERVER.EJECT_PLAYER)
        this.send(writer)
    }

    onClearOwnedCells() {
        this.core.app.exitSpectateMode()
        if (this.core.app.endOwnedSnake()) {
            this.core.ui.onPlayerDied();
        } else {
            this.core.app.ownedCells = []
            this.core.app.mainCell = null
            this.core.app.headCellId = null
        }
    }

    onClearAll() {
        this.core.app.clear()
    }

    rgbToHex(arr) {
        let hex = ""

        for (const rawColor of arr) {
            const color = rawColor.toString(16)
            hex += color.length == 1 ? `0${color}` : color
        }

        return `0x${hex}`
    }

    onNodesUpdate(reader) {
        if (!this.mapReady || !this.border.width) {
            return;
        }

        const app = this.core.app;
        const cellsByID = app.cellsByID;
        const border = this.border;
        const ownerId = this.ownerPlayerId;
        const ownedPositions = {};

        for (const oid of app.ownedCells) {
            const c = cellsByID.get(oid);
            if (c && !c.destroyed) {
                ownedPositions[oid] = { x: c.x, y: c.y };
            }
        }

        try {
            for (let killed; killed = reader.uint32();) {
                const killerId = reader.uint32();
                const cell = cellsByID.get(killed);
                if (cell && !cell.destroyed && !cell._fadingOut) {
                    cell.destroy(killerId || null);
                }
            }

            for (let id; id = reader.uint32();) {
                if (!reader.canRead) break;

                const type = reader.uint8();

                let posX = 0;
                let posY = 0;
                let size = 0;
                let playerId = 0;

                if (type === 1) {
                    const fp = foodPositionFromId(id, border);
                    posX = fp.x;
                    posY = fp.y;
                    const sizeRange = Math.max(1, this.foodMaxSize - this.foodMinSize);
                    size = this.foodMinSize + (id % sizeRange);
                } else {
                    if (type === 0) {
                        if (!reader.canRead) break;
                        playerId = reader.uint32();
                    }
                    if (!reader.canRead) break;
                    posX = reader.int32();
                    posY = reader.int32();
                    size = reader.uint16();
                    // Куски после смерти: визуально чуть больше еды карты
                    if (type === 3) {
                        const foodMax = this.foodMaxSize || 12;
                        const cap = foodMax * 1.55 + 2;
                        if (size > cap) size = cap;
                    }
                }

                if (!reader.canRead) break;
                const r = reader.uint8();
                const g = reader.uint8();
                const b = reader.uint8();
                if (!reader.canRead) break;
                reader.uint8();
                if (!reader.canRead) break;
                const name = reader.utf8();

                if (!isValidCellState(posX, posY, size)) {
                    continue;
                }

                const hex = ((r << 16) | (g << 8) | b);
                const color = "#" + ("000000" + hex.toString(16)).slice(-6).toUpperCase();
                // После смерти головы хвост больше не считаем «своим»
                const isOwned = playerId === ownerId && !app.snakeEnded && type === 0;

                if (cellsByID.has(id)) {
                    const cell = cellsByID.get(id);
                    // Уничтожена, но снова в пакете — пересоздаём (анти-фантом)
                    if (cell.destroyed || cell._fadingOut) {
                        try { cell._finishDestroy?.(); } catch (_) {}
                        cellsByID.delete(id);
                        this.addCell(id, posX, posY, size, name, color, playerId, type);
                        const fresh = cellsByID.get(id);
                        if (fresh) applyServerCellState(fresh, posX, posY, size, this.now, true);
                        continue;
                    }

                    if (playerId) cell.setPlayerId(playerId);
                    if (type === 3 && !cell.isDeathFood) cell.setAsDeathFood();
                    else if (type === 1 && !cell.isFood) cell.setAsFood();

                    const instant = isOwned && (
                        shouldSnapCell(cell, posX, posY, border) ||
                        ownedPositions[id] == null
                    );

                    applyServerCellState(cell, posX, posY, size, this.now, instant);

                    if (color && color !== cell.color) {
                        cell.hasChanged = true;
                        cell.color = color;
                    }
                    if (name && name !== cell.name) {
                        cell.hasChanged = true;
                        cell.name = name;
                    }

                    if (isOwned && !app.ownedCells.includes(id)) {
                        app.ownedCells.push(id);
                        app.ownedCells.sort((a, b) => a - b);
                        app.refreshHeadCellId();
                    }
                } else {
                    this.addCell(id, posX, posY, size, name, color, playerId, type);
                    const cell = cellsByID.get(id);
                    if (!cell) continue;

                    applyServerCellState(cell, posX, posY, size, this.now, true);
                    cell.color = color;
                    cell.name = name;
                    if (type === 1) cell.setAsFood();
                    else if (type === 3) cell.setAsDeathFood();
                    if (isOwned) {
                        app.exitSpectateMode();
                        if (!app.ownedCells.includes(id)) {
                            app.ownedCells.push(id);
                            app.ownedCells.sort((a, b) => a - b);
                        }
                        app.refreshHeadCellId();
                        if (app.ownedCells.length === 1) {
                            snapCameraTo(app, posX, posY);
                            this.core.ui.onLifeStarted();
                            this.core.ui.updateMenuButtons();
                        }
                    }
                }
            }

            while (reader.canRead) {
                const killed = reader.uint32();
                const cell = cellsByID.get(killed);
                if (cell && !cell.destroyed && !cell._fadingOut) {
                    // Уход из FOV / повтор destroy — без прозрачного fade (дыры в середине змей)
                    cell.destroy(null, { instant: true });
                }
            }
        } catch (err) {
            console.warn("[Network] onNodesUpdate parse error:", err);
            return;
        }

        app.pickMainCell();
        app.applySegmentLayers();
        this.applyBoostToCells();
    }
}


/* --- js/ui/UserInterface.js --- */
const SKINS_PER_PAGE = 12;
class UserInterface {

    constructor(core) {
        this.core = core

        this.modalSystem = new ModalSystem()
        this.mobileControls = null
        this.sessionStats = new SessionStats()
        this._lifeActive = false
        this._deathStatsOpen = false
        this._deathFullscreenAdBusy = false
        this.mouse = {
            x: 0,
            y: 0
        }

        this.keysPressed = {};
        this.ejectInterval = null;
        this._boostHeld = false;
        this._boostMouse = false;

        this.userInterface = document.getElementById("user-interface")
        this.playButton = document.getElementById("play")
        this.spectateButton = document.getElementById("spectate")
        this.settingsButton = document.getElementById("settings")
        this.skinsButton = document.getElementById("skins")
        this._skinsPage = 0
        this._skinsModalId = 0
        this.nameInput = document.getElementById("name")
        this.scoreElement = document.getElementById("score")
        this.leaderboard = document.getElementById("leaderboard-list") || document.getElementById("leaderboard")
        this.leaderboardPanel = document.getElementById("leaderboard")
        this.menuRating = document.getElementById("menu-rating")
        this.ratingList = document.getElementById("rating-list")
        this.ratingToggleBtn = document.getElementById("rating-toggle")
        this.deathStats = document.getElementById("death-stats")
        this.deathPlayBtn = document.getElementById("death-play")
        this.deathSpectateBtn = document.getElementById("death-spectate")
        this.deathChart = document.getElementById("death-mass-chart")
        this._ratingOffset = 0
        this._ratingHasMore = false
        this._ratingLoading = false
        this._ratingLastFetch = 0
        this._ratingRows = []
        this._ratingExpanded = false
        this._ratingTop5 = []
        this._ratingAll = null
        this._ratingTotal = 0
        this.chatField = document.getElementById("chat-compose")
        this.chatContent = document.getElementById("chat-content")
        this.chatPanel = document.getElementById("hud-chat") || document.querySelector(".hud-chat")
        this._chatOpen = false
        if (this.chatPanel) this.chatPanel.hidden = true;
        setInterval(() => {
            const score = this.core.app.camera.score;
            if (this.scoreElement) this.scoreElement.innerHTML = `Очки: ${score}`;
            const mass = this.core.app.camera.mass || 0;
            if (this._boostHeld && mass < BOOST_MIN_SCORE) {
                this.stopBoost();
            }
            if (this._lifeActive && this.core.app.ownedCells.length > 0) {
                this.sessionStats.tick(mass, this._boostHeld);
            }
            this.mobileControls?.syncVisibility();
        }, 40);
        this.nameInput.value = sanitizeNick(this.core.store.name);
        this.core.store.name = this.nameInput.value;
        this.addEvents()
        this.mobileControls = new MobileControls(this)
        this.tvControls = new TvControls(this)
        this._tvExitOpen = false
        this._tvBackLast = 0
        this.bindMenuRatingNav();
        this.loadMenuRating();
        this.hideDeathStats();
        this.syncLeaderboardVisibility();
        this.makeButtonsFocusable();
        this._adProgress = { ads: 0, blackUnlocked: false, reviveWaitMs: 0 };
        this.updateAdProgressUi();
        this.removeReviveControlsIfUnavailable();
        onHistoryBack(() => this.handleHistoryBack());
    }

    hasMenuSky() {
        return !!document.getElementById("menu-sky");
    }

    /** Кнопки меню кликабельны с ТВ-пульта (OK / Enter). */
    makeButtonsFocusable() {
        const ids = ["play", "spectate", "skins", "settings", "death-play", "death-spectate", "death-revive"];
        for (const id of ids) {
            const el = document.getElementById(id);
            if (!el) continue;
            if (el.tagName === "BUTTON") continue;
            el.setAttribute("tabindex", "0");
            el.setAttribute("role", "button");
            el.addEventListener("keydown", (e) => {
                if (e.code === "Enter" || e.code === "NumpadEnter" || e.code === "Space") {
                    e.preventDefault();
                    el.click();
                }
            });
        }
    }

    onPlatformReady(type) {
        const t = type || (isTV() ? "tv" : "desktop");
        document.body.classList.add(`platform-${t}`);
        if (t === "tv") {
            // Чат и рейтинг-expand на ТВ не нужны
            if (this.chatPanel) this.chatPanel.hidden = true;
            if (this.chatField) this.chatField.hidden = true;
            if (this.menuRating) this.menuRating.hidden = true;
            // Фокус на «Играть»
            this.playButton?.focus?.();
            this.updateControlsHint();
            // Лимит DPR на ТВ — меньше лагов
            if (this.core.app) this.core.app.tvPerfMode = true;
        }
        this.mobileControls?.syncVisibility();
    }

    /** Пока SDK грузится — блокируем старт (LoadingAPI ещё не ready). */
    setGameBooting(booting) {
        this._booting = !!booting;
        const ids = ["play", "spectate", "skins", "settings", "death-play", "death-spectate", "death-revive"];
        for (const id of ids) {
            const el = document.getElementById(id);
            if (!el) continue;
            if (booting) {
                el.dataset.wasDisabled = el.disabled ? "1" : "0";
                el.disabled = true;
            } else if (el.dataset.wasDisabled === "1") {
                el.disabled = true;
            } else {
                el.disabled = false;
            }
        }
        if (!booting) this.updateReviveButton();
    }

    removeReviveControlsIfUnavailable() {
        const host = String(window.location.hostname || "").toLowerCase();
        const isYandexHost = host === "yandex.ru" || host.endsWith(".yandex.ru");
        if (isYandexHost) return;
        document.getElementById("death-revive")?.remove();
        document.getElementById("death-revive-hint")?.remove();
    }

    updateControlsHint() {
        let el = document.getElementById("platform-hint");
        if (!isTV()) {
            if (el) el.remove();
            return;
        }
        if (!el) {
            el = document.createElement("div");
            el.id = "platform-hint";
            document.body.appendChild(el);
        }
        const menuOpen = this.userInterface?.style.display !== "none";
        if (menuOpen || this._deathStatsOpen) {
            el.textContent = "↑↓←→ выбор · OK подтвердить · Back выход";
            el.hidden = false;
        } else {
            el.hidden = true;
        }
    }

    handleHistoryBack() {
        // ТВ Back: в меню → диалог выхода; в игре → меню; повторно → выход
        if (this._tvExitOpen) return;

        const menuOpen = this.userInterface?.style.display !== "none" || this._deathStatsOpen;
        if (!menuOpen) {
            const now = Date.now();
            if (now - (this._tvBackLast || 0) < 900) {
                this.showTvExitDialog();
                return;
            }
            this._tvBackLast = now;
            this.hideDeathStats();
            this.setPanelState(true);
            this.updateControlsHint();
            return;
        }
        this.showTvExitDialog();
    }

    showTvExitDialog() {
        if (this._tvExitOpen) return;
        this._tvExitOpen = true;
        const wrap = document.createElement("div");
        wrap.id = "tv-exit-dialog";
        wrap.innerHTML = `
            <div class="tv-exit-card">
                <div class="tv-exit-title">Выйти из игры?</div>
                <div class="tv-exit-actions">
                    <button type="button" class="button" id="tv-exit-no" autofocus>Остаться</button>
                    <button type="button" class="button" id="tv-exit-yes">Выйти</button>
                </div>
            </div>`;
        document.body.appendChild(wrap);
        const close = () => {
            this._tvExitOpen = false;
            wrap.remove();
            this.playButton?.focus?.();
        };
        wrap.querySelector("#tv-exit-no")?.addEventListener("click", close);
        wrap.querySelector("#tv-exit-yes")?.addEventListener("click", () => {
            close();
            if (!dispatchExit()) {
                try { window.close(); } catch (_) {}
            }
        });
        wrap.querySelector("#tv-exit-no")?.focus?.();
    }

    syncLeaderboardVisibility() {
        if (!this.leaderboardPanel) return;
        this.leaderboardPanel.style.display = "";
    }

    /** Облака разлетаются сразу; небо остаётся до конца PoW. */
    scatterMenuClouds() {
        const el = document.getElementById("menu-sky");
        if (!el || el.classList.contains("is-scattering")) return;

        const clouds = el.querySelectorAll(".cloud");
        clouds.forEach((cloud) => {
            const rect = cloud.getBoundingClientRect();
            const style = getComputedStyle(cloud);
            cloud.style.animation = "none";
            cloud.style.left = `${rect.left}px`;
            cloud.style.top = `${rect.top}px`;
            cloud.style.opacity = style.opacity;
        });

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                clouds.forEach((cloud) => { cloud.style.opacity = ""; });
                el.classList.add("is-scattering");
            });
        });
    }

    /** Плавно убрать небо после готовности карты (после PoW). */
    fadeMenuSky() {
        const el = document.getElementById("menu-sky");
        if (!el) return Promise.resolve();
        if (el.classList.contains("is-fading") || el.dataset.gone === "1") {
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            el.classList.add("is-fading");
            const done = () => {
                el.dataset.gone = "1";
                el.removeEventListener("transitionend", onEnd);
                el.remove();
                document.body.style.background = "#ffe8a8";
                this.syncLeaderboardVisibility();
                resolve();
            };
            const onEnd = (e) => {
                if (e.target === el && e.propertyName === "opacity") done();
            };
            el.addEventListener("transitionend", onEnd);
            setTimeout(done, 1000);
        });
    }

    /** Совместимость: сразу разлет + (если карта уже готова) fade. */
    dismissMenuSky() {
        this.scatterMenuClouds();
        if (this.core.net?.mapReady) this.fadeMenuSky();
    }

    /**
     * Подключиться к серверу и дождаться карты (PoW + SetBorder).
     * @returns {Promise<void>}
     */
    ensureConnected() {
        const net = this.core.net;
        if (net.ws?.readyState === 1 && net.mapReady) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            this._readyWaiters = this._readyWaiters || [];
            this._readyWaiters.push({ resolve, reject });

            const url = this.core.defaultServerUrl;
            if (!net.ws || net.ws.readyState >= 2) {
                net.connect(url);
            }
            // уже connecting / open — ждём onServerReady
        });
    }

    onServerReady() {
        const waiters = this._readyWaiters || [];
        this._readyWaiters = [];
        for (const w of waiters) {
            try { w.resolve(); } catch (_) {}
        }
    }

    failReadyWaiters(reason) {
        const waiters = this._readyWaiters || [];
        this._readyWaiters = [];
        for (const w of waiters) {
            try { w.reject(new Error(reason || "failed")); } catch (_) {}
        }
    }

    updateConnectionStatus(_status) {
        // HUD статуса сервера убран
    }

    setPowLoading(show, text) {
        let el = document.getElementById("pow-loading");
        if (!el) {
            el = document.createElement("div");
            el.id = "pow-loading";
            el.style.cssText = [
                "position:fixed",
                "left:50%",
                "bottom:18px",
                "transform:translateX(-50%)",
                "z-index:80",
                "padding:10px 16px",
                "border-radius:14px",
                "background:rgba(255,255,255,0.92)",
                "border:2px solid rgba(26,58,74,0.12)",
                "box-shadow:0 8px 20px rgba(30,80,110,0.16)",
                "font:800 13px Nunito,sans-serif",
                "color:#1a3a4a",
                "pointer-events:none",
                "user-select:none"
            ].join(";");
            document.body.appendChild(el);
        }
        if (!show) {
            el.hidden = true;
            return;
        }
        el.hidden = false;
        el.textContent = text || "Загрузка…";
    }

    addEvents() {
        this.onPlay = this.onPlay.bind(this)
        this.onSpectate = this.onSpectate.bind(this)
        this.onSettings = this.onSettings.bind(this)
        this.onSkins = this.onSkins.bind(this)
        this.onKeyDown = this.onKeyDown.bind(this)
        this.onNameChange = this.onNameChange.bind(this)
        this.onMouseMove = this.onMouseMove.bind(this)
        this.onResize = this.onResize.bind(this)
        this.onScroll = this.onScroll.bind(this)
        this.onKeyUp = this.onKeyUp.bind(this)
        this.playButton.addEventListener("click", this.onPlay)
        this.spectateButton.addEventListener("click", this.onSpectate)
        this.skinsButton?.addEventListener("click", this.onSkins)
        this.settingsButton.addEventListener("click", this.onSettings)
        this.deathPlayBtn?.addEventListener("click", () => this.onPlayFromDeath())
        this.deathSpectateBtn?.addEventListener("click", () => this.onSpectateFromDeath())
        document.getElementById("death-revive")?.addEventListener("click", () => this.onReviveFromAd())
        addEventListener("keydown", this.onKeyDown);
        addEventListener("keyup", this.onKeyUp);

        // Разрешаем выделение и копирование текста в полях ввода.
        const isTextField = (target) => {
            const tag = target?.tagName;
            return tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable;
        };
        document.addEventListener("selectstart", (e) => {
            if (!isTextField(e.target)) e.preventDefault();
        });
        document.addEventListener("copy", (e) => {
            if (!isTextField(e.target)) {
                e.preventDefault();
                e.clipboardData?.setData("text/plain", "");
            }
        });
        document.addEventListener("cut", (e) => {
            if (!isTextField(e.target)) {
                e.preventDefault();
                e.clipboardData?.setData("text/plain", "");
            }
        });
        document.addEventListener("contextmenu", (e) => {
            if (!isTextField(e.target)) e.preventDefault();
        });
        // Esc → только меню игры, не выход из окна / fullscreen
        addEventListener("keydown", (e) => {
            if (e.code !== "Escape" && e.key !== "Escape") return;
            e.preventDefault();
            e.stopPropagation();
            if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
            this.handleEscapeKey();
        }, true);

        this.nameInput.addEventListener("change", this.onNameChange)
        this.nameInput.addEventListener("input", () => {
            const live = sanitizeSafeText(this.nameInput.value, 24);
            if (live !== this.nameInput.value) this.nameInput.value = live;
        });
        this.nameInput.addEventListener("keydown", (e) => {
            if (e.code === "Enter") {
                e.preventDefault();
                this.applyNickname(this.nameInput.value);
                if (this.core.app.ownedCells.length > 0) this.setPanelState(false);
            }
        });
        this.chatField?.addEventListener("keydown", (e) => {
            if (e.code === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                this.submitChatCompose();
            } else if (e.code === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                this.closeChatCompose();
            } else {
                e.stopPropagation();
            }
        });
        this.chatField?.addEventListener("keyup", (e) => {
            e.stopPropagation();
        });
        this.chatField?.addEventListener("input", () => {
            const live = sanitizeChatInput(this.chatField.value);
            if (live !== this.chatField.value) this.chatField.value = live;
        });
        document.getElementById("mobile-chat")?.addEventListener("click", () => {
            if (this.isChatComposeOpen()) this.submitChatCompose();
            else this.openChatCompose();
        });
        document.getElementById("mobile-menu")?.addEventListener("click", () => {
            this.closeChatCompose();
            this.hideDeathStats();
            this.setPanelState(true);
        });
        this.core.app.view.addEventListener("mousemove", this.onMouseMove)
        this.core.app.view.addEventListener('wheel', this.onScroll, {
            passive: true
        })
        this.core.app.view.addEventListener("mousedown", (e) => {
            if (e.button !== 0) return;
            if (this.core.app.isSpectating) {
                this.moveSpectateToClick();
                return;
            }
            // ЛКМ = буст (как Space); на мобилке/ТВ — свои контролы
            if (this.mobileControls?._active || isTV()) return;
            if (!this.core.app.ownedCells.length) return;
            e.preventDefault();
            this._boostMouse = true;
            this.startBoost();
        });
        window.addEventListener("mouseup", (e) => {
            if (e.button !== 0 || !this._boostMouse) return;
            this._boostMouse = false;
            if (!this.keysPressed["Space"]) this.stopBoost();
        });
        // На тач-устройствах не даём странице скроллиться жестами по канвасу
        this.core.app.view.style.touchAction = "none";
        document.body.style.touchAction = "manipulation";
        addEventListener("resize", this.onResize)
        if (window.visualViewport) {
            window.visualViewport.addEventListener("resize", this.onResize);
            window.visualViewport.addEventListener("scroll", this.onResize);
        }
        // Первый кадр после layout (мобильный адресный бар)
        requestAnimationFrame(() => this.onResize());
        addEventListener("beforeunload", (event) => {
            this.core.store.settings = this.core.settings.rawSettings
            event.cancelBubble = true
            event.returnValue = 'You sure you want to leave?'
            event.preventDefault()
        })

        window.addEventListener("blur", () => {
            this.resetKeys();
        });

        // 2. Страница стала скрытой (смена вкладки, открытие devtools и т.п.)
        document.addEventListener("visibilitychange", () => {
            if (document.hidden) this.resetKeys();
        });

        // 3. Открытие контекстного меню (ПКМ → KeyUp не приходит)
        window.addEventListener("contextmenu", () => {
            this.resetKeys();
        });
    }

    resetKeys() {
        // сбрасываем все клавиши
        for (const key in this.keysPressed) {
            this.keysPressed[key] = false;
        }

        // останавливаем W-интервал
        if (this.ejectInterval) {
            clearInterval(this.ejectInterval);
            this.ejectInterval = null;
        }

        this._boostMouse = false;
        this.stopBoost();
    }

    isBoostKey(code, keyCode) {
        return code === "Space" || keyCode === 32 || keyCode === 133;
    }

    startBoost() {
        if (!this.core.app.ownedCells.length || this.core.app.isSpectating) return;
        if (this.core.app.camera.mass < BOOST_MIN_SCORE) return;
        if (this._boostHeld) return;
        this._boostHeld = true;
        this.core.net.sendBoost(true);
    }

    stopBoost() {
        if (!this._boostHeld) return;
        this._boostHeld = false;
        this.core.net.sendBoost(false);
    }







    async onPlay() {
        if (this.core.app.ownedCells.length > 0) {
            this.hideDeathStats();
            this.setPanelState(false);
            return;
        }
        if (this._enterBusy) return;
        this._enterBusy = true;

        const name = (this.nameInput.value || "").trim() || "Игрок";
        this.core.store.name = name;
        this.scatterMenuClouds();
        this.core.app.exitSpectateMode();
        this.core.app.prepareNewLife();
        this.core.app.camera.score = 0;
        this.core.app.camera.mass = 0;
        this.hideDeathStats();
        this.setPanelState(false);
        this.updateMenuButtons();

        try {
            await this.ensureConnected();
            await this.fadeMenuSky();
            this.core.net.spawn();
            gameplayStart();
        } catch (err) {
            console.warn("[Game] Play connect failed:", err);
            this.setPanelState(true);
        } finally {
            this._enterBusy = false;
        }
    }

    onPlayFromDeath() {
        this.hideDeathStats();
        this.onPlay();
    }

    onSpectateFromDeath() {
        this.hideDeathStats();
        this.onSpectate();
    }

    onYandexReady(identity) {
        this.core.yandex = identity || getIdentity();
        this.updateYandexAuthButton();
        this.removeReviveControlsIfUnavailable();
    }

    updateYandexAuthButton() {
        let btn = document.getElementById("yandex-auth");
        this.core.yandex = getIdentity();

        // Под учёткой Яндекса / без SDK / локалка — кнопки нет
        if (!needsYandexAuthButton()) {
            if (btn) btn.remove();
            return;
        }

        // Гость на Яндекс Играх — вход только по кнопке (требование 1.2.1)
        if (!btn && this.userInterface) {
            btn = document.createElement("div");
            btn.id = "yandex-auth";
            btn.className = "button";
            btn.textContent = "Войти через Яндекс";
            btn.title = "Сохранять рекорды в рейтинге Яндекса";
            btn.style.marginTop = "12px";
            btn.addEventListener("click", async () => {
                const ok = await openYandexAuth();
                if (ok) {
                    this.core.yandex = getIdentity();
                    this.updateYandexAuthButton();
                    this.core.net?.sendYandexIdentity?.();
                }
            });
            const primary = this.userInterface.querySelector(".primary-buttons");
            if (primary) primary.insertAdjacentElement("afterend", btn);
            else this.userInterface.appendChild(btn);
        }
    }

    /** Старт новой жизни — вызывается при появлении первой своей клетки. */
    onLifeStarted() {
        if (this._lifeActive) return;
        this._lifeActive = true;
        this.core.app.snakeEnded = false;
        this.core.app.refreshHeadCellId();
        this.sessionStats.start();
        this.hideDeathStats();
        this.setPanelState(false);
        gameplayStart();
    }

    /** Смерть — статистика вместо главного меню. */
    onPlayerDied() {
        if (!this._lifeActive) {
            // Уже умерли: не дёргаем меню (иначе итоги мигают)
            return;
        }
        this._lifeActive = false;
        this.stopBoost();
        gameplayStop();
        this.core.app.snakeEnded = true;
        this.core.app.ownedCells = [];
        this.core.app.mainCell = null;
        this.core.app.headCellId = null;
        const snap = this.sessionStats.stop(this.core.app.camera.score | 0);
        this.showDeathStats(snap);
        // Дублируем рекорд в лидерборд Яндекса (ник змейки в extraData)
        const score = snap?.score | 0;
        const nick = this.core.store.name || "Игрок";
        if (score > 0) {
            submitYandexScore(score, nick).catch(() => {});
        }
        this.showDeathFullscreenAd();
    }

    showDeathFullscreenAd() {
        if (!this.isMobileLayout() || this._deathFullscreenAdBusy) return;
        this._deathFullscreenAdBusy = true;
        window.yaContextCb = window.yaContextCb || [];
        window.yaContextCb.push(() => {
            window.setTimeout(() => {
                this._deathFullscreenAdBusy = false;
                if (typeof Ya === "undefined" || !Ya.Context?.AdvManager) return;
                Ya.Context.AdvManager.render({
                    blockId: "R-A-19715377-4",
                    type: "fullscreen",
                    platform: "touch"
                });
            }, 1000);
        });
    }

    showDeathStats(stats) {
        if (!this.deathStats) {
            this.setPanelState(true);
            return;
        }
        this._deathStatsOpen = true;
        document.body.classList.remove("menu-open");
        document.getElementById("menu-screen")?.classList.remove("is-open");
        document.body.classList.add("death-stats-open");
        this.deathStats.classList.add("is-active");
        this.renderDeathAdsOnce();
        this.closeChatCompose();
        this.userInterface.style.display = "none";
        if (this.menuRating) this.menuRating.hidden = true;
        if (this.leaderboardPanel) this.leaderboardPanel.style.display = "";

        const s = stats || this.sessionStats.snapshot();
        const el = (id) => document.getElementById(id);
        if (el("ds-score")) el("ds-score").textContent = String(s.score >>> 0);
        if (el("ds-kills")) el("ds-kills").textContent = String(s.kills >>> 0);
        if (el("ds-time")) el("ds-time").textContent = formatPlayTime(s.durationMs);
        if (el("ds-boost")) el("ds-boost").textContent = formatPlayTime(s.boostMs);
        if (el("ds-mass")) el("ds-mass").textContent = String(s.peakMass >>> 0);

        this.drawMassChart(s.massSamples || []);
        this._lastDeathSnap = s;
        this.deathStats.hidden = false;
        this.updateReviveButton();
        this.mobileControls?.syncVisibility();
        this.updateMenuButtons();
        this.updateControlsHint();
        // ТВ: сразу фокус на «Играть снова», чтобы можно было продолжить без перезапуска
        requestAnimationFrame(() => {
            if (isTV()) {
                const play = document.getElementById("death-play");
                play?.focus?.();
                this.tvControls._focusIdx = 1;
            }
        });
    }

    hideDeathStats() {
        this._deathStatsOpen = false;
        document.body.classList.remove("death-stats-open");
        if (this.deathStats) {
            this.deathStats.hidden = true;
            this.deathStats.classList.remove("is-active");
        }
    }

    renderDeathAdsOnce() {
        if (this._deathAdsRendered) return;
        this._deathAdsRendered = true;
        window.yaContextCb = window.yaContextCb || [];
        window.yaContextCb.push(() => {
            if (typeof Ya === "undefined" || !Ya.Context?.AdvManager) {
                this._deathAdsRendered = false;
                return;
            }
            Ya.Context.AdvManager.render({
                blockId: "R-A-19715377-2",
                renderTo: "yandex_rtb_R-A-19715377-2"
            });
            Ya.Context.AdvManager.render({
                blockId: "R-A-19715377-3",
                renderTo: "yandex_rtb_R-A-19715377-3"
            });
        });
    }

    onAdProgress(p) {
        this._adProgress = p || { ads: 0, blackUnlocked: false, reviveWaitMs: 0 };
        this.updateAdProgressUi();
        this.updateReviveButton();
    }

    updateAdProgressUi() {
        const el = document.getElementById("unlock-progress");
        if (!el) return;
        const ads = this._adProgress?.ads | 0;
        const need = BLACK_UNLOCK_ADS;
        if (ads >= need || this._adProgress?.blackUnlocked) {
            el.textContent = `Чёрная змея открыта · реклам: ${ads}`;
        } else {
            el.textContent = `Чёрная змея: ${ads} / ${need} реклам`;
        }
    }

    updateReviveButton() {
        const btn = document.getElementById("death-revive");
        const hint = document.getElementById("death-revive-hint");
        const host = String(window.location.hostname || "").toLowerCase();
        const isYandexHost = host === "yandex.ru" || host.endsWith(".yandex.ru");
        if (!isYandexHost || !getYsdk()) {
            btn?.remove();
            hint?.remove();
            return;
        }
        if (btn) btn.hidden = false;
        if (hint) hint.hidden = false;
        const main = btn?.querySelector(".death-revive-main");
        const adLabel = btn?.querySelector(".death-revive-ad-label");
        if (!btn) return;
        const snap = this._lastDeathSnap;
        const score = snap?.score | 0;
        const mass = snap?.peakMass | 0;
        const wait = this._adProgress?.reviveWaitMs | 0;
        const can = score >= 10 || mass >= 20;

        if (adLabel) adLabel.textContent = "Смотреть рекламу";

        if (!can) {
            btn.disabled = true;
            if (main) main.textContent = "Восстановить 30%";
            else btn.textContent = "Восстановить 30%";
            if (hint) hint.textContent = "Слишком мало очков для восстановления";
            return;
        }
        if (wait > 0) {
            const sec = Math.ceil(wait / 1000);
            btn.disabled = true;
            if (main) main.textContent = `Подождите ${sec} с`;
            else btn.textContent = `Подождите ${sec} с`;
            if (hint) hint.textContent = "Частые смерти — реклама восстановления реже";
            clearTimeout(this._reviveTick);
            this._reviveTick = setTimeout(() => {
                if (this._adProgress) {
                    this._adProgress.reviveWaitMs = Math.max(0, (this._adProgress.reviveWaitMs | 0) - 1000);
                }
                this.updateReviveButton();
            }, 1000);
            return;
        }
        btn.disabled = false;
        const keepS = Math.max(1, Math.floor(score * 0.3));
        const keepM = Math.max(1, Math.floor(mass * 0.3));
        const scoreWord = keepS === 1 ? "очко" : keepS < 5 ? "очка" : "очков";
        if (main) main.textContent = `Восстановить 30% (~${keepS} ${scoreWord})`;
        else btn.textContent = `Смотреть рекламу — восстановить 30%`;
        if (hint) hint.textContent = `Награда за рекламу: ~${keepS} ${scoreWord} и ~${keepM} массы`;
    }

    async onReviveFromAd() {
        const btn = document.getElementById("death-revive");
        if (btn?.disabled || this._reviveBusy) return;
        this._reviveBusy = true;
        try {
            const res = await showRewardedAd();
            if (!res.rewarded) {
                if (document.getElementById("death-revive-hint")) {
                    document.getElementById("death-revive-hint").textContent = "Реклама не просмотрена";
                }
                return;
            }
            this.core.net.reportAdWatched();
            this.core.app.prepareNewLife();
            this.hideDeathStats();
            this.setPanelState(false);
            this.core.net.requestRevive();
            gameplayStart();
        } finally {
            this._reviveBusy = false;
        }
    }

    drawMassChart(samples) {
        const canvas = this.deathChart;
        if (!canvas) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const cssW = canvas.clientWidth || 420;
        const cssH = canvas.clientHeight || 120;
        canvas.width = Math.floor(cssW * dpr);
        canvas.height = Math.floor(cssH * dpr);
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cssW, cssH);

        const pad = { t: 8, r: 8, b: 18, l: 8 };
        const w = cssW - pad.l - pad.r;
        const h = cssH - pad.t - pad.b;
        const pts = samples.length ? samples : [{ t: 0, m: 0 }, { t: 1, m: 0 }];
        let maxM = 1;
        let maxT = 1;
        for (const p of pts) {
            if (p.m > maxM) maxM = p.m;
            if (p.t > maxT) maxT = p.t;
        }

        ctx.fillStyle = "rgba(184, 236, 255, 0.35)";
        ctx.fillRect(pad.l, pad.t, w, h);

        ctx.beginPath();
        pts.forEach((p, i) => {
            const x = pad.l + (p.t / maxT) * w;
            const y = pad.t + h - (p.m / maxM) * h;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        const last = pts[pts.length - 1];
        const first = pts[0];
        ctx.lineTo(pad.l + (last.t / maxT) * w, pad.t + h);
        ctx.lineTo(pad.l + (first.t / maxT) * w, pad.t + h);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + h);
        grad.addColorStop(0, "rgba(62, 207, 154, 0.55)");
        grad.addColorStop(1, "rgba(62, 207, 154, 0.05)");
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.beginPath();
        pts.forEach((p, i) => {
            const x = pad.l + (p.t / maxT) * w;
            const y = pad.t + h - (p.m / maxM) * h;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = "#249e70";
        ctx.lineWidth = 2.5;
        ctx.lineJoin = "round";
        ctx.stroke();

        ctx.fillStyle = "#6a8fa0";
        ctx.font = "700 10px Nunito, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("старт", pad.l, cssH - 4);
        ctx.textAlign = "right";
        ctx.fillText("конец", pad.l + w, cssH - 4);
        ctx.textAlign = "right";
        ctx.fillText(String(Math.round(maxM)), pad.l + w, pad.t + 10);
    }

    moveSpectateToClick() {
        if (!this.core.app.isSpectating) return;
        const world = this.getMouseWorld();
        this.core.app.setSpectateTarget(world.x, world.y);
        this.core.net.sendSpectateTarget(world.x, world.y);
    }

    async onSpectate() {
        if (this.core.app.ownedCells.length > 0) {
            return;
        }
        if (this._enterBusy) return;
        this._enterBusy = true;
        this.hideDeathStats();
        this.scatterMenuClouds();
        this.setPanelState(false);
        this.updateMenuButtons();
        try {
            await this.ensureConnected();
            await this.fadeMenuSky();
            if (!this.core.app.isSpectating) {
                this.core.app.enterSpectateMode();
                this.moveSpectateToClick();
                this.core.net.spectate();
            }
        } catch (err) {
            console.warn("[Game] Spectate connect failed:", err);
            this.setPanelState(true);
        } finally {
            this._enterBusy = false;
        }
    }

    onSettings() {
        const labels = {
            names: "Показывать имена",
            background: "Красивый фон",
            sectors: "Клетки на карте",
            border: "Край карты"
        };
        let contentStr = `<div class="modal-settings-content">`;
        const settings = this.core.settings.rawSettings;
        for (const setting in settings) {
            if (setting === "mass") continue;
            const inputValue = labels[setting] || setting;
            contentStr += `
        <label class="modal-settings-tile" for="setting-${setting}">
          <span>${inputValue}</span>
          <input type="checkbox" id="setting-${setting}" ${settings[setting] ? "checked" : ""}>
        </label>`;
        }
        contentStr += `</div>`;
        this.modalSystem.addModal(360, null, contentStr, { title: "Настройки" });

        for (const setting in settings) {
            if (setting === "mass") continue;
            const input = document.getElementById(`setting-${setting}`);
            input?.addEventListener("change", () => {
                this.core.settings[setting] = !!input.checked;
            });
        }
    }

    onSkins() {
        const catalog = getSkinCatalog();
        if (!catalog.length) {
            this.modalSystem.addModal(
                360,
                null,
                `<div class="modal-skins"><p class="modal-skins-hint">Скины ещё загружаются…</p></div>`,
                { title: "Скины" }
            );
            return;
        }
        const pages = Math.max(1, Math.ceil(catalog.length / SKINS_PER_PAGE));
        if (this._skinsPage >= pages) this._skinsPage = 0;

        // Уже открыто — только обновить сетку, не пересоздавать окно
        if (this._skinsModalId && this.modalSystem.modals.has(this._skinsModalId)) {
            this._renderSkinsPage();
            return;
        }

        this._skinsModalId = this.modalSystem.addModal(
            420,
            null,
            `<div class="modal-skins">
        <p class="modal-skins-hint">Нажми на картинку — ник и скин станут твоими</p>
        <div class="modal-skins-grid" data-skins-grid></div>
        <div class="modal-skins-pages" data-skins-pager></div>
      </div>`,
            { title: "Выбери скин" }
        );
        this._bindSkinsModalOnce();
        this._renderSkinsPage();
    }

    _skinsPagesCount() {
        return Math.max(1, Math.ceil(getSkinCatalog().length / SKINS_PER_PAGE));
    }

    /** Окно страниц: &lt; 1 2 3 … last &gt; → &lt; 2 3 4 … last &gt; */
    _skinsPagerHtml(page, pages) {
        const windowSize = 3;
        const last = pages - 1;
        const from = page;
        const to = Math.min(last, page + windowSize - 1);

        let mid = "";
        for (let p = from; p <= to; p++) {
            const active = p === page ? " is-active" : "";
            mid += `<button type="button" class="skin-page-btn${active}" data-skin-page="${p}">${p + 1}</button>`;
        }

        let tail = "";
        if (last > to) {
            if (last > to + 1) tail += `<span class="skin-page-ellipsis">…</span>`;
            const active = last === page ? " is-active" : "";
            tail += `<button type="button" class="skin-page-btn${active}" data-skin-page="${last}">${pages}</button>`;
        }

        const prevDis = page <= 0 ? " disabled" : "";
        const nextDis = page >= last ? " disabled" : "";
        return `
      <button type="button" class="skin-nav-arrow" data-skin-nav="-1" aria-label="Назад"${prevDis}>&lt;</button>
      ${mid}${tail}
      <button type="button" class="skin-nav-arrow" data-skin-nav="1" aria-label="Дальше"${nextDis}>&gt;</button>`;
    }

    _skinsGridHtml(page) {
        const catalog = getSkinCatalog();
        const start = page * SKINS_PER_PAGE;
        const slice = catalog.slice(start, start + SKINS_PER_PAGE);
        const selected = normalizeSkinNick(this.core.store.name || this.nameInput?.value || "");
        let tiles = "";
        for (let i = 0; i < slice.length; i++) {
            const { nick, id } = slice[i];
            const key = normalizeSkinNick(nick);
            const sel = key === selected ? " is-selected" : "";
            tiles += `
        <button type="button" class="skin-tile${sel}" data-skin-nick="${this.escapeHtml(nick)}" title="${this.escapeHtml(nick)}">
          <img src="${skinImageUrl(id)}" alt="" loading="lazy" width="58" height="58" />
          <span class="skin-tile-nick">${this.escapeHtml(nick)}</span>
        </button>`;
        }
        return tiles;
    }

    _renderSkinsPage() {
        const root = document.querySelector("#modals-container .modal-skins");
        if (!root) return;
        const pages = this._skinsPagesCount();
        const page = Math.max(0, Math.min(this._skinsPage, pages - 1));
        this._skinsPage = page;

        const grid = root.querySelector("[data-skins-grid]");
        const pager = root.querySelector("[data-skins-pager]");
        if (grid) grid.innerHTML = this._skinsGridHtml(page);
        if (pager) pager.innerHTML = this._skinsPagerHtml(page, pages);
    }

    _bindSkinsModalOnce() {
        const root = document.querySelector("#modals-container .modal-skins");
        if (!root || root.dataset.bound === "1") return;
        root.dataset.bound = "1";

        root.addEventListener("click", (e) => {
            const t = e.target;
            if (!(t instanceof Element)) return;

            const tile = t.closest(".skin-tile");
            if (tile && root.contains(tile)) {
                const nick = tile.getAttribute("data-skin-nick") || "";
                if (!nick) return;
                this.applyNickname(nick);
                root.querySelectorAll(".skin-tile").forEach((el) => el.classList.remove("is-selected"));
                tile.classList.add("is-selected");
                return;
            }

            const pageBtn = t.closest("[data-skin-page]");
            if (pageBtn && root.contains(pageBtn)) {
                const p = parseInt(pageBtn.getAttribute("data-skin-page"), 10);
                if (!Number.isFinite(p)) return;
                this._skinsPage = p;
                this._renderSkinsPage();
                return;
            }

            const nav = t.closest("[data-skin-nav]");
            if (nav && root.contains(nav) && !nav.hasAttribute("disabled")) {
                const d = parseInt(nav.getAttribute("data-skin-nav"), 10) || 0;
                const pages = this._skinsPagesCount();
                this._skinsPage = Math.max(0, Math.min(pages - 1, this._skinsPage + d));
                this._renderSkinsPage();
            }
        });
    }

    isMobileLayout() {
        return window.matchMedia("(max-width: 900px), (pointer: coarse)").matches;
    }

    isMeOnLeaderboard(player) {
        const myId = this.core.net.ownerPlayerId >>> 0;
        if (!myId) return false;
        const entryId = (player.playerId ?? player.id) >>> 0;
        return entryId === myId;
    }

    escapeHtml(text) {
        return String(text ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    makeLeaderboardRow(player, rank, isMe) {
        const row = document.createElement("div");
        row.className = "lb-row" + (isMe ? " lb-me" : "") + (rank === 1 ? " lb-top1" : "");
        const name = this.escapeHtml(player.name || "Без имени");
        const badge = isMe ? `<span class="lb-badge">вы</span>` : "";
        row.innerHTML = `
            <span class="lb-rank">${rank}</span>
            <span class="lb-name-wrap">
                <span class="lb-name">${name}</span>
                ${badge}
            </span>`;
        return row;
    }

    updateLeaderboard() {
        const all = this.core.net.leaderboardItems || [];
        const fragment = document.createDocumentFragment();

        if (!all.length) {
            const empty = document.createElement("div");
            empty.className = "lb-empty";
            empty.textContent = "Пока никого нет";
            fragment.appendChild(empty);
            this.leaderboard.innerHTML = "";
            this.leaderboard.appendChild(fragment);
            return;
        }

        // ПК: топ-10, телефон: топ-5; себя — отдельной строкой, если не в топе
        const topN = this.isMobileLayout() ? 5 : 10;
        const myId = this.core.net.ownerPlayerId >>> 0;
        let myIndex = -1;
        if (myId) {
            for (let i = 0; i < all.length; i++) {
                if (((all[i].playerId ?? all[i].id) >>> 0) === myId) {
                    myIndex = i;
                    break;
                }
            }
        }

        const top = all.slice(0, topN);
        for (let i = 0; i < top.length; i++) {
            fragment.appendChild(this.makeLeaderboardRow(top[i], i + 1, myIndex === i));
        }

        if (myIndex >= topN) {
            const sep = document.createElement("div");
            sep.className = "lb-sep";
            sep.setAttribute("aria-hidden", "true");
            fragment.appendChild(sep);
            fragment.appendChild(this.makeLeaderboardRow(all[myIndex], myIndex + 1, true));
        }

        this.leaderboard.innerHTML = "";
        this.leaderboard.appendChild(fragment);
    }

    bindMenuRatingNav() {
        if (this._ratingNavBound) return;
        this._ratingNavBound = true;
        this.ratingToggleBtn?.addEventListener("click", () => this.toggleMenuRating());
    }

    updateRatingNavButtons() {
        const moreThanFive = (this._ratingTotal > 5) || this._ratingHasMore || (this._ratingAll && this._ratingAll.length > 5);
        if (this.ratingToggleBtn) {
            this.ratingToggleBtn.disabled = (!moreThanFive && !this._ratingExpanded) || this._ratingLoading;
            this.ratingToggleBtn.setAttribute("aria-expanded", this._ratingExpanded ? "true" : "false");
            this.ratingToggleBtn.title = this._ratingExpanded ? "Свернуть" : "Показать всех";
            this.ratingToggleBtn.setAttribute("aria-label", this.ratingToggleBtn.title);
        }
        if (this.menuRating) {
            this.menuRating.dataset.expanded = this._ratingExpanded ? "1" : "0";
        }
    }

    toggleMenuRating() {
        if (this._ratingExpanded) this.collapseMenuRating();
        else this.expandMenuRating();
    }

    ratingsBaseUrl() {
        const wsUrl = this.core.net?.ws?.url || this.core.defaultServerUrl || "wss://sixz.ru:6009";
        try {
            const u = new URL(String(wsUrl).replace(/^ws/i, "http"));
            const basePath = (u.pathname || "").replace(/\/+$/, "");
            return `${u.protocol}//${u.host}${basePath}/ratings`;
        } catch (_) {
            return "https://sixz.ru:6009/ratings";
        }
    }

    /** Только топ-5 при загрузке страницы. */
    async loadMenuRating() {
        if (!this.ratingList) return;
        this._ratingExpanded = false;
        this._ratingOffset = 0;
        this._ratingHasMore = false;
        this._ratingRows = [];
        this._ratingTop5 = [];
        this._ratingAll = null;
        this._ratingTotal = 0;
        this._ratingLoading = false;
        this.ratingList.innerHTML = `<div class="lb-empty">Загрузка…</div>`;
        this.updateRatingNavButtons();
        await this.fetchRatingPage(0, 5, true);
        this.lockRatingListToTop5();
    }

    /** Зафиксировать высоту списка ровно под топ-5 (панель не растёт при раскрытии). */
    lockRatingListToTop5() {
        if (!this.ratingList) return;
        const rows = this.ratingList.querySelectorAll(".lb-row");
        if (!rows.length) return;
        const n = Math.min(5, rows.length);
        let h = 0;
        for (let i = 0; i < n; i++) {
            h += rows[i].offsetHeight;
            if (i < n - 1) {
                h += parseFloat(getComputedStyle(rows[i]).marginBottom) || 0;
            }
        }
        const pad = getComputedStyle(this.ratingList);
        h += (parseFloat(pad.paddingTop) || 0) + (parseFloat(pad.paddingBottom) || 0);
        this.ratingList.style.height = `${Math.ceil(h)}px`;
    }

    /** ▼ — показать всех (подгрузка с сервера один раз, потом из кэша). */
    async expandMenuRating() {
        if (this._ratingExpanded || this._ratingLoading) return;
        this._ratingExpanded = true;
        this.updateRatingNavButtons();

        if (this._ratingAll && this._ratingAll.length > 5) {
            this._ratingRows = this._ratingAll.slice();
            this.renderMenuRating(this._ratingRows, true);
            this.updateRatingNavButtons();
            return;
        }

        while (this._ratingHasMore && this._ratingOffset < 1000) {
            const now = Date.now();
            if (now - this._ratingLastFetch < 350) {
                await new Promise(r => setTimeout(r, 350 - (now - this._ratingLastFetch)));
            }
            await this.fetchRatingPage(this._ratingOffset, 50, false);
            if (!this._ratingExpanded) break;
        }
        this._ratingAll = this._ratingRows.slice();
        this.updateRatingNavButtons();
    }

    /** ▲ — снова только топ-5, остальных убрать из списка. */
    collapseMenuRating() {
        if (!this._ratingExpanded) return;
        this._ratingExpanded = false;
        if (this._ratingRows.length > 5 && !this._ratingAll) {
            this._ratingAll = this._ratingRows.slice();
        }
        this._ratingRows = (this._ratingTop5 || this._ratingRows.slice(0, 5)).slice();
        this.renderMenuRating(this._ratingRows, true);
        if (this.ratingList) this.ratingList.scrollTop = 0;
        this.updateRatingNavButtons();
    }

    async fetchRatingPage(offset, limit, replace) {
        if (this._ratingLoading) return;
        this._ratingLoading = true;
        this._ratingLastFetch = Date.now();
        this.updateRatingNavButtons();
        try {
            const url = `${this.ratingsBaseUrl()}?offset=${offset | 0}&limit=${limit | 0}`;
            const res = await fetch(url, { cache: "no-store" });
            if (res.status === 429) {
                this._ratingHasMore = true;
                return;
            }
            if (!res.ok) throw new Error("HTTP " + res.status);
            const data = await res.json();
            const items = Array.isArray(data.items) ? data.items : [];
            if (typeof data.total === "number") this._ratingTotal = data.total | 0;
            if (replace) {
                this._ratingRows = items.slice();
                this._ratingTop5 = items.slice(0, 5);
            } else {
                this._ratingRows.push(...items);
            }
            this._ratingOffset = (data.offset | 0) + items.length;
            this._ratingHasMore = !!data.hasMore && this._ratingOffset < 1000 && items.length > 0;
            this.renderMenuRating(this._ratingRows, replace);
        } catch (_) {
            if (replace) {
                this.ratingList.innerHTML = `<div class="lb-empty">Рейтинг пока недоступен</div>`;
            }
        } finally {
            this._ratingLoading = false;
            this.updateRatingNavButtons();
        }
    }

    renderMenuRating(top, replace = true) {
        if (!this.ratingList) return;
        if (!top.length) {
            this.ratingList.innerHTML = "";
            const empty = document.createElement("div");
            empty.className = "lb-empty";
            empty.textContent = "Пока пусто — ешьте еду!";
            this.ratingList.appendChild(empty);
            this.updateRatingNavButtons();
            return;
        }

        if (replace) this.ratingList.innerHTML = "";

        const start = replace ? 0 : this.ratingList.querySelectorAll(".lb-row").length;
        const fragment = document.createDocumentFragment();
        for (let i = start; i < top.length; i++) {
            const row = top[i];
            const rank = i + 1;
            const el = document.createElement("div");
            el.className = "lb-row" + (rank === 1 ? " lb-top1" : "");
            el.innerHTML = `
                <span class="lb-rank">${rank}</span>
                <span class="lb-name-wrap">
                    <span class="lb-name">${this.escapeHtml(row.name || "Игрок")}</span>
                    ${row.yaName ? `<span class="lb-ya">${this.escapeHtml(row.yaName)}</span>` : ""}
                </span>
                <span class="lb-lvl">${row.rating >>> 0}</span>`;
            fragment.appendChild(el);
        }
        this.ratingList.appendChild(fragment);
        this.updateRatingNavButtons();
    }

    updateChat() {
        const list = this.core.net.messages || [];
        const fragment = document.createDocumentFragment();

        for (const message of list) {
            const tile = document.createElement("div");
            tile.className = "hud-message-tile";
            const item = document.createElement("span");
            item.className = "hud-message-item";
            item.style.color = `rgb(${message.color.r}, ${message.color.g}, ${message.color.b})`;
            item.textContent = `${message.name}: `;
            const body = document.createElement("span");
            body.className = "hud-message";
            body.textContent = message.content;
            item.appendChild(body);
            tile.appendChild(item);
            fragment.appendChild(tile);
        }

        if (this.chatContent) {
            this.chatContent.innerHTML = "";
            this.chatContent.appendChild(fragment);
            this.chatContent.scrollTop = this.chatContent.scrollHeight;
        }
        if (this.chatPanel) {
            this.chatPanel.hidden = list.length === 0;
        }
    }

    isChatComposeOpen() {
        return !!(this.chatField && !this.chatField.hidden);
    }

    /** Фокус в поле ввода (ник / чат) — пробел и буквы не трогаем. */
    isTypingInField() {
        const ae = document.activeElement;
        if (!ae) return false;
        if (ae === this.nameInput || ae === this.chatField) return true;
        const tag = ae.tagName;
        return tag === "INPUT" || tag === "TEXTAREA" || ae.isContentEditable;
    }

    openChatCompose() {
        if (!this.chatField) return;
        if (this.userInterface && getComputedStyle(this.userInterface).display !== "none") return;
        if (this._deathStatsOpen) return;

        this.chatField.hidden = false;
        this.chatField.value = "";
        this._chatOpen = true;
        const mobileChat = document.getElementById("mobile-chat");
        if (mobileChat) {
            mobileChat.textContent = "Отправить";
            mobileChat.setAttribute("aria-label", "Отправить сообщение");
        }
        this.stopBoost();
        requestAnimationFrame(() => {
            this.chatField.focus();
        });
    }

    closeChatCompose() {
        if (!this.chatField) return;
        this.chatField.blur();
        this.chatField.value = "";
        this.chatField.hidden = true;
        this._chatOpen = false;
        const mobileChat = document.getElementById("mobile-chat");
        if (mobileChat) {
            mobileChat.textContent = "Чат";
            mobileChat.setAttribute("aria-label", "Открыть чат");
        }
    }

    submitChatCompose() {
        if (!this.chatField) return;
        const value = sanitizeChat(this.chatField.value);
        if (value) this.core.net.sendChatMessage(value);
        this.closeChatCompose();
    }

    onMouseMove({ clientX, clientY }) {
        if (this.mobileControls?._active) return;
        this.mouse.x = clientX;
        this.mouse.y = clientY;
    }

    getMouseWorld() {
        return getMouseWorld(this.core);
    }

    onScroll({ deltaY }) {
        const app = this.core.app;
        const steps = (deltaY || 0) / 120;
        app.zoom *= Math.pow(0.9, steps);
    }


    handleEscapeKey() {
        // Чат открыт — закрыть чат
        if (this.isChatComposeOpen()) {
            this.closeChatCompose();
            return;
        }
        // Диалог выхода ТВ
        if (this._tvExitOpen) {
            const dlg = document.getElementById("tv-exit-dialog");
            dlg?.querySelector("#tv-exit-no")?.click();
            return;
        }
        // Уже в меню — ничего (не закрываем вкладку)
        const menuOpen = this.userInterface && getComputedStyle(this.userInterface).display !== "none";
        if (menuOpen && !this._deathStatsOpen) {
            return;
        }
        if (this._deathStatsOpen) {
            this.hideDeathStats();
        }
        this.setPanelState(true);
        this.updateControlsHint();
    }

    onKeyDown(event) {
        const { code, keyCode } = event;

        // Escape обрабатывается в capture (handleEscapeKey)
        if (code === "Escape") {
            event.preventDefault();
            return;
        }

        // Пока пишем в ник/чат — игровые клавиши не трогаем (Space должен печататься)
        if (this.isChatComposeOpen() || this.isTypingInField()) {
            return;
        }

        this.keysPressed[code] = true;

        if (this.isBoostKey(code, keyCode)) {
            // На ТВ в геймплее буст обрабатывает TvControls
            if (isTV() && this.tvControls?.inGameplay()) return;
            event.preventDefault();
            this.startBoost();
            return;
        }

        switch (code) {
            case "KeyW":
                if (isTV()) break;
                if (!this.ejectInterval) {
                    this.core.net.sendEject();
                    this.ejectInterval = setInterval(() => {
                        if (this.keysPressed["KeyW"]) this.core.net.sendEject();
                        else clearInterval(this.ejectInterval);
                    }, 50);
                }
                break;
            case "Enter":
            case "NumpadEnter":
                // ТВ: OK активирует сфокусированную кнопку; в игре — буст (TvControls)
                if (isTV()) {
                    if (this.tvControls?.inGameplay()) return;
                    event.preventDefault();
                    const ae = document.activeElement;
                    if (ae && (ae.classList?.contains("button") || ae.getAttribute("role") === "button")) {
                        ae.click();
                    }
                    return;
                }
                event.preventDefault();
                this.openChatCompose();
                break;
            case "KeyE":
                if (!isTV()) this.core.net.sendE();
                break;
            case "KeyR":
                if (!isTV()) this.core.net.sendR();
                break;
            case "KeyT":
                if (!isTV()) this.core.net.sendT();
                break;
            case "KeyP":
                if (!isTV()) this.core.net.sendP();
                break;
        }
    }

    onKeyUp(event) {
        if (this.isChatComposeOpen() || this.isTypingInField()) return;

        const { code, keyCode } = event;
        this.keysPressed[code] = false;

        if (this.isBoostKey(code, keyCode)) {
            // ЛКМ ещё зажат — буст не гасим
            if (!this._boostMouse) this.stopBoost();
        }

        if (code === "KeyW" && this.ejectInterval) {
            clearInterval(this.ejectInterval);
            this.ejectInterval = null;
        }
    }

    onResize() {
        const vv = window.visualViewport;
        const w = Math.max(1, Math.floor(vv?.width ?? innerWidth));
        const h = Math.max(1, Math.floor(vv?.height ?? innerHeight));
        const app = this.core.app;
        if (!app?.view || !app.resizeCanvas) return;
        app.resizeCanvas(w, h);
        app.syncMinimapSize?.();
        // Сброс «улетевшего» зума после поворота/обновления на мобилке
        if (app.ownedCells.length === 0 && !app.isSpectating) {
            const z = app.zoom;
            if (!Number.isFinite(z) || z < 0.15 || z > 3) {
                app.zoom = 0.7;
            }
        }
        centerRawMouse(this.core);
        const mobile = this.isMobileLayout();
        if (this._lbMobileLayout !== mobile) {
            this._lbMobileLayout = mobile;
            this.updateLeaderboard();
        }
    }

    updateMenuButtons() {
        const playing = this.core.app.ownedCells.length > 0;

        if (playing) {
            this.spectateButton.style.display = "";
            this.spectateButton.style.opacity = "0.5";
            this.spectateButton.style.pointerEvents = "none";
            this.playButton.textContent = "Продолжить";
        } else {
            this.spectateButton.style.display = "";
            this.spectateButton.style.opacity = "";
            this.spectateButton.style.pointerEvents = "";
            this.playButton.textContent = "Играть";
        }
        this.playButton.style.display = "";
    }

    setPanelState(show) {
        if (show) {
            this.closeChatCompose();
            this.hideDeathStats();
            this.userInterface.style.display = "grid";
            document.body.classList.add("menu-open");
            document.getElementById("menu-screen")?.classList.add("is-open");
            if (this.menuRating) this.menuRating.hidden = isTV();
            this.syncLeaderboardVisibility();
            this.updateMenuButtons();
            this.mobileControls?.syncVisibility();
            this.updateControlsHint();
            if (isTV()) {
                this.playButton?.focus?.();
            } else if (this.core.app.ownedCells.length > 0) {
                this.nameInput.value = this.core.store.name || "";
                this.nameInput.focus();
                this.nameInput.select();
            }
        } else {
            this.userInterface.style.display = "none";
            document.body.classList.remove("menu-open");
            document.getElementById("menu-screen")?.classList.remove("is-open");
            if (this.menuRating) this.menuRating.hidden = true;
            this.syncLeaderboardVisibility();
            this.updateMenuButtons();
            this.mobileControls?.syncVisibility();
            this.updateControlsHint();
        }
    }

    applyNickname(raw) {
        const n = sanitizeNick(raw);
        this.core.store.name = n;
        this.nameInput.value = n;

        for (const id of this.core.app.ownedCells) {
            const cell = this.core.app.cellsByID.get(id);
            if (!cell) continue;
            cell.hasChanged = true;
            cell.name = n;
            cell._skinNickKey = "";
            cell._resolveSkin();
        }

        if (this.core.app.ownedCells.length > 0) {
            this.core.net.sendNickname(n);
        }
    }

    onNameChange() {
        this.applyNickname(this.nameInput.value);
    }
}


/* --- js/core/Game.js --- */
class Game {
  constructor() {
    this.init();
  }

  async init() {
    this.app = new Application(this);
    this.store = new Storage();
    this.settings = new Settings(this);
    this.net = new Network(this);
    this.ui = new UserInterface(this);
    this.app.servers = servers;
    this.skins = null;
    this.account = { xp: 0, uid: localStorage.accountToken || "" };
    this.yandex = { uid: "", yaName: "", authorized: false };
    this.deviceType = "desktop";

    this.defaultServerUrl = SERVER_WS_URL;
    console.log("Ready — connect on Play:", SERVER_WS_URL);

    // Пока SDK грузится — игра не считается готовой (LoadingAPI)
    this.ui?.setGameBooting?.(true);

    // Скины грузим параллельно с Yandex SDK — лёгкий txt + bake в память
    await Promise.all([
      initYandex(),
      loadSkinList("./skinlist.txt")
    ]);
    this.skins = { ids: listSkinIds() };
    applyDebugPlatformOverride();
    this.deviceType = getDeviceType();
    this.yandex = getIdentity();
    this.ui?.onYandexReady?.(this.yandex);
    this.ui?.onPlatformReady?.(this.deviceType);
    this.ui?.setGameBooting?.(false);

    // Меню уже интерактивно → сигнал готовности платформе
    signalGameReady();
  }
}


const core = new Game();
window.CORE = core;
})();
