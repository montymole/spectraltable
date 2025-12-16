
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

// Processor code for wavetable synthesis
// Each reading line = one waveform cycle
// Magnitude values directly become the waveform shape
const WAVETABLE_PROCESSOR_CODE = `
class WavetableProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.wavetable = new Float32Array(1024); // Single-cycle waveform
        this.wavetableSize = 64;
        this.phase = 0;
        this.frequency = 220; // A3 default, will be overridden by MIDI
        this.port.onmessage = (e) => {
            if (e.data.type === 'spectral-data') {
                // Extract magnitude channel as waveform
                // Input: RGBA interleaved [mag, phase, custom1, custom2, ...]
                const data = e.data.data;
                const numPoints = data.length / 4;
                this.wavetableSize = numPoints;
                
                // Normalize and build waveform: mag values become wave shape
                // Convert from 0..1 magnitude domain to -1..+1 waveform domain
                let maxMag = 0;
                for (let i = 0; i < numPoints; i++) {
                    const mag = data[i * 4];
                    if (mag > maxMag) maxMag = mag;
                }
                
                // Build waveform centered around zero
                const scale = maxMag > 0.001 ? 1.0 / maxMag : 1.0;
                for (let i = 0; i < numPoints; i++) {
                    // Magnitude becomes the waveform amplitude at this point
                    // Shift from 0..1 to -1..+1 centered
                    const mag = data[i * 4] * scale;
                    this.wavetable[i] = (mag - 0.5) * 2.0;
                }
            } else if (e.data.type === 'frequency') {
                this.frequency = e.data.value;
            }
        };
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0];
        const channelL = output[0];
        const channelR = output[1];
        
        if (this.wavetableSize < 2) {
            // No valid wavetable yet
            for (let i = 0; i < channelL.length; i++) {
                channelL[i] = 0;
                channelR[i] = 0;
            }
            return true;
        }
        
        // Phase increment per sample
        // One full waveform cycle = frequency Hz
        const phaseInc = this.frequency / sampleRate;
        
        for (let i = 0; i < channelL.length; i++) {
            // Linear interpolation within wavetable
            const tablePos = this.phase * this.wavetableSize;
            const idx0 = Math.floor(tablePos) % this.wavetableSize;
            const idx1 = (idx0 + 1) % this.wavetableSize;
            const frac = tablePos - Math.floor(tablePos);
            
            const sample = this.wavetable[idx0] * (1 - frac) + this.wavetable[idx1] * frac;
            
            // Simple stereo (mono for now)
            const gain = 0.5;
            channelL[i] = sample * gain;
            channelR[i] = sample * gain;
            
            // Advance phase
            this.phase += phaseInc;
            if (this.phase >= 1.0) {
                this.phase -= 1.0;
            }
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
    private splitNode: ChannelSplitterNode;
    private analyserL: AnalyserNode;
    private analyserR: AnalyserNode;

    // Wavetable frequency (Hz)
    private wavetableFrequency = 220;

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

    public resume(): void {
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }
}
