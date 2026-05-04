/**
 * Whitenoise Processor (Subtractive Synthesis)
 * Starts with white noise and applies a bank of notch filters.
 * spectralData[0] (R) = Frequency / Suppression amount
 * spectralData[1] (G) = Q/Bandwidth
 */

const WHITENOISE_INTERP_SAMPLES = 64;

class WhitenoiseProcessor extends AudioWorkletProcessor {
    private interpSamples = WHITENOISE_INTERP_SAMPLES;
    private spectralData = new Float32Array(1024 * 4);
    private prevData = new Float32Array(1024 * 4);
    private targetData = new Float32Array(1024 * 4);
    private lowStates = new Float32Array(1024);
    private bandStates = new Float32Array(1024);

    private frequencyMultiplier = 1.0;
    private interpT = 1.0;
    private interpStep: number;
    private timeline: Float32Array | null = null;
    private timelineFrameSize = 0;
    private timelineNumFrames = 0;
    private timelineTotalSamples = 0;
    private sampleCount = 0;

    // Waveshaping
    private waveshapeCurve = 0; // 0=none, 1=tanh, 2=polynomial, 3=sine fold, 4=custom LUT
    private waveshapeDrive = 1.0;
    private waveshapeMix = 0.0;
    private waveshapeLUT: Float32Array | null = null;

    // Saturation / soft clipping
    private saturationMode = 0; // 0=none, 1=gentle, 2=transistor (sym), 3=tube (asym)
    private saturationDrive = 1.0;
    private saturationMix = 0.0;

    constructor() {
        super();
        this.interpStep = this.interpSamples > 0 ? 1.0 / (this.interpSamples + 1) : 1.0;

        this.port.onmessage = (e) => {
            if (e.data.type === 'spectral-timeline') {
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
                this.port.postMessage({ type: 'ready' });
            } else if (e.data.type === 'spectral-data') {
                const data = e.data.data;
                const numPoints = data.length / 4;
                this.ensureBufferSizes(numPoints);

                if (this.interpSamples === 0) {
                    this.spectralData.set(data);
                    this.targetData.set(data);
                    this.port.postMessage({ type: 'ready' });
                } else {
                    this.prevData.set(this.spectralData);
                    this.targetData.set(data);
                    this.interpT = 0.0;
                }
            } else if (e.data.type === 'frequency-multiplier') {
                this.frequencyMultiplier = e.data.value;
            } else if (e.data.type === 'interp-samples') {
                this.interpSamples = e.data.value;
                this.interpStep = this.interpSamples > 0 ? 1.0 / (this.interpSamples + 1) : 1.0;
            } else if (e.data.type === 'waveshape') {
                this.waveshapeCurve = e.data.curve;
                this.waveshapeDrive = e.data.drive;
                this.waveshapeMix = e.data.mix;
            } else if (e.data.type === 'waveshape-lut') {
                this.waveshapeLUT = e.data.lut;
            } else if (e.data.type === 'saturation') {
                this.saturationMode = e.data.mode;
                this.saturationDrive = e.data.drive;
                this.saturationMix = e.data.mix;
            }
        };
    }

    private ensureBufferSizes(numPoints: number): void {
        if (this.spectralData.length < numPoints * 4) {
            this.spectralData = new Float32Array(numPoints * 4);
            this.prevData = new Float32Array(numPoints * 4);
            this.targetData = new Float32Array(numPoints * 4);
            this.lowStates = new Float32Array(numPoints);
            this.bandStates = new Float32Array(numPoints);
        }
    }

    process(_inputs: Float32Array[][], outputs: Float32Array[][], _parameters: Record<string, Float32Array>): boolean {
        const output = outputs[0];
        const channelL = output[0];
        const channelR = output[1];
        const length = channelL.length;

        const numPoints = this.spectralData.length / 4;

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
            this.sampleCount += length;
        } else if (this.interpSamples > 0 && this.interpT < 1.0) {
            this.interpT = Math.min(1.0, this.interpT + this.interpStep * length);
            const t = this.interpT;
            const invT = 1.0 - t;
            for (let j = 0; j < this.spectralData.length; j++) {
                this.spectralData[j] = this.prevData[j] * invT + this.targetData[j] * t;
            }
        }

        // 2. Filter Bank Processing
        const minFreq = 20;
        const maxFreq = 20000;
        const freqRange = maxFreq - minFreq;
        const binWidth = freqRange / numPoints;

        for (let i = 0; i < length; i++) {
            // Source: White Noise
            const noise = Math.random() * 2 - 1;
            let sumSubtracted = 0;

            for (let bin = 0; bin < numPoints; bin++) {
                const idx = bin * 4;
                const suppression = this.spectralData[idx];
                const qVal = this.spectralData[idx + 1];

                if (suppression < 0.001) continue;

                const normalizedBin = bin / numPoints;
                const baseFreq = minFreq + freqRange * normalizedBin;
                const freq = baseFreq * this.frequencyMultiplier;

                // Cap frequency to avoid SVF instability
                if (freq >= sampleRate * 0.45) continue;

                const widthInBins = qVal * 10 + 0.1;
                const BW = binWidth * widthInBins;
                const Q = Math.max(0.5, freq / BW);

                const f = 2.0 * Math.sin(Math.PI * freq / sampleRate);
                const q = 1.0 / Q;

                this.lowStates[bin] = this.lowStates[bin] + f * this.bandStates[bin];
                const high = noise - this.lowStates[bin] - q * this.bandStates[bin];
                const band = f * high + this.bandStates[bin];
                this.bandStates[bin] = band;

                sumSubtracted += band * suppression;
            }

            let sample = noise - sumSubtracted;

            if (this.waveshapeCurve > 0 && this.waveshapeMix > 0.001) {
                const dry = sample;
                const driven = sample * this.waveshapeDrive;
                let shaped: number;
                switch (this.waveshapeCurve) {
                    case 1: shaped = Math.tanh(driven); break;
                    case 2: shaped = driven - driven * driven * driven * 0.333; shaped = Math.max(-1, Math.min(1, shaped)); break;
                    case 3: shaped = Math.sin(driven); break;
                    case 4: shaped = this.applyWaveshapeLUT(driven); break;
                    default: shaped = driven; break;
                }
                sample = dry * (1 - this.waveshapeMix) + shaped * this.waveshapeMix;
            }

            if (this.saturationMode > 0 && this.saturationMix > 0.001) {
                sample = this.applySaturation(sample);
            }

            const gain = 0.01;
            channelL[i] = sample * gain;
            channelR[i] = sample * gain;
        }

        return true;
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

registerProcessor('whitenoise-processor', WhitenoiseProcessor);
