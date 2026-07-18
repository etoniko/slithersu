export class SkinManager {
    constructor(core) {
        this.core = core;
        this.nickToCode = new Map();
        this.textureCache = new Map();
        this.ready = false;
    }

    async init() {
        try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 8000);
            const res = await fetch("https://api.agar.su/skinlist.txt", {
                cache: "no-store",
                signal: ctrl.signal
            });
            clearTimeout(timer);

            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const text = await res.text();
            this.nickToCode.clear();

            for (const raw of text.split(/\r?\n/)) {
                const line = raw.trim();
                if (!line || line.startsWith("#")) continue;
                // формат: nick:id  или  nick id
                const m = line.match(/^(.+?)[\s:]+(\d+)\s*$/);
                if (m) this.nickToCode.set(m[1].trim().toLowerCase(), m[2].trim());
            }

            this.ready = true;
            console.log(`[Skins] Loaded ${this.nickToCode.size} skins from api.agar.su`);
            this.reapplyAll();
        } catch (e) {
            console.warn("Не удалось загрузить список скинов:", e);
            this.ready = true;
        }
    }

    /** id скина по нику: из списка или nick:123 в имени */
    getCodeForName(name) {
        if (!name) return null;
        const explicit = String(name).match(/(?:^|\s)nick:(\d+)(?:\s|$)/i);
        if (explicit) return explicit[1];
        return this.nickToCode.get(String(name).trim().toLowerCase()) || null;
    }

    getTextureForCode(code) {
        if (!code) return null;
        if (this.textureCache.has(code)) return this.textureCache.get(code);
        const tex = PIXI.Texture.from(`https://api.agar.su/skins/${code}.png`);
        if (tex?.baseTexture) {
            tex.baseTexture.mipmap = PIXI.MIPMAP_MODES.ON;
            tex.baseTexture.scaleMode = PIXI.SCALE_MODES.LINEAR;
        }
        this.textureCache.set(code, tex);
        return tex;
    }

    applyToCell(cell, name) {
        if (!this.core.settings?.skins) {
            this._clearCellSkin(cell);
            return;
        }

        const code = this.getCodeForName(name);
        if (!code) {
            this._clearCellSkin(cell);
            return;
        }

        const tex = this.getTextureForCode(code);
        if (!tex) return;

        if (!cell.skinSprite) {
            const OVERSCAN = 2;

            const s = new PIXI.Sprite(tex);
            s.anchor.set(0.5);
            s.width = 512 + 2 * OVERSCAN;
            s.height = 512 + 2 * OVERSCAN;
            s.zIndex = (cell._segmentZ ?? cell.id) + 2;
            s.roundPixels = false;
            cell.sprite.addChild(s);
            cell.skinSprite = s;

            const mask = new PIXI.Graphics();
            mask.beginFill(0xffffff);
            mask.drawCircle(0, 0, 256 + OVERSCAN);
            mask.endFill();
            mask.zIndex = (cell._segmentZ ?? cell.id) + 3;
            mask.cacheAsBitmap = false;
            cell.sprite.addChild(mask);

            s.mask = mask;
            cell.skinMask = mask;
        } else {
            cell.skinSprite.texture = tex;
        }

        if (typeof cell._bringBoostBarToFront === "function") {
            cell._bringBoostBarToFront();
        }
    }

    _clearCellSkin(cell) {
        if (cell.skinSprite) {
            cell.skinSprite.destroy({ children: true });
            cell.skinSprite = null;
        }
        if (cell.skinMask) {
            cell.skinMask.destroy();
            cell.skinMask = null;
        }
    }

    /** После загрузки списка — навесить скины на уже существующие клетки. */
    reapplyAll() {
        const cells = this.core?.app?.cells;
        if (!cells) return;
        for (const cell of cells) {
            if (!cell || cell.destroyed) continue;
            if (cell._name) this.applyToCell(cell, cell._name);
        }
    }
}
