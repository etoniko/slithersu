export class Storage {
    get settings() {
        const defaultSettings = {
            names: true,
            mass: false,
            background: true,
            sectors: false,
            border: true
        };

        let parsedSettings = {};
        try {
            const raw = localStorage.getItem("cigar3-settings");
            if (raw) parsedSettings = JSON.parse(raw) || {};
        } catch (_) {
            parsedSettings = {};
        }

        // Скины отключены — убираем старый ключ из сохранённых настроек
        delete parsedSettings.skins;
        // Массу на клетках больше не показываем
        parsedSettings.mass = false;

        const normalized = { ...defaultSettings };
        for (const key of Object.keys(defaultSettings)) {
            if (key in parsedSettings) normalized[key] = parsedSettings[key];
        }
        localStorage.setItem("cigar3-settings", JSON.stringify(normalized));
        return normalized;
    }

    set settings(settings) {
        localStorage.setItem("cigar3-settings", JSON.stringify(settings))
    }

    get name() {
        return localStorage.getItem("cigar3-name")
    }

    set name(name) {
        localStorage.setItem("cigar3-name", name)
    }

}
