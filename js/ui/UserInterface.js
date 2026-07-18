import { ModalSystem } from "./ModalSystem.js";
import { getMouseWorld, centerRawMouse } from "../input/coordinates.js";
import { BOOST_MIN_SCORE } from "../game/boostConstants.js";
import { MobileControls } from "../input/MobileControls.js";
import { sanitizeNick, sanitizeSafeText, sanitizeChat, sanitizeChatInput } from "../utils/textFilter.js";
import { SessionStats, formatPlayTime } from "../game/SessionStats.js";
import {
    getIdentity,
    openYandexAuth,
    submitYandexScore,
    gameplayStart,
    gameplayStop,
    needsYandexAuthButton,
    isTV,
    requestFullscreen,
    onHistoryBack,
    dispatchExit,
    showFullscreenAd,
    showRewardedAd
} from "../yandex/YandexSDK.js";
import { TvControls } from "../input/TvControls.js";
import { BLACK_UNLOCK_ADS } from "../utils/colors.js";

export class UserInterface {

    constructor(core) {
        this.core = core

        this.modalSystem = new ModalSystem()
        this.mobileControls = null
        this.sessionStats = new SessionStats()
        this._lifeActive = false
        this._deathStatsOpen = false

        this.mouse = {
            x: 0,
            y: 0
        }

        this.keysPressed = {};
        this.ejectInterval = null;
        this._boostHeld = false;

        this.userInterface = document.getElementById("user-interface")
        this.playButton = document.getElementById("play")
        this.spectateButton = document.getElementById("spectate")
        this.settingsButton = document.getElementById("settings")
        this.nameInput = document.getElementById("name")
        this.scoreElement = document.getElementById("score")
        this.leaderboard = document.getElementById("leaderboard-list") || document.getElementById("leaderboard")
        this.leaderboardPanel = document.getElementById("leaderboard")
        this.menuRating = document.getElementById("menu-rating")
        this.ratingList = document.getElementById("rating-list")
        this.ratingToggleBtn = document.getElementById("rating-toggle")
        this.deathStats = document.getElementById("death-stats")
        this.deathPlayBtn = document.getElementById("death-play")
        this.deathSpectateBtn = document.getElementById("death-spectate")
        this.deathChart = document.getElementById("death-mass-chart")
        this._ratingOffset = 0
        this._ratingHasMore = false
        this._ratingLoading = false
        this._ratingLastFetch = 0
        this._ratingRows = []
        this._ratingExpanded = false
        this._ratingTop5 = []
        this._ratingAll = null
        this._ratingTotal = 0
        this.chatField = document.getElementById("chat-compose")
        this.chatContent = document.getElementById("chat-content")
        this.chatPanel = document.getElementById("hud-chat") || document.querySelector(".hud-chat")
        this._chatOpen = false
        if (this.chatPanel) this.chatPanel.hidden = true;
        setInterval(() => {
            const score = this.core.app.camera.score;
            if (this.scoreElement) this.scoreElement.innerHTML = `Очки: ${score}`;
            const mass = this.core.app.camera.mass || 0;
            if (this._boostHeld && mass < BOOST_MIN_SCORE) {
                this.stopBoost();
            }
            if (this._lifeActive && this.core.app.ownedCells.length > 0) {
                this.sessionStats.tick(mass, this._boostHeld);
            }
            this.mobileControls?.syncVisibility();
        }, 40);
        this.nameInput.value = sanitizeNick(this.core.store.name);
        this.core.store.name = this.nameInput.value;
        this.addEvents()
        this.mobileControls = new MobileControls(this)
        this.tvControls = new TvControls(this)
        this._tvExitOpen = false
        this._tvBackLast = 0
        if (this.leaderboardPanel) this.leaderboardPanel.style.display = "none";
        this.bindMenuRatingNav();
        this.loadMenuRating();
        this.hideDeathStats();
        this.syncLeaderboardVisibility();
        this.makeButtonsFocusable();
        this._adProgress = { ads: 0, blackUnlocked: false, reviveWaitMs: 0 };
        this.updateAdProgressUi();
        onHistoryBack(() => this.handleHistoryBack());
    }

    hasMenuSky() {
        return !!document.getElementById("menu-sky");
    }

    /** Кнопки меню кликабельны с ТВ-пульта (OK / Enter). */
    makeButtonsFocusable() {
        const ids = ["play", "spectate", "settings", "death-play", "death-spectate", "death-revive"];
        for (const id of ids) {
            const el = document.getElementById(id);
            if (!el) continue;
            if (el.tagName === "BUTTON") continue;
            el.setAttribute("tabindex", "0");
            el.setAttribute("role", "button");
            el.addEventListener("keydown", (e) => {
                if (e.code === "Enter" || e.code === "NumpadEnter" || e.code === "Space") {
                    e.preventDefault();
                    el.click();
                }
            });
        }
    }

    onPlatformReady(type) {
        const t = type || (isTV() ? "tv" : "desktop");
        document.body.classList.add(`platform-${t}`);
        if (t === "tv") {
            // Чат и рейтинг-expand на ТВ не нужны
            if (this.chatPanel) this.chatPanel.hidden = true;
            if (this.chatField) this.chatField.hidden = true;
            if (this.menuRating) this.menuRating.hidden = true;
            // Фокус на «Играть»
            this.playButton?.focus?.();
            this.updateControlsHint();
        }
        this.mobileControls?.syncVisibility();
    }

    updateControlsHint() {
        let el = document.getElementById("platform-hint");
        if (!isTV()) {
            if (el) el.remove();
            return;
        }
        if (!el) {
            el = document.createElement("div");
            el.id = "platform-hint";
            document.body.appendChild(el);
        }
        const menuOpen = this.userInterface?.style.display !== "none";
        if (menuOpen || this._deathStatsOpen) {
            el.textContent = "↑↓←→ выбор · OK подтвердить · Back выход";
            el.hidden = false;
        } else {
            el.hidden = true;
        }
    }

    handleHistoryBack() {
        // ТВ Back: в меню → диалог выхода; в игре → меню; повторно → выход
        if (this._tvExitOpen) return;

        const menuOpen = this.userInterface?.style.display !== "none" || this._deathStatsOpen;
        if (!menuOpen) {
            const now = Date.now();
            if (now - (this._tvBackLast || 0) < 900) {
                this.showTvExitDialog();
                return;
            }
            this._tvBackLast = now;
            this.hideDeathStats();
            this.setPanelState(true);
            this.updateControlsHint();
            return;
        }
        this.showTvExitDialog();
    }

    showTvExitDialog() {
        if (this._tvExitOpen) return;
        this._tvExitOpen = true;
        const wrap = document.createElement("div");
        wrap.id = "tv-exit-dialog";
        wrap.innerHTML = `
            <div class="tv-exit-card">
                <div class="tv-exit-title">Выйти из игры?</div>
                <div class="tv-exit-actions">
                    <button type="button" class="button" id="tv-exit-no" autofocus>Остаться</button>
                    <button type="button" class="button" id="tv-exit-yes">Выйти</button>
                </div>
            </div>`;
        document.body.appendChild(wrap);
        const close = () => {
            this._tvExitOpen = false;
            wrap.remove();
            this.playButton?.focus?.();
        };
        wrap.querySelector("#tv-exit-no")?.addEventListener("click", close);
        wrap.querySelector("#tv-exit-yes")?.addEventListener("click", () => {
            close();
            if (!dispatchExit()) {
                try { window.close(); } catch (_) {}
            }
        });
        wrap.querySelector("#tv-exit-no")?.focus?.();
    }

    syncLeaderboardVisibility() {
        if (!this.leaderboardPanel) return;
        this.leaderboardPanel.style.display = this.hasMenuSky() ? "none" : "";
    }

    /** Облака разлетаются сразу; небо остаётся до конца PoW. */
    scatterMenuClouds() {
        const el = document.getElementById("menu-sky");
        if (!el || el.classList.contains("is-scattering")) return;

        const clouds = el.querySelectorAll(".cloud");
        clouds.forEach((cloud) => {
            const rect = cloud.getBoundingClientRect();
            const style = getComputedStyle(cloud);
            cloud.style.animation = "none";
            cloud.style.left = `${rect.left}px`;
            cloud.style.top = `${rect.top}px`;
            cloud.style.opacity = style.opacity;
        });

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                clouds.forEach((cloud) => { cloud.style.opacity = ""; });
                el.classList.add("is-scattering");
            });
        });
    }

    /** Плавно убрать небо после готовности карты (после PoW). */
    fadeMenuSky() {
        const el = document.getElementById("menu-sky");
        if (!el) return Promise.resolve();
        if (el.classList.contains("is-fading") || el.dataset.gone === "1") {
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            el.classList.add("is-fading");
            const done = () => {
                el.dataset.gone = "1";
                el.removeEventListener("transitionend", onEnd);
                el.remove();
                document.body.style.background = "#ffe8a8";
                this.syncLeaderboardVisibility();
                resolve();
            };
            const onEnd = (e) => {
                if (e.target === el && e.propertyName === "opacity") done();
            };
            el.addEventListener("transitionend", onEnd);
            setTimeout(done, 1000);
        });
    }

    /** Совместимость: сразу разлет + (если карта уже готова) fade. */
    dismissMenuSky() {
        this.scatterMenuClouds();
        if (this.core.net?.mapReady) this.fadeMenuSky();
    }

    /**
     * Подключиться к серверу и дождаться карты (PoW + SetBorder).
     * @returns {Promise<void>}
     */
    ensureConnected() {
        const net = this.core.net;
        if (net.ws?.readyState === 1 && net.mapReady) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            this._readyWaiters = this._readyWaiters || [];
            this._readyWaiters.push({ resolve, reject });

            const url = this.core.defaultServerUrl;
            if (!net.ws || net.ws.readyState >= 2) {
                net.connect(url);
            }
            // уже connecting / open — ждём onServerReady
        });
    }

    onServerReady() {
        const waiters = this._readyWaiters || [];
        this._readyWaiters = [];
        for (const w of waiters) {
            try { w.resolve(); } catch (_) {}
        }
    }

    failReadyWaiters(reason) {
        const waiters = this._readyWaiters || [];
        this._readyWaiters = [];
        for (const w of waiters) {
            try { w.reject(new Error(reason || "failed")); } catch (_) {}
        }
    }

    updateConnectionStatus(_status) {
        // HUD статуса сервера убран
    }

    setPowLoading(show, text) {
        let el = document.getElementById("pow-loading");
        if (!el) {
            el = document.createElement("div");
            el.id = "pow-loading";
            el.style.cssText = [
                "position:fixed",
                "left:50%",
                "bottom:18px",
                "transform:translateX(-50%)",
                "z-index:80",
                "padding:10px 16px",
                "border-radius:14px",
                "background:rgba(255,255,255,0.92)",
                "border:2px solid rgba(26,58,74,0.12)",
                "box-shadow:0 8px 20px rgba(30,80,110,0.16)",
                "font:800 13px Nunito,sans-serif",
                "color:#1a3a4a",
                "pointer-events:none",
                "user-select:none"
            ].join(";");
            document.body.appendChild(el);
        }
        if (!show) {
            el.hidden = true;
            return;
        }
        el.hidden = false;
        el.textContent = text || "Загрузка…";
    }

    addEvents() {
        this.onPlay = this.onPlay.bind(this)
        this.onSpectate = this.onSpectate.bind(this)
        this.onSettings = this.onSettings.bind(this)
        this.onKeyDown = this.onKeyDown.bind(this)
        this.onNameChange = this.onNameChange.bind(this)
        this.onMouseMove = this.onMouseMove.bind(this)
        this.onResize = this.onResize.bind(this)
        this.onScroll = this.onScroll.bind(this)
        this.onKeyUp = this.onKeyUp.bind(this)
        this.playButton.addEventListener("click", this.onPlay)
        this.spectateButton.addEventListener("click", this.onSpectate)
        this.settingsButton.addEventListener("click", this.onSettings)
        this.deathPlayBtn?.addEventListener("click", () => this.onPlayFromDeath())
        this.deathSpectateBtn?.addEventListener("click", () => this.onSpectateFromDeath())
        document.getElementById("death-revive")?.addEventListener("click", () => this.onReviveFromAd())
        addEventListener("keydown", this.onKeyDown);
        addEventListener("keyup", this.onKeyUp);

        // Запрет выделения и копирования (включая инпуты)
        document.addEventListener("selectstart", (e) => {
            e.preventDefault();
        });
        document.addEventListener("copy", (e) => {
            e.preventDefault();
            e.clipboardData?.setData("text/plain", "");
        });
        document.addEventListener("cut", (e) => {
            e.preventDefault();
            e.clipboardData?.setData("text/plain", "");
        });
        document.addEventListener("contextmenu", (e) => {
            e.preventDefault();
        });
        // Esc → только меню игры, не выход из окна / fullscreen
        addEventListener("keydown", (e) => {
            if (e.code !== "Escape" && e.key !== "Escape") return;
            e.preventDefault();
            e.stopPropagation();
            if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
            this.handleEscapeKey();
        }, true);

        this.nameInput.addEventListener("change", this.onNameChange)
        this.nameInput.addEventListener("input", () => {
            const live = sanitizeSafeText(this.nameInput.value, 24);
            if (live !== this.nameInput.value) this.nameInput.value = live;
        });
        this.nameInput.addEventListener("keydown", (e) => {
            if (e.code === "Enter") {
                e.preventDefault();
                this.applyNickname(this.nameInput.value);
                if (this.core.app.ownedCells.length > 0) this.setPanelState(false);
            }
        });
        this.chatField?.addEventListener("keydown", (e) => {
            if (e.code === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                this.submitChatCompose();
            } else if (e.code === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                this.closeChatCompose();
            } else {
                e.stopPropagation();
            }
        });
        this.chatField?.addEventListener("keyup", (e) => {
            e.stopPropagation();
        });
        this.chatField?.addEventListener("input", () => {
            const live = sanitizeChatInput(this.chatField.value);
            if (live !== this.chatField.value) this.chatField.value = live;
        });
        this.core.app.view.addEventListener("mousemove", this.onMouseMove)
        this.core.app.view.addEventListener('wheel', this.onScroll, {
            passive: true
        })
        this.core.app.view.addEventListener("mousedown", () => {
            if (this.core.app.isSpectating) {
                this.moveSpectateToClick();
            }
        });
        // На тач-устройствах не даём странице скроллиться жестами по канвасу
        this.core.app.view.style.touchAction = "none";
        document.body.style.touchAction = "manipulation";
        addEventListener("resize", this.onResize)
        if (window.visualViewport) {
            window.visualViewport.addEventListener("resize", this.onResize);
            window.visualViewport.addEventListener("scroll", this.onResize);
        }
        // Первый кадр после layout (мобильный адресный бар)
        requestAnimationFrame(() => this.onResize());
        addEventListener("beforeunload", (event) => {
            this.core.store.settings = this.core.settings.rawSettings
            event.cancelBubble = true
            event.returnValue = 'You sure you want to leave?'
            event.preventDefault()
        })

        window.addEventListener("blur", () => {
            this.resetKeys();
        });

        // 2. Страница стала скрытой (смена вкладки, открытие devtools и т.п.)
        document.addEventListener("visibilitychange", () => {
            if (document.hidden) this.resetKeys();
        });

        // 3. Открытие контекстного меню (ПКМ → KeyUp не приходит)
        window.addEventListener("contextmenu", () => {
            this.resetKeys();
        });
    }

    resetKeys() {
        // сбрасываем все клавиши
        for (const key in this.keysPressed) {
            this.keysPressed[key] = false;
        }

        // останавливаем W-интервал
        if (this.ejectInterval) {
            clearInterval(this.ejectInterval);
            this.ejectInterval = null;
        }

        this.stopBoost();
    }

    isBoostKey(code, keyCode) {
        return code === "Space" || keyCode === 32 || keyCode === 133;
    }

    startBoost() {
        if (!this.core.app.ownedCells.length || this.core.app.isSpectating) return;
        if (this.core.app.camera.mass < BOOST_MIN_SCORE) return;
        if (this._boostHeld) return;
        this._boostHeld = true;
        this.core.net.sendBoost(true);
    }

    stopBoost() {
        if (!this._boostHeld) return;
        this._boostHeld = false;
        this.core.net.sendBoost(false);
    }







    async onPlay() {
        if (this.core.app.ownedCells.length > 0) {
            this.hideDeathStats();
            this.setPanelState(false);
            return;
        }
        if (this._enterBusy) return;
        this._enterBusy = true;

        const name = (this.nameInput.value || "").trim() || "Игрок";
        this.core.store.name = name;
        this.scatterMenuClouds();
        this.core.app.exitSpectateMode();
        this.core.app.prepareNewLife();
        this.core.app.camera.score = 0;
        this.core.app.camera.mass = 0;
        this.hideDeathStats();
        this.setPanelState(false);
        this.updateMenuButtons();

        // Сразу по клику: fullscreen + реклама (до долгих await)
        void requestFullscreen();
        let entryAdShown = false;
        if (!this._entryAdShown) {
            this._entryAdShown = true;
            try {
                const ad = await showFullscreenAd();
                entryAdShown = !!ad.shown;
            } catch (_) {}
        }

        try {
            await this.ensureConnected();
            await this.fadeMenuSky();
            if (entryAdShown) this.core.net.reportAdWatched();
            this.core.net.spawn();
            gameplayStart();
        } catch (err) {
            console.warn("[Game] Play connect failed:", err);
            this.setPanelState(true);
        } finally {
            this._enterBusy = false;
        }
    }

    onPlayFromDeath() {
        this.hideDeathStats();
        this.onPlay();
    }

    onSpectateFromDeath() {
        this.hideDeathStats();
        this.onSpectate();
    }

    onYandexReady(identity) {
        this.core.yandex = identity || getIdentity();
        this.updateYandexAuthButton();
    }

    updateYandexAuthButton() {
        let btn = document.getElementById("yandex-auth");
        this.core.yandex = getIdentity();

        // Под учёткой Яндекса / без SDK / локалка — кнопки нет
        if (!needsYandexAuthButton()) {
            if (btn) btn.remove();
            return;
        }

        // Гость на Яндекс Играх — вход только по кнопке (требование 1.2.1)
        if (!btn && this.userInterface) {
            btn = document.createElement("div");
            btn.id = "yandex-auth";
            btn.className = "button";
            btn.textContent = "Войти через Яндекс";
            btn.title = "Сохранять рекорды в рейтинге Яндекса";
            btn.style.marginTop = "12px";
            btn.addEventListener("click", async () => {
                const ok = await openYandexAuth();
                if (ok) {
                    this.core.yandex = getIdentity();
                    this.updateYandexAuthButton();
                    this.core.net?.sendYandexIdentity?.();
                }
            });
            const primary = this.userInterface.querySelector(".primary-buttons");
            if (primary) primary.insertAdjacentElement("afterend", btn);
            else this.userInterface.appendChild(btn);
        }
    }

    /** Старт новой жизни — вызывается при появлении первой своей клетки. */
    onLifeStarted() {
        if (this._lifeActive) return;
        this._lifeActive = true;
        this.core.app.snakeEnded = false;
        this.core.app.refreshHeadCellId();
        this.sessionStats.start();
        this.hideDeathStats();
        this.setPanelState(false);
        gameplayStart();
    }

    /** Смерть — статистика вместо главного меню. */
    onPlayerDied() {
        if (!this._lifeActive) {
            // Уже умерли: не дёргаем меню (иначе итоги мигают)
            return;
        }
        this._lifeActive = false;
        this.stopBoost();
        gameplayStop();
        this.core.app.snakeEnded = true;
        this.core.app.ownedCells = [];
        this.core.app.mainCell = null;
        this.core.app.headCellId = null;
        const snap = this.sessionStats.stop(this.core.app.camera.score | 0);
        this.showDeathStats(snap);
        // Дублируем рекорд в лидерборд Яндекса (ник змейки в extraData)
        const score = snap?.score | 0;
        const nick = this.core.store.name || "Игрок";
        if (score > 0) {
            submitYandexScore(score, nick).catch(() => {});
        }
    }

    showDeathStats(stats) {
        if (!this.deathStats) {
            this.setPanelState(true);
            return;
        }
        this._deathStatsOpen = true;
        this.closeChatCompose();
        this.userInterface.style.display = "none";
        if (this.menuRating) this.menuRating.hidden = true;
        if (this.leaderboardPanel) this.leaderboardPanel.style.display = "";

        const s = stats || this.sessionStats.snapshot();
        const el = (id) => document.getElementById(id);
        if (el("ds-score")) el("ds-score").textContent = String(s.score >>> 0);
        if (el("ds-kills")) el("ds-kills").textContent = String(s.kills >>> 0);
        if (el("ds-time")) el("ds-time").textContent = formatPlayTime(s.durationMs);
        if (el("ds-boost")) el("ds-boost").textContent = formatPlayTime(s.boostMs);
        if (el("ds-mass")) el("ds-mass").textContent = String(s.peakMass >>> 0);

        this.drawMassChart(s.massSamples || []);
        this._lastDeathSnap = s;
        this.deathStats.hidden = false;
        this.updateReviveButton();
        this.mobileControls?.syncVisibility();
        this.updateMenuButtons();
    }

    hideDeathStats() {
        this._deathStatsOpen = false;
        if (this.deathStats) this.deathStats.hidden = true;
    }

    onAdProgress(p) {
        this._adProgress = p || { ads: 0, blackUnlocked: false, reviveWaitMs: 0 };
        this.updateAdProgressUi();
        this.updateReviveButton();
    }

    updateAdProgressUi() {
        const el = document.getElementById("ad-progress");
        if (!el) return;
        const ads = this._adProgress?.ads | 0;
        const need = BLACK_UNLOCK_ADS;
        if (ads >= need || this._adProgress?.blackUnlocked) {
            el.textContent = `Чёрная змея открыта · реклам: ${ads}`;
        } else {
            el.textContent = `Чёрная змея: ${ads} / ${need} реклам`;
        }
    }

    updateReviveButton() {
        const btn = document.getElementById("death-revive");
        const hint = document.getElementById("death-revive-hint");
        if (!btn) return;
        const snap = this._lastDeathSnap;
        const score = snap?.score | 0;
        const mass = snap?.peakMass | 0;
        const wait = this._adProgress?.reviveWaitMs | 0;
        const can = score >= 10 || mass >= 20;

        if (!can) {
            btn.disabled = true;
            btn.textContent = "Восстановить 30%";
            if (hint) hint.textContent = "Слишком мало очков для восстановления";
            return;
        }
        if (wait > 0) {
            const sec = Math.ceil(wait / 1000);
            btn.disabled = true;
            btn.textContent = `Подождите ${sec} с`;
            if (hint) hint.textContent = "Частые смерти — реклама восстановления реже";
            // тик обновления
            clearTimeout(this._reviveTick);
            this._reviveTick = setTimeout(() => {
                if (this._adProgress) {
                    this._adProgress.reviveWaitMs = Math.max(0, (this._adProgress.reviveWaitMs | 0) - 1000);
                }
                this.updateReviveButton();
            }, 1000);
            return;
        }
        btn.disabled = false;
        const keepS = Math.max(1, Math.floor(score * 0.3));
        const keepM = Math.max(1, Math.floor(mass * 0.3));
        btn.textContent = `Восстановить 30% (${keepS} очков)`;
        if (hint) hint.textContent = `За рекламу: ~${keepS} очков и ~${keepM} массы`;
    }

    async onReviveFromAd() {
        const btn = document.getElementById("death-revive");
        if (btn?.disabled || this._reviveBusy) return;
        this._reviveBusy = true;
        try {
            const res = await showRewardedAd();
            if (!res.rewarded) {
                if (document.getElementById("death-revive-hint")) {
                    document.getElementById("death-revive-hint").textContent = "Реклама не просмотрена";
                }
                return;
            }
            this.core.net.reportAdWatched();
            this.core.app.prepareNewLife();
            this.hideDeathStats();
            this.setPanelState(false);
            this.core.net.requestRevive();
            gameplayStart();
        } finally {
            this._reviveBusy = false;
        }
    }

    drawMassChart(samples) {
        const canvas = this.deathChart;
        if (!canvas) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const cssW = canvas.clientWidth || 420;
        const cssH = canvas.clientHeight || 120;
        canvas.width = Math.floor(cssW * dpr);
        canvas.height = Math.floor(cssH * dpr);
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cssW, cssH);

        const pad = { t: 8, r: 8, b: 18, l: 8 };
        const w = cssW - pad.l - pad.r;
        const h = cssH - pad.t - pad.b;
        const pts = samples.length ? samples : [{ t: 0, m: 0 }, { t: 1, m: 0 }];
        let maxM = 1;
        let maxT = 1;
        for (const p of pts) {
            if (p.m > maxM) maxM = p.m;
            if (p.t > maxT) maxT = p.t;
        }

        ctx.fillStyle = "rgba(184, 236, 255, 0.35)";
        ctx.fillRect(pad.l, pad.t, w, h);

        ctx.beginPath();
        pts.forEach((p, i) => {
            const x = pad.l + (p.t / maxT) * w;
            const y = pad.t + h - (p.m / maxM) * h;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        const last = pts[pts.length - 1];
        const first = pts[0];
        ctx.lineTo(pad.l + (last.t / maxT) * w, pad.t + h);
        ctx.lineTo(pad.l + (first.t / maxT) * w, pad.t + h);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + h);
        grad.addColorStop(0, "rgba(62, 207, 154, 0.55)");
        grad.addColorStop(1, "rgba(62, 207, 154, 0.05)");
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.beginPath();
        pts.forEach((p, i) => {
            const x = pad.l + (p.t / maxT) * w;
            const y = pad.t + h - (p.m / maxM) * h;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = "#249e70";
        ctx.lineWidth = 2.5;
        ctx.lineJoin = "round";
        ctx.stroke();

        ctx.fillStyle = "#6a8fa0";
        ctx.font = "700 10px Nunito, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("старт", pad.l, cssH - 4);
        ctx.textAlign = "right";
        ctx.fillText("конец", pad.l + w, cssH - 4);
        ctx.textAlign = "right";
        ctx.fillText(String(Math.round(maxM)), pad.l + w, pad.t + 10);
    }

    moveSpectateToClick() {
        if (!this.core.app.isSpectating) return;
        const world = this.getMouseWorld();
        this.core.app.setSpectateTarget(world.x, world.y);
        this.core.net.sendSpectateTarget(world.x, world.y);
    }

    async onSpectate() {
        if (this.core.app.ownedCells.length > 0) {
            return;
        }
        if (this._enterBusy) return;
        this._enterBusy = true;
        this.hideDeathStats();
        this.scatterMenuClouds();
        this.setPanelState(false);
        this.updateMenuButtons();
        requestFullscreen().catch(() => {});

        try {
            await this.ensureConnected();
            await this.fadeMenuSky();
            if (!this.core.app.isSpectating) {
                this.core.app.enterSpectateMode();
                this.moveSpectateToClick();
                this.core.net.spectate();
            }
        } catch (err) {
            console.warn("[Game] Spectate connect failed:", err);
            this.setPanelState(true);
        } finally {
            this._enterBusy = false;
        }
    }

    onSettings() {
        const labels = {
            names: "Имена",
            background: "Фон",
            sectors: "Секторы",
            border: "Граница карты"
        };
        let contentStr = `<div class="modal-settings-content">`;
        const settings = this.core.settings.rawSettings;
        for (const setting in settings) {
            if (setting === "mass") continue;
            const inputValue = labels[setting] || setting;
            contentStr += `
        <div class="modal-settings-tile">
        ${inputValue}<input type="checkbox" id="setting-${setting}" ${settings[setting] ? "checked" : ""}>
        </div>
        `;
        }
        contentStr += `</div>`;
        this.modalSystem.addModal(200, null, contentStr);

        for (const setting in settings) {
            if (setting === "mass") continue;
            document.getElementById(`setting-${setting}`).addEventListener("click", () => {
                this.core.settings[setting] = !this.core.settings[setting];
            });
        }
    }

    isMobileLayout() {
        return window.matchMedia("(max-width: 900px), (pointer: coarse)").matches;
    }

    isMeOnLeaderboard(player) {
        const myId = this.core.net.ownerPlayerId >>> 0;
        if (!myId) return false;
        const entryId = (player.playerId ?? player.id) >>> 0;
        return entryId === myId;
    }

    escapeHtml(text) {
        return String(text ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    makeLeaderboardRow(player, rank, isMe) {
        const row = document.createElement("div");
        row.className = "lb-row" + (isMe ? " lb-me" : "") + (rank === 1 ? " lb-top1" : "");
        const name = this.escapeHtml(player.name || "Без имени");
        const badge = isMe ? `<span class="lb-badge">вы</span>` : "";
        row.innerHTML = `
            <span class="lb-rank">${rank}</span>
            <span class="lb-name-wrap">
                <span class="lb-name">${name}</span>
                ${badge}
            </span>`;
        return row;
    }

    updateLeaderboard() {
        const all = this.core.net.leaderboardItems || [];
        const fragment = document.createDocumentFragment();

        if (!all.length) {
            const empty = document.createElement("div");
            empty.className = "lb-empty";
            empty.textContent = "Пока никого нет";
            fragment.appendChild(empty);
            this.leaderboard.innerHTML = "";
            this.leaderboard.appendChild(fragment);
            return;
        }

        // ПК: топ-10, телефон: топ-5; себя — отдельной строкой, если не в топе
        const topN = this.isMobileLayout() ? 5 : 10;
        const myId = this.core.net.ownerPlayerId >>> 0;
        let myIndex = -1;
        if (myId) {
            for (let i = 0; i < all.length; i++) {
                if (((all[i].playerId ?? all[i].id) >>> 0) === myId) {
                    myIndex = i;
                    break;
                }
            }
        }

        const top = all.slice(0, topN);
        for (let i = 0; i < top.length; i++) {
            fragment.appendChild(this.makeLeaderboardRow(top[i], i + 1, myIndex === i));
        }

        if (myIndex >= topN) {
            const sep = document.createElement("div");
            sep.className = "lb-sep";
            sep.setAttribute("aria-hidden", "true");
            fragment.appendChild(sep);
            fragment.appendChild(this.makeLeaderboardRow(all[myIndex], myIndex + 1, true));
        }

        this.leaderboard.innerHTML = "";
        this.leaderboard.appendChild(fragment);
    }

    bindMenuRatingNav() {
        if (this._ratingNavBound) return;
        this._ratingNavBound = true;
        this.ratingToggleBtn?.addEventListener("click", () => this.toggleMenuRating());
    }

    updateRatingNavButtons() {
        const moreThanFive = (this._ratingTotal > 5) || this._ratingHasMore || (this._ratingAll && this._ratingAll.length > 5);
        if (this.ratingToggleBtn) {
            this.ratingToggleBtn.disabled = (!moreThanFive && !this._ratingExpanded) || this._ratingLoading;
            this.ratingToggleBtn.setAttribute("aria-expanded", this._ratingExpanded ? "true" : "false");
            this.ratingToggleBtn.title = this._ratingExpanded ? "Свернуть" : "Показать всех";
            this.ratingToggleBtn.setAttribute("aria-label", this.ratingToggleBtn.title);
        }
        if (this.menuRating) {
            this.menuRating.dataset.expanded = this._ratingExpanded ? "1" : "0";
        }
    }

    toggleMenuRating() {
        if (this._ratingExpanded) this.collapseMenuRating();
        else this.expandMenuRating();
    }

    ratingsBaseUrl() {
        let host = "ffa.agar.su:6009";
        const wsUrl = this.core.net?.ws?.url || this.core.defaultServerUrl;
        if (wsUrl) {
            try { host = new URL(wsUrl.replace(/^ws/i, "http")).host; } catch (_) {}
        }
        return `https://${host}/ratings`;
    }

    /** Только топ-5 при загрузке страницы. */
    async loadMenuRating() {
        if (!this.ratingList) return;
        this._ratingExpanded = false;
        this._ratingOffset = 0;
        this._ratingHasMore = false;
        this._ratingRows = [];
        this._ratingTop5 = [];
        this._ratingAll = null;
        this._ratingTotal = 0;
        this._ratingLoading = false;
        this.ratingList.innerHTML = `<div class="lb-empty">Загрузка…</div>`;
        this.updateRatingNavButtons();
        await this.fetchRatingPage(0, 5, true);
        this.lockRatingListToTop5();
    }

    /** Зафиксировать высоту списка ровно под топ-5 (панель не растёт при раскрытии). */
    lockRatingListToTop5() {
        if (!this.ratingList) return;
        const rows = this.ratingList.querySelectorAll(".lb-row");
        if (!rows.length) return;
        const n = Math.min(5, rows.length);
        let h = 0;
        for (let i = 0; i < n; i++) {
            h += rows[i].offsetHeight;
            if (i < n - 1) {
                h += parseFloat(getComputedStyle(rows[i]).marginBottom) || 0;
            }
        }
        const pad = getComputedStyle(this.ratingList);
        h += (parseFloat(pad.paddingTop) || 0) + (parseFloat(pad.paddingBottom) || 0);
        this.ratingList.style.height = `${Math.ceil(h)}px`;
    }

    /** ▼ — показать всех (подгрузка с сервера один раз, потом из кэша). */
    async expandMenuRating() {
        if (this._ratingExpanded || this._ratingLoading) return;
        this._ratingExpanded = true;
        this.updateRatingNavButtons();

        if (this._ratingAll && this._ratingAll.length > 5) {
            this._ratingRows = this._ratingAll.slice();
            this.renderMenuRating(this._ratingRows, true);
            this.updateRatingNavButtons();
            return;
        }

        while (this._ratingHasMore && this._ratingOffset < 1000) {
            const now = Date.now();
            if (now - this._ratingLastFetch < 350) {
                await new Promise(r => setTimeout(r, 350 - (now - this._ratingLastFetch)));
            }
            await this.fetchRatingPage(this._ratingOffset, 50, false);
            if (!this._ratingExpanded) break;
        }
        this._ratingAll = this._ratingRows.slice();
        this.updateRatingNavButtons();
    }

    /** ▲ — снова только топ-5, остальных убрать из списка. */
    collapseMenuRating() {
        if (!this._ratingExpanded) return;
        this._ratingExpanded = false;
        if (this._ratingRows.length > 5 && !this._ratingAll) {
            this._ratingAll = this._ratingRows.slice();
        }
        this._ratingRows = (this._ratingTop5 || this._ratingRows.slice(0, 5)).slice();
        this.renderMenuRating(this._ratingRows, true);
        if (this.ratingList) this.ratingList.scrollTop = 0;
        this.updateRatingNavButtons();
    }

    async fetchRatingPage(offset, limit, replace) {
        if (this._ratingLoading) return;
        this._ratingLoading = true;
        this._ratingLastFetch = Date.now();
        this.updateRatingNavButtons();
        try {
            const url = `${this.ratingsBaseUrl()}?offset=${offset | 0}&limit=${limit | 0}`;
            const res = await fetch(url, { cache: "no-store" });
            if (res.status === 429) {
                this._ratingHasMore = true;
                return;
            }
            if (!res.ok) throw new Error("HTTP " + res.status);
            const data = await res.json();
            const items = Array.isArray(data.items) ? data.items : [];
            if (typeof data.total === "number") this._ratingTotal = data.total | 0;
            if (replace) {
                this._ratingRows = items.slice();
                this._ratingTop5 = items.slice(0, 5);
            } else {
                this._ratingRows.push(...items);
            }
            this._ratingOffset = (data.offset | 0) + items.length;
            this._ratingHasMore = !!data.hasMore && this._ratingOffset < 1000 && items.length > 0;
            this.renderMenuRating(this._ratingRows, replace);
        } catch (_) {
            if (replace) {
                this.ratingList.innerHTML = `<div class="lb-empty">Рейтинг пока недоступен</div>`;
            }
        } finally {
            this._ratingLoading = false;
            this.updateRatingNavButtons();
        }
    }

    renderMenuRating(top, replace = true) {
        if (!this.ratingList) return;
        if (!top.length) {
            this.ratingList.innerHTML = "";
            const empty = document.createElement("div");
            empty.className = "lb-empty";
            empty.textContent = "Пока пусто — ешьте еду!";
            this.ratingList.appendChild(empty);
            this.updateRatingNavButtons();
            return;
        }

        if (replace) this.ratingList.innerHTML = "";

        const start = replace ? 0 : this.ratingList.querySelectorAll(".lb-row").length;
        const fragment = document.createDocumentFragment();
        for (let i = start; i < top.length; i++) {
            const row = top[i];
            const rank = i + 1;
            const el = document.createElement("div");
            el.className = "lb-row" + (rank === 1 ? " lb-top1" : "");
            el.innerHTML = `
                <span class="lb-rank">${rank}</span>
                <span class="lb-name-wrap">
                    <span class="lb-name">${this.escapeHtml(row.name || "Игрок")}</span>
                    ${row.yaName ? `<span class="lb-ya">${this.escapeHtml(row.yaName)}</span>` : ""}
                </span>
                <span class="lb-lvl">${row.rating >>> 0}</span>`;
            fragment.appendChild(el);
        }
        this.ratingList.appendChild(fragment);
        this.updateRatingNavButtons();
    }

    updateChat() {
        const list = this.core.net.messages || [];
        const fragment = document.createDocumentFragment();

        for (const message of list) {
            const tile = document.createElement("div");
            tile.className = "hud-message-tile";
            const item = document.createElement("span");
            item.className = "hud-message-item";
            item.style.color = `rgb(${message.color.r}, ${message.color.g}, ${message.color.b})`;
            item.textContent = `${message.name}: `;
            const body = document.createElement("span");
            body.className = "hud-message";
            body.textContent = message.content;
            item.appendChild(body);
            tile.appendChild(item);
            fragment.appendChild(tile);
        }

        if (this.chatContent) {
            this.chatContent.innerHTML = "";
            this.chatContent.appendChild(fragment);
            this.chatContent.scrollTop = this.chatContent.scrollHeight;
        }
        if (this.chatPanel) {
            this.chatPanel.hidden = list.length === 0;
        }
    }

    isChatComposeOpen() {
        return !!(this.chatField && !this.chatField.hidden);
    }

    /** Фокус в поле ввода (ник / чат) — пробел и буквы не трогаем. */
    isTypingInField() {
        const ae = document.activeElement;
        if (!ae) return false;
        if (ae === this.nameInput || ae === this.chatField) return true;
        const tag = ae.tagName;
        return tag === "INPUT" || tag === "TEXTAREA" || ae.isContentEditable;
    }

    openChatCompose() {
        if (!this.chatField) return;
        if (this.userInterface && getComputedStyle(this.userInterface).display !== "none") return;
        if (this._deathStatsOpen) return;

        this.chatField.hidden = false;
        this.chatField.value = "";
        this._chatOpen = true;
        this.stopBoost();
        requestAnimationFrame(() => {
            this.chatField.focus();
        });
    }

    closeChatCompose() {
        if (!this.chatField) return;
        this.chatField.blur();
        this.chatField.value = "";
        this.chatField.hidden = true;
        this._chatOpen = false;
    }

    submitChatCompose() {
        if (!this.chatField) return;
        const value = sanitizeChat(this.chatField.value);
        if (value) this.core.net.sendChatMessage(value);
        this.closeChatCompose();
    }

    onMouseMove({ clientX, clientY }) {
        if (this.mobileControls?._active) return;
        this.mouse.x = clientX;
        this.mouse.y = clientY;
    }

    getMouseWorld() {
        return getMouseWorld(this.core);
    }

    onScroll({ deltaY }) {
        const app = this.core.app;
        const steps = (deltaY || 0) / 120;
        app.zoom *= Math.pow(0.9, steps);
    }


    handleEscapeKey() {
        // Чат открыт — закрыть чат
        if (this.isChatComposeOpen()) {
            this.closeChatCompose();
            return;
        }
        // Диалог выхода ТВ
        if (this._tvExitOpen) {
            const dlg = document.getElementById("tv-exit-dialog");
            dlg?.querySelector("#tv-exit-no")?.click();
            return;
        }
        // Уже в меню — ничего (не закрываем вкладку)
        const menuOpen = this.userInterface && getComputedStyle(this.userInterface).display !== "none";
        if (menuOpen && !this._deathStatsOpen) {
            return;
        }
        if (this._deathStatsOpen) {
            this.hideDeathStats();
        }
        this.setPanelState(true);
        this.updateControlsHint();
    }

    onKeyDown(event) {
        const { code, keyCode } = event;

        // Escape обрабатывается в capture (handleEscapeKey)
        if (code === "Escape") {
            event.preventDefault();
            return;
        }

        // Пока пишем в ник/чат — игровые клавиши не трогаем (Space должен печататься)
        if (this.isChatComposeOpen() || this.isTypingInField()) {
            return;
        }

        this.keysPressed[code] = true;

        if (this.isBoostKey(code, keyCode)) {
            // На ТВ в геймплее буст обрабатывает TvControls
            if (isTV() && this.tvControls?.inGameplay()) return;
            event.preventDefault();
            this.startBoost();
            return;
        }

        switch (code) {
            case "KeyW":
                if (isTV()) break;
                if (!this.ejectInterval) {
                    this.core.net.sendEject();
                    this.ejectInterval = setInterval(() => {
                        if (this.keysPressed["KeyW"]) this.core.net.sendEject();
                        else clearInterval(this.ejectInterval);
                    }, 50);
                }
                break;
            case "Enter":
            case "NumpadEnter":
                // ТВ: OK активирует сфокусированную кнопку; в игре — буст (TvControls)
                if (isTV()) {
                    if (this.tvControls?.inGameplay()) return;
                    event.preventDefault();
                    const ae = document.activeElement;
                    if (ae && (ae.classList?.contains("button") || ae.getAttribute("role") === "button")) {
                        ae.click();
                    }
                    return;
                }
                event.preventDefault();
                this.openChatCompose();
                break;
            case "KeyE":
                if (!isTV()) this.core.net.sendE();
                break;
            case "KeyR":
                if (!isTV()) this.core.net.sendR();
                break;
            case "KeyT":
                if (!isTV()) this.core.net.sendT();
                break;
            case "KeyP":
                if (!isTV()) this.core.net.sendP();
                break;
        }
    }

    onKeyUp(event) {
        if (this.isChatComposeOpen() || this.isTypingInField()) return;

        const { code, keyCode } = event;
        this.keysPressed[code] = false;

        if (this.isBoostKey(code, keyCode)) {
            this.stopBoost();
        }

        if (code === "KeyW" && this.ejectInterval) {
            clearInterval(this.ejectInterval);
            this.ejectInterval = null;
        }
    }

    onResize() {
        const vv = window.visualViewport;
        const w = Math.max(1, Math.floor(vv?.width ?? innerWidth));
        const h = Math.max(1, Math.floor(vv?.height ?? innerHeight));
        const app = this.core.app;
        if (!app?.renderer) return;
        app.renderer.resize(w, h);
        if (app.stage) {
            app.stage.position.set(w / 2, h / 2);
        }
        // Сброс «улетевшего» зума после поворота/обновления на мобилке
        if (app.ownedCells.length === 0 && !app.isSpectating) {
            const z = app.zoom;
            if (!Number.isFinite(z) || z < 0.15 || z > 3) {
                app.zoom = 0.7;
            }
        }
        centerRawMouse(this.core);
        const mobile = this.isMobileLayout();
        if (this._lbMobileLayout !== mobile) {
            this._lbMobileLayout = mobile;
            this.updateLeaderboard();
        }
    }

    updateMenuButtons() {
        const playing = this.core.app.ownedCells.length > 0;

        if (playing) {
            this.spectateButton.style.display = "";
            this.spectateButton.style.opacity = "0.5";
            this.spectateButton.style.pointerEvents = "none";
            this.playButton.textContent = "Продолжить";
        } else {
            this.spectateButton.style.display = "";
            this.spectateButton.style.opacity = "";
            this.spectateButton.style.pointerEvents = "";
            this.playButton.textContent = "Играть";
        }
        this.playButton.style.display = "";
    }

    setPanelState(show) {
        if (show) {
            this.closeChatCompose();
            this.hideDeathStats();
            this.userInterface.style.display = "grid";
            if (this.menuRating) this.menuRating.hidden = isTV();
            this.syncLeaderboardVisibility();
            this.updateMenuButtons();
            this.mobileControls?.syncVisibility();
            this.updateControlsHint();
            if (isTV()) {
                this.playButton?.focus?.();
            } else if (this.core.app.ownedCells.length > 0) {
                this.nameInput.value = this.core.store.name || "";
                this.nameInput.focus();
                this.nameInput.select();
            }
        } else {
            this.userInterface.style.display = "none";
            if (this.menuRating) this.menuRating.hidden = true;
            this.syncLeaderboardVisibility();
            this.updateMenuButtons();
            this.mobileControls?.syncVisibility();
            this.updateControlsHint();
        }
    }

    applyNickname(raw) {
        const n = sanitizeNick(raw);
        this.core.store.name = n;
        this.nameInput.value = n;

        for (const id of this.core.app.ownedCells) {
            const cell = this.core.app.cellsByID.get(id);
            if (!cell) continue;
            cell.hasChanged = true;
            cell.name = n;
        }

        if (this.core.app.ownedCells.length > 0) {
            this.core.net.sendNickname(n);
        }
    }

    onNameChange() {
        this.applyNickname(this.nameInput.value);
    }
}
