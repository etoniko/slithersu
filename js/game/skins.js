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

export function isSkinId(id) {
    return ID_RE.test(String(id || ""));
}

export function normalizeSkinNick(name) {
    return String(name || "")
        .trim()
        .replace(/#.*$/, "")
        .toLowerCase();
}

export function resolveSkinId(name) {
    const key = normalizeSkinNick(name);
    if (!key) return null;
    return nickToSkin.get(key) || null;
}

export function isTransparentNick(name) {
    return transparentNicks.has(normalizeSkinNick(name));
}

/** Без заливки color на голове/сегментах (список transparent.txt). */
export function isTransparentPlayer(playerId, name) {
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

export function isGwelNick(name) {
    return gwelNicks.has(normalizeSkinNick(name));
}

/** Голова крутится за направлением (gwel.txt / agar.su rotation). */
export function isGwelPlayer(playerId, name) {
    const pid = playerId | 0;
    const key = normalizeSkinNick(name);
    if (key) {
        const on = gwelNicks.has(key);
        if (pid) gwelPlayers.set(pid, on);
        return on;
    }
    return !!gwelPlayers.get(pid);
}

export function skinIdForPlayer(playerId, name) {
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

export function clearPlayerSkins() {
    playerSkin.clear();
    transparentPlayers.clear();
    gwelPlayers.clear();
}

export function hasSkinDef(skinId) {
    return isSkinId(skinId) && diskCache.has(String(skinId));
}

export function listSkinIds() {
    return [...loadedIds];
}

/** Каталог для UI: [{ nick, id }, ...] */
export function getSkinCatalog() {
    return skinCatalog;
}

export function skinImageUrl(id) {
    return SKINS_DIR + String(id) + ".png";
}

export function getSkinColor(skinId) {
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

export function parseSkinList(text) {
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

export function parseTransparentList(text) {
    parseNickLines(text, transparentNicks);
}

export function parseGwelList(text) {
    parseNickLines(text, gwelNicks);
}

/**
 * Плавный поворот без скачка на ±π (как в agar.su main.js).
 * @returns {number} текущий угол в радианах
 */
export function updateSkinRotation(state, vx, vy) {
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

export async function loadSkinList(
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
export function drawSkinnedCell(ctx, skinId, x, y, r, opts = {}) {
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
