/**
 * Spectral Processor (Additive/iFFT Synthesis)
 * Generates audio from logarithmically-spaced frequency bins using additive synthesis.
 * Each bin has: magnitude, phase offset, pan, and custom parameter.
 */

// Band-limiting constants
const NYQUIST_LIMIT = 0.45;  // 45% of Nyquist (conservative margin)
const ROLLOFF_MODE = 2;       // 0=hard, 1=smoothstep, 2=cosine, 3=hann

// Rolloff functions: t in [0,1], returns attenuation factor [0,1]
function rolloffHard(t: number): number {
    return t < 0.001 ? 1.0 : 0.0;
}
function rolloffSmoothstep(t: number): number {
    const x = 1.0 - t;
    return x * x * (3.0 - 2.0 * x);
}
function rolloffCosine(t: number): number {
    return 0.5 * (1.0 + Math.cos(t * Math.PI));
}
function rolloffHann(t: number): number {
    return 0.5 * (1.0 - Math.cos((1.0 - t) * Math.PI));
}

function computeRolloff(normalizedFreq: number, mode: number): number {
    if (normalizedFreq <= NYQUIST_LIMIT) return 1.0;
    if (normalizedFreq >= 1.0) return 0.0;

    const t = (normalizedFreq - NYQUIST_LIMIT) / (1.0 - NYQUIST_LIMIT);

    switch (mode) {
        case 0: return rolloffHard(t);
        case 1: return rolloffSmoothstep(t);
        case 2: return rolloffCosine(t);
        case 3: return rolloffHann(t);
        default: return rolloffSmoothstep(t);
    }
}

const SPECTRAL_INTERP_SAMPLES = 64;
const SPECTRAL_MAX_BLOCK_SIZE = 128;

class SpectralProcessor extends AudioWorkletProcessor {
    private interpSamples = SPECTRAL_INTERP_SAMPLES;
    private spectralData = new Float32Array(1024 * 4);
    private prevData = new Float32Array(1024 * 4);
    private targetData = new Float32Array(1024 * 4);
    private phaseAccumulators = new Float32Array(1024);
    private prevPhaseOffsets = new Float32Array(1024);
    private targetPhaseOffsets = new Float32Array(1024);
    private currentPhaseOffsets = new Float32Array(1024);
    private frequencyMultiplier = 1.0;
    private octaveLow = 0;
    private octaveHigh = 0;
    private octaveMult = 0.5;
    private harmonicPhases = new Float32Array(1024 * 20);
    private interpT = 1.0;
    private interpStep: number;
    private timeline: Float32Array | null = null;
    private timelineFrameSize = 0;
    private timelineNumFrames = 0;
    private timelineTotalSamples = 0;
    private sampleCount = 0;
    private disposed = false;

    // Harmonic Injection
    private harmonicCount = 0;
    private harmonicFalloff = 1.0;
    private harmonicPhasesExtra = new Float32Array(1024 * 32);

    // Spectral Copy
    private spectralCopyShift = 12; // Semitones
    private spectralCopyMix = 0.0;
    private spectralCopyPhases = new Float32Array(1024);

    // Waveshaping
    private waveshapeCurve = 0; // 0=none, 1=tanh, 2=polynomial, 3=sine fold, 4=custom LUT
    private waveshapeDrive = 1.0;
    private waveshapeMix = 0.0;
    private waveshapeLUT: Float32Array | null = null;

    // Saturation / soft clipping
    private saturationMode = 0; // 0=none, 1=gentle, 2=transistor (sym), 3=tube (asym)
    private saturationDrive = 1.0;
    private saturationMix = 0.0;

    // Pre-allocated block buffers
    private blockL = new Float32Array(SPECTRAL_MAX_BLOCK_SIZE);
    private blockR = new Float32Array(SPECTRAL_MAX_BLOCK_SIZE);

    constructor() {
        super();
        this.interpStep = this.interpSamples > 0 ? 1.0 / (this.interpSamples + 1) : 1.0;

        this.port.onmessage = (e) => {
            switch (e.data.type) {
                case 'dispose':
                    this.disposed = true;
                    break;
                case 'spectral-timeline': {
                    this.timeline = e.data.frames;
                    this.timelineFrameSize = e.data.frameSize;
                    this.timelineNumFrames = e.data.numFrames;
                    this.timelineTotalSamples = e.data.totalSamples;
                    this.sampleCount = 0;
                    const numPoints = this.timelineFrameSize / 4;
                    this.ensureBufferSizes(numPoints);
                    for (let i = 0; i < this.timelineFrameSize; i++) {
                        this.spectralData[i] = this.timeline![i];
                    }
                    for (let bin = 0; bin < numPoints; bin++) {
                        this.currentPhaseOffsets[bin] = this.timeline![bin * 4 + 1];
                    }
                    this.port.postMessage({ type: 'ready' });
                    break;
                }
                case 'spectral-data': {
                    const data = e.data.data;
                    const numPoints = data.length / 4;
                    this.ensureBufferSizes(numPoints);

                    if (this.interpSamples === 0) {
                        this.spectralData.set(data);
                        this.targetData.set(data);
                        for (let bin = 0; bin < numPoints; bin++) {
                            const offset = data[bin * 4 + 1];
                            this.currentPhaseOffsets[bin] = offset;
                            this.targetPhaseOffsets[bin] = offset;
                        }
                        this.port.postMessage({ type: 'ready' });
                    } else {
                        this.prevData.set(this.spectralData);
                        this.prevPhaseOffsets.set(this.currentPhaseOffsets);
                        this.targetData.set(data);
                        for (let bin = 0; bin < numPoints; bin++) {
                            this.targetPhaseOffsets[bin] = data[bin * 4 + 1];
                        }
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
                case 'spectral-copy':
                    this.spectralCopyShift = e.data.shift;
                    this.spectralCopyMix = e.data.mix;
                    break;
                case 'waveshape':
                    this.waveshapeCurve = e.data.curve;
                    this.waveshapeDrive = e.data.drive;
                    this.waveshapeMix = e.data.mix;
                    break;
                case 'waveshape-lut':
                    this.waveshapeLUT = e.data.lut;
                    break;
                case 'saturation':
                    this.saturationMode = e.data.mode;
                    this.saturationDrive = e.data.drive;
                    this.saturationMix = e.data.mix;
                    break;
            }
        };
    }

    private ensureBufferSizes(numPoints: number): void {
        if (this.spectralData.length < numPoints * 4) {
            this.spectralData = new Float32Array(numPoints * 4);
            this.prevData = new Float32Array(numPoints * 4);
            this.targetData = new Float32Array(numPoints * 4);
            this.phaseAccumulators = new Float32Array(numPoints);
            this.prevPhaseOffsets = new Float32Array(numPoints);
            this.targetPhaseOffsets = new Float32Array(numPoints);
            this.currentPhaseOffsets = new Float32Array(numPoints);
            this.spectralCopyPhases = new Float32Array(numPoints);
        }
        if (this.harmonicPhases.length < numPoints * 20) {
            this.harmonicPhases = new Float32Array(numPoints * 20);
        }
        if (this.harmonicPhasesExtra.length < numPoints * 32) {
            this.harmonicPhasesExtra = new Float32Array(numPoints * 32);
        }
    }

    private sanitizeSample(value: number): number {
        if (!Number.isFinite(value)) return 0;
        return Math.max(-1, Math.min(1, value));
    }

    process(_inputs: Float32Array[][], outputs: Float32Array[][], _parameters: Record<string, Float32Array>): boolean {
        if (this.disposed) return false;
        const output = outputs[0];
        const channelL = output[0];
        const channelR = output[1];
        const length = channelL.length;

        const numPoints = this.spectralData.length / 4;
        const nyquist = sampleRate * 0.5;
        const PI2_SR = (2 * Math.PI) / sampleRate;
        const PI2 = 2 * Math.PI;

        // 1. Update Interpolation (Block level)
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
            const np = this.timelineFrameSize / 4;
            for (let bin = 0; bin < np; bin++) {
                this.currentPhaseOffsets[bin] = this.spectralData[bin * 4 + 1];
            }
            this.sampleCount += length;
        } else if (this.interpSamples > 0 && this.interpT < 1.0) {
            this.interpT = Math.min(1.0, this.interpT + this.interpStep * length);
            const t = this.interpT;
            const invT = 1.0 - t;

            for (let j = 0; j < this.spectralData.length; j++) {
                this.spectralData[j] = this.prevData[j] * invT + this.targetData[j] * t;
            }

            for (let bin = 0; bin < numPoints; bin++) {
                this.currentPhaseOffsets[bin] =
                    this.prevPhaseOffsets[bin] * invT + this.targetPhaseOffsets[bin] * t;
            }
        }

        // 2. Clear pre-allocated block buffers
        for (let i = 0; i < length; i++) {
            this.blockL[i] = 0;
            this.blockR[i] = 0;
        }

        // 3. Additive Synthesis
        for (let bin = 0; bin < numPoints; bin++) {
            const idx = bin * 4;
            const mag = this.spectralData[idx];
            if (mag < 0.001) continue;

            const phaseOffset = this.currentPhaseOffsets[bin];
            const pan = this.spectralData[idx + 2];

            const minFreq = 20;
            const maxFreq = 20000;
            const normalizedBin = bin / numPoints;
            const baseFreq = minFreq + (maxFreq - minFreq) * normalizedBin;
            const freq = baseFreq * this.frequencyMultiplier;

            const normalizedFreq = freq / nyquist;
            if (normalizedFreq >= 1.0) continue;

            const rolloffGain = computeRolloff(normalizedFreq, ROLLOFF_MODE);
            if (rolloffGain < 0.001) continue;

            const db = mag * 60 - 60;
            const linearMag = Math.pow(10, db / 20) * rolloffGain;

            const p = (pan - 0.5) * 2;
            const baseGainL = Math.min(1, 1 - p) * linearMag;
            const baseGainR = Math.min(1, 1 + p) * linearMag;

            const phaseInc = freq * PI2_SR;
            const offsetInRad = phaseOffset * PI2;

            // Base oscillator
            let phase = this.phaseAccumulators[bin];
            for (let i = 0; i < length; i++) {
                const sample = Math.sin(phase + offsetInRad);
                this.blockL[i] += sample * baseGainL;
                this.blockR[i] += sample * baseGainR;
                phase += phaseInc;
            }
            this.phaseAccumulators[bin] = phase % PI2;

            // Low octaves
            if (this.octaveLow > 0) {
                let harmGain = this.octaveMult;
                for (let h = 1; h <= this.octaveLow; h++) {
                    const hScale = Math.pow(2, h);
                    const hFreq = freq / hScale;
                    if (hFreq < 20) break;

                    const hPhaseInc = hFreq * PI2_SR;
                    const phaseIdx = bin * 20 + (h - 1);
                    let hPhase = this.harmonicPhases[phaseIdx];

                    for (let i = 0; i < length; i++) {
                        const sample = Math.sin(hPhase + offsetInRad);
                        this.blockL[i] += sample * baseGainL * harmGain;
                        this.blockR[i] += sample * baseGainR * harmGain;
                        hPhase += hPhaseInc;
                    }
                    this.harmonicPhases[phaseIdx] = hPhase % PI2;
                    harmGain *= this.octaveMult;
                }
            }

            // High octaves
            if (this.octaveHigh > 0) {
                let harmGain = this.octaveMult;
                for (let h = 1; h <= this.octaveHigh; h++) {
                    const hScale = Math.pow(2, h);
                    const hFreq = freq * hScale;
                    if (hFreq >= nyquist) break;

                    const hPhaseInc = hFreq * PI2_SR;
                    const phaseIdx = bin * 20 + 10 + (h - 1);
                    let hPhase = this.harmonicPhases[phaseIdx];

                    for (let i = 0; i < length; i++) {
                        const sample = Math.sin(hPhase + offsetInRad);
                        this.blockL[i] += sample * baseGainL * harmGain;
                        this.blockR[i] += sample * baseGainR * harmGain;
                        hPhase += hPhaseInc;
                    }
                    this.harmonicPhases[phaseIdx] = hPhase % PI2;
                    harmGain *= this.octaveMult;
                }
            }

            // Integer Harmonics (Injection)
            if (this.harmonicCount > 0) {
                for (let h = 2; h <= this.harmonicCount + 1; h++) {
                    const hFreq = freq * h;
                    if (hFreq >= nyquist) break;

                    const injGain = Math.pow(h, -this.harmonicFalloff);
                    const hPhaseInc = hFreq * PI2_SR;
                    const phaseIdx = bin * 32 + (h - 2);
                    let hPhase = this.harmonicPhasesExtra[phaseIdx];

                    for (let i = 0; i < length; i++) {
                        const sample = Math.sin(hPhase + offsetInRad);
                        this.blockL[i] += sample * baseGainL * injGain;
                        this.blockR[i] += sample * baseGainR * injGain;
                        hPhase += hPhaseInc;
                    }
                    this.harmonicPhasesExtra[phaseIdx] = hPhase % PI2;
                }
            }

            // Spectral Copy
            if (this.spectralCopyMix > 0.001) {
                const shiftScale = Math.pow(2, this.spectralCopyShift / 12.0);
                const cFreq = freq * shiftScale;
                if (cFreq < nyquist) {
                    const cPhaseInc = cFreq * PI2_SR;
                    let cPhase = this.spectralCopyPhases[bin];
                    for (let i = 0; i < length; i++) {
                        const sample = Math.sin(cPhase + offsetInRad);
                        this.blockL[i] += sample * baseGainL * this.spectralCopyMix;
                        this.blockR[i] += sample * baseGainR * this.spectralCopyMix;
                        cPhase += cPhaseInc;
                    }
                    this.spectralCopyPhases[bin] = cPhase % PI2;
                }
            }
        }

        // 4. Waveshaping + Saturation + Output
        const scale = 0.1;
        const doWaveshape = this.waveshapeCurve > 0 && this.waveshapeMix > 0.001;
        const doSat = this.saturationMode > 0 && this.saturationMix > 0.001;
        for (let i = 0; i < length; i++) {
            let l = this.blockL[i];
            let r = this.blockR[i];
            if (doWaveshape) {
                l = this.applyWaveshape(l);
                r = this.applyWaveshape(r);
            }
            if (doSat) {
                l = this.applySaturation(l);
                r = this.applySaturation(r);
            }
            channelL[i] = this.sanitizeSample(l * scale);
            channelR[i] = this.sanitizeSample(r * scale);
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
            case 4: shaped = this.applyWaveshapeLUT(driven); break;
            default: return x;
        }
        return x * (1 - this.waveshapeMix) + shaped * this.waveshapeMix;
    }

    private applyWaveshapeLUT(x: number): number {
        const lut = this.waveshapeLUT;
        if (!lut || lut.length < 2) return Math.max(-1, Math.min(1, x));
        const t = (Math.max(-1, Math.min(1, x)) + 1) * 0.5 * (lut.length - 1);
        const i0 = Math.floor(t);
        const i1 = Math.min(lut.length - 1, i0 + 1);
        const frac = t - i0;
        return lut[i0] * (1 - frac) + lut[i1] * frac;
    }

    private applySaturation(x: number): number {
        const dry = x;
        const driven = x * this.saturationDrive;
        let shaped = driven;
        switch (this.saturationMode) {
            case 1:
                shaped = driven - driven * driven * driven * 0.333;
                shaped = Math.max(-1, Math.min(1, shaped));
                break;
            case 2:
                shaped = Math.tanh(driven);
                break;
            case 3: {
                const bias = 0.2;
                const base = Math.tanh(bias);
                const denom = Math.max(1e-6, 1 - base);
                shaped = (Math.tanh(driven + bias) - base) / denom;
                shaped = Math.max(-1, Math.min(1, shaped));
                break;
            }
            default:
                shaped = driven;
        }
        return dry * (1 - this.saturationMix) + shaped * this.saturationMix;
    }
}

registerProcessor('spectral-processor', SpectralProcessor);
