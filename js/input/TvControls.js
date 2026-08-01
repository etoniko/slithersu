/**
 * Управление на ТВ-пульте:
 * стрелки = направление змейки, OK/Enter/Space = буст.
 * В меню/после смерти — навигация по кнопкам (п. 1.6.3.2 / 1.14).
 */
import { isTV } from "../yandex/YandexSDK.js";

const ARROWS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
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
}

export class TvControls {
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
