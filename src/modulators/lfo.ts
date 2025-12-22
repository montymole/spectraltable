
export type LFOWaveform = 'sine' | 'square' | 'saw' | 'triangle';

export class LFO {
    public waveform: LFOWaveform = 'sine';
    public frequency: number = 0.5; // Hz
    public amplitude: number = 1.0; // 0-1 multiplier
    private phase: number = 0; // 0-1

    public offset: number = 0.0; // -1 to 1

    // Tempo Sync Properties
    public isSynced: boolean = false;
    public division: string = '1/4';
    private bpm: number = 140;

    constructor(freq: number = 1.0) {
        this.frequency = freq;
    }

    public setWaveform(wave: LFOWaveform): void {
        this.waveform = wave;
    }

    public setFrequency(freq: number): void {
        this.frequency = freq;
    }

    public setAmplitude(amp: number): void {
        this.amplitude = amp;
    }

    public setOffset(offset: number): void {
        this.offset = offset;
    }

    public setSync(synced: boolean): void {
        this.isSynced = synced;
    }

    public setDivision(div: string): void {
        this.division = div;
    }

    public setBPM(bpm: number): void {
        this.bpm = bpm;
    }

    private getSyncedFrequency(): number {
        // Frequency in Hz for a given beat division
        const isTriplet = this.division.endsWith('T');
        const cleanDiv = isTriplet ? this.division.slice(0, -1) : this.division;

        const parts = cleanDiv.split('/');
        const numerator = parseInt(parts[0]);
        const denominator = parseInt(parts[1]);
        const divisionMultiplier = numerator / denominator;

        // Beats per second
        const bps = this.bpm / 60;

        // Base frequency for 1/1 note (4 beats in 4/4) is bps / 4
        // But usually, 1/4 means the duration of one beat.
        // So frequency of 1/4 LFO is bps / 1.
        // frequency = 1 / duration
        // duration of 1/4 note = 1 beat
        // duration of 1/1 note = 4 beats

        const durationInBeats = 4 * (numerator / denominator);
        let freq = bps / durationInBeats;

        if (isTriplet) {
            freq *= 1.5; // Triplets are 1.5x faster (3 notes in space of 2)
        }

        return freq;
    }

    public update(deltaTime: number): number {
        const currentFreq = this.isSynced ? this.getSyncedFrequency() : this.frequency;

        // Increment phase (freq * seconds)
        this.phase += currentFreq * deltaTime;
        // Wrap 0-1
        if (this.phase >= 1.0) this.phase -= Math.floor(this.phase);

        let value = 0;
        switch (this.waveform) {
            case 'sine':
                value = Math.sin(this.phase * 2 * Math.PI);
                break;
            case 'square':
                value = this.phase < 0.5 ? 1.0 : -1.0;
                break;
            case 'saw':
                // 1.0 to -1.0
                value = 1.0 - 2.0 * this.phase;
                break;
            case 'triangle':
                value = this.phase < 0.5
                    ? 4.0 * this.phase - 1.0
                    : 3.0 - 4.0 * this.phase;
                break;
        }

        // Apply amplitude and offset
        let output = (value * this.amplitude) + this.offset;

        // Clamp to -1 to 1
        return Math.max(-1.0, Math.min(1.0, output));
    }
}
