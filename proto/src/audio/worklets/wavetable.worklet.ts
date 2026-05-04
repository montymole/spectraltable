/**
 * Wavetable Processor (AM Synthesis with Feedback)
 * Carrier wave(sine / saw / square / tri) modulated by reading line magnitudes.
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

    // Waveshaping
    private waveshapeCurve = 0;  // 0=none, 1=tanh, 2=polynomial, 3=sine fold, 4=custom LUT
    private waveshapeDrive = 1.0;
    private waveshapeMix = 0.0;
    private waveshapeLUT: Float32Array | null = null;

    // Saturation / soft clipping
    private saturationMode = 0; // 0=none, 1=gentle, 2=transistor (sym), 3=tube (asym)
    private saturationDrive = 1.0;
    private saturationMix = 0.0;

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
                    this.ensureBufferSizes(this.envelopeSize);
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
                    this.ensureBufferSizes(numPoints);

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

    private ensureBufferSizes(size: number): void {
        if (this.envelope.length < size) {
            this.envelope = new Float32Array(size);
            this.prevEnvelope = new Float32Array(size);
            this.targetEnvelope = new Float32Array(size);
        }
    }

    private carrier(phase: number, type: number): number {
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
        const length = channelL.length;

        if (this.envelopeSize < 2) {
            for (let i = 0; i < length; i++) {
                channelL[i] = 0;
                channelR[i] = 0;
            }
            return true;
        }

        const carrierPhaseInc = this.frequency / sampleRate;
        const envPhaseInc = carrierPhaseInc;
        const nyquist = sampleRate * 0.5;

        // 1. Update Interpolation (Block level)
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
            this.sampleCount += length;
        } else if (this.interpSamples > 0 && this.interpT < 1.0) {
            this.interpT = Math.min(1.0, this.interpT + this.interpStep * length);
            const t = this.interpT;
            const invT = 1.0 - t;
            for (let j = 0; j < this.envelopeSize; j++) {
                this.envelope[j] = this.prevEnvelope[j] * invT + this.targetEnvelope[j] * t;
            }
        }

        // 2. Synthesize Per Sample
        for (let i = 0; i < length; i++) {
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

            // Add low octaves
            if (this.octaveLow > 0) {
                let harmGain = this.octaveMult;
                for (let h = 1; h <= this.octaveLow; h++) {
                    const hScale = Math.pow(2, h);
                    const harmFreq = this.frequency / hScale;
                    if (harmFreq < 20) break;
                    const phaseIdx = h - 1;
                    const hPhaseInc = harmFreq / sampleRate;

                    const hSample = this.carrier(this.harmonicPhases[phaseIdx], this.carrierType);
                    const hEnvPos = this.harmonicEnvPhases[phaseIdx] * this.envelopeSize;
                    const hIdx0 = Math.floor(hEnvPos) % this.envelopeSize;
                    const hIdx1 = (hIdx0 + 1) % this.envelopeSize;
                    const hFrac = hEnvPos - Math.floor(hEnvPos);
                    const hAmp = this.envelope[hIdx0] * (1 - hFrac) + this.envelope[hIdx1] * hFrac;

                    totalSample += hSample * hAmp * harmGain;
                    this.harmonicPhases[phaseIdx] = (this.harmonicPhases[phaseIdx] + hPhaseInc) % 1.0;
                    this.harmonicEnvPhases[phaseIdx] = (this.harmonicEnvPhases[phaseIdx] + hPhaseInc) % 1.0;
                    harmGain *= this.octaveMult;
                }
            }

            // Add high octaves
            if (this.octaveHigh > 0) {
                let harmGain = this.octaveMult;
                for (let h = 1; h <= this.octaveHigh; h++) {
                    const hScale = Math.pow(2, h);
                    const harmFreq = this.frequency * hScale;
                    if (harmFreq >= nyquist) break;
                    const phaseIdx = 10 + (h - 1);
                    const hPhaseInc = harmFreq / sampleRate;

                    const hSample = this.carrier(this.harmonicPhases[phaseIdx], this.carrierType);
                    const hEnvPos = this.harmonicEnvPhases[phaseIdx] * this.envelopeSize;
                    const hIdx0 = Math.floor(hEnvPos) % this.envelopeSize;
                    const hIdx1 = (hIdx0 + 1) % this.envelopeSize;
                    const hFrac = hEnvPos - Math.floor(hEnvPos);
                    const hAmp = this.envelope[hIdx0] * (1 - hFrac) + this.envelope[hIdx1] * hFrac;

                    totalSample += hSample * hAmp * harmGain;
                    this.harmonicPhases[phaseIdx] = (this.harmonicPhases[phaseIdx] + hPhaseInc) % 1.0;
                    this.harmonicEnvPhases[phaseIdx] = (this.harmonicEnvPhases[phaseIdx] + hPhaseInc) % 1.0;
                    harmGain *= this.octaveMult;
                }
            }

            // Integer Harmonics (Injection)
            if (this.harmonicCount > 0) {
                for (let h = 2; h <= this.harmonicCount + 1; h++) {
                    const harmFreq = this.frequency * h;
                    if (harmFreq >= nyquist) break;
                    const gain = Math.pow(h, -this.harmonicFalloff);
                    const phaseIdx = h - 2;
                    if (phaseIdx >= this.harmonicPhasesInj.length) break;

                    const hPhaseInc = harmFreq / sampleRate;
                    const hSample = this.carrier(this.harmonicPhasesInj[phaseIdx], this.carrierType);
                    const hEnvPos = this.harmonicEnvPhasesInj[phaseIdx] * this.envelopeSize;
                    const hIdx0 = Math.floor(hEnvPos) % this.envelopeSize;
                    const hIdx1 = (hIdx0 + 1) % this.envelopeSize;
                    const hFrac = hEnvPos - Math.floor(hEnvPos);
                    const hAmp = this.envelope[hIdx0] * (1 - hFrac) + this.envelope[hIdx1] * hFrac;

                    totalSample += hSample * hAmp * gain;
                    this.harmonicPhasesInj[phaseIdx] = (this.harmonicPhasesInj[phaseIdx] + hPhaseInc) % 1.0;
                    this.harmonicEnvPhasesInj[phaseIdx] = (this.harmonicEnvPhasesInj[phaseIdx] + hPhaseInc) % 1.0;
                }
            }

            this.lastSample = totalSample;

            // Waveshaping post-process
            if (this.waveshapeCurve > 0 && this.waveshapeMix > 0.001) {
                const dry = totalSample;
                const driven = totalSample * this.waveshapeDrive;
                let shaped: number;
                switch (this.waveshapeCurve) {
                    case 1: // tanh — warm symmetric saturation
                        shaped = Math.tanh(driven);
                        break;
                    case 2: // polynomial — x - x^3, gentle odd-harmonic addition
                        shaped = driven - driven * driven * driven * 0.333;
                        shaped = Math.max(-1, Math.min(1, shaped));
                        break;
                    case 3: // sine fold — wraps signal through sin()
                        shaped = Math.sin(driven);
                        break;
                    case 4: // custom LUT in [-1..1]
                        shaped = this.applyWaveshapeLUT(driven);
                        break;
                    default:
                        shaped = driven;
                        break;
                }
                totalSample = dry * (1 - this.waveshapeMix) + shaped * this.waveshapeMix;
            }

            // Saturation / soft clip post-process
            if (this.saturationMode > 0 && this.saturationMix > 0.001) {
                totalSample = this.applySaturation(totalSample);
            }

            const gain = 0.5;
            channelL[i] = totalSample * gain;
            channelR[i] = totalSample * gain;

            this.phase = (this.phase + carrierPhaseInc) % 1.0;
            this.envPhase = (this.envPhase + envPhaseInc) % 1.0;
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
            case 1: // gentle odd-harmonic addition
                shaped = driven - driven * driven * driven * 0.333;
                shaped = Math.max(-1, Math.min(1, shaped));
                break;
            case 2: // transistor: symmetric soft clip
                shaped = Math.tanh(driven);
                break;
            case 3: { // tube: asymmetric soft clip (simple biased tanh)
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

registerProcessor('wavetable-processor', WavetableProcessor);
