import { removeFromArray } from "../utils/array.js";
import { toPixiColor, colorToCss } from "../utils/colors.js";
import { getMainSegmentId } from "./segments.js";

export class Cell {
    static NAME_CACHE = new Map();

    constructor(core, id, x, y, r, _spriteUnused, name, color) {
        this.core = core;
        this.id = id;
        this.x = this.nx = this.ox = x;
        this.y = this.ny = this.oy = y;
        this.r = this.nr = this.or = r;
        this._color = color;
        this._colorNum = toPixiColor(color);
        this._drawColor = this._colorNum;
        this._name = name;
        this.updated = Date.now();
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
        this._fadingOut = false;
        this._fadeStart = 0;
        this._fadeDuration = 280;
        this._fadeStartScale = 1;
        this.destroyed = false;
        this.diedBy = 0;
        this.dead = 0;
        this._showName = false;
    }

    setPlayerId(playerId) {
        this.playerId = playerId | 0;
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
        const cellCount = this.core?.app?.cells?.length || 0;
        const threshold = cellCount > 800 ? 0.35 : 0.22;
        const simple = camS < threshold;
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
        const phase = time * 0.015 - segIdx * 0.16;
        const wave = 0.5 + 0.5 * Math.sin(phase);
        const camS = this.core?.app?.camera?.s ?? 1;
        const far = camS < 0.32;

        if (segIdx > 0) {
            this._showBoostRing = false;
            if (far) {
                this._clearBoostTint();
                return;
            }
            const t = 0.08 + 0.42 * (wave * wave);
            this._drawColor = this._mixBoostTint(t);
            this._boostTintActive = true;
            return;
        }

        if (far) {
            this._showBoostRing = false;
            this._drawColor = this._mixBoostTint(0.15 + 0.35 * wave);
            this._boostTintActive = true;
            return;
        }

        this._showBoostRing = true;
        this._boostRingAlpha = 0.5 + 0.5 * wave;
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

    static _getNameCanvas(name) {
        if (Cell.NAME_CACHE.has(name)) return Cell.NAME_CACHE.get(name);

        let fontSize = 100;
        const measure = document.createElement("canvas").getContext("2d");
        measure.font = `700 ${fontSize}px Ubuntu, Arial, sans-serif`;
        let w = measure.measureText(name).width;
        if (w > 512) {
            fontSize = Math.max(20, (512 / w) * fontSize);
            measure.font = `700 ${fontSize}px Ubuntu, Arial, sans-serif`;
            w = measure.measureText(name).width;
        }

        const pad = 16;
        const h = fontSize + pad * 2;
        const canvas = document.createElement("canvas");
        const dpr = 2;
        canvas.width = Math.ceil((w + pad * 2) * dpr);
        canvas.height = Math.ceil(h * dpr);
        const ctx = canvas.getContext("2d");
        ctx.scale(dpr, dpr);
        ctx.font = `700 ${fontSize}px Ubuntu, Arial, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineJoin = "round";
        ctx.lineWidth = 10;
        ctx.strokeStyle = "#000";
        ctx.fillStyle = "#fff";
        ctx.strokeText(name, (w + pad * 2) / 2, h / 2);
        ctx.fillText(name, (w + pad * 2) / 2, h / 2);

        const entry = { canvas, cssW: w + pad * 2, cssH: h };
        Cell.NAME_CACHE.set(name, entry);
        return entry;
    }

    set name(value) {
        if (!this.hasChanged) return;
        this._name = value;
        this.syncLabelVisibility();
    }

    get name() {
        return this._name;
    }

    set color(value) {
        if (!this.hasChanged) return;
        this._color = value;
        this._colorNum = toPixiColor(value);
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
        const delta = Math.max(Math.min((time - this.updated) / 80, 1), 0);

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

        this.boostBoosting = this._isNetworkBoosting();
        this._updateSpeedEdgeEffect(time);
    }

    draw(ctx) {
        if (!this._visible && !this._fadingOut) return;

        const r = this.r * (this.drawScale || 1);
        if (r <= 0) return;

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

        ctx.beginPath();
        ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
        ctx.fillStyle = colorToCss(this._drawColor);
        ctx.fill();

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

        if (this._showName && this._name) {
            const entry = Cell._getNameCanvas(this._name);
            // Как в Pixi: ник — дочерний спрайт клетки (локальный масштаб r/256)
            const invScale = Math.max(0.5, Math.min(1.35, 170 / Math.max(1, this.r)));
            const cellScale = this.r / 256;
            const dw = entry.cssW * invScale * cellScale;
            const dh = entry.cssH * invScale * cellScale;
            ctx.globalAlpha = alpha * this.labelAlpha;
            ctx.drawImage(entry.canvas, this.x - dw / 2, this.y - dh / 2, dw, dh);
        }

        ctx.restore();
    }

    destroy(killerId, opts) {
        if (this._fadingOut || this.destroyed) return;
        this._fadingOut = true;
        this.destroyed = true;
        this.dead = this.core.net.now || Date.now();
        this._fadeStart = this.dead;
        this._fadeStartScale = this._lastScale || (this.r / 256) || 1;

        if (killerId && !this.diedBy) {
            this.diedBy = killerId;
            this.ox = this.x;
            this.oy = this.y;
            this.updated = this.dead;
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
        this.alpha = 0;
        this._visible = false;
    }
}
