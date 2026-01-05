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
                for (let i = 0; i < this.timelineFrameSize; i++) {
                    this.spectralData[i] = this.timeline![i];
                }
                this.port.postMessage({ type: 'ready' });
            } else if (e.data.type === 'spectral-data') {
                const data = e.data.data;
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
            }
        };
    }

    process(_inputs: Float32Array[][], outputs: Float32Array[][], _parameters: Record<string, Float32Array>): boolean {
        const output = outputs[0];
        const channelL = output[0];
        const channelR = output[1];

        const numPoints = this.spectralData.length / 4;

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

            // Source: White Noise
            const noise = Math.random() * 2 - 1;
            let sumSubtracted = 0;

            const minFreq = 20;
            const maxFreq = 20000;
            const freqRange = maxFreq - minFreq;
            const binWidth = freqRange / numPoints;

            // Subtractive Filtering (Parallel Bank of SVF Band-Pass filters subtracted from noise)
            for (let bin = 0; bin < numPoints; bin++) {
                const idx = bin * 4;
                const suppression = this.spectralData[idx];
                const qVal = this.spectralData[idx + 1];

                if (suppression < 0.001) continue;

                const normalizedBin = bin / numPoints;
                const baseFreq = minFreq + freqRange * normalizedBin;
                const freq = baseFreq * this.frequencyMultiplier;

                if (freq >= sampleRate * 0.48) continue;

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

            const sample = noise - sumSubtracted;

            const gain = 0.01;
            channelL[i] = sample * gain;
            channelR[i] = sample * gain;
        }

        return true;
    }
}

registerProcessor('whitenoise-processor', WhitenoiseProcessor);
