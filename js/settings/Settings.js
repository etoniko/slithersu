export class Settings {
    constructor(core) {
        this.core = core
        this._settings = this.core.store.settings
    }

    get rawSettings() {
        return this._settings
    }

    get skins() {
        return false;
    }

    set skins(_value) {
        // скины отключены
    }

    get names() {
        return this.rawSettings.names
    }

    set names(value) {
        for (const cell of this.core.app.cells) cell.hasChanged = true
        this.rawSettings.names = value
    }

    get mass() {
        return this.rawSettings.mass
    }

    set mass(value) {
        for (const cell of this.core.app.cells) cell.hasChanged = true
        this.rawSettings.mass = value
    }

    get background() {
        return this.rawSettings.background
    }

    set background(value) {
        this.rawSettings.background = value;
    }

    get sectors() {
        return this.rawSettings.sectors
    }

    set sectors(value) {
        this.rawSettings.sectors = value
    }

    get border() {
        return this.rawSettings.border !== false
    }

    set border(value) {
        this.rawSettings.border = value
    }
}
