/**
 * Мобильное управление:
 * - свободный джойстик (появляется под пальцем)
 * - Буст = ускорение
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
        this.splitBtn = document.getElementById("mobile-split");
        this.cursor = document.getElementById("mobile-cursor");

        this.stickTouchId = null;
        this.splitTouchId = null;
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
        this.onSplitStart = this.onSplitStart.bind(this);
        this.onSplitEnd = this.onSplitEnd.bind(this);

        this.splitBtn?.addEventListener("touchstart", this.onSplitStart, { passive: false });
        this.splitBtn?.addEventListener("touchend", this.onSplitEnd, { passive: false });
        this.splitBtn?.addEventListener("touchcancel", this.onSplitEnd, { passive: false });

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
        if (this.ui.userInterface?.style.display !== "none") return false;
        if (this.ui._deathStatsOpen) return false;
        if (this.ui.core.app.isSpectating) return false;
        return this.ui.core.app.ownedCells.length > 0;
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
        this.splitTouchId = null;
        this.pinchTouchIds = null;
        this.hideStick();
        this.splitBtn?.classList.remove("is-active");
        if (was) this.ui.stopBoost();
    }

    isUiTarget(target) {
        if (!target || !target.closest) return false;
        return !!target.closest(
            ".hud-chat, #leaderboard, #chat-compose, #mobile-split, input, textarea, button, .menu-rating, #user-interface, #death-stats, .modal-background, .modal"
        );
    }

    isOnSplit(clientX, clientY) {
        if (!this.splitBtn) return false;
        const r = this.splitBtn.getBoundingClientRect();
        const pad = 8;
        return (
            clientX >= r.left - pad &&
            clientX <= r.right + pad &&
            clientY >= r.top - pad &&
            clientY <= r.bottom + pad
        );
    }

    onTouchStart(e) {
        if (!this._active) return;

        // Pinch: два пальца
        if (e.touches.length >= 2) {
            e.preventDefault();
            this.beginPinch(e.touches[0], e.touches[1]);
            // сбрасываем стик, если был
            if (this.stickTouchId != null) {
                this.stickTouchId = null;
                this.hideStick();
            }
            return;
        }

        const t = e.changedTouches[0];
        if (!t) return;
        if (this.isUiTarget(e.target) || this.isOnSplit(t.clientX, t.clientY)) return;
        if (this.stickTouchId != null || this.pinchTouchIds) return;

        e.preventDefault();
        this.stickTouchId = t.identifier;
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
        e.preventDefault();
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

        if (this.stickTouchId == null) return;
        for (const t of e.changedTouches) {
            if (t.identifier === this.stickTouchId) {
                e.preventDefault();
                this.stickTouchId = null;
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

    onSplitStart(e) {
        if (!this._active) return;
        e.preventDefault();
        e.stopPropagation();
        const t = e.changedTouches[0];
        if (!t) return;
        this.splitTouchId = t.identifier;
        this.splitBtn?.classList.add("is-active");
        this.ui.startBoost();
    }

    onSplitEnd(e) {
        if (this.splitTouchId == null) return;
        for (const t of e.changedTouches) {
            if (t.identifier === this.splitTouchId) {
                e.preventDefault();
                this.splitTouchId = null;
                this.splitBtn?.classList.remove("is-active");
                this.ui.stopBoost();
                break;
            }
        }
    }
}
