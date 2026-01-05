/**
 * Wavetable Processor (AM Synthesis with Feedback)
 * Carrier wave (sine/saw/square/tri) modulated by reading line magnitudes.
 * Magnitude 0 = silence, Magnitude 1 = full carrier amplitude.
 * Feedback: previous output mixed back into carrier for evolving timbres.
 */

const WAVETABLE_INTERP_SAMPLES = 128;

class WavetableProcessor extends AudioWorkletProcessor {
    private interpSamples = WAVETABLE_INTERP_SAMPLES;
    private envelope = new Float32Array(1024);
    private prevEnvelope = new Float32Array(1024);
    private targetEnvelope = new Float32Array(1024);
    private envelopeSize = 64;
    private phase = 0;
    private envPhase = 0;
    private frequency = 220;
    private carrierType = 0;
    private feedback = 0;
    private lastSample = 0;
    private octaveLow = 0;
    private octaveHigh = 0;
    private octaveMult = 0.5;
    private harmonicPhases = new Float32Array(20);
    private harmonicEnvPhases = new Float32Array(20);

    // Harmonic Injection (Integer harmonics)
    private harmonicCount = 0;
    private harmonicFalloff = 1.0;
    private harmonicPhasesInj = new Float32Array(32);
    private harmonicEnvPhasesInj = new Float32Array(32);
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
            switch (e.data.type) {
                case 'spectral-timeline': {
                    this.timeline = e.data.frames;
                    this.timelineFrameSize = e.data.frameSize;
                    this.timelineNumFrames = e.data.numFrames;
                    this.timelineTotalSamples = e.data.totalSamples;
                    this.sampleCount = 0;
                    this.envelopeSize = this.timelineFrameSize / 4;
                    let maxMag = 0;
                    for (let i = 0; i < this.envelopeSize; i++) {
                        const mag = this.timeline![i * 4];
                        if (mag > maxMag) maxMag = mag;
                    }
                    const scale = maxMag > 0.001 ? 1.0 / maxMag : 1.0;
                    for (let i = 0; i < this.envelopeSize; i++) {
                        this.envelope[i] = this.timeline![i * 4] * scale;
                    }
                    this.port.postMessage({ type: 'ready' });
                    break;
                }
                case 'spectral-data': {
                    const data = e.data.data;
                    const numPoints = data.length / 4;
                    this.envelopeSize = numPoints;

                    let maxMag = 0;
                    for (let i = 0; i < numPoints; i++) {
                        const mag = data[i * 4];
                        if (mag > maxMag) maxMag = mag;
                    }

                    const scale = maxMag > 0.001 ? 1.0 / maxMag : 1.0;

                    if (this.interpSamples === 0) {
                        for (let i = 0; i < numPoints; i++) {
                            this.envelope[i] = data[i * 4] * scale;
                            this.targetEnvelope[i] = this.envelope[i];
                        }
                        this.port.postMessage({ type: 'ready' });
                    } else {
                        this.prevEnvelope.set(this.envelope);
                        for (let i = 0; i < numPoints; i++) {
                            this.targetEnvelope[i] = data[i * 4] * scale;
                        }
                        this.interpT = 0.0;
                    }
                    break;
                }
                case 'frequency':
                    this.frequency = e.data.value;
                    break;
                case 'carrier':
                    this.carrierType = e.data.value;
                    break;
                case 'feedback':
                    this.feedback = e.data.value;
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
            }
        };
    }

    carrier(phase: number, type: number): number {
        switch (type) {
            case 0: // Sine
                return Math.sin(phase * 2 * Math.PI);
            case 1: // Saw (falling)
                return 1 - 2 * phase;
            case 2: // Square
                return phase < 0.5 ? 1 : -1;
            case 3: // Triangle
                return phase < 0.5
                    ? 4 * phase - 1
                    : 3 - 4 * phase;
            default:
                return Math.sin(phase * 2 * Math.PI);
        }
    }

    process(_inputs: Float32Array[][], outputs: Float32Array[][], _parameters: Record<string, Float32Array>): boolean {
        const output = outputs[0];
        const channelL = output[0];
        const channelR = output[1];

        if (this.envelopeSize < 2) {
            for (let i = 0; i < channelL.length; i++) {
                channelL[i] = 0;
                channelR[i] = 0;
            }
            return true;
        }

        const carrierPhaseInc = this.frequency / sampleRate;
        const envPhaseInc = carrierPhaseInc;
        const nyquist = sampleRate * 0.5;

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
                let maxMag = 0;
                for (let j = 0; j < this.envelopeSize; j++) {
                    const mag0 = this.timeline[offset0 + j * 4];
                    const mag1 = this.timeline[offset1 + j * 4];
                    const mag = mag0 * (1 - t) + mag1 * t;
                    if (mag > maxMag) maxMag = mag;
                }
                const scale = maxMag > 0.001 ? 1.0 / maxMag : 1.0;
                for (let j = 0; j < this.envelopeSize; j++) {
                    const mag0 = this.timeline[offset0 + j * 4];
                    const mag1 = this.timeline[offset1 + j * 4];
                    this.envelope[j] = (mag0 * (1 - t) + mag1 * t) * scale;
                }
                this.sampleCount++;
            }
            // Per-sample interpolation advance
            else if (this.interpSamples > 0 && this.interpT < 1.0) {
                this.interpT += this.interpStep;
                if (this.interpT > 1.0) this.interpT = 1.0;

                const t = this.interpT;
                const invT = 1.0 - t;
                for (let j = 0; j < this.envelopeSize; j++) {
                    this.envelope[j] = this.prevEnvelope[j] * invT + this.targetEnvelope[j] * t;
                }
            }

            // Get envelope with linear interpolation
            const envPos = this.envPhase * this.envelopeSize;
            const envIdx0 = Math.floor(envPos) % this.envelopeSize;
            const envIdx1 = (envIdx0 + 1) % this.envelopeSize;
            const envFrac = envPos - Math.floor(envPos);
            const amplitude = this.envelope[envIdx0] * (1 - envFrac) + this.envelope[envIdx1] * envFrac;

            // Get base carrier sample
            let carrierSample = this.carrier(this.phase, this.carrierType);

            // Mix in feedback
            if (this.feedback > 0) {
                carrierSample = carrierSample * (1 - this.feedback * 0.5) + this.lastSample * this.feedback * 0.5;
            }

            // AM synthesis: carrier * envelope
            let totalSample = carrierSample * amplitude;

            // Add low octaves (doubling below)
            let harmGain = this.octaveMult;
            for (let h = 1; h <= this.octaveLow; h++) {
                const harmFreq = this.frequency / Math.pow(2, h);
                if (harmFreq < 20) break;
                const phaseIdx = h - 1;
                const harmPhaseInc = harmFreq / sampleRate;

                const harmCarrier = this.carrier(this.harmonicPhases[phaseIdx], this.carrierType);

                const harmEnvPos = this.harmonicEnvPhases[phaseIdx] * this.envelopeSize;
                const hEnvIdx0 = Math.floor(harmEnvPos) % this.envelopeSize;
                const hEnvIdx1 = (hEnvIdx0 + 1) % this.envelopeSize;
                const hEnvFrac = harmEnvPos - Math.floor(harmEnvPos);
                const harmAmp = this.envelope[hEnvIdx0] * (1 - hEnvFrac) + this.envelope[hEnvIdx1] * hEnvFrac;

                totalSample += harmCarrier * harmAmp * harmGain;

                this.harmonicPhases[phaseIdx] += harmPhaseInc;
                if (this.harmonicPhases[phaseIdx] >= 1.0) this.harmonicPhases[phaseIdx] -= 1.0;
                this.harmonicEnvPhases[phaseIdx] += harmPhaseInc;
                if (this.harmonicEnvPhases[phaseIdx] >= 1.0) this.harmonicEnvPhases[phaseIdx] -= 1.0;

                harmGain *= this.octaveMult;
            }

            // Add high octaves (doubling above)
            harmGain = this.octaveMult;
            for (let h = 1; h <= this.octaveHigh; h++) {
                const harmFreq = this.frequency * Math.pow(2, h);
                if (harmFreq >= nyquist) break;
                const phaseIdx = 10 + (h - 1);
                const harmPhaseInc = harmFreq / sampleRate;

                const harmCarrier = this.carrier(this.harmonicPhases[phaseIdx], this.carrierType);

                const harmEnvPos = this.harmonicEnvPhases[phaseIdx] * this.envelopeSize;
                const hEnvIdx0 = Math.floor(harmEnvPos) % this.envelopeSize;
                const hEnvIdx1 = (hEnvIdx0 + 1) % this.envelopeSize;
                const hEnvFrac = harmEnvPos - Math.floor(harmEnvPos);
                const harmAmp = this.envelope[hEnvIdx0] * (1 - hEnvFrac) + this.envelope[hEnvIdx1] * hEnvFrac;

                totalSample += harmCarrier * harmAmp * harmGain;

                this.harmonicPhases[phaseIdx] += harmPhaseInc;
                if (this.harmonicPhases[phaseIdx] >= 1.0) this.harmonicPhases[phaseIdx] -= 1.0;
                this.harmonicEnvPhases[phaseIdx] += harmPhaseInc;
                if (this.harmonicEnvPhases[phaseIdx] >= 1.0) this.harmonicEnvPhases[phaseIdx] -= 1.0;

                harmGain *= this.octaveMult;
            }

            // Integer Harmonics (Injection)
            if (this.harmonicCount > 0) {
                for (let h = 2; h <= this.harmonicCount + 1; h++) {
                    const harmFreq = this.frequency * h;
                    if (harmFreq >= nyquist) break;

                    const gain = Math.pow(h, -this.harmonicFalloff);
                    // Use a separate phase space, allocating 32 slots (h ranges from 2..33 basically)
                    const phaseIdx = h - 2;
                    if (phaseIdx >= this.harmonicPhasesInj.length) break;

                    const harmPhaseInc = harmFreq / sampleRate;
                    const harmCarrier = this.carrier(this.harmonicPhasesInj[phaseIdx], this.carrierType);

                    const harmEnvPos = this.harmonicEnvPhasesInj[phaseIdx] * this.envelopeSize;
                    const hEnvIdx0 = Math.floor(harmEnvPos) % this.envelopeSize;
                    const hEnvIdx1 = (hEnvIdx0 + 1) % this.envelopeSize;
                    const hEnvFrac = harmEnvPos - Math.floor(harmEnvPos);
                    const harmAmp = this.envelope[hEnvIdx0] * (1 - hEnvFrac) + this.envelope[hEnvIdx1] * hEnvFrac;

                    totalSample += harmCarrier * harmAmp * gain;

                    this.harmonicPhasesInj[phaseIdx] += harmPhaseInc;
                    if (this.harmonicPhasesInj[phaseIdx] >= 1.0) this.harmonicPhasesInj[phaseIdx] -= 1.0;
                    this.harmonicEnvPhasesInj[phaseIdx] += harmPhaseInc;
                    if (this.harmonicEnvPhasesInj[phaseIdx] >= 1.0) this.harmonicEnvPhasesInj[phaseIdx] -= 1.0;
                }
            }

            this.lastSample = totalSample;

            const gain = 0.5;
            channelL[i] = totalSample * gain;
            channelR[i] = totalSample * gain;

            this.phase += carrierPhaseInc;
            if (this.phase >= 1.0) this.phase -= 1.0;

            this.envPhase += envPhaseInc;
            if (this.envPhase >= 1.0) this.envPhase -= 1.0;
        }

        return true;
    }
}

registerProcessor('wavetable-processor', WavetableProcessor);
