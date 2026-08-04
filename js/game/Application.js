import { MINIMAP_SIZE, worldToMinimap } from "./minimap.js";
import { getMainSegmentId, sortSegmentIds } from "./segments.js";
import { clearPlayerSkins } from "./skins.js";

const OUTSIDE_CSS = "#ffe8a8";
const GOLD_CSS = "#f0c84a";
const GRID_CSS = "rgba(168,212,232,0.55)";
const SECTOR_LINE = "rgba(126,184,208,0.35)";
const SECTOR_LABEL = "#6a9fb0";
const CYR_ROWS = ["А", "Б", "В", "Г", "Д"];

export class Application {
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
