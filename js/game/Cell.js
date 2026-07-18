import { removeFromArray } from "../utils/array.js";
import { snapBoostEnergy, BOOST_SEGMENTS } from "./boostConstants.js";
import { toPixiColor } from "../utils/colors.js";
import { getMainSegmentId } from "./segments.js";

export class Cell {
    static NAME_CACHE = new Map()
    static MASS_POOL = new Array()
    static SPRITE //pixi.sprite set later


    constructor(core, id, x, y, r, sprite, name, color) {
        this.core = core
        this.sprite = sprite
        this.id = id
        this.x = this.nx = this.ox = x
        this.y = this.ny = this.oy = y
        this.r = this.nr = this.or = r
        this._color = color
        this._colorNum = toPixiColor(color)
        if (this.sprite) this.sprite.tint = this._colorNum
        this._name = name
        this.updated = Date.now()
        this.hasChanged = true
        this.skinSprite = null;
        this.skinMask = null;
        // Кэш для оптимизации обновлений
        this._lastScale = r / 256;
        this._lastZIndex = id;
        this._visible = true;
        this.playerId = 0;
        this.segmentIndex = -1;
        this._segmentZ = id;
        this.isFood = false;
        this.isDeathFood = false;
        this.foodDecor = null;
        this.boostEnergy = 0;
        this.boostEnergyTarget = 0;
        this.boostEnergyVisual = 0;
        this._boostBlackDrawn = -1;
        this.boostBoosting = false;
        this.boostStateKnown = false;
        this.boostAuraWrap = null;
        this.boostAuraGfx = null;
        this.boostSpeedLinesGfx = null;
        this._lastAuraFrame = -1;
        this.speedEdgeWrap = null;
        this.speedEdgeGfx = null;
        this._lastSpeedEdgeFrame = -1;
        this._lastMoveAngle = 0;
        this._fadingOut = false;
        this._fadeStart = 0;
        this._fadeDuration = 280;
        this._fadeStartScale = 1;
        this.destroyed = false;
        this.diedBy = 0;
        this.dead = 0;

        this.sprite.scale.set(r/ 256);
        this.sprite.zIndex = this._segmentZ;
        this.sprite.sortableChildren = true;
    }

    setPlayerId(playerId) {
        this.playerId = playerId | 0;
    }

    /** Еда: вблизи — блеск, при сильном отдалении — простой круг (экономия FPS). */
    setAsFood() {
        this.isFood = true;
        this.isDeathFood = false;
        this.sprite.zIndex = 2;
        this._segmentZ = 2;
        this._foodSimple = null;
        this._updateFoodLod(true);
    }

    /**
     * Куски после смерти / eject: вид как у еды, чуть крупнее обычной еды карты.
     */
    setAsDeathFood() {
        this.isFood = true;
        this.isDeathFood = true;
        this.playerId = 0;
        this.sprite.zIndex = 3;
        this._segmentZ = 3;

        // Убрать ник и скин — это уже «еда»
        if (this.nameSprite) {
            this.nameSprite.destroy();
            this.nameSprite = null;
        }
        if (this.massSprite) {
            this.massSprite.destroy();
            this.massSprite = null;
        }
        if (this.skinSprite) {
            this.skinSprite.destroy({ children: true });
            this.skinSprite = null;
        }
        if (this.skinMask) {
            this.skinMask.destroy();
            this.skinMask = null;
        }
        this._name = '';
        this._hideSpeedEdge?.();

        const foodMax = this.core?.net?.foodMaxSize || 12;
        this._foodVisualCap = foodMax * 1.55 + 2;

        // Сразу визуально подогнать размер
        if (this.r > this._foodVisualCap) {
            this.r = this.or = this.nr = this._foodVisualCap;
            const s = this.r / 256;
            this.sprite.scale.set(s);
            this._lastScale = s;
        }

        this._foodSimple = null;
        this._updateFoodLod(true);
    }

    /**
     * LOD еды: далеко (zoom out) — только tint, без Graphics-декора.
     */
    _updateFoodLod(force = false) {
        if (!this.isFood || !this.sprite) return;
        const camS = this.core?.app?.camera?.s ?? 1;
        const simple = camS < 0.42;
        if (!force && this._foodSimple === simple) return;
        this._foodSimple = simple;

        if (simple) {
            if (this.foodDecor) {
                this.foodDecor.destroy({ children: true });
                this.foodDecor = null;
            }
            this.sprite.tint = this._colorNum >>> 0;
            return;
        }

        this._refreshFoodDecor();
    }

    _refreshFoodDecor() {
        if (!this.sprite || this._foodSimple) return;
        if (this.foodDecor) {
            this.foodDecor.destroy({ children: true });
            this.foodDecor = null;
        }
        const color = this._colorNum >>> 0;
        const wrap = new PIXI.Container();
        wrap.zIndex = -1;

        const glow = new PIXI.Graphics();
        glow.beginFill(color, 0.35);
        glow.drawCircle(0, 0, 320);
        glow.endFill();
        glow.beginFill(0xffffff, 0.18);
        glow.drawCircle(0, 0, 280);
        glow.endFill();
        wrap.addChild(glow);

        const gloss = new PIXI.Graphics();
        gloss.beginFill(0xffffff, 0.55);
        gloss.drawCircle(-70, -90, 70);
        gloss.endFill();
        gloss.beginFill(0xffffff, 0.25);
        gloss.drawCircle(90, 100, 40);
        gloss.endFill();
        gloss.zIndex = 10;
        wrap.addChild(gloss);

        this.sprite.addChildAt(wrap, 0);
        this.foodDecor = wrap;
        this.sprite.tint = color;
    }

    /** Порядок в цепочке сегментов (0 = голова с минимальным id). */
    setSegmentOrder(segmentIndex, segmentCount) {
        const prevIndex = this.segmentIndex;
        this.segmentIndex = segmentIndex;
        const z = segmentCount > 0 && segmentIndex >= 0
            ? 10000 + (segmentCount - segmentIndex) * 4
            : this.id;
        if (this._segmentZ !== z) {
            this._segmentZ = z;
            this.sprite.zIndex = z;
            this._lastZIndex = z;
            if (this.skinSprite) this.skinSprite.zIndex = z + 2;
            if (this.skinMask) this.skinMask.zIndex = z + 3;
        }
        if (prevIndex !== segmentIndex) {
            this.syncLabelVisibility();
        }
    }

    /** Клетка, на которой надо показывать ник/индикаторы. */
    isPrimaryDisplayCell() {
        if (!this.playerId) return true;
        const ownerId = this.core?.net?.ownerPlayerId ?? 0;
        const mainId = this.core?.app?.mainCell?.id;
        if (ownerId && this.playerId === ownerId && mainId != null) {
            return this.id === mainId;
        }
        // Для других игроков: голова/еще не разложенные сегменты.
        return this.segmentIndex <= 0;
    }

    /** Имя и масса на основной клетке. */
    shouldShowNameAndMass() {
        if (this.isFood) return false;
        return this.isPrimaryDisplayCell();
    }

    getDisplayMass() {
        return this._mass ?? Math.round(this.r * this.r / 100);
    }

    /** Индикатор boost отключён. */
    shouldShowBoostBar() {
        return false;
    }

    /** Серверное состояние boost (источник истины). */
    setBoostState(energy, boosting) {
        const e = Math.max(0, Math.min(1, energy ?? 0));
        this.boostEnergy = e;
        this.boostEnergyTarget = e;
        this.boostEnergyVisual = e;
        this.boostBoosting = !!boosting;
        this.boostStateKnown = true;
    }

    /** Для строгого синхрона визуал всегда равен последнему серверному значению. */
    _tickBoostVisual(deltaMs) {
        void deltaMs;
        if (!this.boostStateKnown) return;
        this.boostEnergyVisual = this.boostEnergyTarget;
    }

    syncLabelVisibility() {
        const showName = this.shouldShowNameAndMass();
        const showBoost = this.shouldShowBoostBar();
        const visKey = `${showName ? 1 : 0}|${showBoost ? 1 : 0}|${this._name}|${this.core.settings.names ? 1 : 0}`;
        if (this._labelVisKey === visKey) return;
        this._labelVisKey = visKey;

        if (!showName) {
            if (this.nameSprite) {
                this.nameSprite.destroy();
                this.nameSprite = null;
            }
            if (this.massSprite) {
                this.massSprite.destroy();
                this.massSprite = null;
            }
            if (this.boostBarWrap) {
                this.boostBarWrap.visible = false;
            }
            return;
        }
        if (this.core.settings.names && this._name) {
            this._setNameSprite(this._name);
        } else if (this.playerId && this._name) {
            this._setNameSprite(this._name);
        }

        if (showBoost && this.massSprite) {
            this.massSprite.destroy();
            this.massSprite = null;
        }

        if (showBoost) {
            this._ensureBoostBar();
            this.boostBarWrap.visible = true;
            this._boostLayoutKey = null;
            this.updateBoostBar(this.boostEnergy, this.boostBoosting);
        } else if (this.boostBarWrap) {
            this.boostBarWrap.visible = false;
        }

        this.setLabelAlpha(this.core.app.isSpectating ? 0.5 : 1);
    }

    _ensureBoostBar() {
        if (!this.boostBarGfx) {
            if (!this.boostBarWrap) {
                this.boostBarWrap = new PIXI.Container();
                this.boostBarWrap.zIndex = 20000;
                this.sprite.addChild(this.boostBarWrap);
            }
            this.boostBarGfx = new PIXI.Graphics();
            this.boostBarWrap.addChild(this.boostBarGfx);
        }
        if (!this.sprite.sortableChildren) {
            this.sprite.sortableChildren = true;
        }
        this._bringBoostBarToFront();
    }

    _bringBoostBarToFront() {
        if (!this.boostBarWrap || !this.sprite) return;
        this.boostBarWrap.zIndex = 20000;
        if (this.sprite.sortableChildren) {
            this.sprite.setChildIndex(this.boostBarWrap, this.sprite.children.length - 1);
        }
    }

    _ensureBoostAura() {
        if (!this.boostAuraWrap) {
            this.boostAuraWrap = new PIXI.Container();
            this.boostAuraWrap.zIndex = 15000;
            this.sprite.addChild(this.boostAuraWrap);
        }
        if (!this.boostAuraGfx) {
            this.boostAuraGfx = new PIXI.Graphics();
            this.boostAuraWrap.addChild(this.boostAuraGfx);
        }
        if (!this.boostSpeedLinesGfx) {
            this.boostSpeedLinesGfx = new PIXI.Graphics();
            this.boostAuraWrap.addChild(this.boostSpeedLinesGfx);
        }
        if (!this.sprite.sortableChildren) this.sprite.sortableChildren = true;
    }

    _hideSpeedEdge() {
        if (this.speedEdgeWrap) {
            this.speedEdgeWrap.visible = false;
            if (this.speedEdgeGfx) this.speedEdgeGfx.clear();
        }
        this._edgeGeomKey = null;
        this._lastSpeedEdgeFrame = -1;
        this._clearBoostTint();
    }

    _clearBoostTint() {
        if (!this._boostTintActive || !this.sprite) return;
        this.sprite.tint = this._colorNum >>> 0;
        this._boostTintActive = false;
    }

    /** Смешать цвет клетки к белому (t 0..1) — дёшевая «волна» буста по телу. */
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

    _ensureSpeedEdge() {
        if (!this.speedEdgeWrap) {
            this.speedEdgeWrap = new PIXI.Container();
            this.speedEdgeWrap.zIndex = 50;
            this.sprite.addChild(this.speedEdgeWrap);
        }
        if (!this.speedEdgeGfx) {
            this.speedEdgeGfx = new PIXI.Graphics();
            this.speedEdgeWrap.addChild(this.speedEdgeGfx);
        }
        if (!this.sprite.sortableChildren) this.sprite.sortableChildren = true;
    }

    /**
     * Boost для длинных змеек (100–200+ сегментов):
     * - голова: яркое кольцо цвета клетки
     * - тело: волна яркости через tint (без Graphics — не лагает)
     */
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

        // ——— ТЕЛО: только tint-волна (O(1) на сегмент, без draw) ———
        if (segIdx > 0) {
            if (this.speedEdgeWrap) this.speedEdgeWrap.visible = false;
            if (far) {
                this._clearBoostTint();
                return;
            }
            // Голова → хвост: вспышка белым поверх цвета сервера
            const t = 0.08 + 0.42 * (wave * wave);
            this.sprite.tint = this._mixBoostTint(t);
            this._boostTintActive = true;
            return;
        }

        // ——— ГОЛОВА: кольцо + лёгкая подсветка ———
        if (far) {
            // далеко — тоже только tint, без Graphics
            if (this.speedEdgeWrap) this.speedEdgeWrap.visible = false;
            this.sprite.tint = this._mixBoostTint(0.15 + 0.35 * wave);
            this._boostTintActive = true;
            return;
        }

        this._ensureSpeedEdge();
        this.speedEdgeWrap.visible = true;
        this.speedEdgeWrap.alpha = 0.5 + 0.5 * wave;

        this.sprite.tint = this._mixBoostTint(0.18 + 0.32 * wave);
        this._boostTintActive = true;

        const cellColor = this._colorNum >>> 0;
        const geomKey = `${(this.r * 0.5) | 0}|${cellColor}`;
        if (geomKey === this._edgeGeomKey) return;
        this._edgeGeomKey = geomKey;

        const g = this.speedEdgeGfx;
        g.clear();
        const R = 256;
        const setLine = (w, col, a) => {
            try { g.lineStyle({ width: w, color: col, alpha: a, alignment: 0.5 }); }
            catch (_) { g.lineStyle(w, col, a); }
        };
        // Мягкое внешнее + чёткое кольцо цвета клетки
        setLine(36, cellColor, 0.35);
        g.drawCircle(0, 0, R + 14);
        setLine(18, cellColor, 0.95);
        g.drawCircle(0, 0, R + 4);
        setLine(8, 0xffffff, 0.35);
        g.drawCircle(0, 0, R + 2);
    }

    _hideBoostAura() {
        if (!this.boostAuraWrap) return;
        this.boostAuraWrap.visible = false;
        this._lastAuraFrame = -1;
    }

    _isNetworkBoosting() {
        if (!this.playerId) return false;
        const st = this.core.net.playerBoost.get(this.playerId);
        return !!(st && st.boosting);
    }

    _updateBoostAura(time) {
        void time;
        this._hideBoostAura();
    }

  /** Позиция ряда квадратиков под name (локальные координаты, R=256). */
    _getBoostBarLayout() {
        const R = 256;
        const gap = R * 0.045;
        const segGap = R * 0.018;
        const segH = R * 0.09;
        const segW = R * 0.075;
        const barW = segW * BOOST_SEGMENTS + segGap * (BOOST_SEGMENTS - 1);
        const barH = segH + R * 0.02;

        let y = R * 0.2;
        if (this.nameSprite?.texture) {
            const nameH = this.nameSprite.texture.height;
            y = nameH / 2 + gap + barH / 2;
        }

        return { barW, barH, y, segW, segH, segGap };
    }

    /**
     * Индикатор под ником: 8 слотов.
     * Белые = доступный boost, тёмные = потраченный boost (по серверному energy).
     */
    updateBoostBar(energy, boosting = false) {
        if (!this.shouldShowBoostBar()) {
            if (this.boostBarWrap) this.boostBarWrap.visible = false;
            return;
        }
        this._ensureBoostBar();
        this.boostBarWrap.visible = true;

        const e = Math.max(0, Math.min(1, energy ?? 0));
        const layout = this._getBoostBarLayout();
        const energyKey = Math.round(snapBoostEnergy(e) * BOOST_SEGMENTS);
        const layoutKey = `${layout.y}|${layout.barW}|${this.boostStateKnown ? 1 : 0}|${energyKey}`;

        if (layoutKey === this._boostLayoutKey && boosting === this._boostBoostingDrawn) {
            return;
        }
        this._boostLayoutKey = layoutKey;
        this._boostBoostingDrawn = boosting;

        const { barW, barH, y, segW, segH, segGap } = layout;
        const left = -barW / 2;
        const top = y - barH / 2;
        const g = this.boostBarGfx;
        g.clear();

        // Поле индикатора всегда видно.
        g.lineStyle(0);
        g.beginFill(0x0f0f0f, 0.65);
        g.drawRoundedRect(left - 4, top - 4, barW + 8, barH + 8, 6);
        g.endFill();

        const litFloat = this.boostStateKnown ? (e * BOOST_SEGMENTS) : 0;
        const r = Math.min(segW, segH) * 0.22;

        for (let i = 0; i < BOOST_SEGMENTS; i++) {
            const sx = left + i * (segW + segGap);
            const sy = top + (barH - segH) / 2;
            const fill = Math.max(0, Math.min(1, litFloat - i));

            if (fill > 0) {
                g.lineStyle(0);
                g.beginFill(boosting ? 0xffffff : 0xf2f2f2, 1);
                g.drawRoundedRect(sx, sy, segW * fill, segH, r);
                g.endFill();
                g.lineStyle(2, 0xbdbdbd, 0.95);
                g.drawRoundedRect(sx, sy, segW, segH, r);
            } else {
                g.lineStyle(0);
                g.beginFill(0x161616, this.boostStateKnown ? 1 : 0.65);
                g.drawRoundedRect(sx, sy, segW, segH, r);
                g.endFill();
                g.lineStyle(2, 0x3e3e3e, 0.95);
                g.drawRoundedRect(sx, sy, segW, segH, r);
            }
        }

        this._bringBoostBarToFront();
    }

    setLabelAlpha(alpha) {
        if (this.nameSprite) this.nameSprite.alpha = alpha;
        if (this.boostBarWrap) this.boostBarWrap.alpha = alpha;
    }

    _applySkin(name) {
        if (!this.core?.skins) return;
        if (this.core.settings.skins) {
            this.core.skins.applyToCell(this, name);
            this._bringBoostBarToFront();
        } else if (this.skinSprite) {
            this.skinSprite.destroy({ children: true });
            this.skinSprite = null;
            if (this.skinMask) {
                this.skinMask.destroy();
                this.skinMask = null;
            }
        }
    }

    _getNameTexture(name) {
        const MAX_WIDTH = 512; // максимально допустимая ширина имени
        let fontSize = 100; // базовый размер шрифта

        // Создаём временный текст для измерения ширины
        let text = new PIXI.Text(name, {
            fontFamily: 'Ubuntu, Arial, sans-serif',
            fontWeight: '700',
            fontSize: fontSize,
            lineJoin: "round",
            fill: "white",
            stroke: "black",
            strokeThickness: 10
        });

        // Если текст слишком широкий, уменьшаем шрифт пропорционально
        const maxWidth = MAX_WIDTH;
        if (text.width > maxWidth) {
            fontSize = Math.max(20, (maxWidth / text.width) * fontSize);
            text.style.fontSize = fontSize;
        }

        // Генерация текстуры
        const texture = this.core.app.renderer.generateTexture(text, {
            resolution: 3,
            scaleMode: PIXI.SCALE_MODES.LINEAR
        });

        texture.baseTexture.mipmapMode = PIXI.MIPMAP_MODES.ON;
        Cell.NAME_CACHE.set(name, texture);
        text.destroy();

        return texture;
    }


    _getMassInstance() {
        const mass = Cell.MASS_POOL.shift();
        if (mass) return mass;
        return new PIXI.Text("", {
            fontFamily: 'Ubuntu, Arial, sans-serif',
            fontWeight: '700',
            fontSize: 50,
            fill: "white",
            stroke: "black",
            strokeThickness: 6,
            lineJoin: "round"
        });
    }

    _setNameSprite(value) {
        const fallbackName = this.core?.store?.name || "Игрок";
        const nameValue = (value && String(value).trim().length) ? String(value) : fallbackName;
        let nameSprite;
        if (Cell.NAME_CACHE.has(nameValue)) {
            nameSprite = new PIXI.Sprite(Cell.NAME_CACHE.get(nameValue));
        } else {
            nameSprite = new PIXI.Sprite(this._getNameTexture(nameValue));
        }
        if (this.nameSprite) this.nameSprite.destroy();
        nameSprite.anchor.set(0.5);
        nameSprite.zIndex = 25000;
        this.sprite.addChild(nameSprite);
        this.nameSprite = nameSprite;
        this._positionNameSprite();
        if (this.shouldShowBoostBar() && this.boostBarWrap?.visible) {
            this._boostBlackDrawn = -1;
            this.updateBoostBar(this.boostEnergy, this.boostBoosting);
        }
    }

    _positionNameSprite() {
        if (!this.nameSprite) return;
        // Ник внутри клетки: центр + ограниченный масштаб.
        const invScale = Math.max(0.5, Math.min(1.35, 170 / Math.max(1, this.r)));
        this.nameSprite.scale.set(invScale);
        this.nameSprite.y = 0;
        if (this.sprite.sortableChildren) {
            this.sprite.setChildIndex(this.nameSprite, this.sprite.children.length - 1);
        }
    }

    set name(value) {
        if (!this.hasChanged) return;
        this._name = value;
        this._applySkin(value);
        this.syncLabelVisibility();
    }


    get name() {
        return this._name
    }

    set color(value) {
        if (!this.hasChanged) return
        this._color = value
        this._colorNum = toPixiColor(value)
        this.sprite.tint = this._colorNum
        if (this.isFood && !this._foodSimple) this._refreshFoodDecor()
    }

    get color() {
        return this._color
    }

    /** Числовой цвет клетки с сервера (для PIXI). */
    get colorNum() {
        return this._colorNum >>> 0
    }

    get mass() {
        return this._mass
    }

    set mass(value) {
        this._mass = value;
        // Показ массы на клетках отключён
        if (this.massSprite) {
            this.massSprite.destroy();
            this.massSprite = null;
        }
    }


    update(time) {
        const delta = Math.max(Math.min((time - this.updated) / 80, 1), 0)

        if (this.hasChanged) {
            this.color = this.color;
            this.name = this.name;
            this.hasChanged = false;
        }

        this.x = this.ox + (this.nx - this.ox) * delta;
        this.y = this.oy + (this.ny - this.oy) * delta;
        this.r = this.or + (this.nr - this.or) * delta;

        if (this.isFood) {
            this._updateFoodLod();
            if (this.sprite.x !== this.x || this.sprite.y !== this.y) {
                this.sprite.x = this.x;
                this.sprite.y = this.y;
            }
            const fs = this.r / 256;
            if (this._lastScale !== fs) {
                this.sprite.scale.set(fs);
                this._lastScale = fs;
            }
            return;
        }

        const massVal = Math.round(this.r * this.r / 100);
        if (this.shouldShowNameAndMass()) {
            this.mass = massVal;
        } else {
            this._mass = massVal;
        }

        // Оптимизация: обновляем позицию только если изменилась
        if (this.sprite.x !== this.x || this.sprite.y !== this.y) {
            this.sprite.x = this.x;
            this.sprite.y = this.y;
        }

        // Оптимизация: обновляем масштаб только если изменился (кэшируем предыдущее значение)
        const s = this.r / 256; // 512px база → r/256
        if (this._lastScale !== s) {
            this.sprite.scale.set(s);
            this._lastScale = s;
        }
        this._positionNameSprite();

        if (this._lastZIndex !== this._segmentZ) {
            this.sprite.zIndex = this._segmentZ;
            this._lastZIndex = this._segmentZ;
        }

        if (this.shouldShowBoostBar()) {
            const st = this.core.net.playerBoost.get(this.playerId);
            if (st) {
                const visKey = `${Math.round(snapBoostEnergy(st.energy) * BOOST_SEGMENTS)}|${st.boosting ? 1 : 0}`;
                if (this._boostVisKey !== visKey) {
                    this._boostVisKey = visKey;
                    this.setBoostState(st.energy, st.boosting);
                    this.updateBoostBar(this.boostEnergyTarget, this.boostBoosting);
                }
            }
        } else {
            this._boostVisKey = null;
            if (this.boostBarWrap?.visible) {
                this.boostBarWrap.visible = false;
            }
        }

        this.boostBoosting = this._isNetworkBoosting();
        this._updateSpeedEdgeEffect(time);
        this._updateBoostAura(time);
    }


    /**
     * Плавное исчезновение клетки (хвост / съедение).
     * Сразу убираем из логики, спрайт гасим и чуть сжимаем.
     * @param {number|null} killerId
     * @param {{ instant?: boolean }} [opts] — без fade (уход из FOV)
     */
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
        if (this.boostAuraWrap) {
            this.boostAuraWrap.visible = false;
        }
        if (this.nameSprite) this.nameSprite.visible = false;
        if (this.massSprite) this.massSprite.visible = false;
        if (this.boostBarWrap) this.boostBarWrap.visible = false;

        if (opts && opts.instant) {
            this._finishDestroy();
            return;
        }

        if (!this.core.app.dyingCells) this.core.app.dyingCells = [];
        this.core.app.dyingCells.push(this);
    }

    /** @returns {boolean} true если анимация закончена */
    updateFade(now) {
        if (!this._fadingOut || !this.sprite) return true;

        const dur = this._fadeDuration || 280;
        const t = Math.max(0, Math.min(1, (now - this._fadeStart) / dur));
        // ease-out: сначала быстрее пропадает размер, альфа плавно
        const ease = 1 - (1 - t) * (1 - t);
        const fade = 1 - t;

        this.sprite.alpha = fade;

        const s = this._fadeStartScale * (0.45 + 0.55 * fade);
        this.sprite.scale.set(Math.max(0.01, s));

        // Если съели — мягко втягиваем в убийцу
        if (this.diedBy) {
            const killer = this.core.app.cellsByID.get(this.diedBy);
            if (killer && !killer.destroyed) {
                this.x = this.ox + (killer.x - this.ox) * ease;
                this.y = this.oy + (killer.y - this.oy) * ease;
                this.sprite.x = this.x;
                this.sprite.y = this.y;
            }
        }

        if (t >= 1) {
            this._finishDestroy();
            return true;
        }
        return false;
    }

    _finishDestroy() {
        if (this.boostAuraWrap) {
            this.boostAuraWrap.destroy({ children: true });
            this.boostAuraWrap = null;
            this.boostAuraGfx = null;
            this.boostSpeedLinesGfx = null;
        }
        if (this.speedEdgeWrap) {
            this.speedEdgeWrap.destroy({ children: true });
            this.speedEdgeWrap = null;
            this.speedEdgeGfx = null;
        }
        if (this.sprite) {
            this.sprite.destroy({ children: true });
            this.sprite = null;
        }
        this._fadingOut = false;
    }
}
