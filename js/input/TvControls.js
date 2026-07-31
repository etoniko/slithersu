/**
 * Управление на ТВ-пульте:
 * стрелки = направление змейки, OK/Enter/Space = буст.
 * Достаточно стрелок для полного геймплея (требование Яндекс 1.6.3.2).
 */
import { isTV } from "../yandex/YandexSDK.js";

const ARROWS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

export class TvControls {
    constructor(ui) {
        this.ui = ui;
        this._nx = 0;
        this._ny = -1;
        this._held = new Set();
        this._raf = 0;
        this._hint = null;

        this.onKeyDown = this.onKeyDown.bind(this);
        this.onKeyUp = this.onKeyUp.bind(this);

        addEventListener("keydown", this.onKeyDown, true);
        addEventListener("keyup", this.onKeyUp, true);
        this._tick = this._tick.bind(this);
        this._raf = requestAnimationFrame(this._tick);
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

    onKeyDown(e) {
        if (!this.enabled()) return;
        if (this.ui?.isTypingInField?.()) return;
        const { code } = e;

        // Навигация по меню — не перехватываем стрелки
        if (!this.inGameplay()) return;

        if (ARROWS.has(code)) {
            e.preventDefault();
            e.stopPropagation();
            this._held.add(code);
            this._recomputeDir();
            this.applyAim();
            return;
        }

        // OK на пульте часто = Enter
        if (code === "Enter" || code === "NumpadEnter" || code === "Space") {
            e.preventDefault();
            e.stopPropagation();
            this.ui.startBoost();
        }
    }

    onKeyUp(e) {
        if (!this.enabled()) return;
        if (this.ui?.isTypingInField?.()) return;
        const { code } = e;

        if (ARROWS.has(code)) {
            this._held.delete(code);
            this._recomputeDir();
            this.applyAim();
            return;
        }

        if (code === "Enter" || code === "NumpadEnter" || code === "Space") {
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
        const dist = Math.min(innerWidth, innerHeight) * 0.28;
        this.ui.mouse.x = cx + this._nx * dist;
        this.ui.mouse.y = cy + this._ny * dist;
    }

    _tick() {
        this._raf = requestAnimationFrame(this._tick);
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
