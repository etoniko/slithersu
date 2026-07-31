import { servers, SERVER_WS_URL } from "../config/servers.js";
import { Application } from "../game/Application.js";
import { Storage } from "../settings/Storage.js";
import { Settings } from "../settings/Settings.js";
import { Network } from "../net/Network.js";
import { UserInterface } from "../ui/UserInterface.js";
import {
    initYandex,
    getIdentity,
    getDeviceType,
    applyDebugPlatformOverride
} from "../yandex/YandexSDK.js";

export class Game {
  constructor() {
    this.init();
  }

  async init() {
    this.app = new Application(this);
    this.store = new Storage();
    this.settings = new Settings(this);
    this.net = new Network(this);
    this.ui = new UserInterface(this);
    this.app.servers = servers;
    this.skins = null;
    this.account = { xp: 0, uid: localStorage.accountToken || "" };
    this.yandex = { uid: "", yaName: "", authorized: false };
    this.deviceType = "desktop";

    this.defaultServerUrl = SERVER_WS_URL;
    console.log("Ready — connect on Play:", SERVER_WS_URL);

    await initYandex();
    applyDebugPlatformOverride();
    this.deviceType = getDeviceType();
    this.yandex = getIdentity();
    this.ui?.onYandexReady?.(this.yandex);
    this.ui?.onPlatformReady?.(this.deviceType);
  }
}
