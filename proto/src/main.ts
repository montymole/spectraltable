import './style.css';
import { WebGLContext } from './gpu/context';
import { Renderer } from './gpu/renderer';
import { ControlPanel } from './ui/controls';
import { SpectrogramWebGL as Spectrogram } from './ui/spectrogram-webgl';
import { StereoScopeWebGL as StereoScope } from './ui/scope-webgl';
import { AudioEngine } from './audio/audio-engine';
import { AudioAnalyzer } from './audio/audio-analyzer';
import { MidiHandler } from './audio/midi-handler';
import { PianoKeyboard } from './ui/piano';
import bundledPresetsJson from './presets.json';
import {
    ReadingPathState, VolumeResolution, SynthMode, CarrierType,
    VOLUME_DENSITY_X_DEFAULT, VOLUME_DENSITY_Y_DEFAULT, VOLUME_DENSITY_Z_DEFAULT,
    GeneratorParams, PresetControls, OctaveDoublingState,
    FilterState, defaultFilterState, FILTER_CUTOFF_MIN, FILTER_CUTOFF_MAX, FILTER_RESONANCE_MIN, FILTER_RESONANCE_MAX,
    PolyphonyState, defaultPolyphonyState, POLYPHONY_MIN, POLYPHONY_MAX,
    UNISON_DETUNE_CENTS_MIN, UNISON_DETUNE_CENTS_MAX, UNISON_VOICES_MIN, UNISON_VOICES_MAX
} from './types';
import { createDefaultModulatorStates, estimateModulatorRange, Modulator, resolveModulatorStates } from './modulators/modulator';
import { noteToName } from './ui/ui-elements';
import type { PresetData } from './types';

const BUNDLED_PRESETS = bundledPresetsJson as PresetData[];

interface VoiceRuntime {
    id: number;
    note: number;
    modulators: Modulator[];
    isReleasing: boolean;
    releaseElapsed: number;
    releaseDuration: number;
    lastOutputs: number[];
}

// Main application entry point
// Initializes WebGL, UI, and wires up event handling

class SpectralTableApp {
    private glContext: WebGLContext;
    private renderer: Renderer;
    private controls: ControlPanel;
    private spectrogram: Spectrogram;
    private scope: StereoScope;
    private audioEngine: AudioEngine;
    private audioAnalyzer: AudioAnalyzer;
    private midiHandler: MidiHandler;
    private piano: PianoKeyboard;
    private canvas: HTMLCanvasElement;
    private activeVoices: Map<number, VoiceRuntime> = new Map();
    private animationFrameId: number = 0;
    private lastAudioSpectralRevision = -1;

    // Store uploaded spectral volumes
    private uploadedVolumes: Map<string, Float32Array> = new Map();

    // Animation state
    private gameOfLifeActive = false;
    private gameOfLifeSpeed = 0.5; // 0-1 range
    private gameOfLifeLastUpdate = 0;

    private sinePlasmaActive = false;
    private sinePlasmaSpeed = 0.5; // 0-1 range
    private sinePlasmaLastUpdate = 0;

    // Modulation Logic
    private modulators: Modulator[];
    private pathYSource: string = 'mod3';
    private scanPhaseSource: string = 'mod4';
    private shapePhaseSource: string = 'none';
    private amplitudeSource: string = 'mod1';
    private filterCutoffSource: string = 'mod2';
    private filterResonanceSource: string = 'none';
    private filterState: FilterState = { ...defaultFilterState };
    private polyphonyState: PolyphonyState = { ...defaultPolyphonyState };
    private currentBpm = 140;

    constructor() {
        console.log('Spectra Table Synthesis - Initializing...');
        this.modulators = createDefaultModulatorStates(4).map((state) => new Modulator(state));

        // Initialize WebGL
        this.canvas = document.getElementById('gl-canvas') as HTMLCanvasElement;
        if (!this.canvas) throw new Error('Canvas not found');

        this.glContext = new WebGLContext(this.canvas);

        // Create renderer with default resolution
        const defaultResolution: VolumeResolution = {
            x: VOLUME_DENSITY_X_DEFAULT,
            y: VOLUME_DENSITY_Y_DEFAULT,
            z: VOLUME_DENSITY_Z_DEFAULT,
        };
        this.renderer = new Renderer(this.glContext, defaultResolution);

        // Initialize UI controls
        this.controls = new ControlPanel('controls', {
            modulators: this.modulators.map((modulator) => modulator.getState()),
            bundledPresets: BUNDLED_PRESETS
        });

        // Create Spectrogram and Scope
        this.spectrogram = new Spectrogram('spectrogram-canvas');
        this.scope = new StereoScope('scope-canvas');

        // Initialize Audio Engine
        this.audioEngine = new AudioEngine();

        // Initialize Audio Analyzer
        this.audioAnalyzer = new AudioAnalyzer();

        // Initialize MIDI Handler
        this.midiHandler = new MidiHandler();
        this.midiHandler.setNoteEventCallback((note, velocity, isNoteOn) => {
            if (isNoteOn) this.onMidiNoteOn(note, velocity);
            else this.onMidiNoteOff(note);
        });
        this.midiHandler.setConnectionChangeCallback((isConnected) => {
            if (isConnected) console.log('✓ MIDI Device Connected');
            this.controls.updateMidiInputs(this.midiHandler.getInputs());
        });

        // Initialize Piano
        this.piano = new PianoKeyboard('piano-container');

        // Piano -> MidiHandler
        this.piano.setNoteChangeCallback((note, velocity) => {
            if (velocity > 0) {
                this.midiHandler.simulateNoteOn(note, velocity);
            } else {
                this.midiHandler.simulateNoteOff(note);
            }
        });

        // MidiHandler Raw -> Piano Visualization
        this.midiHandler.setRawNoteCallback((note, velocity) => {
            this.piano.setVisualizeState(note, velocity > 0);
        });

        // MIDI Input Selection
        this.controls.setMidiInputChangeCallback((id: string) => {
            this.midiHandler.selectInput(id);
        });

        this.controls.setOctaveChangeCallback((octave: number) => {
            this.piano.setBaseOctave(octave);
        });

        // Initial input list population (might be empty initially)
        setTimeout(() => {
            this.controls.updateMidiInputs(this.midiHandler.getInputs());
        }, 500);

        // Wire up callbacks
        this.controls.setPathChangeCallback(this.onPathChange.bind(this));
        this.controls.setVolumeResolutionChangeCallback(this.onVolumeResolutionChange.bind(this));
        this.controls.setSpectralDataChangeCallback(this.onSpectralDataChange.bind(this));
        this.controls.setWavUploadCallback(this.onWavUpload.bind(this));
        this.controls.setImageUploadCallback(this.onImageUpload.bind(this));
        this.controls.setSynthModeChangeCallback(this.onSynthModeChange.bind(this));
        this.controls.setCarrierChangeCallback(this.onCarrierChange.bind(this));
        this.controls.setFeedbackChangeCallback(this.onFeedbackChange.bind(this));
        this.controls.setOctaveDoublingChangeCallback(this.onOctaveDoublingChange.bind(this));
        this.controls.setHarmonicInjectionChangeCallback((state) => {
            this.audioEngine.setHarmonicInjection(state.count, state.falloff);
        });
        this.controls.setSpectralCopyChangeCallback((state) => {
            this.audioEngine.setSpectralCopy(state.shift, state.mix);
        });
        this.controls.setWaveshapeChangeCallback((state) => {
            this.audioEngine.setWaveshaping(state);
        });
        this.controls.setSaturationChangeCallback((state) => {
            this.audioEngine.setSaturation(state);
        });
        this.controls.setFilterChangeCallback((state) => {
            this.filterState = { ...state };
            this.audioEngine.setFilterState(state);
        });
        this.controls.setPolyphonyChangeCallback((state) => {
            this.polyphonyState = { ...state };
            this.audioEngine.setPolyphony(state);
            this.trimVoiceRuntimes();
        });
        this.controls.setInterpSamplesChangeCallback((samples: number) => this.audioEngine.setInterpSamples(samples));
        this.controls.setGeneratorParamsChangeCallback(this.onGeneratorParamsChange.bind(this));
        this.controls.setPresetLoadCallback(this.onPresetLoad.bind(this));
        this.controls.setRenderWavCallback(this.onRenderWav.bind(this));
        this.controls.setBPMCallback((bpm) => {
            this.currentBpm = bpm;
            this.modulators.forEach(modulator => modulator.setBPM(bpm));
            this.activeVoices.forEach((voice) => voice.modulators.forEach((modulator) => modulator.setBPM(bpm)));
        });
        this.controls.setModulatorChangeCallback((index, state) => {
            const modulator = this.modulators[index];
            if (!modulator) return;
            modulator.setState(state);
            modulator.setBPM(this.controls.getFullState().bpm);
            this.activeVoices.forEach((voice) => {
                const voiceModulator = voice.modulators[index];
                if (!voiceModulator) return;
                voiceModulator.setState(state);
                voiceModulator.setBPM(this.currentBpm);
            });
        });

        this.controls.setModulationRoutingChangeCallback((target: string, source: string) => {
            if (target === 'pathY') this.pathYSource = source;
            if (target === 'scanPhase') this.scanPhaseSource = source;
            if (target === 'shapePhase') this.shapePhaseSource = source;
            if (target === 'amplitude') this.amplitudeSource = source;
            if (target === 'filterCutoff') {
                this.filterCutoffSource = source;
                this.audioEngine.setFilterState(this.filterState);
            }
            if (target === 'filterResonance') {
                this.filterResonanceSource = source;
                this.audioEngine.setFilterState(this.filterState);
            }
        });

        // Handle window resize
        window.addEventListener('resize', this.onResize.bind(this));
        this.onResize();

        // Initialize audio engine early
        this.audioEngine.initialize().then(() => {
            console.log('✓ Audio engine ready (suspended until user interaction)');
        });

        // Wire up mouse events for 3D rotation
        this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
        this.canvas.addEventListener('mouseleave', this.onMouseUp.bind(this));
        this.canvas.addEventListener('wheel', this.onWheel.bind(this), { passive: false });

        // Prevent context menu on right-click
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            return false;
        });

        // Resume audio on any canvas interaction
        this.canvas.addEventListener('click', () => {
            this.audioEngine.resume();
        });

        // Keyboard shortcuts
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                this.audioEngine.resume();
                console.log('Audio resumed (Space)');
            }
        });

        // Start render loop
        this.startRenderLoop();
        void this.applyInitialPreset();

        console.log('✓ Application initialized');
    }

    private async applyInitialPreset(): Promise<void> {
        const initialPreset = await this.controls.getInitialPreset();
        if (!initialPreset) return;
        console.log(`Loading initial preset: ${initialPreset.name}`);
        this.applyPresetState(initialPreset.controls);
        this.controls.selectPreset(initialPreset.name);
    }

    private onPresetLoad(controls: PresetControls): void {
        console.log('Loading preset...');
        this.applyPresetState(controls);
    }

    private applyPresetState(state: PresetControls): void {
        // Apply to controls UI
        this.controls.applyState(state);

        // Apply BPM
        if (state.bpm !== undefined) {
            this.currentBpm = state.bpm;
            this.modulators.forEach(modulator => modulator.setBPM(state.bpm));
        }

        const modulatorStates = resolveModulatorStates(state, this.modulators.length);
        this.modulators = modulatorStates.map((modulatorState) => {
            const modulator = new Modulator(modulatorState);
            modulator.setBPM(state.bpm || this.controls.getFullState().bpm);
            return modulator;
        });

        // Apply modulation routing
        this.pathYSource = state.modRouting.pathY;
        this.scanPhaseSource = state.modRouting.scanPhase;
        this.shapePhaseSource = state.modRouting.shapePhase;
        this.amplitudeSource = state.modRouting.amplitude || 'mod1';
        this.filterCutoffSource = state.modRouting.filterCutoff || 'none';
        this.filterResonanceSource = state.modRouting.filterResonance || 'none';

        // Apply audio settings
        this.audioEngine.setMode(state.synthMode as SynthMode);
        this.lastAudioSpectralRevision = -1;
        this.audioEngine.setWavetableFrequency(state.frequency);
        this.audioEngine.setCarrier(state.carrier);
        this.audioEngine.setFeedback(state.feedback);
        this.audioEngine.setInterpSamples(state.interpSamples || 64);
        this.audioEngine.setWaveshaping(state.waveshape);
        this.audioEngine.setSaturation(state.saturation);
        this.filterState = state.filter ? { ...state.filter } : { ...defaultFilterState };
        this.audioEngine.setFilterState(this.filterState);
        this.polyphonyState = this.normalizePolyphonyState(state.polyphony);
        this.audioEngine.setPolyphony(this.polyphonyState);
        this.clearVoiceRuntimes();

        // Apply piano octave
        this.piano.setBaseOctave(state.octave);

        // Apply octave doubling
        if (state.octaveDoubling) {
            this.audioEngine.setOctaveDoubling(
                state.octaveDoubling.lowCount,
                state.octaveDoubling.highCount,
                state.octaveDoubling.multiplier
            );
        }

        // Apply harmonic injection
        if (state.harmonicInjection) {
            this.audioEngine.setHarmonicInjection(
                state.harmonicInjection.count,
                state.harmonicInjection.falloff
            );
        }

        // Apply spectral copy
        if (state.spectralCopy) {
            this.audioEngine.setSpectralCopy(
                state.spectralCopy.shift,
                state.spectralCopy.mix
            );
        }

        // Apply volume resolution
        const resolution = { x: state.densityX, y: state.densityY, z: state.densityZ };
        this.renderer.updateVolumeResolution(resolution);

        // Update generator params UI and trigger data generation
        this.controls.updateGeneratorParamsUI(state.spectralData, state.generatorParams);

        // Trigger spectral data change (will use generator params if available)
        this.onSpectralDataChange(state.spectralData, state.generatorParams);

        // Update path
        this.onPathChange(this.controls.getState());

        console.log('✓ State applied');
    }

    private onPathChange(state: ReadingPathState): void {
        this.renderer.updateReadingPath(state);
    }



    private onVolumeResolutionChange(resolution: VolumeResolution): void {
        console.log('Volume resolution changed:', resolution);
        this.renderer.updateVolumeResolution(resolution);

        // Re-generate current spectral data with new resolution
        const currentData = (document.getElementById('spectral-data-type') as HTMLSelectElement)?.value || 'blank';

        // Reinitialize Game of Life if it's active
        if (currentData === 'game-of-life' && this.gameOfLifeActive) {
            this.renderer.getSpectralVolume().initGameOfLife();
            this.gameOfLifeLastUpdate = performance.now();
            console.log('✓ Game of Life reinitialized with new density');
        } else if (currentData === 'sine-plasma' && this.sinePlasmaActive) {
            this.renderer.getSpectralVolume().generateSinePlasma(0);
            this.sinePlasmaLastUpdate = performance.now();
            console.log('✓ Sine Plasma reinitialized with new density');
        } else if (!this.uploadedVolumes.has(currentData)) {
            // Regenerate other built-in datasets
            this.renderer.updateSpectralData(currentData);
        }
        // Note: Uploaded volumes maintain their data across resolution changes
    }

    private onSpectralDataChange(dataSet: string, initialParams?: GeneratorParams): void {
        console.log('Spectral data changed:', dataSet);

        // Stop any active animations
        this.gameOfLifeActive = false;
        this.sinePlasmaActive = false;

        // Show generator params UI for supported generators
        this.controls.updateGeneratorParamsUI(dataSet, initialParams);

        // Check if it's an uploaded volume
        if (this.uploadedVolumes.has(dataSet)) {
            const volumeData = this.uploadedVolumes.get(dataSet)!;
            this.renderer.getSpectralVolume().setData(volumeData);
            this.renderer.markReadingLineDirty();
            this.controls.hideDynamicParam();
        } else if (dataSet === 'game-of-life') {
            // Initialize Game of Life with current params
            const params = this.controls.getCurrentGeneratorParams();
            this.renderer.updateSpectralData(dataSet, params || undefined);
            this.gameOfLifeActive = true;
            this.gameOfLifeLastUpdate = performance.now();

            // Show dynamic parameter slider for evolution speed (0.01 to 1.0)
            this.controls.showDynamicParam('Evolution Speed', 0.5, 0.01, 1.0, 0.01, (v: number) => {
                this.gameOfLifeSpeed = v;
            });
            console.log('✓ Game of Life initialized');
        } else if (dataSet === 'sine-plasma') {
            // Initialize Sine Plasma with current params
            const params = this.controls.getCurrentGeneratorParams();
            this.renderer.updateSpectralData(dataSet, params || undefined);
            this.sinePlasmaActive = true;
            this.sinePlasmaLastUpdate = performance.now();

            // Show dynamic parameter slider for evolution speed (0.01 to 1.0)
            this.controls.showDynamicParam('Evolution Speed', 0.5, 0.01, 1.0, 0.01, (v: number) => {
                this.sinePlasmaSpeed = v;
            });
            console.log('✓ Sine Plasma initialized with evolution');
        } else {
            // Built-in data sets with params
            const params = this.controls.getCurrentGeneratorParams();
            this.renderer.updateSpectralData(dataSet, params || undefined);
            this.controls.hideDynamicParam();
        }

        // Resume audio when data changes
        this.audioEngine.resume();
    }

    private onSynthModeChange(mode: SynthMode): void {
        this.audioEngine.setMode(mode);
        this.lastAudioSpectralRevision = -1;
        console.log(`✓ Synth mode: ${mode}`);
    }

    private onCarrierChange(carrier: CarrierType): void {
        this.audioEngine.setCarrier(carrier);
    }

    private onFeedbackChange(amount: number): void {
        this.audioEngine.setFeedback(amount);
    }

    private onOctaveDoublingChange(state: OctaveDoublingState): void {
        this.audioEngine.setOctaveDoubling(
            state.lowCount,
            state.highCount,
            state.multiplier
        );
    }

    private onGeneratorParamsChange(dataSet: string, params: GeneratorParams): void {
        // Regenerate with new params
        this.renderer.updateSpectralData(dataSet, params);
    }

    private getModulatorIndex(source: string): number {
        if (!source.startsWith('mod')) return -1;
        return parseInt(source.replace('mod', ''), 10) - 1;
    }

    private getModulatorValue(source: string, outputs: number[]): number {
        const index = this.getModulatorIndex(source);
        return index >= 0 && index < outputs.length ? outputs[index] : 0;
    }

    private getNormalizedModulatorValue(source: string, outputs: number[]): number {
        const index = this.getModulatorIndex(source);
        if (index < 0 || index >= outputs.length) return 0;

        const modulator = this.modulators[index];
        if (!modulator) return 0;

        const [min, max] = estimateModulatorRange(modulator.getState());
        if (Math.abs(max - min) < 1e-6) {
            return Math.max(0, Math.min(1, outputs[index]));
        }

        return Math.max(0, Math.min(1, (outputs[index] - min) / (max - min)));
    }

    private interpolateLog(min: number, max: number, normalized: number): number {
        const clamped = Math.max(0, Math.min(1, normalized));
        return min * Math.pow(max / min, clamped);
    }

    private getFilterCutoffValue(outputs: number[]): number {
        if (this.filterCutoffSource === 'none') {
            return this.filterState.cutoff;
        }
        return this.interpolateLog(
            FILTER_CUTOFF_MIN,
            FILTER_CUTOFF_MAX,
            this.getNormalizedModulatorValue(this.filterCutoffSource, outputs)
        );
    }

    private getFilterResonanceValue(outputs: number[]): number {
        if (this.filterResonanceSource === 'none') {
            return this.filterState.resonance;
        }
        const normalized = this.getNormalizedModulatorValue(this.filterResonanceSource, outputs);
        return FILTER_RESONANCE_MIN + (FILTER_RESONANCE_MAX - FILTER_RESONANCE_MIN) * normalized;
    }

    private getFilterRuntimeState(outputs: number[]): FilterState {
        return {
            ...this.filterState,
            cutoff: this.getFilterCutoffValue(outputs),
            resonance: this.getFilterResonanceValue(outputs)
        };
    }

    private applyModulatedPathState(state: ReadingPathState, outputs: number[]): boolean {
        let changed = false;

        if (this.pathYSource !== 'none') {
            state.position.y = Math.max(-1, Math.min(1, this.getModulatorValue(this.pathYSource, outputs)));
            this.controls.updatePathY(state.position.y);
            changed = true;
        }
        if (this.scanPhaseSource !== 'none') {
            state.scanPosition = Math.max(-1, Math.min(1, this.getModulatorValue(this.scanPhaseSource, outputs)));
            this.controls.updateScanPosition(state.scanPosition);
            changed = true;
        }
        if (this.shapePhaseSource !== 'none') {
            state.shapePhase = Math.max(-1, Math.min(1, this.getModulatorValue(this.shapePhaseSource, outputs)));
            changed = true;
        }

        return changed;
    }

    private getAmplitudeValue(outputs: number[], noteActive: boolean = this.activeVoices.size > 0): number {
        if (this.amplitudeSource === 'none') {
            return noteActive ? 1 : 0;
        }
        return Math.max(0, Math.min(1, this.getModulatorValue(this.amplitudeSource, outputs)));
    }

    private normalizePolyphonyState(state?: Partial<PolyphonyState>): PolyphonyState {
        if (!state) return { ...defaultPolyphonyState };
        const rawMode = (state as any).mode;
        const voices = Math.round(state.voices ?? defaultPolyphonyState.voices);
        const unisonVoices = Math.round((state as any).unisonVoices ?? (rawMode === 'unison' ? voices : defaultPolyphonyState.unisonVoices));
        return {
            voices: Math.max(POLYPHONY_MIN, Math.min(POLYPHONY_MAX, voices)),
            mode: rawMode === 'mono' || rawMode === 'unison' ? 'mono' : 'poly',
            unisonVoices: Math.max(UNISON_VOICES_MIN, Math.min(UNISON_VOICES_MAX, unisonVoices)),
            unisonDetuneCents: Math.max(
                UNISON_DETUNE_CENTS_MIN,
                Math.min(UNISON_DETUNE_CENTS_MAX, state.unisonDetuneCents ?? defaultPolyphonyState.unisonDetuneCents)
            )
        };
    }

    private onMidiNoteOn(note: number, velocity: number): void {
        const voiceIds = this.audioEngine.noteOn(note, velocity);
        voiceIds.forEach((id) => {
            const modulators = this.modulators.map((modulator) => {
                const clone = modulator.clone();
                clone.setBPM(this.currentBpm);
                clone.noteOn();
                return clone;
            });
            const releaseDuration = this.getVoiceReleaseDuration(modulators);
            this.activeVoices.set(id, {
                id,
                note,
                modulators,
                isReleasing: false,
                releaseElapsed: 0,
                releaseDuration,
                lastOutputs: new Array(modulators.length).fill(0)
            });
        });
        this.trimVoiceRuntimes();
    }

    private onMidiNoteOff(note: number): void {
        const releasedIds = this.audioEngine.noteOff(note);
        releasedIds.forEach((id) => {
            const voice = this.activeVoices.get(id);
            if (!voice) return;
            voice.isReleasing = true;
            voice.releaseElapsed = 0;
            voice.modulators.forEach((modulator) => modulator.noteOff());
        });
    }

    private getVoiceReleaseDuration(modulators: Modulator[]): number {
        if (this.amplitudeSource === 'none') return 0.05;
        const index = Math.max(0, this.getModulatorIndex(this.amplitudeSource));
        return modulators[index]?.getMaxReleaseTime() || 0.05;
    }

    private trimVoiceRuntimes(): void {
        const activeIds = new Set(this.audioEngine.getActiveVoiceIds());
        Array.from(this.activeVoices.keys()).forEach((id) => {
            if (!activeIds.has(id)) this.activeVoices.delete(id);
        });
    }

    private clearVoiceRuntimes(): void {
        this.audioEngine.allNotesOff(0.001);
        this.activeVoices.clear();
    }

    private async onRenderWav(note: number, duration: number): Promise<void> {
        const fullState = this.controls.getFullState();
        const bpm = (fullState as any).bpm || 140;

        let actualDuration = duration;
        const anySynced = this.modulators.some((modulator) =>
            modulator.getState().slots.some((slot) => slot.type === 'lfo' && slot.lfo?.isSynced)
        );

        if (anySynced) {
            actualDuration = duration * (60 / bpm);
            console.log(`Auto-adjusting render duration to ${duration} beats (${actualDuration.toFixed(3)}s) at ${bpm} BPM`);
        }

        console.log(`Rendering WAV for note ${note}, duration ${actualDuration}s...`);

        const octaveDoubling = this.audioEngine.getOctaveDoubling();
        const state = fullState;
        const releaseDuration = this.amplitudeSource === 'none'
            ? 0
            : this.modulators[Math.max(0, this.getModulatorIndex(this.amplitudeSource))]?.getMaxReleaseTime() || 0;
        const totalDuration = actualDuration + releaseDuration;

        const hasPathModulation = this.pathYSource !== 'none' ||
            this.scanPhaseSource !== 'none' ||
            this.shapePhaseSource !== 'none';
        const hasFilterModulation = this.filterCutoffSource !== 'none' ||
            this.filterResonanceSource !== 'none';

        let spectralData: Float32Array;
        let timelineInfo: { numFrames: number, frameSize: number } | undefined;
        let gainTimeline: Float32Array | undefined;
        let filterCutoffTimeline: Float32Array | undefined;
        let filterResonanceTimeline: Float32Array | undefined;

        const fps = 60;
        const numFrames = Math.max(1, Math.ceil(totalDuration * fps));
        const deltaTime = 1 / fps;
        if (hasFilterModulation) {
            if (this.filterCutoffSource !== 'none') filterCutoffTimeline = new Float32Array(numFrames);
            if (this.filterResonanceSource !== 'none') filterResonanceTimeline = new Float32Array(numFrames);
        }
        const simModulators = this.modulators.map((modulator) => {
            const clone = modulator.clone();
            clone.setBPM(bpm);
            return clone;
        });
        simModulators.forEach((modulator) => modulator.noteOn());

        const pathState = this.controls.getState();
        const initialPathY = pathState.position.y;
        const initialScanPos = pathState.scanPosition;
        const initialShapePhase = pathState.shapePhase;

        if (hasPathModulation) {
            const firstFrame = this.renderer.getReadingLineSpectralData();
            const frameSize = firstFrame.length;
            const timeline = new Float32Array(numFrames * frameSize);
            gainTimeline = new Float32Array(numFrames);

            let released = false;
            for (let f = 0; f < numFrames; f++) {
                const currentTime = f * deltaTime;
                if (!released && currentTime >= actualDuration) {
                    simModulators.forEach((modulator) => modulator.noteOff());
                    released = true;
                }

                const outputs = simModulators.map((modulator) => modulator.update(f === 0 ? 0 : deltaTime));
                this.applyModulatedPathState(pathState, outputs);
                gainTimeline[f] = this.getAmplitudeValue(outputs, currentTime < actualDuration || !released);
                if (filterCutoffTimeline) filterCutoffTimeline[f] = this.getFilterCutoffValue(outputs);
                if (filterResonanceTimeline) filterResonanceTimeline[f] = this.getFilterResonanceValue(outputs);

                this.renderer.updateReadingPath(pathState);
                const frame = this.renderer.getReadingLineSpectralData();
                timeline.set(frame, f * frameSize);
            }

            spectralData = timeline;
            timelineInfo = { numFrames, frameSize };
            console.log(`Generated ${numFrames} frames for modulator simulation`);
        } else {
            let released = false;
            gainTimeline = new Float32Array(numFrames);
            for (let f = 0; f < numFrames; f++) {
                const currentTime = f * deltaTime;
                if (!released && currentTime >= actualDuration) {
                    simModulators.forEach((modulator) => modulator.noteOff());
                    released = true;
                }
                const outputs = simModulators.map((modulator) => modulator.update(f === 0 ? 0 : deltaTime));
                gainTimeline[f] = this.getAmplitudeValue(outputs, currentTime < actualDuration || !released);
                if (filterCutoffTimeline) filterCutoffTimeline[f] = this.getFilterCutoffValue(outputs);
                if (filterResonanceTimeline) filterResonanceTimeline[f] = this.getFilterResonanceValue(outputs);
            }
            spectralData = this.renderer.getReadingLineSpectralData();
        }

        pathState.position.y = initialPathY;
        pathState.scanPosition = initialScanPos;
        pathState.shapePhase = initialShapePhase;
        this.renderer.updateReadingPath(pathState);

        try {
            this.controls.showProgress('render');
            this.controls.updateProgress('render', 0);

            const blob = await this.audioEngine.renderOffline(note, actualDuration, spectralData, {
                mode: state.synthMode as SynthMode,
                wavetableParams: {
                    frequency: 220,
                    carrier: state.carrier,
                    feedback: state.feedback
                },
                octaveDoubling: {
                    low: octaveDoubling.low,
                    high: octaveDoubling.high,
                    multiplier: octaveDoubling.multiplier
                },
                harmonicInjection: this.audioEngine.getHarmonicInjection(),
                spectralCopy: this.audioEngine.getSpectralCopy(),
                waveshape: state.waveshape,
                saturation: state.saturation,
                filter: this.filterState,
                filterAutomation: (filterCutoffTimeline || filterResonanceTimeline) ? {
                    cutoff: filterCutoffTimeline,
                    resonance: filterResonanceTimeline,
                    duration: totalDuration
                } : undefined,
                interpSamples: state.interpSamples,
                timeline: timelineInfo,
                gainTimeline,
                releaseDuration
            });

            this.controls.updateProgress('render', 100);

            // Construct filename
            const presetName = (document.getElementById('preset-select') as HTMLSelectElement)?.value;
            const sourceName = presetName && presetName.trim() ? presetName : state.spectralData;
            const noteName = noteToName(note);
            const filename = `${sourceName}-${noteName}.wav`;

            await this.controls.showRenderDialog(blob, filename);

            console.log('✓ WAV render complete');
        } catch (error) {
            console.error('Offline render failed:', error);
            alert(`Failed to render WAV: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            this.controls.hideProgress('render');
        }
    }

    private async onWavUpload(files: FileList): Promise<void> {
        const fileArray = Array.from(files);
        console.log(`Processing ${fileArray.length} audio file(s) for morphing`);

        try {
            // Show progress
            this.controls.showProgress('upload');
            this.controls.updateProgress('upload', 0);

            // Get current volume resolution
            const resolution = this.renderer.getSpectralVolume().getResolution();

            // Set Y density to number of files
            const numSamples = fileArray.length;
            const newResolution = {
                ...resolution,
                y: numSamples
            };

            // Update Y density slider
            this.controls.setVolumeDensity(newResolution.x, newResolution.y, newResolution.z);
            this.renderer.updateVolumeResolution(newResolution);

            // Analyze all files and build the morphing volume
            const volumeData = await this.audioAnalyzer.analyzeMultipleFiles(
                fileArray,
                newResolution,
                (percent: number) => this.controls.updateProgress('upload', percent)
            );

            // Store the volume data
            const volumeName = fileArray.length === 1
                ? fileArray[0].name.replace(/\.[^/.]+$/, '')
                : `Morph_${fileArray.length}_samples`;

            this.uploadedVolumes.set(volumeName, volumeData);

            // Set volume data directly
            this.renderer.getSpectralVolume().setData(volumeData);
            this.renderer.markReadingLineDirty();

            // Add to dropdown and select it
            this.controls.addSpectralDataOption(volumeName);

            console.log(`✓ Processed ${fileArray.length} file(s) into morphing volume`);
        } catch (error) {
            console.error('Failed to process audio file(s):', error);
            alert(`Error processing audio file(s): ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            // Hide progress
            setTimeout(() => this.controls.hideProgress('upload'), 500);
        }
    }

    private async onImageUpload(file: File): Promise<void> {
        console.log('Processing image: ' + file.name);

        try {
            // Show progress
            this.controls.showProgress('upload');
            this.controls.updateProgress('upload', 0, 'Loading image. ..');

            // Load image onto canvas
            const img = await this.loadImageFromFile(file);

            // Get current volume resolution
            const resolution = this.renderer.getSpectralVolume().getResolution();
            const x = resolution.x;
            const y = resolution.y;
            const z = resolution.z;

            console.log('Tiling image ' + img.naturalWidth + 'x' + img.naturalHeight + ' into ' + x + 'x' + y + 'x' + z + ' volume');

            // Create offscreen canvas at image size
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, 0, 0);

            // Compute optimal tile grid (rows x cols >= z tiles) matching image aspect ratio
            const tileGrid = this.computeTileGrid(img.naturalWidth, img.naturalHeight, z);
            console.log('Tile grid: ' + tileGrid.rows + 'x' + tileGrid.cols + ' = ' + tileGrid.tiles + ' tiles');

            // Tile the image into the volume
            this.controls.updateProgress('upload', 10, 'Tiling volume. ..');

            const volumeData = new Float32Array(x * y * z * 4);
            const tileW = Math.ceil(img.naturalWidth / tileGrid.cols);
            const tileH = Math.ceil(img.naturalHeight / tileGrid.rows);

            // Temporary canvas for scaling tiles
            const tileCanvas = document.createElement('canvas');
            tileCanvas.width = x;
            tileCanvas.height = y;
            const tileCtx = tileCanvas.getContext('2d')!;

            let tileIndex = 0;
            for (let row = 0; row < tileGrid.rows; row++) {
                for (let col = 0; col < tileGrid.cols; col++) {
                    if (tileIndex >= z) break;

                    // Source region in full image
                    const srcX = col * tileW;
                    const srcY = row * tileH;
                    const srcW = Math.min(tileW, img.naturalWidth - srcX);
                    const srcH = Math.min(tileH, img.naturalHeight - srcY);

                    // Draw scaled tile to tile canvas
                    tileCtx.clearRect(0, 0, x, y);
                    tileCtx.drawImage(canvas, srcX, srcY, srcW, srcH, 0, 0, x, y);

                    // Read scaled tile pixels
                    const tileData = tileCtx.getImageData(0, 0, x, y).data;

                    // Write to volume data (RGBA -> Float32Array, normalized 0-1)
                    const baseIdx = tileIndex * x * y * 4;
                    for (let i = 0; i < tileData.length; i++) {
                        volumeData[baseIdx + i] = tileData[i] / 255.0;
                    }

                    // Update progress
                    const pct = 10 + Math.floor((tileIndex / z) * 70);
                    this.controls.updateProgress('upload', pct, 'Tiling ' + (tileIndex + 1) + '/' + z + '. ..');

                    tileIndex++;
                }
            }

            this.controls.updateProgress('upload', 90, 'Uploading to GPU. ..');

            // Store the volume data
            const volumeName = file.name.replace(/\.[^/.]+$/, '');
            this.uploadedVolumes.set(volumeName, volumeData);

            // Set volume data directly
            this.renderer.getSpectralVolume().setData(volumeData);
            this.renderer.markReadingLineDirty();

            // Add to dropdown and select it
            this.controls.addSpectralDataOption(volumeName);
            this.controls.selectSpectralDataOption(volumeName);

            this.controls.updateProgress('upload', 100, 'Done!');
            console.log('Image ' + volumeName + ' tiled into ' + x + 'x' + y + 'x' + z + ' volume (' + tileIndex + ' tiles)');
        } catch (error) {
            console.error('Failed to process image:', error);
            alert('Error processing image: ' + (error instanceof Error ? error.message : 'Unknown error'));
        } finally {
            setTimeout(() => this.controls.hideProgress('upload'), 1000);
        }
    }

    private loadImageFromFile(file: File): Promise<HTMLImageElement> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const objectUrl = URL.createObjectURL(file);
            img.onload = () => {
                URL.revokeObjectURL(objectUrl);
                resolve(img);
            };
            img.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                reject(new Error('Failed to load image'));
            };
            img.src = objectUrl;
        });
    }

    private computeTileGrid(imgWidth: number, imgHeight: number, numTiles: number): { rows: number, cols: number, tiles: number } {
        const imgAspect = imgWidth / imgHeight;

        let bestRows = 1;
        let bestCols = numTiles;
        let bestScore = Infinity;

        // Search for optimal grid that matches image aspect ratio and has >= numTiles tiles
        for (let rows = 1; rows <= numTiles; rows++) {
            const cols = Math.ceil(numTiles / rows);
            const gridAspect = cols / rows;
            const score = Math.abs(Math.log2(gridAspect / imgAspect));
            if (score < bestScore) {
                bestScore = score;
                bestRows = rows;
                bestCols = cols;
            }
        }

        return { rows: bestRows, cols: bestCols, tiles: bestRows * bestCols };
    }

    private onResize(): void {
        const rect = this.canvas.getBoundingClientRect();
        this.renderer.resize(rect.width, rect.width);
    }

    private onMouseDown(event: MouseEvent): void {
        this.renderer.onMouseDown(event.clientX, event.clientY, event.button);

        // Resume audio context on user interaction
        this.audioEngine.resume();
    }

    private onMouseMove(event: MouseEvent): void {
        this.renderer.onMouseMove(event.clientX, event.clientY);
    }

    private onMouseUp(): void {
        this.renderer.onMouseUp();
    }

    private onWheel(event: WheelEvent): void {
        event.preventDefault();
        this.renderer.zoom(event.deltaY);
    }

    private startRenderLoop(): void {
        let lastTime = performance.now();

        const render = (time: number) => {
            const deltaTime = (time - lastTime) / 1000; // Seconds
            lastTime = time;

            // Update Game of Life animation
            if (this.gameOfLifeActive && this.gameOfLifeSpeed > 0) {
                // Speed 0 = paused
                // Speed 1 = instant (no delay)
                // Map speed to delay: at 1.0 -> 0ms delay, at 0.01 -> 1000ms delay
                const delay = (1.0 - this.gameOfLifeSpeed) * 1000;
                const timeSinceLastUpdate = time - this.gameOfLifeLastUpdate;

                if (timeSinceLastUpdate >= delay) {
                    this.renderer.getSpectralVolume().stepGameOfLife();
                    this.renderer.markReadingLineDirty();
                    this.gameOfLifeLastUpdate = time;
                }
            }

            // Update Sine Plasma animation
            if (this.sinePlasmaActive && this.sinePlasmaSpeed > 0) {
                // Speed 0 = static
                // Speed 1 = fast evolution (every frame)
                // Speed controls frequency of updates
                const delay = (1.0 - this.sinePlasmaSpeed) * 100; // Max 100ms between updates
                const timeSinceLastUpdate = time - this.sinePlasmaLastUpdate;

                if (timeSinceLastUpdate >= delay) {
                    this.renderer.getSpectralVolume().stepSinePlasma();
                    this.renderer.markReadingLineDirty();
                    this.sinePlasmaLastUpdate = time;
                }
            }

            // Modulator update. Shared modulators drive global visual/path targets; each
            // active audio voice advances its own cloned modulators for amp/filter.
            const state = this.controls.getState();
            let modOutputs = this.modulators.map((modulator) => modulator.update(deltaTime));

            this.activeVoices.forEach((voice) => {
                const voiceOutputs = voice.modulators.map((modulator) => modulator.update(deltaTime));
                voice.lastOutputs = voiceOutputs;
                this.audioEngine.setVoiceGainTarget(
                    voice.id,
                    this.getAmplitudeValue(voiceOutputs, true)
                );

                if (this.filterCutoffSource !== 'none' || this.filterResonanceSource !== 'none') {
                    const filterRuntimeState = this.getFilterRuntimeState(voiceOutputs);
                    this.audioEngine.setVoiceFilterParams(voice.id, filterRuntimeState.cutoff, filterRuntimeState.resonance);
                }

                if (voice.isReleasing) {
                    voice.releaseElapsed += deltaTime;
                    const amp = this.getAmplitudeValue(voiceOutputs, false);
                    if (voice.releaseElapsed >= voice.releaseDuration + 0.05 || amp <= 0.0005) {
                        this.audioEngine.stopVoice(voice.id);
                        this.activeVoices.delete(voice.id);
                    }
                }
            });

            const firstVoice = this.activeVoices.values().next().value as VoiceRuntime | undefined;
            if (firstVoice) modOutputs = firstVoice.lastOutputs;

            const beatDuration = 60 / Math.max(this.currentBpm, 1);
            this.controls.updateModulatorPreviewCurves(
                this.modulators.map((modulator) => modulator.samplePreview(beatDuration, 256))
            );
            const pathModulated = this.applyModulatedPathState(state, modOutputs);
            if (pathModulated) {
                this.renderer.updateReadingPath(state);
            }

            this.renderer.render(deltaTime);

            // Get spectral data (RGBA)
            const spectralData = this.renderer.getReadingLineSpectralData();

            // Only resend to the worklet when the sampled reading line changed.
            const spectralRevision = this.renderer.getReadingLineRevision();
            if (spectralRevision !== this.lastAudioSpectralRevision) {
                this.audioEngine.updateSpectralData(spectralData);
                this.lastAudioSpectralRevision = spectralRevision;
            }

            // Get Audio FFT data
            const audioSpectralData = this.audioEngine.getAudioSpectralData();

            // Update Visualizations
            this.spectrogram.update(spectralData, audioSpectralData.left);

            // Update Scope
            const scopeData = this.audioEngine.getScopeData();
            this.scope.draw(scopeData.left, scopeData.right);

            this.animationFrameId = requestAnimationFrame(render);
        };
        requestAnimationFrame(render);
    }

    public destroy(): void {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        this.renderer.destroy();
    }
}

// Initialize app when DOM is ready
const app = new SpectralTableApp();

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    app.destroy();
});
