/**
 * Мобильное управление:
 * - свободный джойстик (появляется под пальцем)
 * - двойное касание джойстика + удержание второго пальца = буст
 * - квадратный курсор направления
 * - pinch двумя пальцами = зум
 */
import { isTV } from "../yandex/YandexSDK.js";

export class MobileControls {
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
