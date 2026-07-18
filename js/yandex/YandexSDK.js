/**
 * Обёртка SDK Яндекс Игр.
 * Платформы: desktop / mobile / tv.
 */
export const LEADERBOARD_NAME = "score";

let ysdk = null;
let player = null;
let ready = false;
/** @type {'desktop'|'mobile'|'tv'} */
let deviceType = "desktop";

function waitForYaGames(timeoutMs = 4000) {
    if (typeof YaGames !== "undefined") return Promise.resolve(true);
    return new Promise((resolve) => {
        const t0 = Date.now();
        const id = setInterval(() => {
            if (typeof YaGames !== "undefined") {
                clearInterval(id);
                resolve(true);
            } else if (Date.now() - t0 > timeoutMs) {
                clearInterval(id);
                resolve(false);
            }
        }, 50);
    });
}

function detectLocalDeviceType() {
    try {
        const coarse = window.matchMedia("(pointer: coarse)").matches;
        const narrow = window.matchMedia("(max-width: 900px)").matches;
        if (coarse || narrow) return "mobile";
    } catch (_) {}
    return "desktop";
}

function readDeviceType() {
    try {
        const info = ysdk?.deviceInfo;
        if (!info) return detectLocalDeviceType();
        if (typeof info.isTV === "function" && info.isTV()) return "tv";
        if (typeof info.isMobile === "function" && info.isMobile()) return "mobile";
        if (typeof info.isDesktop === "function" && info.isDesktop()) return "desktop";
        const t = String(info.type || "").toLowerCase();
        if (t === "tv" || t === "mobile" || t === "desktop") return t;
    } catch (_) {}
    return detectLocalDeviceType();
}

function applyPlatformClass(type) {
    document.body.classList.remove("platform-desktop", "platform-mobile", "platform-tv");
    document.body.classList.add(`platform-${type}`);
}

export function getYsdk() {
    return ysdk;
}

export function getYandexPlayer() {
    return player;
}

export function isYandexReady() {
    return ready;
}

export function getDeviceType() {
    return deviceType;
}

export function isTV() {
    return deviceType === "tv";
}

export function isMobileDevice() {
    return deviceType === "mobile";
}

export function isDesktopDevice() {
    return deviceType === "desktop";
}

export async function initYandex() {
    if (ready) return { ysdk, player, deviceType };

    const hasSdk = await waitForYaGames();
    if (!hasSdk || typeof YaGames === "undefined") {
        console.log("[Yandex] SDK не найден — локальный режим");
        deviceType = detectLocalDeviceType();
        applyPlatformClass(deviceType);
        return { ysdk: null, player: null, deviceType };
    }

    try {
        ysdk = await YaGames.init();
        deviceType = readDeviceType();
        applyPlatformClass(deviceType);

        try {
            ysdk.features?.LoadingAPI?.ready();
        } catch (_) {}

        try {
            player = await ysdk.getPlayer();
        } catch (e) {
            console.warn("[Yandex] getPlayer:", e);
            player = null;
        }

        ready = true;
        console.log("[Yandex] SDK ready", {
            device: deviceType,
            uid: player?.getUniqueID?.(),
            auth: player?.isAuthorized?.()
        });
        return { ysdk, player, deviceType };
    } catch (e) {
        console.warn("[Yandex] init failed:", e);
        deviceType = detectLocalDeviceType();
        applyPlatformClass(deviceType);
        return { ysdk: null, player: null, deviceType };
    }
}

export function getIdentity() {
    if (!player) {
        // Локальный гость — прогресс рекламы на этом устройстве
        let guest = "";
        try {
            guest = localStorage.getItem("guestUid") || "";
            if (!guest) {
                guest = "guest_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
                localStorage.setItem("guestUid", guest);
            }
        } catch (_) {}
        return { uid: guest, yaName: "", authorized: false };
    }
    let uid = "";
    let yaName = "";
    try {
        uid = String(player.getUniqueID?.() || "");
    } catch (_) {}
    try {
        yaName = String(player.getName?.() || "");
    } catch (_) {}
    let authorized = false;
    try {
        authorized = !!player.isAuthorized?.();
    } catch (_) {}
    if (!authorized && yaName && yaName !== "anonymous" && yaName !== "Аноним") {
        authorized = true;
    }
    return { uid, yaName, authorized };
}

export function needsYandexAuthButton() {
    if (!ysdk || !player) return false;
    if (isTV()) return false; // на ТВ диалог входа неудобен
    return !getIdentity().authorized;
}

export async function openYandexAuth() {
    if (!ysdk?.auth?.openAuthDialog) return false;
    try {
        await ysdk.auth.openAuthDialog();
        player = await ysdk.getPlayer();
        return true;
    } catch (_) {
        return false;
    }
}

export async function submitYandexScore(score, snakeNick) {
    const s = score | 0;
    if (s <= 0 || !ysdk?.leaderboards) return false;

    try {
        const available = await ysdk.isAvailableMethod?.("leaderboards.setScore");
        if (available === false) return false;
    } catch (_) {}

    try {
        const nick = String(snakeNick || "").slice(0, 48);
        await ysdk.leaderboards.setScore(LEADERBOARD_NAME, s, nick);
        return true;
    } catch (e) {
        console.warn("[Yandex] setScore:", e);
        return false;
    }
}

export function gameplayStart() {
    try {
        ysdk?.features?.GameplayAPI?.start();
    } catch (_) {}
}

export function gameplayStop() {
    try {
        ysdk?.features?.GameplayAPI?.stop();
    } catch (_) {}
}

/** Полноэкранная реклама (при входе в игру). */
export function showFullscreenAd() {
    return new Promise((resolve) => {
        if (!ysdk?.adv?.showFullscreenAdv) {
            resolve({ shown: false, error: "no-sdk" });
            return;
        }
        try {
            gameplayStop();
            ysdk.adv.showFullscreenAdv({
                callbacks: {
                    onOpen: () => {},
                    onClose: (wasShown) => {
                        resolve({ shown: !!wasShown });
                    },
                    onError: (err) => {
                        resolve({ shown: false, error: err });
                    }
                }
            });
        } catch (e) {
            resolve({ shown: false, error: e });
        }
    });
}

/** Rewarded video — награда только в onRewarded. */
export function showRewardedAd() {
    return new Promise((resolve) => {
        if (!ysdk?.adv?.showRewardedVideo) {
            resolve({ rewarded: false, error: "no-sdk" });
            return;
        }
        let rewarded = false;
        try {
            gameplayStop();
            ysdk.adv.showRewardedVideo({
                callbacks: {
                    onOpen: () => {},
                    onRewarded: () => {
                        rewarded = true;
                    },
                    onClose: () => {
                        resolve({ rewarded });
                    },
                    onError: (err) => {
                        resolve({ rewarded: false, error: err });
                    }
                }
            });
        } catch (e) {
            resolve({ rewarded: false, error: e });
        }
    });
}

/**
 * Полноэкранный режим (Яндекс Games SDK).
 * Вызывать сразу по клику «Играть» — до await.
 */
export async function requestFullscreen() {
    // API Яндекс Игр — десктоп / мобайл / ТВ
    try {
        const fs = ysdk?.screen?.fullscreen;
        if (fs && typeof fs.request === "function") {
            const status = fs.status;
            if (status !== "on" && status !== fs.STATUS_ON) {
                await fs.request();
            }
            return true;
        }
    } catch (e) {
        console.warn("[Yandex] fullscreen.request:", e);
    }

    // Fallback native: мобилки / ТВ (на десктопе без SDK Esc ломает окно)
    if (isDesktopDevice()) return false;
    try {
        const el = document.documentElement;
        if (document.fullscreenElement) return true;
        if (el.requestFullscreen) await el.requestFullscreen();
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
        return true;
    } catch (_) {
        return false;
    }
}

/**
 * Back на ТВ-пульте.
 * @param {() => void} handler
 * @returns {() => void} unsubscribe
 */
export function onHistoryBack(handler) {
    if (!ysdk?.on || !ysdk?.EVENTS?.HISTORY_BACK) return () => {};
    try {
        return ysdk.on(ysdk.EVENTS.HISTORY_BACK, handler) || (() => {});
    } catch (_) {
        return () => {};
    }
}

/** Подтверждённый выход из игры (ТВ). */
export function dispatchExit() {
    try {
        if (ysdk?.EVENTS?.EXIT) {
            ysdk.dispatchEvent(ysdk.EVENTS.EXIT);
            return true;
        }
    } catch (_) {}
    return false;
}

/** Локальный debug: ?tv=1 в URL имитирует ТВ. */
export function applyDebugPlatformOverride() {
    try {
        const q = new URLSearchParams(location.search);
        if (q.get("tv") === "1") {
            deviceType = "tv";
            applyPlatformClass("tv");
        } else if (q.get("mobile") === "1") {
            deviceType = "mobile";
            applyPlatformClass("mobile");
        }
    } catch (_) {}
}
