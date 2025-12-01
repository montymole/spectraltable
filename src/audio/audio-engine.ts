
// Audio Engine for Spectral Table
// Handles AudioContext, Worklet loading, and spectral-to-audio conversion

export class AudioEngine {
    private ctx: AudioContext;
    private workletNode: AudioWorkletNode | null = null;
    private isInitialized = false;

    // Buffers for visualization
    private timeDomainDataL: Float32Array;
    private timeDomainDataR: Float32Array;
    private splitNode: ChannelSplitterNode;
    private analyserL: AnalyserNode;
    private analyserR: AnalyserNode;

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

        // Note: We don't connect splitNode to destination here, the worklet will connect to it
    }

    public async initialize(): Promise<void> {
        if (this.isInitialized) return;

        try {
            // Inline the processor code to avoid file loading issues in dev environment
            const processorCode = `
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
                        
                        // Simple additive synthesis for now (iFFT is heavy)
                        // We have N bins. Each bin corresponds to a frequency.
                        // Freq = binIndex * (SampleRate / FFTSize) ??
                        // Or we map reading line 0..1 to 20Hz..20kHz
                        
                        // Let's assume the reading line represents a frequency range.
                        // e.g. 0 = 100Hz, 1 = 10000Hz (Log scale ideally)
                        
                        const numPoints = this.spectralData.length / 4;
                        // sampleRate is global in AudioWorkletGlobalScope
                        
                        // We process 128 samples (render quantum)
                        for (let i = 0; i < channelL.length; i++) {
                            let sumL = 0;
                            let sumR = 0;
                            
                            // Iterate over spectral bins
                            // Optimization: Don't iterate all 512 bins for every sample if performance is bad.
                            // But for < 100 partials it's fine.
                            
                            for (let bin = 0; bin < numPoints; bin++) {
                                const idx = bin * 4;
                                const mag = this.spectralData[idx];     // R
                                const phaseOffset = this.spectralData[idx + 1]; // G (0..1) -> 0..2PI
                                const pan = this.spectralData[idx + 2]; // B (0..1) -> -1..1
                                const width = this.spectralData[idx + 3]; // A
                                
                                if (mag < 0.001) continue; // Skip silence

                                // Map bin to frequency (Linear for now, or Exponential)
                                // Linear: 
                                // const freq = 100 + (bin / numPoints) * 5000;
                                
                                // Exponential mapping usually sounds better for music
                                // 100Hz to 10kHz
                                const normalizedBin = bin / numPoints;
                                const freq = 100 * Math.pow(100, normalizedBin); 
                                
                                // Increment phase
                                const phaseInc = (freq * 2 * Math.PI) / sampleRate;
                                this.phaseAccumulators[bin] += phaseInc;
                                if (this.phaseAccumulators[bin] > 2 * Math.PI) {
                                    this.phaseAccumulators[bin] -= 2 * Math.PI;
                                }
                                
                                const currentPhase = this.phaseAccumulators[bin] + (phaseOffset * 2 * Math.PI);
                                const sample = Math.sin(currentPhase);
                                
                                // Pan logic
                                // pan 0..1. 0.5 is center.
                                // -1..1 mapping: (pan - 0.5) * 2
                                const p = (pan - 0.5) * 2; // -1 to 1
                                
                                // Simple linear pan
                                const gainL = Math.min(1, 1 - p) * mag;
                                const gainR = Math.min(1, 1 + p) * mag;
                                
                                // Width logic (decorrelate phase or widen pan?)
                                // For now ignore width, just use pan.
                                
                                sumL += sample * gainL;
                                sumR += sample * gainR;
                            }
                            
                            // Normalize output to avoid clipping with many partials
                            // A simple limiter or scaling
                            const scale = 0.1; 
                            channelL[i] = sumL * scale;
                            channelR[i] = sumR * scale;
                        }
                        
                        return true;
                    }
                }
                registerProcessor('spectral-processor', SpectralProcessor);
            `;

            const blob = new Blob([processorCode], { type: 'application/javascript' });
            const url = URL.createObjectURL(blob);

            await this.ctx.audioWorklet.addModule(url);

            this.workletNode = new AudioWorkletNode(this.ctx, 'spectral-processor', {
                numberOfInputs: 0,
                numberOfOutputs: 1,
                outputChannelCount: [2] // Stereo
            });

            // Connect graph
            this.workletNode.connect(this.ctx.destination);
            this.workletNode.connect(this.splitNode);

            this.isInitialized = true;
            console.log('✓ Audio Engine initialized');

        } catch (e) {
            console.error('Failed to initialize Audio Engine:', e);
        }
    }

    public updateSpectralData(data: Float32Array): void {
        if (!this.workletNode || !this.isInitialized) return;

        // Send data to worklet
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
