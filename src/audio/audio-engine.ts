/**
 * Audio Engine for Spectral Table
 * Handles AudioContext, Worklet loading, and synthesis modes.
 * 
 * Synthesis Modes:
 * - SPECTRAL: iFFT/additive synthesis from frequency bins
 * - SPECTRAL_CHIRP: Log-frequency spaced additive synthesis
 * - WAVETABLE: Carrier wave AM synthesis with optional feedback
 * - WHITENOISE_BAND_Q_FILTER: Subtractive noise filtering
 */

import { SynthMode } from '../types';

// Vite imports worklet files as URLs for AudioWorklet.addModule()
import spectralWorkletUrl from './worklets/spectral.worklet.ts?worker&url';
import chirpSpectralWorkletUrl from './worklets/chirp-spectral.worklet.ts?worker&url';
import wavetableWorkletUrl from './worklets/wavetable.worklet.ts?worker&url';
import whitenoiseWorkletUrl from './worklets/whitenoise.worklet.ts?worker&url';

export class AudioEngine {
    private ctx: AudioContext;
    private workletNode: AudioWorkletNode | null = null;
    private isInitialized = false;
    private currentMode: SynthMode = SynthMode.WAVETABLE;

    // Visualization buffers
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

    // Wavetable params
    private wavetableFrequency = 220;
    private carrierType = 0;
    private feedback = 0;

    // Octave doubling state
    private octaveLow = 0;
    private octaveHigh = 0;
    private octaveMult = 0.5;

    constructor() {
        this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

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
            // Load all worklet processors via Vite-provided URLs
            await this.ctx.audioWorklet.addModule(spectralWorkletUrl);
            await this.ctx.audioWorklet.addModule(chirpSpectralWorkletUrl);
            await this.ctx.audioWorklet.addModule(wavetableWorkletUrl);
            await this.ctx.audioWorklet.addModule(whitenoiseWorkletUrl);

            this.createWorkletNode();

            this.isInitialized = true;
            console.log(`✓ Audio Engine initialized (mode: ${this.currentMode})`);
        } catch (e) {
            console.error('Failed to initialize Audio Engine:', e);
        }
    }

    private createWorkletNode(): void {
        if (this.workletNode) {
            this.workletNode.disconnect();
            this.workletNode = null;
        }

        let processorName = 'wavetable-processor';
        if (this.currentMode === SynthMode.SPECTRAL) processorName = 'spectral-processor';
        if (this.currentMode === SynthMode.SPECTRAL_CHIRP) processorName = 'chirp-spectral-processor';
        if (this.currentMode === SynthMode.WHITENOISE_BAND_Q_FILTER) processorName = 'whitenoise-processor';

        this.workletNode = new AudioWorkletNode(this.ctx, processorName, {
            numberOfInputs: 0,
            numberOfOutputs: 1,
            outputChannelCount: [2]
        });

        this.workletNode.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);
        this.masterGain.connect(this.splitNode);

        if (this.currentMode === SynthMode.WAVETABLE) {
            this.workletNode.port.postMessage({
                type: 'frequency',
                value: this.wavetableFrequency
            });
        }

        this.workletNode.port.postMessage({
            type: 'octave-doubling',
            low: this.octaveLow,
            high: this.octaveHigh,
            multiplier: this.octaveMult
        });
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
        if (!this.workletNode || !this.isInitialized) return;

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
        this.analyserL.getFloatTimeDomainData(this.timeDomainDataL as Float32Array<ArrayBuffer>);
        this.analyserR.getFloatTimeDomainData(this.timeDomainDataR as Float32Array<ArrayBuffer>);
        return {
            left: this.timeDomainDataL,
            right: this.timeDomainDataR
        };
    }

    public getAudioSpectralData(): { left: Float32Array, right: Float32Array } {
        this.analyserL.getFloatFrequencyData(this.frequencyDataL as Float32Array<ArrayBuffer>);
        this.analyserR.getFloatFrequencyData(this.frequencyDataR as Float32Array<ArrayBuffer>);
        return {
            left: this.frequencyDataL,
            right: this.frequencyDataR
        };
    }

    public setSpectralPitch(multiplier: number): void {
        const supported = this.currentMode === SynthMode.SPECTRAL ||
            this.currentMode === SynthMode.SPECTRAL_CHIRP ||
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

        this.masterGain.gain.cancelScheduledValues(now);
        const currentGain = this.masterGain.gain.value;
        this.masterGain.gain.setValueAtTime(currentGain, now);

        const peak = 1.0;
        this.masterGain.gain.linearRampToValueAtTime(peak, now + this.attack);
        this.masterGain.gain.linearRampToValueAtTime(this.sustain, now + this.attack + this.decay);
    }

    public triggerRelease(r?: number): void {
        const now = this.ctx.currentTime;
        this.isNoteOn = false;

        if (r !== undefined) this.release = r;

        this.masterGain.gain.cancelScheduledValues(now);
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

    public async renderOffline(
        note: number,
        duration: number,
        spectralDataOrTimeline: Float32Array,
        params: {
            mode: SynthMode,
            wavetableParams: { frequency: number, carrier: number, feedback: number },
            octaveDoubling: { low: number, high: number, multiplier: number },
            interpSamples: number,
            timeline?: { numFrames: number, frameSize: number }
        }
    ): Promise<Blob> {
        const offlineSampleRate = 44100;
        const totalDuration = duration + this.release;
        const lengthSamples = Math.ceil(totalDuration * offlineSampleRate);

        const offlineCtx = new OfflineAudioContext(2, lengthSamples, offlineSampleRate);

        // Load processors into offline context via URL imports
        await offlineCtx.audioWorklet.addModule(spectralWorkletUrl);
        await offlineCtx.audioWorklet.addModule(chirpSpectralWorkletUrl);
        await offlineCtx.audioWorklet.addModule(wavetableWorkletUrl);
        await offlineCtx.audioWorklet.addModule(whitenoiseWorkletUrl);

        let processorName = 'wavetable-processor';
        if (params.mode === SynthMode.SPECTRAL) processorName = 'spectral-processor';
        if (params.mode === SynthMode.SPECTRAL_CHIRP) processorName = 'chirp-spectral-processor';
        if (params.mode === SynthMode.WHITENOISE_BAND_Q_FILTER) processorName = 'whitenoise-processor';

        const node = new AudioWorkletNode(offlineCtx, processorName, {
            numberOfInputs: 0,
            numberOfOutputs: 1,
            outputChannelCount: [2]
        });

        const masterGain = offlineCtx.createGain();
        masterGain.gain.value = 0;

        node.connect(masterGain);
        masterGain.connect(offlineCtx.destination);

        // Setup parameters
        node.port.postMessage({
            type: 'octave-doubling',
            low: params.octaveDoubling.low,
            high: params.octaveDoubling.high,
            multiplier: params.octaveDoubling.multiplier
        });

        if (params.mode === SynthMode.WAVETABLE) {
            const freq = 440 * Math.pow(2, (note - 69) / 12);
            node.port.postMessage({ type: 'frequency', value: freq });
            node.port.postMessage({ type: 'carrier', value: params.wavetableParams.carrier });
            node.port.postMessage({ type: 'feedback', value: params.wavetableParams.feedback });
        } else {
            const targetFreq = 440 * Math.pow(2, (note - 69) / 12);
            const rootFreq = 440;
            node.port.postMessage({ type: 'frequency-multiplier', value: targetFreq / rootFreq });
        }

        // Send spectral data
        if (params.timeline) {
            node.port.postMessage({
                type: 'spectral-timeline',
                frames: spectralDataOrTimeline,
                frameSize: params.timeline.frameSize,
                numFrames: params.timeline.numFrames,
                totalSamples: lengthSamples
            });
        } else {
            node.port.postMessage({ type: 'interp-samples', value: 0 });
            node.port.postMessage({ type: 'spectral-data', data: spectralDataOrTimeline });
        }

        // Wait for worklet ready
        await new Promise<void>((resolve) => {
            node.port.onmessage = (e) => {
                if (e.data.type === 'ready') resolve();
            };
        });

        // Envelope automation
        const now = 0;
        masterGain.gain.setValueAtTime(0, now);
        masterGain.gain.linearRampToValueAtTime(1.0, now + this.attack);
        masterGain.gain.linearRampToValueAtTime(this.sustain, now + this.attack + this.decay);

        const releaseStart = duration;
        masterGain.gain.setValueAtTime(this.sustain, releaseStart);
        masterGain.gain.linearRampToValueAtTime(0, releaseStart + this.release);

        const renderedBuffer = await offlineCtx.startRendering();
        return this.audioBufferToWav(renderedBuffer);
    }

    private audioBufferToWav(buffer: AudioBuffer): Blob {
        const numOfChan = buffer.numberOfChannels;
        const length = buffer.length * numOfChan * 2 + 44;
        const out = new ArrayBuffer(length);
        const view = new DataView(out);
        const channels: Float32Array[] = [];
        let offset = 0;
        let pos = 0;

        function setUint16(data: number) {
            view.setUint16(pos, data, true);
            pos += 2;
        }

        function setUint32(data: number) {
            view.setUint32(pos, data, true);
            pos += 4;
        }

        // WAVE header
        setUint32(0x46464952);  // "RIFF"
        setUint32(length - 8);
        setUint32(0x45564157);  // "WAVE"

        setUint32(0x20746d66);  // "fmt "
        setUint32(16);
        setUint16(1);           // PCM
        setUint16(numOfChan);
        setUint32(buffer.sampleRate);
        setUint32(buffer.sampleRate * 2 * numOfChan);
        setUint16(numOfChan * 2);
        setUint16(16);          // 16-bit

        setUint32(0x61746164);  // "data"
        setUint32(length - pos - 4);

        for (let i = 0; i < buffer.numberOfChannels; i++) {
            channels.push(buffer.getChannelData(i));
        }

        while (pos < length) {
            for (let i = 0; i < numOfChan; i++) {
                let sample = Math.max(-1, Math.min(1, channels[i][offset]));
                sample = (sample < 0 ? sample * 0x8000 : sample * 0x7FFF) | 0;
                view.setInt16(pos, sample, true);
                pos += 2;
            }
            offset++;
        }

        return new Blob([out], { type: 'audio/wav' });
    }
}
