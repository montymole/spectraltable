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
import {
    ReadingPathState, VolumeResolution, SynthMode, CarrierType,
    VOLUME_DENSITY_X_DEFAULT, VOLUME_DENSITY_Y_DEFAULT, VOLUME_DENSITY_Z_DEFAULT,
    GeneratorParams, PresetControls, OctaveDoublingState
} from './types';
import { createDefaultModulatorStates, Modulator, resolveModulatorStates } from './modulators/modulator';
import { noteToName } from './ui/ui-elements';

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
    private currentNote: number | null = null;
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
    private pathYSource: string = 'none';
    private scanPhaseSource: string = 'none';
    private shapePhaseSource: string = 'none';
    private amplitudeSource: string = 'mod1';
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
        this.midiHandler.setNoteChangeCallback(this.onMidiNote.bind(this));
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
        this.controls.setInterpSamplesChangeCallback((samples: number) => this.audioEngine.setInterpSamples(samples));
        this.controls.setGeneratorParamsChangeCallback(this.onGeneratorParamsChange.bind(this));
        this.controls.setPresetLoadCallback(this.onPresetLoad.bind(this));
        this.controls.setRenderWavCallback(this.onRenderWav.bind(this));
        this.controls.setBPMCallback((bpm) => {
            this.currentBpm = bpm;
            this.modulators.forEach(modulator => modulator.setBPM(bpm));
        });
        this.controls.setModulatorChangeCallback((index, state) => {
            const modulator = this.modulators[index];
            if (!modulator) return;
            modulator.setState(state);
            modulator.setBPM(this.controls.getFullState().bpm);
        });

        this.controls.setModulationRoutingChangeCallback((target: string, source: string) => {
            if (target === 'pathY') this.pathYSource = source;
            if (target === 'scanPhase') this.scanPhaseSource = source;
            if (target === 'shapePhase') this.shapePhaseSource = source;
            if (target === 'amplitude') this.amplitudeSource = source;
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

        // Try to restore saved state
        this.restoreSavedState();

        console.log('✓ Application initialized');
    }

    private restoreSavedState(): void {
        const savedState = this.controls.loadSavedState();
        if (savedState) {
            console.log('Restoring saved state...');
            this.applyPresetState(savedState);
        }
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

        // Apply audio settings
        this.audioEngine.setMode(state.synthMode as SynthMode);
        this.lastAudioSpectralRevision = -1;
        this.audioEngine.setWavetableFrequency(state.frequency);
        this.audioEngine.setCarrier(state.carrier);
        this.audioEngine.setFeedback(state.feedback);
        this.audioEngine.setInterpSamples(state.interpSamples || 64);
        this.audioEngine.setMasterGainTarget(0, 0.001);

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

    private getAmplitudeValue(outputs: number[], noteActive: boolean = this.currentNote !== null): number {
        if (this.amplitudeSource === 'none') {
            return noteActive ? 1 : 0;
        }
        return Math.max(0, Math.min(1, this.getModulatorValue(this.amplitudeSource, outputs)));
    }

    private onMidiNote(note: number | null): void {
        // Handle Note Off / All Keys Up
        if (note === null) {
            this.currentNote = null;
            this.modulators.forEach((modulator) => modulator.noteOff());
            return;
        }

        // Avoid re-triggering if the highest note hasn't changed (e.g. releasing a lower key)
        if (note === this.currentNote) {
            return;
        }

        this.currentNote = note;

        // Convert MIDI note to frequency
        // f = 440 * 2^((n - 69) / 12)
        const freq = 440 * Math.pow(2, (note - 69) / 12);

        const mode = this.audioEngine.getMode();

        if (mode === SynthMode.WAVETABLE) {
            // Set wavetable frequency directly from MIDI
            this.audioEngine.setWavetableFrequency(freq);
        } else if (mode === SynthMode.SPECTRAL) {
            // Spectral Mode Pitch Strategy
            // Root = 440Hz (A4)
            // Multiplier = TargetFreq / Root
            const rootFreq = 440;
            const multiplier = freq / rootFreq;

            this.audioEngine.setSpectralPitch(multiplier);
        }

        this.modulators.forEach((modulator) => modulator.noteOn());
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

        let spectralData: Float32Array;
        let timelineInfo: { numFrames: number, frameSize: number } | undefined;
        let gainTimeline: Float32Array | undefined;

        const fps = 60;
        const numFrames = Math.max(1, Math.ceil(totalDuration * fps));
        const deltaTime = 1 / fps;
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

            // Modulator update
            const state = this.controls.getState();
            const modOutputs = this.modulators.map((modulator) => modulator.update(deltaTime));
            const beatDuration = 60 / Math.max(this.currentBpm, 1);
            this.controls.updateModulatorPreviewCurves(
                this.modulators.map((modulator) => modulator.samplePreview(beatDuration, 256))
            );
            const pathModulated = this.applyModulatedPathState(state, modOutputs);
            if (pathModulated) {
                this.renderer.updateReadingPath(state);
            }
            this.audioEngine.setMasterGainTarget(this.getAmplitudeValue(modOutputs));

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
