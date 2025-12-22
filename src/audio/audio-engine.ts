
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

// Default interpolation samples (can be changed dynamically)
const DEFAULT_INTERP_SAMPLES = 64;

class SpectralProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        // Interpolation setting
        this.interpSamples = DEFAULT_INTERP_SAMPLES;
        
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
        
        // Octave Doubling: layering octaves
        this.octaveLow = 0;      // 0-10 octaves below
        this.octaveHigh = 0;     // 0-10 octaves above
        this.octaveMult = 0.5;   // Volume decay per octave
        
        // Extra phase accumulators for octave doubling (10 low + 10 high per bin)
        this.harmonicPhases = new Float32Array(1024 * 20); // This will be resized based on numPoints
        
        // Interpolation state: 0 = at prev, 1 = at target
        this.interpT = 1.0;
        // Recalculate step based on current interpSamples
        this.interpStep = this.interpSamples > 0 ? 1.0 / (this.interpSamples + 1) : 1.0;
        
        this.port.onmessage = (e) => {
            if (e.data.type === 'spectral-data') {
                const data = e.data.data;
                const numPoints = data.length / 4;
                
                // Resize harmonicPhases if numPoints changed
                if (this.harmonicPhases.length !== numPoints * 20) {
                    this.harmonicPhases = new Float32Array(numPoints * 20);
                }

                if (this.interpSamples === 0) {
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

    process(inputs, outputs, parameters) {
        const output = outputs[0];
        const channelL = output[0];
        const channelR = output[1];
        
        const numPoints = this.spectralData.length / 4;
        const nyquist = sampleRate * 0.5;
        const PI2_SR = (2 * Math.PI) / sampleRate;
        const PI2 = 2 * Math.PI;
        
        for (let i = 0; i < channelL.length; i++) {
            // Per-sample interpolation advance (skip if disabled)
            if (this.interpSamples > 0 && this.interpT < 1.0) {
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
                
                const p = (custom1 - 0.5) * 2;
                const baseGainL = Math.min(1, 1 - p) * linearMag;
                const baseGainR = Math.min(1, 1 + p) * linearMag;
                
                // Helper to generate oscillator at given frequency with gain
                const generateOsc = (oscFreq, gain, phaseIdx) => {
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
`;

// Processor code for wavetable AM synthesis with feedback
// Carrier wave (sine/saw/square/tri) modulated by reading line magnitudes
// Magnitude 0 = silence, Magnitude 1 = full carrier amplitude
// Feedback: previous output mixed back into carrier for evolving timbres
const WAVETABLE_PROCESSOR_CODE = `
const DEFAULT_INTERP_SAMPLES = 128;

class WavetableProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        // Interpolation setting
        this.interpSamples = DEFAULT_INTERP_SAMPLES;
        
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
        
        // Octave Doubling: octave layering
        this.octaveLow = 0;    // 0-10 octaves below
        this.octaveHigh = 0;   // 0-10 octaves above
        this.octaveMult = 0.5; // Volume decay per octave
        
        // Octave doubling phases (10 low + 10 high)
        this.harmonicPhases = new Float32Array(20);
        this.harmonicEnvPhases = new Float32Array(20);
        
        // Interpolation state
        this.interpT = 1.0;
        this.interpStep = this.interpSamples > 0 ? 1.0 / (this.interpSamples + 1) : 1.0;
        
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
                
                if (this.interpSamples === 0) {
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
        const nyquist = sampleRate * 0.5;
        
        for (let i = 0; i < channelL.length; i++) {
            // Per-sample interpolation advance (skip if disabled)
            if (this.interpSamples > 0 && this.interpT < 1.0) {
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
            
            // Mix in feedback: blend carrier with previous output
            // feedback=0: pure carrier, feedback=1: 50/50 mix with previous
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
                
                let harmCarrier = this.carrier(this.harmonicPhases[phaseIdx], this.carrierType);
                
                // Get envelope at harmonic's position
                const harmEnvPos = this.harmonicEnvPhases[phaseIdx] * this.envelopeSize;
                const hEnvIdx0 = Math.floor(harmEnvPos) % this.envelopeSize;
                const hEnvIdx1 = (hEnvIdx0 + 1) % this.envelopeSize;
                const hEnvFrac = harmEnvPos - Math.floor(harmEnvPos);
                const harmAmp = this.envelope[hEnvIdx0] * (1 - hEnvFrac) + this.envelope[hEnvIdx1] * hEnvFrac;
                
                totalSample += harmCarrier * harmAmp * harmGain;
                
                // Advance harmonic phases
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
                
                let harmCarrier = this.carrier(this.harmonicPhases[phaseIdx], this.carrierType);
                
                // Get envelope at harmonic's position
                const harmEnvPos = this.harmonicEnvPhases[phaseIdx] * this.envelopeSize;
                const hEnvIdx0 = Math.floor(harmEnvPos) % this.envelopeSize;
                const hEnvIdx1 = (hEnvIdx0 + 1) % this.envelopeSize;
                const hEnvFrac = harmEnvPos - Math.floor(harmEnvPos);
                const harmAmp = this.envelope[hEnvIdx0] * (1 - hEnvFrac) + this.envelope[hEnvIdx1] * hEnvFrac;
                
                totalSample += harmCarrier * harmAmp * harmGain;
                
                // Advance harmonic phases
                this.harmonicPhases[phaseIdx] += harmPhaseInc;
                if (this.harmonicPhases[phaseIdx] >= 1.0) this.harmonicPhases[phaseIdx] -= 1.0;
                this.harmonicEnvPhases[phaseIdx] += harmPhaseInc;
                if (this.harmonicEnvPhases[phaseIdx] >= 1.0) this.harmonicEnvPhases[phaseIdx] -= 1.0;
                
                harmGain *= this.octaveMult;
            }
            
            // Store for feedback
            this.lastSample = totalSample;
            
            const gain = 0.5;
            channelL[i] = totalSample * gain;
            channelR[i] = totalSample * gain;
            
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
const DEFAULT_INTERP_SAMPLES = 64;

class WhitenoiseProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        // Interpolation setting
        this.interpSamples = DEFAULT_INTERP_SAMPLES;
        
        this.spectralData = new Float32Array(1024 * 4);
        this.prevData = new Float32Array(1024 * 4);
        this.targetData = new Float32Array(1024 * 4);
        
        // State Variable Filter states (low and band) per potential filter band
        this.lowStates = new Float32Array(1024);
        this.bandStates = new Float32Array(1024);
        
        // Octave doubling filter states (10 low + 10 high) per bin
        this.harmLowStates = new Float32Array(1024 * 20);
        this.harmBandStates = new Float32Array(1024 * 20);
        
        this.frequencyMultiplier = 1.0;
        
        // Octave Doubling: layering octaves for filter bands
        this.octaveLow = 0;
        this.octaveHigh = 0;
        this.octaveMult = 0.5;
        
        this.interpT = 1.0;
        this.interpStep = this.interpSamples > 0 ? 1.0 / (this.interpSamples + 1) : 1.0;
        
        this.port.onmessage = (e) => {
            if (e.data.type === 'spectral-data') {
                const data = e.data.data;
                if (this.interpSamples === 0) {
                    this.spectralData.set(data);
                    this.targetData.set(data);
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

    process(inputs, outputs, parameters) {
        const output = outputs[0];
        const channelL = output[0];
        const channelR = output[1];
        
        const numPoints = this.spectralData.length / 4;
        
        for (let i = 0; i < channelL.length; i++) {
            // Per-sample interpolation for smooth parameter changes
            if (this.interpSamples > 0 && this.interpT < 1.0) {
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

    // Octave doubling state
    private octaveLow = 0;
    private octaveHigh = 0;
    private octaveMult = 0.5;

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

        // Send initial octave doubling settings to the new worklet
        if (this.workletNode) {
            this.workletNode.port.postMessage({
                type: 'octave-doubling',
                low: this.octaveLow,
                high: this.octaveHigh,
                multiplier: this.octaveMult
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

    public setOctaveDoubling(low: number, high: number, multiplier: number): void {
        this.octaveLow = low;
        this.octaveHigh = high;
        this.octaveMult = multiplier;

        if (this.workletNode && this.isInitialized) {
            this.workletNode.port.postMessage({
                type: 'octave-doubling',
                low: low,
                high: high,
                multiplier: multiplier
            });
        }
    }

    public getOctaveDoubling(): { low: number, high: number, multiplier: number } {
        return {
            low: this.octaveLow,
            high: this.octaveHigh,
            multiplier: this.octaveMult
        };
    }

    public setInterpSamples(samples: number): void {
        if (this.workletNode && this.isInitialized) {
            this.workletNode.port.postMessage({
                type: 'interp-samples',
                value: samples
            });
        }
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
