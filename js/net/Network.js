import { Cell } from "../game/Cell.js";
import { getLevel, normalizeFractlPart } from "../utils/math.js";
import { prepareData, Writer, Reader, BinaryReader } from "../utils/binary.js";
import { getMouseDelta } from "../input/coordinates.js";
import { sanitizeNick } from "../utils/textFilter.js";
import { solvePowBlob } from "./pow.js";
import {
    applyServerCellState,
    isValidCellState,
    shouldSnapCell,
    snapCameraTo
} from "../game/cellSync.js";

export class Network {
    static SERVER_TO_CLIENT = {
        UPDATE_PING: 2,
        UPDATE_NODES: 16,
        SPECTATE_CAMERA: 17,
        // CLEAR_ALL: 300,
        CLEAR_OWNED_CELLS: 20,
        LEADERBOARD_UPDATE: 49,
        BORDER: 64,
        CHAT_MESSAGE: 99,
        UPDATE_EXP: 114,
        BOOST_PLAYERS: 115,
        UPDATE_SCORE: 116,
        UPDATE_MINIMAP: 117,
        POW_CHALLENGE: 118,
        AD_PROGRESS: 123
    }

    static CLIENT_TO_SERVER = {
        SPAWN: 0,
        SPECTATE: 0x1,
        MOUSE: 0x10,
        SPLIT_PLAYER: 0x11,
        BOOST_START: 17,
        BOOST_STOP: 18,
        SPLIT_MINION: 0x16,
        EJECT_PLAYER: 0x15,
        EJECT_MINION: 0x17,
        CHAT: 99
    }

    constructor(core) {
        this.core = core;

        this.protocol = "eSejeKSVdysQvZs0ES1H";

        this.onOpen = this.onOpen.bind(this)
        this.onMessage = this.onMessage.bind(this)
        this.onClose = this.onClose.bind(this)
        this.onError = this.onError.bind(this)

        this.leaderboardItems = []
        this.messages = []
        this.border = {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            centerX: 0,
            centerY: 0,
            width: 0,
            height: 0
        }
        this.foodMinSize = 0
        this.foodMaxSize = 0
        this.ownerPlayerId = 0
        this.ping = 0
        this.pingstamp = 0
        this.oldMouseDx = 0
        this.oldMouseDy = 0
        this._lastSpectateX = null
        this._lastSpectateY = null
        this.playerBoost = new Map()
        this.minimapPlayers = [] // [{ pID, x, y }] — все головы с сервера
        this.mapReady = false
        this.adProgress = { ads: 0, blackUnlocked: false, reviveWaitMs: 0 }
        this.connectionStatus = "connecting"
    }

    setConnectionStatus(status) {
        this.connectionStatus = status;
        this.core.ui?.updateConnectionStatus?.(status);
    }

    connect(addr) {
        this.setConnectionStatus("connecting");
        const params = "?token=";
        if (this.ws) this.reset();
        const ws = (this.ws = new WebSocket(addr + params, this.protocol));
        ws.binaryType = "arraybuffer";
        ws.onopen = this.onOpen;
        ws.onmessage = this.onMessage;
        ws.onclose = this.onClose;
        ws.onerror = this.onError;
    }





    reset() {
        if (this.ws) this.ws.close()
        this.ws = null
        this.messages = []
        this.core?.ui?.updateChat?.()
        this.border = {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            centerX: 0,
            centerY: 0,
            width: 0,
            height: 0
        }
        this.foodMinSize = 0
        this.foodMaxSize = 0
        this.ownerPlayerId = 0
        this.ping = 0
        this.pingstamp = 0
        this.oldMouseDx = 0
        this.oldMouseDy = 0
        this._lastSpectateX = null
        this._lastSpectateY = null
        this.playerBoost.clear()
        this.minimapPlayers = []
        this.mapReady = false
        this.adProgress = { ads: 0, blackUnlocked: false, reviveWaitMs: 0 }
        clearInterval(this.pingInterval)
        clearInterval(this.mouseMoveInterval)
        cancelAnimationFrame(this.core.app.hueShiftingRAF)
    }

    send(data) {
        if (!this.ws || this.ws.readyState !== 1) return
        if (data.build) this.ws.send(data.build())
        else this.ws.send(data)
    }

    sendUint8(a) {
        const msg = prepareData(1);
        msg.setUint8(0, a);
        this.send(msg);
    }
    sendAccountToken() {
        const token = localStorage.accountToken;
        if (token) {
            const msg = prepareData(1 + 2 * token.length);
            msg.setUint8(0, 114);
            for (var i = 0; i < token.length; ++i) msg.setUint16(1 + 2 * i, token.charCodeAt(i), true);
            this.send(msg.buffer);
        }
        this.sendYandexIdentity();
    }

    /** Opcode 120: uid + yaName (utf16 null-terminated). */
    sendYandexIdentity() {
        const id = this.core.yandex || {};
        let uid = String(id.uid || "").trim();
        let yaName = String(id.yaName || "").trim().slice(0, 64);
        if (!uid) return;

        // Только безопасные символы для сервера
        if (!/^[a-zA-Z0-9_\-./+=]+$/.test(uid)) return;

        const uidLen = uid.length;
        const nameLen = yaName.length;
        const msg = prepareData(1 + (uidLen + 1) * 2 + (nameLen + 1) * 2);
        let o = 0;
        msg.setUint8(o++, 120);
        for (let i = 0; i < uidLen; i++) msg.setUint16(o + i * 2, uid.charCodeAt(i), true);
        o += uidLen * 2;
        msg.setUint16(o, 0, true);
        o += 2;
        for (let i = 0; i < nameLen; i++) msg.setUint16(o + i * 2, yaName.charCodeAt(i), true);
        o += nameLen * 2;
        msg.setUint16(o, 0, true);
        this.send(msg);
    }

    onOpen() {
        console.log("[Game] Connected to server");
        this.setConnectionStatus("online");
        this._powBusy = false;
        this.sendAccountToken();

        this.send(new Uint8Array([254, 5, 0, 0, 0]))
        this.send(new Uint8Array([255, 0, 0, 0, 0]))

        // Панель не трогаем: коннект идёт по Играть — меню уже скрыто
        this.core.ui?.setPowLoading?.(true, "Проверка…");
        this.pingInterval = setInterval(() => {

            if (!document.hidden) {
                this.pingstamp = Date.now();
                this.send(new Uint8Array([2]).buffer); // ping
            }

        }, 3000);
        this.mouseMoveInterval = setInterval(() => this.sendMouseMove(), 40);
    }

    async onPowChallenge(reader) {
        if (this._powBusy) return;
        this._powBusy = true;
        try {
            const len = reader.getUint16();
            let blob = '';
            for (let i = 0; i < len; i++) {
                blob += String.fromCharCode(reader.getUint8());
            }
            this.core.ui?.setPowLoading?.(true, "Загрузка защиты…");
            const solved = await solvePowBlob(blob, (p) => {
                const pct = Math.floor((p || 0) * 100);
                this.core.ui?.setPowLoading?.(true, `Загрузка защиты… ${pct}%`);
            });
            const msg = prepareData(5);
            msg.setUint8(0, 119);
            msg.setUint32(1, solved.nonce >>> 0, true);
            this.send(msg);
            this.core.ui?.setPowLoading?.(true, "Подключение…");
        } catch (err) {
            console.warn("[Game] PoW failed:", err);
            this.core.ui?.setPowLoading?.(true, "Ошибка проверки");
        } finally {
            this._powBusy = false;
        }
    }

    onMessage({ data }) {
        this.now = Date.now()

        let reader;
        let opcode;
        try {
            reader = new Reader(new DataView(data), 0, true);
            opcode = reader.getUint8();
        } catch (err) {
            console.warn("[Game] Bad packet header:", err);
            return;
        }

        try {
        switch (opcode) {
            case Network.SERVER_TO_CLIENT.UPDATE_PING: {
                this.ping = Date.now() - this.pingstamp;
                break
            }
            case Network.SERVER_TO_CLIENT.UPDATE_NODES: {
                const reader = new BinaryReader(
                    new DataView(data)
                );
                reader.offset++; // skip messageType
                this.onNodesUpdate(reader)

                break
            }
            case Network.SERVER_TO_CLIENT.CLEAR_OWNED_CELLS: {
                this.onClearOwnedCells()
                break
            }
            // case Network.SERVER_TO_CLIENT.CLEAR_ALL: { // TODO
            //     this.onClearAll()
            //     break
            // }
            case Network.SERVER_TO_CLIENT.BORDER: {
                this.onBorder(reader)
                break
            }
            case Network.SERVER_TO_CLIENT.SPECTATE_CAMERA: {
                this.onSpectateCamera(reader)
                break
            }
            case Network.SERVER_TO_CLIENT.LEADERBOARD_UPDATE: {
                this.onLoaderboard(reader)
                break
            }
            case Network.SERVER_TO_CLIENT.CHAT_MESSAGE: {
                this.onChatMessage(reader)
                break;
            }
            case Network.SERVER_TO_CLIENT.BOOST_PLAYERS: {
                this.onBoostPlayers(reader);
                break;
            }
            case Network.SERVER_TO_CLIENT.UPDATE_SCORE: {
                this.onScore(reader);
                break;
            }
            case Network.SERVER_TO_CLIENT.UPDATE_MINIMAP: {
                this.onMinimap(reader);
                break;
            }
            case Network.SERVER_TO_CLIENT.POW_CHALLENGE: {
                this.onPowChallenge(reader);
                break;
            }
            case Network.SERVER_TO_CLIENT.AD_PROGRESS: {
                this.onAdProgress(reader);
                break;
            }
            default:
                break;
        }
        } catch (err) {
            console.warn("[Game] Packet", opcode, "error:", err);
        }
    }

    onBoostPlayers(reader) {
        if (!this.mapReady || !reader?.view) return;
        const count = Math.min(reader.getUint16(), 256);
        // count уже прочитан — осталось count * (4 pID + 2 energy + 1 boosting)
        const need = count * 7;
        if (reader._o + need > reader.view.byteLength) {
            console.warn("[Game] Boost packet truncated");
            return;
        }
        const seen = new Set();
        for (let i = 0; i < count; i++) {
            const pID = reader.getUint32();
            const energy = reader.getUint16() / 65535;
            const boosting = reader.getUint8() === 1;
            seen.add(pID);
            this.playerBoost.set(pID, { energy, boosting });
        }
        for (const pID of this.playerBoost.keys()) {
            if (!seen.has(pID)) this.playerBoost.delete(pID);
        }
        this.applyBoostToCells();
    }

    applyBoostToCells() {
        const app = this.core.app;
        for (let i = 0; i < app.cells.length; i++) {
            const cell = app.cells[i];
            if (!cell || cell.destroyed || !cell.playerId) continue;
            const st = this.playerBoost.get(cell.playerId);
            cell.boostBoosting = !!(st && st.boosting);
            if (st && cell.isPrimaryDisplayCell()) {
                cell.setBoostState(st.energy, st.boosting);
            }
        }
    }

    onClose() {
        console.warn("[Game] Disconnected from server");
        this._powBusy = false;
        this.core.ui?.setPowLoading?.(false);
        this.core.ui?.failReadyWaiters?.("disconnected");
        this.setConnectionStatus("offline");
        this.core.app.clear();
        this.core.ui.setPanelState(true);
    }
    onError() {
        console.warn("[Game] Connection error");
        this._powBusy = false;
        this.core.ui?.setPowLoading?.(false);
        this.core.ui?.failReadyWaiters?.("error");
        this.setConnectionStatus("error");
        this.core.app.clear();
        this.core.ui.setPanelState(true);
    }

    addCell(id, x, y, r, name, color, playerId = 0, cellType = 0) {
        let cellsByID = this.core.app.cellsByID
        let cells = this.core.app.cells

        let sprite = new PIXI.Sprite(this.core.app.textures.cell)
        sprite.anchor.set(.5)
        sprite.roundPixels = false;

        this.core.app.stage.addChild(sprite)

        const cell = new Cell(this.core, id, x, y, r, sprite, name, color);
        if (playerId) cell.setPlayerId(playerId);
        if (cellType === 1) cell.setAsFood();
        else if (cellType === 3) cell.setAsDeathFood();
        if (this.core.app.isSpectating) {
            cell.setLabelAlpha(0.5);
        }
        cellsByID.set(id, cell);
        cells.push(cell);
    }

    spawn() {
        this.sendNickname(this.core.store.name);
    }

    /** Смена ника: opcode 0. Цвет всегда назначает сервер. */
    sendNickname(name) {
        const nick = sanitizeNick(name) + "#";
        const msg = prepareData(4 + 2 * nick.length);
        let offset = 0;
        msg.setUint8(offset++, 0);
        msg.setUint8(offset++, 0); // colorId игнорируется сервером
        for (let i = 0; i < nick.length; i++) {
            msg.setUint16(offset, nick.charCodeAt(i), true);
            offset += 2;
        }
        msg.setUint16(offset, 0, true);
        this.send(msg);
    }

    /** Серверу: засчитан просмотр рекламы. */
    reportAdWatched() {
        this.sendUint8(121);
    }

    /** Запрос revive 30% после rewarded. */
    requestRevive() {
        this.sendUint8(122);
    }

    onAdProgress(reader) {
        const ads = reader.getUint32();
        const blackUnlocked = !!reader.getUint8();
        const reviveWaitMs = reader.getUint32();
        this.adProgress = { ads, blackUnlocked, reviveWaitMs };
        this.core.ui?.onAdProgress?.(this.adProgress);
    }

    spectate() {
        const writer = new Writer(true)
        writer.setUint8(Network.CLIENT_TO_SERVER.SPECTATE)
        this.send(writer)
    }

    /** Точка обзора в наблюдении — только по клику (мировые координаты). */
    sendSpectateTarget(x, y) {
        if (!this.ws || this.ws.readyState !== 1) return;

        const rx = Math.round(x);
        const ry = Math.round(y);

        if (
            this._lastSpectateX != null &&
            Math.abs(rx - this._lastSpectateX) < 1 &&
            Math.abs(ry - this._lastSpectateY) < 1
        ) {
            return;
        }

        this._lastSpectateX = rx;
        this._lastSpectateY = ry;

        const msg = prepareData(13);
        msg.setUint8(0, Network.CLIENT_TO_SERVER.MOUSE);
        msg.setInt32(1, rx, true);
        msg.setInt32(5, ry, true);
        msg.setUint32(9, 0, true);
        this.send(msg.buffer);
    }

    sendMouseMove() {
        if (!this.ws || this.ws.readyState !== 1) return;
        if (this.core.app.isSpectating) return;

        // Игра: смещение от центра экрана (направление змейки)
        const { dx, dy } = getMouseDelta(this.core);

        if (
            dx * dx + dy * dy < 64 ||
            (Math.abs(this.oldMouseDx - dx) < 0.01 && Math.abs(this.oldMouseDy - dy) < 0.01)
        ) {
            return;
        }

        this.oldMouseDx = dx;
        this.oldMouseDy = dy;

        const msg = prepareData(21);
        msg.setUint8(0, Network.CLIENT_TO_SERVER.MOUSE);
        msg.setFloat64(1, dx, true);
        msg.setFloat64(9, dy, true);
        msg.setUint32(17, 0, true);
        this.send(msg.buffer);
    }

    sendChatMessage(text) {
        const writer = new Writer()
        writer.setUint8(Network.CLIENT_TO_SERVER.CHAT)
        writer.setUint8(0)
        writer.setStringUTF16(text)
        this.send(writer)
    }

    onChatMessage(reader) {
        const flagMask = reader.getUint8();
        const color = {
            r: reader.getUint8(),
            g: reader.getUint8(),
            b: reader.getUint8()
        }
        const playerXp = reader.getUint32(); // TODO...

        const pId = reader.getUint16(); // TODO...

        const name = reader.getStringUTF16()
        const content = reader.getStringUTF16()

        const lvl = playerXp ? getLevel(playerXp) : -1;
        const nameWithLvl = lvl >= 0 ? `${name} [ур. ${lvl}]` : name;

        this.messages.push({
            color,
            name: nameWithLvl,
            content
        });
        if (this.messages.length > 50) {
            this.messages.splice(0, this.messages.length - 50);
        }
        this.core.ui.updateChat()
    }

    onSpectateCamera(reader) {
        this.core.app.camera.target.s = 0.2;
    }

    /** Очки за еду с сервера — не сбрасываем в 0 при смерти/обзоре. */
    onScore(reader) {
        const score = reader.getUint32() >>> 0;
        let kills = 0;
        if (reader.view && reader._o + 4 <= reader.view.byteLength) {
            kills = reader.getUint32() >>> 0;
        }
        const app = this.core.app;
        if (app.ownedCells.length > 0) {
            app.camera.score = score;
            this.core.ui?.sessionStats?.setKills(kills);
            return;
        }
        if (score > 0) app.camera.score = score;
        if (kills > 0) this.core.ui?.sessionStats?.setKills(kills);
    }

    /** Головы всех игроков/ботов на карте (для миникарты вне обзора). */
    onMinimap(reader) {
        const count = reader.getUint16();
        const list = [];
        for (let i = 0; i < count; i++) {
            const pID = reader.getUint32() >>> 0;
            const x = reader.getInt32();
            const y = reader.getInt32();
            list.push({ pID, x, y });
        }
        this.minimapPlayers = list;
    }

    onLoaderboard(reader) {
        this.leaderboardItems = []
        const count = reader.getUint32()
        for (let i = 0; i < count; ++i) {
            const playerId = reader.getUint32() // pID игрока с сервера
            const name = reader.getStringUTF16()
            const playerXp = reader.getUint32();
            const playerLevel = playerXp ? getLevel(playerXp) : -1; // TODO...
            this.leaderboardItems.push({ id: playerId, playerId, name: name, level: playerLevel })
        }
        this.core.ui.updateLeaderboard()
    }

    onBorder(reader) {
        this.core.ui?.setPowLoading?.(false);
        const firstBorder = !this.mapReady;
        this.mapReady = true;

        this.border.left = reader.getFloat64()
        this.border.top = reader.getFloat64()
        this.border.right = reader.getFloat64()
        this.border.bottom = reader.getFloat64()
        // Размеры еды: сервер отправляет радиус напрямую (как и для клеток игроков)
        // Убираем умножение на 100 и sqrt, так как это радиус, а не масса
        const rawMinSize = reader.getUint16();
        const rawMaxSize = reader.getUint16();
        // Ограничение: еда обычно должна быть маленькой (5-15 пикселей в радиусе)
        const MAX_FOOD_RADIUS = 15;
        this.foodMinSize = Math.min(rawMinSize, MAX_FOOD_RADIUS);
        this.foodMaxSize = Math.min(rawMaxSize, MAX_FOOD_RADIUS);
        // Убеждаемся, что min <= max
        if (this.foodMinSize > this.foodMaxSize) {
            this.foodMaxSize = this.foodMinSize;
        }
        this.ownerPlayerId = reader.getUint32()
        this.border.width = this.border.right - this.border.left
        this.border.height = this.border.bottom - this.border.top
        this.border.centerX = (this.border.left + this.border.right) / 2
        this.border.centerY = (this.border.top + this.border.bottom) / 2
        // clear сносит stage — сначала clear, потом рисуем декорации карты
        if (firstBorder) {
            this.core.app.clear();
            console.log("[Game] Map loaded, playerId:", this.ownerPlayerId);
        }
        this.core.app.drawBackground()
        this.core.app.drawGrid()
        this.core.app.drawBorder()
        this.core.app.drawSectors()
        this.core.app.drawMinimapBorder()

        if (firstBorder) {
            this.core.ui?.onServerReady?.();
        }

        // Если мы не владеем клетками (спектатор/до спавна) — ставим камеру в центр.
        if (this.core.app.ownedCells.length === 0 && !this.core.app.isSpectating) {
            const app = this.core.app;
            app.posX = this.border.centerX;
            app.posY = this.border.centerY;
            app.posSize = 1;
            app.camera.x = app.posX;
            app.camera.y = app.posY;
            app.viewZoom = app.posSize;
            app.camera.s = app.viewZoom;
        }
    }


    sendSplit() {
        const writer = new Writer(true)
        writer.setUint8(Network.CLIENT_TO_SERVER.SPLIT_PLAYER)
        this.send(writer)
    }

    sendBoost(active) {
        const writer = new Writer(true);
        writer.setUint8(active ? Network.CLIENT_TO_SERVER.BOOST_START : Network.CLIENT_TO_SERVER.BOOST_STOP);
        this.send(writer);
    }

    sendE() {
        const writer = new Writer(true)
        writer.setUint8(22)
        this.send(writer)
    }

    sendR() {
        const writer = new Writer(true)
        writer.setUint8(23)
        this.send(writer)
    }

    sendT() {
        const writer = new Writer(true)
        writer.setUint8(24)
        this.send(writer)
    }

    sendP() {
        const writer = new Writer(true)
        writer.setUint8(25)
        this.send(writer)
    }

    sendEject() {
        const writer = new Writer(true)
        writer.setUint8(Network.CLIENT_TO_SERVER.EJECT_PLAYER)
        this.send(writer)
    }

    onClearOwnedCells() {
        this.core.app.exitSpectateMode()
        if (this.core.app.endOwnedSnake()) {
            this.core.ui.onPlayerDied();
        } else {
            this.core.app.ownedCells = []
            this.core.app.mainCell = null
            this.core.app.headCellId = null
        }
    }

    onClearAll() {
        this.core.app.clear()
    }

    rgbToHex(arr) {
        let hex = ""

        for (const rawColor of arr) {
            const color = rawColor.toString(16)
            hex += color.length == 1 ? `0${color}` : color
        }

        return `0x${hex}`
    }

    onNodesUpdate(reader) {
        if (!this.mapReady || !this.border.width) {
            return;
        }

        const app = this.core.app;
        const cellsByID = app.cellsByID;
        const border = this.border;
        const ownerId = this.ownerPlayerId;
        const ownedPositions = {};

        for (const oid of app.ownedCells) {
            const c = cellsByID.get(oid);
            if (c && !c.destroyed) {
                ownedPositions[oid] = { x: c.x, y: c.y };
            }
        }

        try {
            for (let killed; killed = reader.uint32();) {
                const killerId = reader.uint32();
                const cell = cellsByID.get(killed);
                if (cell && !cell.destroyed && !cell._fadingOut) {
                    cell.destroy(killerId || null);
                }
            }

            for (let id; id = reader.uint32();) {
                if (!reader.canRead) break;

                const type = reader.uint8();

                let posX = 0;
                let posY = 0;
                let size = 0;
                let playerId = 0;

                if (type === 1) {
                    const w = border.width || (border.right - border.left);
                    const h = border.height || (border.bottom - border.top);
                    posX = border.left + w * normalizeFractlPart(id);
                    posY = border.top + h * normalizeFractlPart(id * id);
                    const sizeRange = Math.max(1, this.foodMaxSize - this.foodMinSize);
                    size = this.foodMinSize + (id % sizeRange);
                } else {
                    if (type === 0) {
                        if (!reader.canRead) break;
                        playerId = reader.uint32();
                    }
                    if (!reader.canRead) break;
                    posX = reader.int32();
                    posY = reader.int32();
                    size = reader.uint16();
                    // Куски после смерти: визуально чуть больше еды карты
                    if (type === 3) {
                        const foodMax = this.foodMaxSize || 12;
                        const cap = foodMax * 1.55 + 2;
                        if (size > cap) size = cap;
                    }
                }

                if (!reader.canRead) break;
                const r = reader.uint8();
                const g = reader.uint8();
                const b = reader.uint8();
                if (!reader.canRead) break;
                reader.uint8();
                if (!reader.canRead) break;
                const name = reader.utf8();

                if (!isValidCellState(posX, posY, size)) {
                    continue;
                }

                const hex = ((r << 16) | (g << 8) | b);
                const color = "#" + ("000000" + hex.toString(16)).slice(-6).toUpperCase();
                // После смерти головы хвост больше не считаем «своим»
                const isOwned = playerId === ownerId && !app.snakeEnded && type === 0;

                if (cellsByID.has(id)) {
                    const cell = cellsByID.get(id);
                    // Уничтожена, но снова в пакете — пересоздаём (анти-фантом)
                    if (cell.destroyed || cell._fadingOut) {
                        try { cell._finishDestroy?.(); } catch (_) {}
                        cellsByID.delete(id);
                        this.addCell(id, posX, posY, size, name, color, playerId, type);
                        const fresh = cellsByID.get(id);
                        if (fresh) applyServerCellState(fresh, posX, posY, size, this.now, true);
                        continue;
                    }

                    if (playerId) cell.setPlayerId(playerId);
                    if (type === 3 && !cell.isDeathFood) cell.setAsDeathFood();
                    else if (type === 1 && !cell.isFood) cell.setAsFood();

                    const instant = isOwned && (
                        shouldSnapCell(cell, posX, posY, border) ||
                        ownedPositions[id] == null
                    );

                    applyServerCellState(cell, posX, posY, size, this.now, instant);

                    if (color && color !== cell.color) {
                        cell.hasChanged = true;
                        cell.color = color;
                    }
                    if (name && name !== cell.name) {
                        cell.hasChanged = true;
                        cell.name = name;
                    }

                    if (isOwned && !app.ownedCells.includes(id)) {
                        app.ownedCells.push(id);
                        app.ownedCells.sort((a, b) => a - b);
                        app.refreshHeadCellId();
                    }
                } else {
                    this.addCell(id, posX, posY, size, name, color, playerId, type);
                    const cell = cellsByID.get(id);
                    if (!cell) continue;

                    applyServerCellState(cell, posX, posY, size, this.now, true);
                    cell.color = color;
                    cell.name = name;
                    if (type === 1) cell.setAsFood();
                    else if (type === 3) cell.setAsDeathFood();
                    if (isOwned) {
                        app.exitSpectateMode();
                        if (!app.ownedCells.includes(id)) {
                            app.ownedCells.push(id);
                            app.ownedCells.sort((a, b) => a - b);
                        }
                        app.refreshHeadCellId();
                        if (app.ownedCells.length === 1) {
                            snapCameraTo(app, posX, posY);
                            this.core.ui.onLifeStarted();
                            this.core.ui.updateMenuButtons();
                        }
                    }
                }
            }

            while (reader.canRead) {
                const killed = reader.uint32();
                const cell = cellsByID.get(killed);
                if (cell && !cell.destroyed && !cell._fadingOut) {
                    // Уход из FOV / повтор destroy — без прозрачного fade (дыры в середине змей)
                    cell.destroy(null, { instant: true });
                }
            }
        } catch (err) {
            console.warn("[Network] onNodesUpdate parse error:", err);
            return;
        }

        app.pickMainCell();
        app.applySegmentLayers();
        this.applyBoostToCells();
    }
}
