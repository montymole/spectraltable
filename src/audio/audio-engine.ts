
// Audio Engine for Spectral Table
// Handles AudioContext, Worklet loading, and synthesis modes (spectral/wavetable)

import { SynthMode } from '../types';

// Processor code for spectral (additive/iFFT) synthesis
const SPECTRAL_PROCESSOR_CODE = `
class SpectralProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.spectralData = new Float32Array(1024 * 4); // RGBA
        this.phaseAccumulators = new Float32Array(1024); // For oscillator bank
        this.port.onmessage = (e) => {
            if (e.data.type === 'spectral-data') {
                this.spectralData = e.data.data;
            }
        };
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0];
        const channelL = output[0];
        const channelR = output[1];
        
        const numPoints = this.spectralData.length / 4;
        
        for (let i = 0; i < channelL.length; i++) {
            let sumL = 0;
            let sumR = 0;
            
            for (let bin = 0; bin < numPoints; bin++) {
                const idx = bin * 4;
                const mag = this.spectralData[idx];
                const phaseOffset = this.spectralData[idx + 1];
                const custom1 = this.spectralData[idx + 2];
                
                if (mag < 0.001) continue;

                const minFreq = 20;
                const maxFreq = 20000;
                const normalizedBin = bin / numPoints;
                const freq = minFreq + (maxFreq - minFreq) * normalizedBin;
                
                const db = mag * 60 - 60;
                const linearMag = Math.pow(10, db / 20);
                
                const phaseInc = (freq * 2 * Math.PI) / sampleRate;
                this.phaseAccumulators[bin] += phaseInc;
                if (this.phaseAccumulators[bin] > 2 * Math.PI) {
                    this.phaseAccumulators[bin] -= 2 * Math.PI;
                }
                
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
class WavetableProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.envelope = new Float32Array(1024); // Amplitude envelope from reading line
        this.envelopeSize = 64;
        this.phase = 0;           // Carrier phase (0-1)
        this.envPhase = 0;        // Envelope read position (0-1)
        this.frequency = 220;     // Carrier frequency Hz
        this.carrierType = 0;     // 0=sine, 1=saw, 2=square, 3=triangle
        this.feedback = 0;        // Feedback amount 0-1
        this.lastSample = 0;      // Previous output for feedback
        
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
                for (let i = 0; i < numPoints; i++) {
                    this.envelope[i] = data[i * 4] * scale;
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

            const spectralUrl = URL.createObjectURL(spectralBlob);
            const wavetableUrl = URL.createObjectURL(wavetableBlob);

            await this.ctx.audioWorklet.addModule(spectralUrl);
            await this.ctx.audioWorklet.addModule(wavetableUrl);

            URL.revokeObjectURL(spectralUrl);
            URL.revokeObjectURL(wavetableUrl);

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

        const processorName = this.currentMode === SynthMode.SPECTRAL
            ? 'spectral-processor'
            : 'wavetable-processor';

        this.workletNode = new AudioWorkletNode(this.ctx, processorName, {
            numberOfInputs: 0,
            numberOfOutputs: 1,
            outputChannelCount: [2] // Stereo
        });

        // Connect graph
        this.workletNode.connect(this.ctx.destination);
        this.workletNode.connect(this.splitNode);

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

    public resume(): void {
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }
}
