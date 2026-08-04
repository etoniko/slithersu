import { removeFromArray } from "../utils/array.js";
import { toRgbInt, colorToCss } from "../utils/colors.js";
import { CELL_INTERP_MS } from "./cellSync.js";
import { getMainSegmentId } from "./segments.js";
import {
    skinIdForPlayer,
    drawSkinnedCell,
    isTransparentPlayer,
    isGwelPlayer,
    updateSkinRotation
} from "./skins.js";

export class Cell {
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
