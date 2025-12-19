
// Audio Engine for Spectral Table
// Handles AudioContext, Worklet loading, and synthesis modes (spectral/wavetable)

import { SynthMode } from '../types';

// Processor code for spectral (additive/iFFT) synthesis
const SPECTRAL_PROCESSOR_CODE = `
// Band-limiting constants
const NYQUIST_LIMIT = 0.45;  // 0.45 = 45% of Nyquist (conservative margin)
const ROLLOFF_MODE = 2;       // 0=hard, 1=smoothstep, 2=cosine, 3=hann

// Rolloff functions: t in [0,1], returns attenuation factor [0,1]
// t=0 means at limit edge (full signal), t=1 means at Nyquist (zero signal)
function rolloffHard(t) {
    return t < 0.001 ? 1.0 : 0.0;
}
function rolloffSmoothstep(t) {
    const x = 1.0 - t;
    return x * x * (3.0 - 2.0 * x);
}
function rolloffCosine(t) {
    return 0.5 * (1.0 + Math.cos(t * Math.PI));
}
function rolloffHann(t) {
    return 0.5 * (1.0 - Math.cos((1.0 - t) * Math.PI));
}

function computeRolloff(normalizedFreq, mode) {
    // normalizedFreq = freq / nyquist, range [0, 1+]
    if (normalizedFreq <= NYQUIST_LIMIT) return 1.0;
    if (normalizedFreq >= 1.0) return 0.0;
    
    // t: 0 at limit, 1 at nyquist
    const t = (normalizedFreq - NYQUIST_LIMIT) / (1.0 - NYQUIST_LIMIT);
    
    switch (mode) {
        case 0: return rolloffHard(t);
        case 1: return rolloffSmoothstep(t);
        case 2: return rolloffCosine(t);
        case 3: return rolloffHann(t);
        default: return rolloffSmoothstep(t);
    }
}

// Interpolation: intermediate samples between spectral frame transitions
// 0 = OFF (instant update, may cause rattling on sudden changes)
// 1 = 1 intermediate sample, 2 = 2 intermediate samples, etc.
const INTERP_SAMPLES = 64;

class SpectralProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        // Current working spectral data (interpolated)
        this.spectralData = new Float32Array(1024 * 4);
        // Previous frame (start of interpolation)
        this.prevData = new Float32Array(1024 * 4);
        // Target frame (end of interpolation)  
        this.targetData = new Float32Array(1024 * 4);
        
        // Phase accumulator per bin - runs continuously, never reset
        this.phaseAccumulators = new Float32Array(1024);
        
        // Per-bin phase offset targets (from spectral data)
        // We interpolate toward these to avoid discontinuities
        this.prevPhaseOffsets = new Float32Array(1024);
        this.targetPhaseOffsets = new Float32Array(1024);
        this.currentPhaseOffsets = new Float32Array(1024);
        
        this.frequencyMultiplier = 1.0;
        
        // Interpolation state: 0 = at prev, 1 = at target
        this.interpT = 1.0;
        // N intermediate samples means N+1 total steps to reach target
        this.interpStep = INTERP_SAMPLES > 0 ? 1.0 / (INTERP_SAMPLES + 1) : 1.0;
        
        this.port.onmessage = (e) => {
            if (e.data.type === 'spectral-data') {
                const data = e.data.data;
                const numPoints = data.length / 4;
                
                if (INTERP_SAMPLES === 0) {
                    // No interpolation - instant update
                    this.spectralData.set(data);
                    this.targetData.set(data);
                    // Extract phase offsets
                    for (let bin = 0; bin < numPoints; bin++) {
                        const offset = data[bin * 4 + 1];
                        this.currentPhaseOffsets[bin] = offset;
                        this.targetPhaseOffsets[bin] = offset;
                    }
                } else {
                    // Snapshot current state as previous
                    this.prevData.set(this.spectralData);
                    this.prevPhaseOffsets.set(this.currentPhaseOffsets);
                    
                    // New incoming data is target
                    this.targetData.set(data);
                    for (let bin = 0; bin < numPoints; bin++) {
                        this.targetPhaseOffsets[bin] = data[bin * 4 + 1];
                    }
                    
                    // Reset interpolation
                    this.interpT = 0.0;
                }
            } else if (e.data.type === 'frequency-multiplier') {
                this.frequencyMultiplier = e.data.value;
            }
        };
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0];
        const channelL = output[0];
        const channelR = output[1];
        
        const numPoints = this.spectralData.length / 4;
        const nyquist = sampleRate * 0.5;
        
        for (let i = 0; i < channelL.length; i++) {
            // Per-sample interpolation advance (skip if disabled)
            if (INTERP_SAMPLES > 0 && this.interpT < 1.0) {
                this.interpT += this.interpStep;
                if (this.interpT > 1.0) this.interpT = 1.0;
                
                const t = this.interpT;
                const invT = 1.0 - t;
                
                // Lerp all spectral data values (mag, custom1, custom2 - not phase offset)
                for (let j = 0; j < this.spectralData.length; j++) {
                    this.spectralData[j] = this.prevData[j] * invT + this.targetData[j] * t;
                }
                
                // Lerp phase offsets separately for phase continuity
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
                // Phase offset is now read from interpolated array, not spectralData
                const phaseOffset = this.currentPhaseOffsets[bin];
                const custom1 = this.spectralData[idx + 2];
                
                if (mag < 0.001) continue;

                const minFreq = 20;
                const maxFreq = 20000;
                const normalizedBin = bin / numPoints;
                const baseFreq = minFreq + (maxFreq - minFreq) * normalizedBin;
                const freq = baseFreq * this.frequencyMultiplier;
                
                // Band-limiting: skip or attenuate bins above Nyquist threshold
                const normalizedFreq = freq / nyquist;
                if (normalizedFreq >= 1.0) continue;  // Hard cutoff at Nyquist
                
                const rolloffGain = computeRolloff(normalizedFreq, ROLLOFF_MODE);
                if (rolloffGain < 0.001) continue;  // Skip negligible contributions
                
                const db = mag * 60 - 60;
                const linearMag = Math.pow(10, db / 20) * rolloffGain;
                
                // Phase increment from instantaneous frequency
                // This changes smoothly because freq comes from interpolated data
                const phaseInc = (freq * 2 * Math.PI) / sampleRate;
                
                // Advance phase accumulator continuously - never reset
                this.phaseAccumulators[bin] += phaseInc;
                
                // Wrap phase to prevent floating point precision loss
                if (this.phaseAccumulators[bin] > 2 * Math.PI) {
                    this.phaseAccumulators[bin] -= 2 * Math.PI;
                }
                
                // Apply phase offset (now smoothly interpolated)
                const currentPhase = this.phaseAccumulators[bin] + (phaseOffset * 2 * Math.PI);
                const sample = Math.sin(currentPhase);
                
                const p = (custom1 - 0.5) * 2;
                const gainL = Math.min(1, 1 - p) * linearMag;
                const gainR = Math.min(1, 1 + p) * linearMag;
                
                sumL += sample * gainL;
                sumR += sample * gainR;
            }
            
            const scale = 0.1; 
            channelL[i] = sumL * scale;
            channelR[i] = sumR * scale;
        }
        
        return true;
    }
}
registerProcessor('spectral-processor', SpectralProcessor);
`;

// Processor code for wavetable AM synthesis with feedback
// Carrier wave (sine/saw/square/tri) modulated by reading line magnitudes
// Magnitude 0 = silence, Magnitude 1 = full carrier amplitude
// Feedback: previous output mixed back into carrier for evolving timbres
const WAVETABLE_PROCESSOR_CODE = `
// Same interpolation setting as SpectralProcessor
// 0 = OFF (instant), N = N intermediate samples between frames
const INTERP_SAMPLES = 128;

class WavetableProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.envelope = new Float32Array(1024);     // Current interpolated envelope
        this.prevEnvelope = new Float32Array(1024); // Previous envelope
        this.targetEnvelope = new Float32Array(1024); // Target envelope
        this.envelopeSize = 64;
        this.phase = 0;           // Carrier phase (0-1)
        this.envPhase = 0;        // Envelope read position (0-1)
        this.frequency = 220;     // Carrier frequency Hz
        this.carrierType = 0;     // 0=sine, 1=saw, 2=square, 3=triangle
        this.feedback = 0;        // Feedback amount 0-1
        this.lastSample = 0;      // Previous output for feedback
        
        // Interpolation state
        this.interpT = 1.0;
        this.interpStep = INTERP_SAMPLES > 0 ? 1.0 / (INTERP_SAMPLES + 1) : 1.0;
        
        this.port.onmessage = (e) => {
            if (e.data.type === 'spectral-data') {
                const data = e.data.data;
                const numPoints = data.length / 4;
                this.envelopeSize = numPoints;
                
                let maxMag = 0;
                for (let i = 0; i < numPoints; i++) {
                    const mag = data[i * 4];
                    if (mag > maxMag) maxMag = mag;
                }
                
                const scale = maxMag > 0.001 ? 1.0 / maxMag : 1.0;
                
                if (INTERP_SAMPLES === 0) {
                    // No interpolation - instant update
                    for (let i = 0; i < numPoints; i++) {
                        this.envelope[i] = data[i * 4] * scale;
                        this.targetEnvelope[i] = this.envelope[i];
                    }
                } else {
                    // Snapshot current envelope as previous
                    this.prevEnvelope.set(this.envelope);
                    
                    for (let i = 0; i < numPoints; i++) {
                        this.targetEnvelope[i] = data[i * 4] * scale;
                    }
                    
                    // Reset interpolation
                    this.interpT = 0.0;
                }
            } else if (e.data.type === 'frequency') {
                this.frequency = e.data.value;
            } else if (e.data.type === 'carrier') {
                this.carrierType = e.data.value;
            } else if (e.data.type === 'feedback') {
                this.feedback = e.data.value;
            }
        };
    }
    
    // Generate carrier waveform sample at phase (0-1)
    carrier(phase, type) {
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

    process(inputs, outputs, parameters) {
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
        
        for (let i = 0; i < channelL.length; i++) {
            // Per-sample interpolation advance (skip if disabled)
            if (INTERP_SAMPLES > 0 && this.interpT < 1.0) {
                this.interpT += this.interpStep;
                if (this.interpT > 1.0) this.interpT = 1.0;
                
                const t = this.interpT;
                const invT = 1.0 - t;
                for (let j = 0; j < this.envelopeSize; j++) {
                    this.envelope[j] = this.prevEnvelope[j] * invT + this.targetEnvelope[j] * t;
                }
            }
            
            // Get base carrier sample
            let carrierSample = this.carrier(this.phase, this.carrierType);
            
            // Mix in feedback: blend carrier with previous output
            // feedback=0: pure carrier, feedback=1: 50/50 mix with previous
            if (this.feedback > 0) {
                carrierSample = carrierSample * (1 - this.feedback * 0.5) + this.lastSample * this.feedback * 0.5;
            }
            
            // Get envelope with linear interpolation
            const envPos = this.envPhase * this.envelopeSize;
            const envIdx0 = Math.floor(envPos) % this.envelopeSize;
            const envIdx1 = (envIdx0 + 1) % this.envelopeSize;
            const envFrac = envPos - Math.floor(envPos);
            const amplitude = this.envelope[envIdx0] * (1 - envFrac) + this.envelope[envIdx1] * envFrac;
            
            // AM synthesis: carrier * envelope
            const sample = carrierSample * amplitude;
            
            // Store for feedback
            this.lastSample = sample;
            
            const gain = 0.5;
            channelL[i] = sample * gain;
            channelR[i] = sample * gain;
            
            // Advance phases
            this.phase += carrierPhaseInc;
            if (this.phase >= 1.0) this.phase -= 1.0;
            
            this.envPhase += envPhaseInc;
            if (this.envPhase >= 1.0) this.envPhase -= 1.0;
        }
        
        return true;
    }
}
registerProcessor('wavetable-processor', WavetableProcessor);
`;

// Processor code for subtractive noise filtering
// Starts with white noise and applies a bank of notch filters
// spectralData[0] (R) = Frequency
// spectralData[1] (G) = Q/Bandwidth
const WHITENOISE_PROCESSOR_CODE = `
const INTERP_SAMPLES = 64;

class WhitenoiseProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.spectralData = new Float32Array(1024 * 4);
        this.prevData = new Float32Array(1024 * 4);
        this.targetData = new Float32Array(1024 * 4);
        
        // State Variable Filter states (low and band) per potential filter band
        this.lowStates = new Float32Array(1024);
        this.bandStates = new Float32Array(1024);
        
        this.frequencyMultiplier = 1.0;
        
        this.interpT = 1.0;
        this.interpStep = INTERP_SAMPLES > 0 ? 1.0 / (INTERP_SAMPLES + 1) : 1.0;
        
        this.port.onmessage = (e) => {
            if (e.data.type === 'spectral-data') {
                const data = e.data.data;
                if (INTERP_SAMPLES === 0) {
                    this.spectralData.set(data);
                    this.targetData.set(data);
                } else {
                    this.prevData.set(this.spectralData);
                    this.targetData.set(data);
                    this.interpT = 0.0;
                }
            } else if (e.data.type === 'frequency-multiplier') {
                this.frequencyMultiplier = e.data.value;
            }
        };
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0];
        const channelL = output[0];
        const channelR = output[1];
        
        const numPoints = this.spectralData.length / 4;
        
        for (let i = 0; i < channelL.length; i++) {
            // Per-sample interpolation for smooth parameter changes
            if (INTERP_SAMPLES > 0 && this.interpT < 1.0) {
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
                const suppression = this.spectralData[idx]; // R channel: Suppression amount
                const qVal = this.spectralData[idx + 1];    // G channel: Width multiplier
                
                if (suppression < 0.001) continue;
                
                // Frequency mapped to index (consistent with Spectral mode)
                const normalizedBin = bin / numPoints;
                const baseFreq = minFreq + freqRange * normalizedBin;
                const freq = baseFreq * this.frequencyMultiplier;
                
                if (freq >= sampleRate * 0.48) continue; // Protect SVF stability
                
                // Bandwidth: one bin width scaled by Green channel
                const widthInBins = qVal * 10 + 0.1;
                const BW = binWidth * widthInBins;
                
                // Q = center_freq / bandwidth
                const Q = Math.max(0.5, freq / BW);
                
                // SVF Coefficients (Standard SVF for subtraction)
                const f = 2.0 * Math.sin(Math.PI * freq / sampleRate);
                const q = 1.0 / Q;
                
                // SVF Update Equations for Band-Pass
                this.lowStates[bin] = this.lowStates[bin] + f * this.bandStates[bin];
                const high = noise - this.lowStates[bin] - q * this.bandStates[bin];
                const band = f * high + this.bandStates[bin];
                this.bandStates[bin] = band;
                
                // Add to parallel subtraction sum
                sumSubtracted += band * suppression;
            }
            
            const sample = noise - sumSubtracted;
            
            const gain = 0.01; // User adjusted gain
            channelL[i] = sample * gain;
            channelR[i] = sample * gain;
        }
        
        return true;
    }
}
registerProcessor('whitenoise-processor', WhitenoiseProcessor);
`;

export class AudioEngine {
    private ctx: AudioContext;
    private workletNode: AudioWorkletNode | null = null;
    private isInitialized = false;
    private currentMode: SynthMode = SynthMode.WAVETABLE; // Default to wavetable

    // Buffers for visualization
    private timeDomainDataL: Float32Array;
    private timeDomainDataR: Float32Array;
    private frequencyDataL: Float32Array;
    private frequencyDataR: Float32Array;
    private splitNode: ChannelSplitterNode;
    private analyserL: AnalyserNode;
    private analyserR: AnalyserNode;
    private masterGain: GainNode;

    // ADSR Envelope
    public attack = 0.1;
    public decay = 0.2;
    public sustain = 0.5;
    public release = 0.5;

    private lastNoteTime = 0;
    private isNoteOn = false;

    // Wavetable frequency (Hz)
    private wavetableFrequency = 220;

    // Carrier waveform type (0=sine, 1=saw, 2=square, 3=triangle)
    private carrierType = 0;

    // Feedback amount (0-1)
    private feedback = 0;

    constructor() {
        this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

        // Setup analysis graph
        this.splitNode = this.ctx.createChannelSplitter(2);
        this.analyserL = this.ctx.createAnalyser();
        this.analyserR = this.ctx.createAnalyser();

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0;

        this.analyserL.fftSize = 2048;
        this.analyserR.fftSize = 2048;

        this.timeDomainDataL = new Float32Array(this.analyserL.fftSize);
        this.timeDomainDataR = new Float32Array(this.analyserR.fftSize);
        this.frequencyDataL = new Float32Array(this.analyserL.frequencyBinCount);
        this.frequencyDataR = new Float32Array(this.analyserR.frequencyBinCount);

        this.splitNode.connect(this.analyserL, 0);
        this.splitNode.connect(this.analyserR, 1);
    }

    public async initialize(): Promise<void> {
        if (this.isInitialized) return;

        try {
            // Load both processors
            const spectralBlob = new Blob([SPECTRAL_PROCESSOR_CODE], { type: 'application/javascript' });
            const wavetableBlob = new Blob([WAVETABLE_PROCESSOR_CODE], { type: 'application/javascript' });
            const whitenoiseBlob = new Blob([WHITENOISE_PROCESSOR_CODE], { type: 'application/javascript' });

            const spectralUrl = URL.createObjectURL(spectralBlob);
            const wavetableUrl = URL.createObjectURL(wavetableBlob);
            const whitenoiseUrl = URL.createObjectURL(whitenoiseBlob);

            await this.ctx.audioWorklet.addModule(spectralUrl);
            await this.ctx.audioWorklet.addModule(wavetableUrl);
            await this.ctx.audioWorklet.addModule(whitenoiseUrl);

            URL.revokeObjectURL(spectralUrl);
            URL.revokeObjectURL(wavetableUrl);
            URL.revokeObjectURL(whitenoiseUrl);

            // Create initial worklet based on current mode
            this.createWorkletNode();

            this.isInitialized = true;
            console.log(`✓ Audio Engine initialized (mode: ${this.currentMode})`);

        } catch (e) {
            console.error('Failed to initialize Audio Engine:', e);
        }
    }

    private createWorkletNode(): void {
        // Disconnect existing node if any
        if (this.workletNode) {
            this.workletNode.disconnect();
            this.workletNode = null;
        }

        let processorName = 'wavetable-processor';
        if (this.currentMode === SynthMode.SPECTRAL) processorName = 'spectral-processor';
        if (this.currentMode === SynthMode.WHITENOISE_BAND_Q_FILTER) processorName = 'whitenoise-processor';

        this.workletNode = new AudioWorkletNode(this.ctx, processorName, {
            numberOfInputs: 0,
            numberOfOutputs: 1,
            outputChannelCount: [2] // Stereo
        });

        // Connect graph
        // Connect graph
        this.workletNode.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);
        this.masterGain.connect(this.splitNode);

        // If wavetable mode, send initial frequency
        if (this.currentMode === SynthMode.WAVETABLE) {
            this.workletNode.port.postMessage({
                type: 'frequency',
                value: this.wavetableFrequency
            });
        }
    }

    public setMode(mode: SynthMode): void {
        if (mode === this.currentMode) return;

        this.currentMode = mode;

        if (this.isInitialized) {
            this.createWorkletNode();
            console.log(`✓ Synth mode changed to: ${mode}`);
        }
    }

    public getMode(): SynthMode {
        return this.currentMode;
    }

    public setWavetableFrequency(freq: number): void {
        this.wavetableFrequency = freq;

        if (this.workletNode && this.currentMode === SynthMode.WAVETABLE) {
            this.workletNode.port.postMessage({
                type: 'frequency',
                value: freq
            });
        }
    }

    public getWavetableFrequency(): number {
        return this.wavetableFrequency;
    }

    public setCarrier(type: number): void {
        this.carrierType = type;

        if (this.workletNode && this.currentMode === SynthMode.WAVETABLE) {
            this.workletNode.port.postMessage({
                type: 'carrier',
                value: type
            });
        }
    }

    public getCarrier(): number {
        return this.carrierType;
    }

    public setFeedback(amount: number): void {
        this.feedback = amount;

        if (this.workletNode && this.currentMode === SynthMode.WAVETABLE) {
            this.workletNode.port.postMessage({
                type: 'feedback',
                value: amount
            });
        }
    }

    public getFeedback(): number {
        return this.feedback;
    }

    public updateSpectralData(data: Float32Array): void {
        if (!this.workletNode || !this.isInitialized) {
            return;
        }

        // Send data to worklet (both modes use same message format)
        this.workletNode.port.postMessage({
            type: 'spectral-data',
            data: data
        });
    }

    public getScopeData(): { left: Float32Array, right: Float32Array } {
        this.analyserL.getFloatTimeDomainData(this.timeDomainDataL as any);
        this.analyserR.getFloatTimeDomainData(this.timeDomainDataR as any);
        return {
            left: this.timeDomainDataL,
            right: this.timeDomainDataR
        };
    }

    public getAudioSpectralData(): { left: Float32Array, right: Float32Array } {
        this.analyserL.getFloatFrequencyData(this.frequencyDataL as any);
        this.analyserR.getFloatFrequencyData(this.frequencyDataR as any);
        return {
            left: this.frequencyDataL,
            right: this.frequencyDataR
        };
    }

    public setSpectralPitch(multiplier: number): void {
        const supported = this.currentMode === SynthMode.SPECTRAL ||
            this.currentMode === SynthMode.WHITENOISE_BAND_Q_FILTER;
        if (this.workletNode && supported) {
            this.workletNode.port.postMessage({
                type: 'frequency-multiplier',
                value: multiplier
            });
        }
    }

    public resume(): void {
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    public triggerAttack(params?: { a: number, d: number, s: number }): void {
        const now = this.ctx.currentTime;
        this.lastNoteTime = now;
        this.isNoteOn = true;

        if (params) {
            this.attack = params.a;
            this.decay = params.d;
            this.sustain = params.s;
        }

        // Cancel any pending ramps
        this.masterGain.gain.cancelScheduledValues(now);

        // Smooth transition from current value
        const currentGain = this.masterGain.gain.value; // Approximate, see getGain() for precision
        this.masterGain.gain.setValueAtTime(currentGain, now);

        // Attack ramp
        // Target peak (1.0 or user defined?) usually 1.0, then decay to Sustain
        const peak = 1.0;
        this.masterGain.gain.linearRampToValueAtTime(peak, now + this.attack);

        // Decay ramp
        this.masterGain.gain.linearRampToValueAtTime(this.sustain, now + this.attack + this.decay);
    }

    public triggerRelease(r?: number): void {
        const now = this.ctx.currentTime;
        this.isNoteOn = false;

        if (r !== undefined) this.release = r;

        // Cancel future
        this.masterGain.gain.cancelScheduledValues(now);

        // We need to ramp from *current* calculated gain to 0
        // Web Audio's .value attribute is not always the instantaneous ramp value during scheduling
        // But cancelScheduledValues() sets it to the current scheduled value? 
        // No, it holds the value at 'now'. 
        // However, safest to calculate it or just use setTargetAtTime which handles it automatically?
        // User asked for "green line graph", implies linear release.
        // linearRampToValueAtTime requires a starting point.

        // Let's rely on browser behavior: 
        // cancelScheduledValues(now) -> the param value becomes constant at the value it had at 'now'.
        // So we just ramp from there.
        // Wait, if we are in middle of attack, 'value' might jump?
        // Actually, strictly speaking `setValueAtTime(this.masterGain.gain.value, now)` is needed to anchor it.
        // But reading `.value` during automation is spec'd to return the automated value?
        // "If the AudioParam is being automated, the value property returns the current value of the parameter." (MDN)

        const currentGain = this.masterGain.gain.value;
        this.masterGain.gain.setValueAtTime(currentGain, now);
        this.masterGain.gain.linearRampToValueAtTime(0, now + this.release);
    }

    public getEnvelopeState(): {
        attack: number,
        decay: number,
        sustain: number,
        release: number,
        isNoteOn: boolean,
        lastNoteTime: number,
        currentTime: number
    } {
        return {
            attack: this.attack,
            decay: this.decay,
            sustain: this.sustain,
            release: this.release,
            isNoteOn: this.isNoteOn,
            lastNoteTime: this.lastNoteTime,
            currentTime: this.ctx.currentTime
        };
    }
}
