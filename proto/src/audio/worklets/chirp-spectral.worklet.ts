/**
 * Chirp Spectral Processor (ICZT-based synthesis)
 * Generates audio from logarithmically-spaced frequency bins using direct additive synthesis.
 * Originally designed for CZT/ICZT approach, now uses direct sinusoidal synthesis.
 */

// Block processing constants  
const MAX_BLOCK_SIZE = 128;

class ChirpSpectralProcessor extends AudioWorkletProcessor {
    private numBins = 256;
    private spectralData = new Float32Array(256 * 4);
    private prevData = new Float32Array(256 * 4);
    private targetData = new Float32Array(256 * 4);
    private phases = new Float32Array(256);
    private interpSamples = 64;
    private interpT = 1.0;
    private interpStep: number;
    private frequencyMultiplier = 1.0;
    private octaveLow = 0;
    private octaveHigh = 0;
    private octaveMult = 0.5;
    private fMin = 20;
    private fMax = 20000;
    private timeline: Float32Array | null = null;
    private timelineFrameSize = 0;
    private timelineNumFrames = 0;
    private timelineTotalSamples = 0;
    private sampleCount = 0;

    // Harmonic Injection
    private harmonicCount = 0;
    private harmonicFalloff = 1.0;

    // Waveshaping
    private waveshapeCurve = 0;
    private waveshapeDrive = 1.0;
    private waveshapeMix = 0.0;

    // Pre-allocated block buffers to avoid GC
    private blockL = new Float32Array(MAX_BLOCK_SIZE);
    private blockR = new Float32Array(MAX_BLOCK_SIZE);

    constructor() {
        super();
        this.interpStep = 1.0 / (this.interpSamples + 1);

        this.port.onmessage = (e) => {
            switch (e.data.type) {
                case 'spectral-timeline':
                    this.timeline = e.data.frames;
                    this.timelineFrameSize = e.data.frameSize;
                    this.timelineNumFrames = e.data.numFrames;
                    this.timelineTotalSamples = e.data.totalSamples;
                    this.sampleCount = 0;
                    this.numBins = this.timelineFrameSize / 4;
                    this.ensureBufferSize(this.numBins);
                    for (let i = 0; i < this.timelineFrameSize; i++) {
                        this.spectralData[i] = this.timeline![i];
                    }
                    this.port.postMessage({ type: 'ready' });
                    break;
                case 'spectral-data': {
                    const data = e.data.data;
                    this.numBins = data.length / 4;
                    this.ensureBufferSize(this.numBins);

                    if (this.interpSamples === 0) {
                        this.spectralData.set(data);
                        this.targetData.set(data);
                        this.port.postMessage({ type: 'ready' });
                    } else {
                        this.prevData.set(this.spectralData);
                        this.targetData.set(data);
                        this.interpT = 0.0;
                    }
                    break;
                }
                case 'frequency-multiplier':
                    this.frequencyMultiplier = e.data.value;
                    break;
                case 'octave-doubling':
                    this.octaveLow = e.data.low;
                    this.octaveHigh = e.data.high;
                    this.octaveMult = e.data.multiplier;
                    break;
                case 'harmonic-injection':
                    this.harmonicCount = e.data.count;
                    this.harmonicFalloff = e.data.falloff;
                    break;
                case 'interp-samples':
                    this.interpSamples = e.data.value;
                    this.interpStep = this.interpSamples > 0 ? 1.0 / (this.interpSamples + 1) : 1.0;
                    break;
                case 'waveshape':
                    this.waveshapeCurve = e.data.curve;
                    this.waveshapeDrive = e.data.drive;
                    this.waveshapeMix = e.data.mix;
                    break;
            }
        };
    }

    private ensureBufferSize(bins: number): void {
        const needed = bins * 4;
        if (this.spectralData.length < needed) {
            this.spectralData = new Float32Array(needed);
            this.prevData = new Float32Array(needed);
            this.targetData = new Float32Array(needed);
            this.phases = new Float32Array(bins);
        }
    }

    getLogFreq(k: number): number {
        const ratio = this.fMax / this.fMin;
        return this.fMin * Math.pow(ratio, k / (this.numBins - 1)) * this.frequencyMultiplier;
    }

    synthesize(length: number): void {
        const blockL = this.blockL;
        const blockR = this.blockR;

        // Clear buffers
        for (let i = 0; i < length; i++) {
            blockL[i] = 0;
            blockR[i] = 0;
        }

        const nyquist = sampleRate * 0.5;
        const pi2 = 2 * Math.PI;
        const pi2Sr = pi2 / sampleRate;

        for (let bin = 0; bin < this.numBins; bin++) {
            const idx = bin * 4;
            const mag = this.spectralData[idx];
            const phaseOffset = this.spectralData[idx + 1];
            const pan = this.spectralData[idx + 2];

            if (mag < 0.001) continue;

            const freq = this.getLogFreq(bin);
            if (freq >= nyquist) continue;

            const db = mag * 60 - 60;
            const amp = Math.pow(10, db / 20);

            const panVal = (pan - 0.5) * 2;
            const gainL = Math.min(1, 1 - panVal) * amp;
            const gainR = Math.min(1, 1 + panVal) * amp;

            const phaseInc = freq * pi2Sr;
            let phase = this.phases[bin];

            // Baseline oscillator
            const offsetInRad = phaseOffset * pi2;
            for (let s = 0; s < length; s++) {
                const sample = Math.sin(phase + offsetInRad);
                blockL[s] += sample * gainL;
                blockR[s] += sample * gainR;
                phase += phaseInc;
            }
            this.phases[bin] = phase % pi2;

            // Octave doubling (sub-harmonics)
            if (this.octaveLow > 0) {
                let harmGain = this.octaveMult;
                for (let h = 1; h <= this.octaveLow; h++) {
                    const hScale = Math.pow(2, h);
                    const harmFreq = freq / hScale;
                    if (harmFreq < 20) break;

                    const harmPhaseInc = harmFreq * pi2Sr;
                    let harmPhase = this.phases[bin] / hScale;

                    for (let s = 0; s < length; s++) {
                        const sample = Math.sin(harmPhase + offsetInRad);
                        blockL[s] += sample * gainL * harmGain;
                        blockR[s] += sample * gainR * harmGain;
                        harmPhase += harmPhaseInc;
                    }
                    harmGain *= this.octaveMult;
                }
            }

            // Octave doubling (harmonics)
            if (this.octaveHigh > 0) {
                let harmGain = this.octaveMult;
                for (let h = 1; h <= this.octaveHigh; h++) {
                    const hScale = Math.pow(2, h);
                    const harmFreq = freq * hScale;
                    if (harmFreq >= nyquist) break;

                    const harmPhaseInc = harmFreq * pi2Sr;
                    let harmPhase = this.phases[bin] * hScale;

                    for (let s = 0; s < length; s++) {
                        const sample = Math.sin(harmPhase + offsetInRad);
                        blockL[s] += sample * gainL * harmGain;
                        blockR[s] += sample * gainR * harmGain;
                        harmPhase += harmPhaseInc;
                    }
                    harmGain *= this.octaveMult;
                }
            }

            // Integer Harmonics (Injection)
            if (this.harmonicCount > 0) {
                for (let h = 2; h <= this.harmonicCount + 1; h++) {
                    const harmFreq = freq * h;
                    if (harmFreq >= nyquist) break;

                    const gain = Math.pow(h, -this.harmonicFalloff);
                    const harmPhaseInc = harmFreq * pi2Sr;
                    let harmPhase = this.phases[bin] * h;

                    for (let s = 0; s < length; s++) {
                        const sample = Math.sin(harmPhase + offsetInRad);
                        blockL[s] += sample * gainL * gain;
                        blockR[s] += sample * gainR * gain;
                        harmPhase += harmPhaseInc;
                    }
                }
            }
        }
    }

    process(_inputs: Float32Array[][], outputs: Float32Array[][], _parameters: Record<string, Float32Array>): boolean {
        const output = outputs[0];
        const channelL = output[0];
        const channelR = output[1];
        const length = channelL.length;

        // 1. Update Interpolation (once per block for efficiency, or per-sample if needed)
        if (this.timeline && this.timelineNumFrames > 1) {
            const progress = this.sampleCount / this.timelineTotalSamples;
            const framePos = progress * (this.timelineNumFrames - 1);
            const frame0 = Math.floor(framePos);
            const frame1 = Math.min(frame0 + 1, this.timelineNumFrames - 1);
            const t = framePos - frame0;
            const offset0 = frame0 * this.timelineFrameSize;
            const offset1 = frame1 * this.timelineFrameSize;
            for (let j = 0; j < this.timelineFrameSize; j++) {
                this.spectralData[j] = this.timeline[offset0 + j] * (1 - t) + this.timeline[offset1 + j] * t;
            }
            this.sampleCount += length;
        } else if (this.interpSamples > 0 && this.interpT < 1.0) {
            this.interpT = Math.min(1.0, this.interpT + this.interpStep * length);
            const t = this.interpT;
            const invT = 1.0 - t;
            for (let j = 0; j < this.spectralData.length; j++) {
                this.spectralData[j] = this.prevData[j] * invT + this.targetData[j] * t;
            }
        }

        // 2. Synthesize
        this.synthesize(length);

        // 3. Waveshaping + Output
        const scale = 0.1;
        if (this.waveshapeCurve > 0 && this.waveshapeMix > 0.001) {
            for (let i = 0; i < length; i++) {
                channelL[i] = this.applyWaveshape(this.blockL[i]) * scale;
                channelR[i] = this.applyWaveshape(this.blockR[i]) * scale;
            }
        } else {
            for (let i = 0; i < length; i++) {
                channelL[i] = this.blockL[i] * scale;
                channelR[i] = this.blockR[i] * scale;
            }
        }

        return true;
    }

    private applyWaveshape(x: number): number {
        const driven = x * this.waveshapeDrive;
        let shaped: number;
        switch (this.waveshapeCurve) {
            case 1: shaped = Math.tanh(driven); break;
            case 2: shaped = driven - driven * driven * driven * 0.333; shaped = Math.max(-1, Math.min(1, shaped)); break;
            case 3: shaped = Math.sin(driven); break;
            default: return x;
        }
        return x * (1 - this.waveshapeMix) + shaped * this.waveshapeMix;
    }
}

registerProcessor('chirp-spectral-processor', ChirpSpectralProcessor);
