
export type LFOWaveform = 'sine' | 'square' | 'saw' | 'triangle';

export class LFO {
    public waveform: LFOWaveform = 'sine';
    public frequency: number = 0.5; // Hz
    public amplitude: number = 1.0; // 0-1 multiplier
    private phase: number = 0; // 0-1

    public offset: number = 0.0; // -1 to 1

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

    public update(deltaTime: number): number {
        // Increment phase (freq * seconds)
        this.phase += this.frequency * deltaTime;
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
                // -1 to 1 to -1
                // 0.0 -> -1
                // 0.5 -> 1
                // 1.0 -> -1
                // 4 * phase - 1 (0..0.5 maps to -1..1)
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
