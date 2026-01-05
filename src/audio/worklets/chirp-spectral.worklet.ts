/**
 * Chirp Spectral Processor (ICZT-based synthesis)
 * Generates audio from logarithmically-spaced frequency bins using direct additive synthesis.
 * Originally designed for CZT/ICZT approach, now uses direct sinusoidal synthesis.
 */

// Block processing constants  
const BLOCK_SIZE = 512;

class ChirpSpectralProcessor extends AudioWorkletProcessor {
    private numBins = 256;
    private spectralData = new Float32Array(this.numBins * 4);
    private prevData = new Float32Array(this.numBins * 4);
    private targetData = new Float32Array(this.numBins * 4);
    private phases = new Float32Array(this.numBins);
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

    constructor() {
        super();
        this.interpStep = 1.0 / (this.interpSamples + 1);

        this.port.onmessage = (e) => {
            if (e.data.type === 'spectral-timeline') {
                this.timeline = e.data.frames;
                this.timelineFrameSize = e.data.frameSize;
                this.timelineNumFrames = e.data.numFrames;
                this.timelineTotalSamples = e.data.totalSamples;
                this.sampleCount = 0;
                this.numBins = this.timelineFrameSize / 4;
                for (let i = 0; i < this.timelineFrameSize; i++) {
                    this.spectralData[i] = this.timeline![i];
                }
                this.port.postMessage({ type: 'ready' });
            } else if (e.data.type === 'spectral-data') {
                const data = e.data.data;
                this.numBins = data.length / 4;

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
            } else if (e.data.type === 'octave-doubling') {
                this.octaveLow = e.data.low;
                this.octaveHigh = e.data.high;
                this.octaveMult = e.data.multiplier;
            } else if (e.data.type === 'interp-samples') {
                this.interpSamples = e.data.value;
                this.interpStep = this.interpSamples > 0 ? 1.0 / (this.interpSamples + 1) : 1.0;
            }
        };
    }

    getLogFreq(k: number): number {
        const ratio = this.fMax / this.fMin;
        return this.fMin * Math.pow(ratio, k / (this.numBins - 1)) * this.frequencyMultiplier;
    }

    synthesizeBlock(): { left: Float32Array; right: Float32Array } {
        const blockL = new Float32Array(BLOCK_SIZE);
        const blockR = new Float32Array(BLOCK_SIZE);

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
            for (let s = 0; s < BLOCK_SIZE; s++) {
                const sample = Math.sin(phase + phaseOffset * pi2);
                blockL[s] += sample * gainL;
                blockR[s] += sample * gainR;

                phase += phaseInc;
                if (phase > pi2) phase -= pi2;
            }
            this.phases[bin] = phase;

            // Octave doubling (sub-harmonics)
            let harmGain = this.octaveMult;
            for (let h = 1; h <= this.octaveLow; h++) {
                const harmFreq = freq / Math.pow(2, h);
                if (harmFreq < 20) break;

                const harmPhaseInc = harmFreq * pi2Sr;
                let harmPhase = this.phases[bin] / Math.pow(2, h);

                for (let s = 0; s < BLOCK_SIZE; s++) {
                    const sample = Math.sin(harmPhase + phaseOffset * pi2);
                    blockL[s] += sample * gainL * harmGain;
                    blockR[s] += sample * gainR * harmGain;
                    harmPhase += harmPhaseInc;
                }
                harmGain *= this.octaveMult;
            }

            // Octave doubling (harmonics)
            harmGain = this.octaveMult;
            for (let h = 1; h <= this.octaveHigh; h++) {
                const harmFreq = freq * Math.pow(2, h);
                if (harmFreq >= nyquist) break;

                const harmPhaseInc = harmFreq * pi2Sr;
                let harmPhase = this.phases[bin] * Math.pow(2, h);

                for (let s = 0; s < BLOCK_SIZE; s++) {
                    const sample = Math.sin(harmPhase + phaseOffset * pi2);
                    blockL[s] += sample * gainL * harmGain;
                    blockR[s] += sample * gainR * harmGain;
                    harmPhase += harmPhaseInc;
                }
                harmGain *= this.octaveMult;
            }
        }

        return { left: blockL, right: blockR };
    }

    process(_inputs: Float32Array[][], outputs: Float32Array[][], _parameters: Record<string, Float32Array>): boolean {
        const output = outputs[0];
        const channelL = output[0];
        const channelR = output[1];

        for (let i = 0; i < channelL.length; i++) {
            // Timeline mode interpolation
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
                this.sampleCount++;
            }
            // Per-sample interpolation
            else if (this.interpSamples > 0 && this.interpT < 1.0) {
                this.interpT += this.interpStep;
                if (this.interpT > 1.0) this.interpT = 1.0;
                const t = this.interpT;
                const invT = 1.0 - t;
                for (let j = 0; j < this.spectralData.length; j++) {
                    this.spectralData[j] = this.prevData[j] * invT + this.targetData[j] * t;
                }
            }
        }

        const block = this.synthesizeBlock();

        const scale = 0.1;
        for (let i = 0; i < channelL.length; i++) {
            channelL[i] = block.left[i] * scale;
            channelR[i] = block.right[i] * scale;
        }

        return true;
    }
}

registerProcessor('chirp-spectral-processor', ChirpSpectralProcessor);
