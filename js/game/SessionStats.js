/** Статистика одной жизни — время, масса, буст, убийства. */
export class SessionStats {
    constructor() {
        this.reset();
    }

    reset() {
        this.active = false;
        this.startTime = 0;
        this.endTime = 0;
        this.kills = 0;
        this.boostMs = 0;
        this._boostOn = false;
        this._boostStartedAt = 0;
        this.massSamples = [];
        this.peakMass = 0;
        this.finalScore = 0;
        this._lastSampleAt = 0;
    }

    start() {
        this.reset();
        this.active = true;
        this.startTime = Date.now();
        this._lastSampleAt = 0;
    }

    setKills(n) {
        if (!this.active) return;
        this.kills = Math.max(0, n | 0);
    }

    tick(mass, boosting) {
        if (!this.active) return;
        const now = Date.now();
        const m = Math.max(0, mass | 0);

        if (boosting) {
            if (!this._boostOn) {
                this._boostOn = true;
                this._boostStartedAt = now;
            }
        } else if (this._boostOn) {
            this.boostMs += now - this._boostStartedAt;
            this._boostOn = false;
        }

        if (now - this._lastSampleAt >= 350) {
            this._lastSampleAt = now;
            this.massSamples.push({ t: now - this.startTime, m });
            if (this.massSamples.length > 360) this.massSamples.shift();
            if (m > this.peakMass) this.peakMass = m;
        }
    }

    stop(score = 0) {
        if (!this.active) return this.snapshot();
        const now = Date.now();
        if (this._boostOn) {
            this.boostMs += now - this._boostStartedAt;
            this._boostOn = false;
        }
        this.endTime = now;
        this.finalScore = Math.max(0, score | 0);
        if (this.massSamples.length === 0) {
            this.massSamples.push({ t: 0, m: 0 });
            this.massSamples.push({ t: Math.max(1, now - this.startTime), m: this.peakMass });
        }
        this.active = false;
        return this.snapshot();
    }

    snapshot() {
        const end = this.endTime || Date.now();
        const start = this.startTime || end;
        return {
            durationMs: Math.max(0, end - start),
            kills: this.kills | 0,
            boostMs: this.boostMs | 0,
            peakMass: this.peakMass | 0,
            score: this.finalScore | 0,
            massSamples: this.massSamples.slice()
        };
    }
}

export function formatPlayTime(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h} ч ${m} мин`;
    if (m > 0) return `${m} мин ${String(s).padStart(2, "0")} с`;
    return `${s} с`;
}
