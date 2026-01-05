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
                if (this.harmonicPhases.length !== numPoints * 20) {
                    this.harmonicPhases = new Float32Array(numPoints * 20);
                }
                for (let i = 0; i < this.timelineFrameSize; i++) {
                    this.spectralData[i] = this.timeline![i];
                }
                for (let bin = 0; bin < numPoints; bin++) {
                    this.currentPhaseOffsets[bin] = this.timeline![bin * 4 + 1];
                }
                this.port.postMessage({ type: 'ready' });
            } else if (e.data.type === 'spectral-data') {
                const data = e.data.data;
                const numPoints = data.length / 4;

                if (this.harmonicPhases.length !== numPoints * 20) {
                    this.harmonicPhases = new Float32Array(numPoints * 20);
                }

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

    process(_inputs: Float32Array[][], outputs: Float32Array[][], _parameters: Record<string, Float32Array>): boolean {
        const output = outputs[0];
        const channelL = output[0];
        const channelR = output[1];

        const numPoints = this.spectralData.length / 4;
        const nyquist = sampleRate * 0.5;
        const PI2_SR = (2 * Math.PI) / sampleRate;
        const PI2 = 2 * Math.PI;

        for (let i = 0; i < channelL.length; i++) {
            // Timeline mode: step through pre-computed frames
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
                this.sampleCount++;
            }
            // Per-sample interpolation advance
            else if (this.interpSamples > 0 && this.interpT < 1.0) {
                this.interpT += this.interpStep;
                if (this.interpT > 1.0) this.interpT = 1.0;

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

            let sumL = 0;
            let sumR = 0;

            for (let bin = 0; bin < numPoints; bin++) {
                const idx = bin * 4;
                const mag = this.spectralData[idx];
                const phaseOffset = this.currentPhaseOffsets[bin];
                const custom1 = this.spectralData[idx + 2];

                if (mag < 0.001) continue;

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

                const p = (custom1 - 0.5) * 2;
                const baseGainL = Math.min(1, 1 - p) * linearMag;
                const baseGainR = Math.min(1, 1 + p) * linearMag;

                // Helper to generate oscillator at given frequency with gain
                const generateOsc = (oscFreq: number, gain: number, phaseIdx: number) => {
                    if (gain < 0.001) return;
                    const nf = oscFreq / nyquist;
                    if (nf >= 1.0) return;
                    const rf = computeRolloff(nf, ROLLOFF_MODE);
                    if (rf < 0.001) return;

                    this.harmonicPhases[phaseIdx] += (oscFreq * PI2_SR);
                    if (this.harmonicPhases[phaseIdx] > PI2) {
                        this.harmonicPhases[phaseIdx] -= PI2;
                    }
                    const sample = Math.sin(this.harmonicPhases[phaseIdx] + phaseOffset * PI2);
                    sumL += sample * baseGainL * gain * rf;
                    sumR += sample * baseGainR * gain * rf;
                };

                // Base oscillator (fundamental)
                this.phaseAccumulators[bin] += (freq * PI2_SR);
                if (this.phaseAccumulators[bin] > PI2) {
                    this.phaseAccumulators[bin] -= PI2;
                }
                const currentPhase = this.phaseAccumulators[bin] + (phaseOffset * PI2);
                const sample = Math.sin(currentPhase);
                sumL += sample * baseGainL;
                sumR += sample * baseGainR;

                // Low octaves (doubling below)
                let harmGain = this.octaveMult;
                for (let h = 1; h <= this.octaveLow; h++) {
                    const harmFreq = freq / Math.pow(2, h);
                    if (harmFreq < 20) break;
                    const phaseIdx = bin * 20 + (h - 1);
                    generateOsc(harmFreq, harmGain, phaseIdx);
                    harmGain *= this.octaveMult;
                }

                // High octaves (doubling above)
                harmGain = this.octaveMult;
                for (let h = 1; h <= this.octaveHigh; h++) {
                    const harmFreq = freq * Math.pow(2, h);
                    const phaseIdx = bin * 20 + 10 + (h - 1);
                    generateOsc(harmFreq, harmGain, phaseIdx);
                    harmGain *= this.octaveMult;
                }
            }

            const scale = 0.1;
            channelL[i] = sumL * scale;
            channelR[i] = sumR * scale;
        }

        return true;
    }
}

registerProcessor('spectral-processor', SpectralProcessor);
