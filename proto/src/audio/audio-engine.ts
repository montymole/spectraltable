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

import {
    defaultFilterState,
    FILTER_CUTOFF_MAX,
    FILTER_CUTOFF_MIN,
    FILTER_RESONANCE_MAX,
    FILTER_RESONANCE_MIN,
    FilterOrder,
    FilterState,
    SaturationState,
    SynthMode,
    WaveshapeState
} from '../types';

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
    private filterStageA: BiquadFilterNode;
    private filterStageB: BiquadFilterNode;

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

    // Harmonic injection state
    private harmonicCount = 0;
    private harmonicFalloff = 1.0;

    // Spectral copy state
    private spectralCopyShift = 12;
    private spectralCopyMix = 0.0;

    // Waveshaping state
    private waveshapeCurve = 0;
    private waveshapeDrive = 1.0;
    private waveshapeMix = 0.0;
    private waveshapeCustomCurve: Float32Array | null = null;

    // Saturation state
    private saturationMode = 0;
    private saturationDrive = 1.0;
    private saturationMix = 0.0;
    private filterState: FilterState = { ...defaultFilterState };

    constructor() {
        this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

        this.splitNode = this.ctx.createChannelSplitter(2);
        this.analyserL = this.ctx.createAnalyser();
        this.analyserR = this.ctx.createAnalyser();

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0;
        this.filterStageA = this.ctx.createBiquadFilter();
        this.filterStageB = this.ctx.createBiquadFilter();

        this.analyserL.fftSize = 2048;
        this.analyserR.fftSize = 2048;

        this.timeDomainDataL = new Float32Array(this.analyserL.fftSize);
        this.timeDomainDataR = new Float32Array(this.analyserR.fftSize);
        this.frequencyDataL = new Float32Array(this.analyserL.frequencyBinCount);
        this.frequencyDataR = new Float32Array(this.analyserR.frequencyBinCount);

        this.splitNode.connect(this.analyserL, 0);
        this.splitNode.connect(this.analyserR, 1);
        this.masterGain.connect(this.ctx.destination);
        this.masterGain.connect(this.splitNode);
        this.applyFilterStateToNodes(
            this.ctx,
            [this.filterStageA, this.filterStageB],
            this.filterState,
            this.ctx.currentTime,
            0
        );
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

    private modeMap = {
        [SynthMode.SPECTRAL]: 'spectral-processor',
        [SynthMode.SPECTRAL_CHIRP]: 'chirp-spectral-processor',
        [SynthMode.WAVETABLE]: 'wavetable-processor',
        [SynthMode.WHITENOISE_BAND_Q_FILTER]: 'whitenoise-processor',
    }

    private createWorkletNode(): void {
        if (this.workletNode) {
            this.safeDisconnect(this.workletNode);
            this.workletNode = null;
        }

        const processorName = this.modeMap[this.currentMode] || 'wavetable-processor';

        this.workletNode = new AudioWorkletNode(this.ctx, processorName, {
            numberOfInputs: 0,
            numberOfOutputs: 1,
            outputChannelCount: [2]
        });

        this.reconnectLiveGraph();

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

        this.workletNode.port.postMessage({
            type: 'harmonic-injection',
            count: this.harmonicCount,
            falloff: this.harmonicFalloff
        });

        this.workletNode.port.postMessage({
            type: 'spectral-copy',
            shift: this.spectralCopyShift,
            mix: this.spectralCopyMix
        });

        // Send waveshaping state
        this.sendWaveshapingToWorklet();
        this.sendSaturationToWorklet();
    }

    private safeDisconnect(node: AudioNode | null): void {
        if (!node) return;
        try {
            node.disconnect();
        } catch {
            // Ignore disconnect errors when nodes are already detached.
        }
    }

    private clampFilterCutoff(value: number, sampleRate: number): number {
        const nyquistSafeMax = Math.min(FILTER_CUTOFF_MAX, sampleRate * 0.45);
        return Math.max(FILTER_CUTOFF_MIN, Math.min(nyquistSafeMax, value));
    }

    private clampFilterResonance(value: number): number {
        return Math.max(FILTER_RESONANCE_MIN, Math.min(FILTER_RESONANCE_MAX, value));
    }

    private applyFilterStateToNodes(
        context: BaseAudioContext,
        nodes: [BiquadFilterNode, BiquadFilterNode],
        state: FilterState,
        startTime: number,
        smoothingTime: number
    ): void {
        if (state.mode === 'none') return;
        const cutoff = this.clampFilterCutoff(state.cutoff, context.sampleRate);
        const resonance = this.clampFilterResonance(state.resonance);
        const biquadType: BiquadFilterType = state.mode;

        nodes.forEach((node) => {
            node.type = biquadType;
            if (smoothingTime > 0) {
                node.frequency.cancelScheduledValues(startTime);
                node.Q.cancelScheduledValues(startTime);
                node.frequency.setTargetAtTime(cutoff, startTime, smoothingTime);
                node.Q.setTargetAtTime(resonance, startTime, smoothingTime);
            } else {
                node.frequency.setValueAtTime(cutoff, startTime);
                node.Q.setValueAtTime(resonance, startTime);
            }
        });
    }

    private connectFilterChain(
        source: AudioNode,
        stages: [BiquadFilterNode, BiquadFilterNode],
        destination: AudioNode,
        order: FilterOrder
    ): void {
        this.safeDisconnect(source);
        this.safeDisconnect(stages[0]);
        this.safeDisconnect(stages[1]);

        source.connect(stages[0]);
        if (order === 4) {
            stages[0].connect(stages[1]);
            stages[1].connect(destination);
        } else {
            stages[0].connect(destination);
        }
    }

    private reconnectLiveGraph(): void {
        if (!this.workletNode) return;
        this.safeDisconnect(this.workletNode);
        this.safeDisconnect(this.filterStageA);
        this.safeDisconnect(this.filterStageB);

        if (this.filterState.mode === 'none') {
            this.workletNode.connect(this.masterGain);
            return;
        }

        this.connectFilterChain(
            this.workletNode,
            [this.filterStageA, this.filterStageB],
            this.masterGain,
            this.filterState.order
        );
        this.applyFilterStateToNodes(
            this.ctx,
            [this.filterStageA, this.filterStageB],
            this.filterState,
            this.ctx.currentTime,
            0
        );
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

        const transferData = data.slice();

        this.workletNode.port.postMessage({
            type: 'spectral-data',
            data: transferData
        }, [transferData.buffer]);
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

    public setHarmonicInjection(count: number, falloff: number): void {
        this.harmonicCount = count;
        this.harmonicFalloff = falloff;

        if (this.workletNode && this.isInitialized) {
            this.workletNode.port.postMessage({
                type: 'harmonic-injection',
                count: count,
                falloff: falloff
            });
        }
    }

    public getHarmonicInjection(): { count: number, falloff: number } {
        return {
            count: this.harmonicCount,
            falloff: this.harmonicFalloff
        };
    }

    public setSpectralCopy(shift: number, mix: number): void {
        this.spectralCopyShift = shift;
        this.spectralCopyMix = mix;

        if (this.workletNode && this.isInitialized) {
            this.workletNode.port.postMessage({
                type: 'spectral-copy',
                shift: shift,
                mix: mix
            });
        }
    }

    public getSpectralCopy(): { shift: number, mix: number } {
        return {
            shift: this.spectralCopyShift,
            mix: this.spectralCopyMix
        };
    }

    private sendWaveshapingToWorklet(): void {
        if (this.workletNode) {
            this.workletNode.port.postMessage({
                type: 'waveshape',
                curve: this.waveshapeCurve,
                drive: this.waveshapeDrive,
                mix: this.waveshapeMix
            });

            if (this.waveshapeCurve === 4 && this.waveshapeCustomCurve) {
                const lut = this.waveshapeCustomCurve.slice();
                this.workletNode.port.postMessage({ type: 'waveshape-lut', lut }, [lut.buffer]);
            }
        }
    }

    public setWaveshapingState(curve: number, drive: number, mix: number): void {
        this.waveshapeCurve = curve;
        this.waveshapeDrive = drive;
        this.waveshapeMix = mix;
        this.sendWaveshapingToWorklet();
    }

    public setWaveshapeCustomCurve(curve: Float32Array | null): void {
        this.waveshapeCustomCurve = curve ? curve.slice() : null;
        if (this.waveshapeCurve === 4) this.sendWaveshapingToWorklet();
    }

    public setWaveshaping(state: WaveshapeState | undefined): void {
        const s = state || { curve: 0, drive: 1.0, mix: 0.0 };
        this.setWaveshapingState(s.curve, s.drive, s.mix);
        if (s.curve === 4 && s.customCurve && s.customCurve.length > 1) {
            this.setWaveshapeCustomCurve(new Float32Array(s.customCurve));
        }
    }

    private sendSaturationToWorklet(): void {
        if (this.workletNode) {
            this.workletNode.port.postMessage({
                type: 'saturation',
                mode: this.saturationMode,
                drive: this.saturationDrive,
                mix: this.saturationMix
            });
        }
    }

    public setSaturationState(mode: number, drive: number, mix: number): void {
        this.saturationMode = mode;
        this.saturationDrive = drive;
        this.saturationMix = mix;
        this.sendSaturationToWorklet();
    }

    public setSaturation(state: SaturationState | undefined): void {
        const s = state || { mode: 0, drive: 1.0, mix: 0.0 };
        this.setSaturationState(s.mode, s.drive, s.mix);
    }

    public setFilterState(state: FilterState | undefined): void {
        const nextState = state ? { ...state } : { ...defaultFilterState };
        this.filterState = {
            mode: nextState.mode,
            order: nextState.order,
            cutoff: this.clampFilterCutoff(nextState.cutoff, this.ctx.sampleRate),
            resonance: this.clampFilterResonance(nextState.resonance)
        };
        this.reconnectLiveGraph();
    }

    public setFilterParams(cutoff: number, resonance: number, smoothingTime: number = 0.01): void {
        this.filterState.cutoff = this.clampFilterCutoff(cutoff, this.ctx.sampleRate);
        this.filterState.resonance = this.clampFilterResonance(resonance);
        if (this.filterState.mode === 'none') return;
        this.applyFilterStateToNodes(
            this.ctx,
            [this.filterStageA, this.filterStageB],
            this.filterState,
            this.ctx.currentTime,
            Math.max(0.001, smoothingTime)
        );
    }

    public getFilterState(): FilterState {
        return { ...this.filterState };
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

    public setMasterGainTarget(value: number, smoothingTime: number = 0.01): void {
        const now = this.ctx.currentTime;
        const clamped = Math.max(0, Math.min(1, value));
        this.masterGain.gain.cancelScheduledValues(now);
        this.masterGain.gain.setTargetAtTime(clamped, now, Math.max(0.001, smoothingTime));
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
            harmonicInjection: { count: number, falloff: number },
            spectralCopy: { shift: number, mix: number },
            waveshape?: WaveshapeState,
            saturation?: SaturationState,
            filter?: FilterState,
            filterAutomation?: {
                cutoff?: Float32Array,
                resonance?: Float32Array,
                duration: number
            },
            interpSamples: number,
            timeline?: { numFrames: number, frameSize: number },
            gainTimeline?: Float32Array,
            releaseDuration?: number
        }
    ): Promise<Blob> {
        const offlineSampleRate = 44100;
        const totalDuration = duration + (params.releaseDuration ?? this.release);
        const lengthSamples = Math.ceil(totalDuration * offlineSampleRate);

        const offlineCtx = new OfflineAudioContext(2, lengthSamples, offlineSampleRate);

        const addWorkletModule = async (url: string, label: string) => {
            try {
                await offlineCtx.audioWorklet.addModule(url);
            } catch (err) {
                // `addModule` errors are often opaque; try to fetch for status/CORS hints.
                let extra = '';
                try {
                    const resp = await fetch(url);
                    extra = ` fetch=${resp.status} ${resp.statusText}`;
                } catch (fetchErr) {
                    extra = ` fetchError=${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`;
                }
                const message = err instanceof Error ? err.message : String(err);
                throw new Error(`Offline worklet load failed (${label}) url=${url} err=${message}${extra}`);
            }
        };

        // Load processors into offline context via URL imports
        await addWorkletModule(spectralWorkletUrl, 'spectral');
        await addWorkletModule(chirpSpectralWorkletUrl, 'chirp-spectral');
        await addWorkletModule(wavetableWorkletUrl, 'wavetable');
        await addWorkletModule(whitenoiseWorkletUrl, 'whitenoise');

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
        const offlineFilterA = offlineCtx.createBiquadFilter();
        const offlineFilterB = offlineCtx.createBiquadFilter();

        const filterState = params.filter || this.filterState;
        if (filterState.mode === 'none') {
            node.connect(masterGain);
        } else {
            this.connectFilterChain(
                node,
                [offlineFilterA, offlineFilterB],
                masterGain,
                filterState.order
            );
            this.applyFilterStateToNodes(
                offlineCtx,
                [offlineFilterA, offlineFilterB],
                filterState,
                0,
                0
            );
        }
        masterGain.connect(offlineCtx.destination);

        // Setup parameters
        node.port.postMessage({
            type: 'octave-doubling',
            low: params.octaveDoubling.low,
            high: params.octaveDoubling.high,
            multiplier: params.octaveDoubling.multiplier
        });

        node.port.postMessage({
            type: 'harmonic-injection',
            count: params.harmonicInjection.count,
            falloff: params.harmonicInjection.falloff
        });

        node.port.postMessage({
            type: 'spectral-copy',
            shift: params.spectralCopy.shift,
            mix: params.spectralCopy.mix
        });

        // Send waveshaping + saturation (offline)
        const ws = params.waveshape || { curve: this.waveshapeCurve, drive: this.waveshapeDrive, mix: this.waveshapeMix, customCurve: this.waveshapeCustomCurve ? Array.from(this.waveshapeCustomCurve) : undefined };
        node.port.postMessage({ type: 'waveshape', curve: ws.curve, drive: ws.drive, mix: ws.mix });
        if (ws.curve === 4 && ws.customCurve && ws.customCurve.length > 1) {
            const lut = new Float32Array(ws.customCurve);
            node.port.postMessage({ type: 'waveshape-lut', lut }, [lut.buffer]);
        }

        const sat = params.saturation || { mode: this.saturationMode, drive: this.saturationDrive, mix: this.saturationMix };
        node.port.postMessage({ type: 'saturation', mode: sat.mode, drive: sat.drive, mix: sat.mix });

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

        if (filterState.mode !== 'none' && params.filterAutomation?.cutoff && params.filterAutomation.cutoff.length > 1) {
            const curve = params.filterAutomation.cutoff;
            offlineFilterA.frequency.setValueCurveAtTime(curve, 0, params.filterAutomation.duration);
            offlineFilterB.frequency.setValueCurveAtTime(curve, 0, params.filterAutomation.duration);
        } else if (filterState.mode !== 'none') {
            const cutoff = this.clampFilterCutoff(filterState.cutoff, offlineSampleRate);
            offlineFilterA.frequency.setValueAtTime(cutoff, 0);
            offlineFilterB.frequency.setValueAtTime(cutoff, 0);
        }

        if (filterState.mode !== 'none' && params.filterAutomation?.resonance && params.filterAutomation.resonance.length > 1) {
            const curve = params.filterAutomation.resonance;
            offlineFilterA.Q.setValueCurveAtTime(curve, 0, params.filterAutomation.duration);
            offlineFilterB.Q.setValueCurveAtTime(curve, 0, params.filterAutomation.duration);
        } else if (filterState.mode !== 'none') {
            const resonance = this.clampFilterResonance(filterState.resonance);
            offlineFilterA.Q.setValueAtTime(resonance, 0);
            offlineFilterB.Q.setValueAtTime(resonance, 0);
        }

        if (params.gainTimeline && params.gainTimeline.length > 1) {
            masterGain.gain.setValueCurveAtTime(params.gainTimeline, 0, totalDuration);
        } else if (params.gainTimeline && params.gainTimeline.length === 1) {
            masterGain.gain.setValueAtTime(params.gainTimeline[0], 0);
        } else {
            // Legacy ADSR fallback
            const now = 0;
            masterGain.gain.setValueAtTime(0, now);
            masterGain.gain.linearRampToValueAtTime(1.0, now + this.attack);
            masterGain.gain.linearRampToValueAtTime(this.sustain, now + this.attack + this.decay);

            const releaseStart = duration;
            masterGain.gain.setValueAtTime(this.sustain, releaseStart);
            masterGain.gain.linearRampToValueAtTime(0, releaseStart + this.release);
        }

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
