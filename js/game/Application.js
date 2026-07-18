import { Cell } from "./Cell.js";
import { Star } from "./Star.js";
import { MINIMAP_SIZE, worldToMinimap } from "./minimap.js";
import { getMainSegmentId, sortSegmentIds } from "./segments.js";

export class Application {
    constructor(core) {
        this.core = core

        this.initRenderer()
        this.initMinimap()

        this.cells = []
        this.cellsByID = new Map()
        this.ownedCells = []
        this.dyingCells = []
        this.camera = {
            x: 1,
            y: 1,
            s: 1,
            w: 1,
            score: 0,
            mass: 0,
            target: {
                x: 1,
                y: 1,
                s: 1
            }
        }
        // Лимиты зума: для игры и для спектатора
        this.zoomLimits = {
            player: { min: 0.2, max: 8 }, // когда у тебя есть клетки
            spectate: { min: 0.04, max: 8 } // когда ты в спектате (без клеток)
        };
        this.zoom = 0.7;      // колесо (как старый zoom)
        this.viewZoom = 1;  // сглаженный итоговый масштаб
        // >>> Добавь это:
        this._fpsFrames = 0;
        this._fpsLast = performance.now();
        this._fpsUpdateMs = 500; // усредняем каждые ~0.5 c
        this.core.stats = this.core.stats || {};
        this.core.stats.fps = 0;
        // Кэш для оптимизации updateCamera
        this._lastPivotX = 0;
        this._lastPivotY = 0;
        this._lastScale = 1;
        this.mainCell = null;
        this.mainCellLockTime = 0;
        this.posX = 0;
        this.posY = 0;
        this.posSize = 1;
        this.isSpectating = false;
        this.boostEnergy = 1;
        this.isBoostActive = false;
        /** Голова текущей жизни (мин. node id). */
        this.headCellId = null;
        /** После смерти головы не берём хвост обратно в owned, пока не нажмём «Играть». */
        this.snakeEnded = false;
        this.loop = this.loop.bind(this)

        this.loop()
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

    /** Новая жизнь — можно снова владеть клетками. */
    prepareNewLife() {
        this.snakeEnded = false;
        this.headCellId = null;
        this.ownedCells = [];
        this.mainCell = null;
    }

    /**
     * Голова умерла / змейка снята — больше не считаем сегменты своими.
     * Хвост на экране может ещё дорисоваться, но управление и «жизнь» уже конец.
     */
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

    /** Обновить id головы = минимальный среди owned. */
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
        // CSS-пиксели, не буфер с devicePixelRatio — иначе на телефоне зум «улетает»
        const w = this.view?.clientWidth || this.renderer?.screen?.width || innerWidth;
        const h = this.view?.clientHeight || this.renderer?.screen?.height || innerHeight;
        const ratio = Math.max(h / 1080, w / 1920);
        return ratio * this.zoom;
    }

    calcViewZoom() {
        if (!this.mainCell || this.mainCell.destroyed) return;
        const size = this.mainCell.r;
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

    /** Главный сегмент = клетка с минимальным node id (id1). Камера следует за ней. */
    pickMainCell() {
        this.pruneOwnedCells();
        this.ownedCells = sortSegmentIds(this.ownedCells);
        const mainId = getMainSegmentId(this.ownedCells);
        this.mainCell = mainId != null ? this.cellsByID.get(mainId) : null;
        if (this.mainCell?.destroyed) {
            this.mainCell = null;
        }
    }

    /**
     * z-index по порядку id в цепочке каждого игрока (не по массе).
     * id1 — поверх, id2 ниже, id3 ниже id2…
     */
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

        // Еда / мёртвая еда — всегда под змейками (змейки от ~10000)
        for (let i = 0, len = this.cells.length; i < len; i++) {
            const cell = this.cells[i];
            if (!cell || cell.destroyed || cell.playerId) continue;
            const z = cell.isDeathFood ? 3 : (cell.isFood ? 2 : 1);
            if (cell._segmentZ !== z) {
                cell._segmentZ = z;
                cell.sprite.zIndex = z;
                cell._lastZIndex = z;
            }
        }
    }

    /** Всегда интерполируем свои клетки — иначе камера замирает вне экрана. */
    updateOwnedCells(now) {
        for (let i = 0; i < this.ownedCells.length; i++) {
            const cell = this.cellsByID.get(this.ownedCells[i]);
            if (cell && !cell.destroyed) {
                cell.update(now);
            }
        }
    }

    /** Позиция для камеры: главный сегмент (мин. id). update() уже вызван в updateOwnedCells. */
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


    drawBorder() {
        if (this.borderGraphics) {
            this.borderGraphics.destroy({ children: true });
            this.borderGraphics = null;
        }
        if (this.borderOutsideGfx) {
            this.borderOutsideGfx.destroy();
            this.borderOutsideGfx = null;
        }

        const border = this.core.net.border;
        if (!border?.width) return;

        const radius = Math.min(border.width, border.height) / 2;
        const cx = border.centerX ?? 0;
        const cy = border.centerY ?? 0;
        const GOLD = 0xf0c84a;
        const OUTSIDE = 0xffe8a8;
        const extent = Math.max(radius * 6, border.width * 3, 30000);

        // За границей карты — кремовый фон ВЫШЕ еды (2–3), ниже змей (~10000),
        // чтобы еда за кругом не мерцала
        const outside = new PIXI.Graphics();
        outside.position.set(cx, cy);
        outside.beginFill(OUTSIDE, 1);
        outside.drawRect(-extent, -extent, extent * 2, extent * 2);
        if (typeof outside.beginHole === "function") {
            outside.beginHole();
            outside.drawCircle(0, 0, radius);
            outside.endHole();
        }
        outside.endFill();
        outside.zIndex = 50;
        this.borderOutsideGfx = outside;
        this.stage.addChild(outside);

        // Одна золотая обводка — поверх «за картой»
        const g = new PIXI.Graphics();
        g.position.set(cx, cy);
        g.lineStyle(28, GOLD, 1);
        g.drawCircle(0, 0, radius);
        g.zIndex = 60;
        g.visible = this.core.settings.border !== false;
        outside.visible = g.visible;

        this.borderGraphics = g;
        this.stage.addChild(g);
    }

    drawBackground() {
        const border = this.core.net.border;
        const mapW = border.width;
        const mapH = border.height;

        const geometry = new PIXI.Geometry()
            .addAttribute('aVertexPosition', [
                -mapW / 2, -mapH / 2,
                mapW / 2, -mapH / 2,
                -mapW / 2, mapH / 2,
                mapW / 2, mapH / 2,
            ])
            .addAttribute('aUvs', [0, 0, 1, 0, 0, 1, 1, 1])
            .addIndex([0, 1, 2, 1, 3, 2]);

        const shader = PIXI.Shader.from(`
precision highp float;
attribute vec2 aVertexPosition;
attribute vec2 aUvs;
uniform mat3 translationMatrix;
uniform mat3 projectionMatrix;
varying vec2 vUvs;
void main() {
  vUvs = aUvs;
  gl_Position = vec4((projectionMatrix * translationMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
}
  `, `
precision highp float;
varying vec2 vUvs;

uniform vec2 uCenter;

// Максимально плавный градиент
float smoothGradient(float t) {
  t = clamp(t, 0.0, 1.0);
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

// Дизеринг против banding
float noise(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 uv = vUvs;
  float dist = length(uv - uCenter); // 0..~0.707

  // Нормализуем расстояние: 0 = центр, 1 = угол
  float t = dist / 0.65; 

  // Инвертируем: центр = 1, края = 0
  float intensity = 0.9 - smoothGradient(t);

  // Светлый «игровой дворик» для детской стилистики
  vec3 centerColor = vec3(0.72, 0.92, 0.98); // мягкий небо-голубой
  vec3 edgeColor   = vec3(0.55, 0.82, 0.78); // мятный край

  vec3 color = mix(edgeColor, centerColor, intensity);

  // Дизеринг
  color += (noise(uv * 1200.0) - 0.5) * 0.018;

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
  `, {
            uCenter: [0.5, 0.5]
        });

        const bg = new PIXI.Mesh(geometry, shader);
        bg.position.set(0, 0);
        bg.zIndex = -1000;
        bg.visible = this.core.settings.background;
        this.stage.addChild(bg);
        this.backgroundSprite = bg;
    }




    performHueShifting() {
        this.hueDegree += 1
        if (this.hueDegree > 360) this.hueDegree = 0
        this.colorMatrix.hue(this.hueDegree)
        this.hueShiftingRAF = requestAnimationFrame(this.performHueShifting.bind(this))
    }

    drawGrid() {
        if (this.gridSprite) this.gridSprite.destroy()

        const border = this.core.net.border
        const g = new PIXI.Graphics()
        const width = 100
        const height = 100
        g.lineStyle(10, 0xa8d4e8, 0.55)
        g.moveTo(width, 0)
        g.lineTo(0, 0)
        g.moveTo(width / 2, height / 2)
        g.lineTo(width / 2, -height / 2)
        const texture = this.renderer.generateTexture(g, {
            scaleMode: PIXI.SCALE_MODES.LINEAR,
            resolution: this.renderDpr || this.renderer.resolution || 1,
            region: new PIXI.Rectangle(0, 0, width / 2, height / 2)
        })
        texture.baseTexture.scaleMode = PIXI.SCALE_MODES.LINEAR
        texture.baseTexture.mipmapMode = PIXI.MIPMAP_MODES.ON
        this.gridSprite = new PIXI.TilingSprite(texture, border.width, border.height)
        this.gridSprite.position.set(-border.width / 2, -border.height / 2)
        this.gridSprite.visible = this.core.settings.grid

        this.stage.addChild(this.gridSprite)
    }

    drawSectors() {
        if (this.sectorContainer) this.sectorContainer.destroy()

        const labels = []
        const rows = 5
        const cols = 5
        const sectorSize = this.core.net.border.width / 5
        this.sectorContainer = new PIXI.Container()
        for (let row = 0; row < rows; row++) {
            labels[row] = []
            for (let col = 0; col < cols; col++) {
                const square = new PIXI.Graphics()
                square.lineStyle(80, 0x7eb8d0, 0.35)
                square.drawRect(0, 0, sectorSize, sectorSize);
                square.position.set(col * sectorSize, row * sectorSize)
                const cyrRows = ["А", "Б", "В", "Г", "Д"];
                const label = new PIXI.Text(cyrRows[row] + (col + 1), {
                    fontFamily: 'Nunito, Ubuntu, Arial, sans-serif',
                    fontWeight: '700',
                    fontSize: 1024,
                    fill: 0x6a9fb0
                })
                label.position.set(
                    col * sectorSize + (sectorSize - label.width) / 2,
                    row * sectorSize + (sectorSize - label.height) / 2
                )
                const sector = new PIXI.Container()
                sector.addChild(square, label)
                this.sectorContainer.addChild(sector)
            }
        }
        this.sectorContainer.position.set(-1 * sectorSize * 5 / 2, -1 * sectorSize * 5 / 2)
        this.sectorContainer.visible = this.core.settings.sectors

        this.stage.addChild(this.sectorContainer)
    }

    initMinimap() {
        const view = this.minimapView = document.getElementById("minimap-view");
        this.minimapRenderer = PIXI.autoDetectRenderer({
            view,
            width: MINIMAP_SIZE,
            height: MINIMAP_SIZE,
            backgroundAlpha: 0,
            antialias: false
        });

        this.minimapStage = new PIXI.Container();

        this.minimapBorderGfx = new PIXI.Graphics();
        this.minimapStage.addChild(this.minimapBorderGfx);

        // Серые точки — другие игроки и боты
        this.minimapPlayersGfx = new PIXI.Graphics();
        this.minimapStage.addChild(this.minimapPlayersGfx);

        // Свой маркер поверх
        const sprite = this.minimapEntity = new PIXI.Sprite(PIXI.Texture.WHITE);
        sprite.width = 8;
        sprite.height = 8;
        sprite.tint = 0xff4444;
        sprite.anchor.set(0.5);
        this.minimapStage.addChild(sprite);
    }

    drawMinimapBorder() {
        if (!this.minimapBorderGfx) return;
        const border = this.core?.net?.border;
        if (!border?.width) return;

        const GOLD = 0xf0c84a;
        const OUTSIDE = 0xffe8a8;
        this.minimapBorderGfx.clear();

        // Фон миникарты — цвет «за границей»
        this.minimapBorderGfx.beginFill(OUTSIDE, 1);
        this.minimapBorderGfx.drawRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
        this.minimapBorderGfx.endFill();

        if (border.centerX != null && border.width) {
            const r = border.width / 2;
            const cx = ((border.centerX - border.left) / border.width) * MINIMAP_SIZE;
            const cy = ((border.centerY - border.top) / border.height) * MINIMAP_SIZE;
            const scale = MINIMAP_SIZE / border.width;
            const rr = r * scale;

            // Внутри круга — чуть прозрачнее, чтобы сетка читалась
            this.minimapBorderGfx.beginFill(0xffffff, 0.25);
            this.minimapBorderGfx.drawCircle(cx, cy, rr);
            this.minimapBorderGfx.endFill();

            this.minimapBorderGfx.lineStyle(2, GOLD, 1);
            this.minimapBorderGfx.drawCircle(cx, cy, rr);
        }
    }

    updateMinimap() {
        if (!this.minimapEntity) return;
        const border = this.core?.net?.border;
        if (!border?.width) return;

        const { x, y } = worldToMinimap(this.posX, this.posY, border);
        this.minimapEntity.position.set(x, y);

        const gfx = this.minimapPlayersGfx;
        if (!gfx) return;
        gfx.clear();

        const ownerId = this.core?.net?.ownerPlayerId >>> 0;
        const serverDots = this.core?.net?.minimapPlayers || [];

        gfx.beginFill(0x8a8a8a, 0.95);
        for (let i = 0; i < serverDots.length; i++) {
            const d = serverDots[i];
            if (!d) continue;
            if (ownerId && (d.pID >>> 0) === ownerId) continue; // себя — красный маркер
            const p = worldToMinimap(d.x, d.y, border);
            gfx.drawCircle(p.x, p.y, 3);
        }
        gfx.endFill();
    }

    initRenderer() {
        const view = this.view = document.getElementById("view")
        const w = Math.max(1, Math.floor(window.visualViewport?.width || innerWidth));
        const h = Math.max(1, Math.floor(window.visualViewport?.height || innerHeight));
        // На телефонах DPR часто 2–3 — не режем до 2, иначе картинка мыльная
        const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), 3);
        this.renderDpr = dpr;

        if (PIXI.settings) {
            PIXI.settings.ROUND_PIXELS = false;
            PIXI.settings.RESOLUTION = dpr;
            if (PIXI.settings.SCALE_MODE != null) {
                PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.LINEAR;
            }
        }

        this.renderer = PIXI.autoDetectRenderer({
            view,
            width: w,
            height: h,
            antialias: true,
            resolution: dpr,
            autoDensity: true,
            powerPreference: 'high-performance',
            backgroundColor: 0xffe8a8,
            backgroundAlpha: 1,
            hello: false
        })
        this.stage = new PIXI.Container()
        this.stage.sortableChildren = true
        this.stage.position.set(w / 2, h / 2);

        const circle = new PIXI.Graphics()
        circle.beginFill(0xffffff)
        circle.drawCircle(256, 256, 256)
        circle.endFill();

        const star = new PIXI.Graphics()
            .beginFill(0xffffff)
            .lineStyle(10, 0x777777, 1)
            .drawPolygon(new Star(256, 256, 30, 256, 220, 0))
            .endFill();

        // Текстура клетки в DPR — чёткие круги на Retina
        const cellRenderTexture = PIXI.RenderTexture.create({
            width: 512,
            height: 512,
            resolution: dpr,
            scaleMode: PIXI.SCALE_MODES.LINEAR
        })
        this.renderer.render(circle, { renderTexture: cellRenderTexture })
        cellRenderTexture.baseTexture.scaleMode = PIXI.SCALE_MODES.LINEAR
        cellRenderTexture.baseTexture.mipmapMode = PIXI.MIPMAP_MODES.ON


        this.textures = { cell: cellRenderTexture }

        Cell.SPRITE = new PIXI.Sprite(cellRenderTexture)
    }


    loop(now = performance.now()) {
        this.now = Date.now();

        // Оптимизация: убрали slice(0) - итерируемся напрямую по массиву
        // Оптимизация: добавляем frustum culling для видимых клеток
        const cam = this.camera;
        const rect = this.view.getBoundingClientRect();
        const viewWidth = rect.width / cam.s;
        const viewHeight = rect.height / cam.s;
        const viewLeft = cam.x - viewWidth / 2;
        const viewRight = cam.x + viewWidth / 2;
        const viewTop = cam.y - viewHeight / 2;
        const viewBottom = cam.y + viewHeight / 2;

        const ownedSet = new Set(this.ownedCells);
        this.applySegmentLayers();
        this.updateOwnedCells(this.now);

        for (let i = 0, len = this.cells.length; i < len; i++) {
            const cell = this.cells[i];
            if (!cell || cell.destroyed) continue;

            const isOwned = ownedSet.has(cell.id);
            if (isOwned) continue;

            // Cull по серверным nx/ny — иначе клетка «застывает» вне экрана
            // и больше не появляется (дыры в середине чужих змей).
            const cx = Number.isFinite(cell.nx) ? cell.nx : cell.x;
            const cy = Number.isFinite(cell.ny) ? cell.ny : cell.y;
            const cr = (Number.isFinite(cell.nr) ? cell.nr : cell.r) || 0;
            const margin = Math.max(80, cr * 2);
            const isVisible = !(cx + cr < viewLeft - margin || cx - cr > viewRight + margin ||
                cy + cr < viewTop - margin || cy - cr > viewBottom + margin);

            // Сегменты змей всегда интерполируем (даже чуть вне экрана)
            const isSnake = !!cell.playerId;
            if (isVisible || isSnake) {
                cell.update(this.now);
            }

            if (isVisible !== cell._visible) {
                cell._visible = isVisible;
                if (cell.sprite) cell.sprite.visible = isVisible;
            }
        }

        for (let i = 0; i < this.ownedCells.length; i++) {
            const cell = this.cellsByID.get(this.ownedCells[i]);
            if (cell && !cell.destroyed) {
                cell._visible = true;
                cell.sprite.visible = true;
            }
        }

        // Плавное исчезновение удалённых клеток
        if (this.dyingCells.length) {
            for (let i = this.dyingCells.length - 1; i >= 0; i--) {
                const cell = this.dyingCells[i];
                if (!cell || cell.updateFade(this.now)) {
                    this.dyingCells.splice(i, 1);
                }
            }
        }

        this.updateCamera();

        this.renderer.render(this.stage);
        this.minimapRenderer.render(this.minimapStage);

        // >>> Подсчёт FPS
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
        this.stage.removeChildren()
        this.cells = []
        this.cellsByID = new Map()
        this.ownedCells = []
        this.mainCell = null
        this.headCellId = null
        this.snakeEnded = false
        this.borderGraphics = null
        this.borderOutsideGfx = null
        this.backgroundSprite = null
        this.gridSprite = null
        this.sectorContainer = null
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
            this.camera.x = (this.camera.x + this.posX) / 2;
            this.camera.y = (this.camera.y + this.posY) / 2;
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
        // camera.score — очки за еду с сервера, не трогаем здесь

        if (this._lastPivotX !== this.camera.x || this._lastPivotY !== this.camera.y) {
            this.stage.pivot.set(this.camera.x, this.camera.y);
            this._lastPivotX = this.camera.x;
            this._lastPivotY = this.camera.y;
        }

        if (this._lastScale !== this.camera.s) {
            this.stage.scale.set(this.camera.s);
            this._lastScale = this.camera.s;
        }

        const viewRect = this.view.getBoundingClientRect();
        this.stage.position.set(viewRect.width / 2, viewRect.height / 2);

        this.updateMinimap();
    }



}
