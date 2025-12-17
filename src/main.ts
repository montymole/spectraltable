import './style.css';
import { WebGLContext } from './gpu/context';
import { Renderer } from './gpu/renderer';
import { ControlPanel } from './ui/controls';
import { Spectrogram } from './ui/spectrogram';
import { StereoScope } from './ui/scope';
import { AudioEngine } from './audio/audio-engine';
import { AudioAnalyzer } from './audio/audio-analyzer';
import { MidiHandler } from './audio/midi-handler';
import { EnvelopeEditor } from './ui/envelope-editor';
import { PianoKeyboard } from './ui/piano';
import {
    ReadingPathState, VolumeResolution, SynthMode, CarrierType,
    VOLUME_DENSITY_X_DEFAULT, VOLUME_DENSITY_Y_DEFAULT, VOLUME_DENSITY_Z_DEFAULT,
    GeneratorParams, PresetControls
} from './types';
import { LFO, LFOWaveform } from './modulators/lfo';

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
    private lfo1: LFO;
    private lfo2: LFO;
    private pathYSource: string = 'none'; // 'none', 'lfo1', 'lfo2'
    private scanPhaseSource: string = 'none';
    private shapePhaseSource: string = 'none';

    constructor() {
        console.log('Spectra Table Synthesis - Initializing...');

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
        this.controls = new ControlPanel('controls');

        // Create Spectrogram and Scope
        this.spectrogram = new Spectrogram('spectrogram-canvas');
        this.scope = new StereoScope('scope-canvas');

        // Initialize Audio Engine
        this.audioEngine = new AudioEngine();

        // Initialize LFOs
        this.lfo1 = new LFO(0.5);
        this.lfo2 = new LFO(0.5);

        // Initialize envelope editor logic
        const envCanvas = this.controls.envelopeCanvas;
        if (envCanvas) {
            new EnvelopeEditor(envCanvas, this.audioEngine);
        } else {
            console.error('Envelope canvas not created in controls');
        }

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
        this.controls.setMidiInputChangeCallback((id) => {
            this.midiHandler.selectInput(id);
        });

        this.controls.setOctaveChangeCallback((octave) => {
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
        this.controls.setDynamicParamChangeCallback(this.onDynamicParamChange.bind(this));
        this.controls.setSynthModeChangeCallback(this.onSynthModeChange.bind(this));
        this.controls.setFrequencyChangeCallback(this.onFrequencyChange.bind(this));
        this.controls.setCarrierChangeCallback(this.onCarrierChange.bind(this));
        this.controls.setFeedbackChangeCallback(this.onFeedbackChange.bind(this));
        this.controls.setGeneratorParamsChangeCallback(this.onGeneratorParamsChange.bind(this));
        this.controls.setPresetLoadCallback(this.onPresetLoad.bind(this));

        // LFO Wiring
        this.controls.setLFOParamChangeCallback((index, param, value) => {
            const lfo = index === 0 ? this.lfo1 : this.lfo2;
            if (param === 'waveform') lfo.setWaveform(value as LFOWaveform);
            if (param === 'frequency') lfo.setFrequency(value);
            if (param === 'amplitude') lfo.setAmplitude(value);
            if (param === 'offset') lfo.setOffset(value);
        });

        this.controls.setModulationRoutingChangeCallback((target, source) => {
            if (target === 'pathY') this.pathYSource = source;
            if (target === 'scanPhase') this.scanPhaseSource = source;
            if (target === 'shapePhase') this.shapePhaseSource = source;
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

        // Apply to LFOs
        this.lfo1.setWaveform(state.lfo1.waveform as any);
        this.lfo1.setFrequency(state.lfo1.frequency);
        this.lfo1.setAmplitude(state.lfo1.amplitude);
        this.lfo1.setOffset(state.lfo1.offset);

        this.lfo2.setWaveform(state.lfo2.waveform as any);
        this.lfo2.setFrequency(state.lfo2.frequency);
        this.lfo2.setAmplitude(state.lfo2.amplitude);
        this.lfo2.setOffset(state.lfo2.offset);

        // Apply modulation routing
        this.pathYSource = state.modRouting.pathY;
        this.scanPhaseSource = state.modRouting.scanPhase;
        this.shapePhaseSource = state.modRouting.shapePhase;

        // Apply audio settings
        this.audioEngine.setMode(state.synthMode as SynthMode);
        this.audioEngine.setWavetableFrequency(state.frequency);
        this.audioEngine.setCarrier(state.carrier);
        this.audioEngine.setFeedback(state.feedback);

        // Apply envelope
        this.audioEngine.attack = state.envelope.attack;
        this.audioEngine.decay = state.envelope.decay;
        this.audioEngine.sustain = state.envelope.sustain;
        this.audioEngine.release = state.envelope.release;

        // Apply piano octave
        this.piano.setBaseOctave(state.octave);

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
            this.controls.hideDynamicParam();
        } else if (dataSet === 'game-of-life') {
            // Initialize Game of Life with current params
            const params = this.controls.getCurrentGeneratorParams();
            this.renderer.updateSpectralData(dataSet, params || undefined);
            this.gameOfLifeActive = true;
            this.gameOfLifeLastUpdate = performance.now();

            // Show dynamic parameter slider for evolution speed (0-1)
            this.controls.showDynamicParam('Evolution Speed', 0, 1, 0.5, 0.01);
            console.log('✓ Game of Life initialized');
        } else if (dataSet === 'sine-plasma') {
            // Initialize Sine Plasma with current params
            const params = this.controls.getCurrentGeneratorParams();
            this.renderer.updateSpectralData(dataSet, params || undefined);
            this.sinePlasmaActive = true;
            this.sinePlasmaLastUpdate = performance.now();

            // Show dynamic parameter slider for evolution speed (0-1)
            this.controls.showDynamicParam('Evolution Speed', 0, 1, 0.5, 0.01);
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

    private onDynamicParamChange(value: number): void {
        // Update speed for active animation (0-1 range)
        if (this.gameOfLifeActive) {
            this.gameOfLifeSpeed = value;
            console.log(`Game of Life speed: ${value.toFixed(2)} (0=pause, 1=instant)`);
        } else if (this.sinePlasmaActive) {
            this.sinePlasmaSpeed = value;
            console.log(`Sine plasma speed: ${value.toFixed(2)} (0=static, 1=fast)`);
        }
    }

    private onSynthModeChange(mode: SynthMode): void {
        this.audioEngine.setMode(mode);
        console.log(`✓ Synth mode: ${mode}`);
    }

    private onFrequencyChange(freq: number): void {
        this.audioEngine.setWavetableFrequency(freq);
    }

    private onCarrierChange(carrier: CarrierType): void {
        this.audioEngine.setCarrier(carrier);
    }

    private onFeedbackChange(amount: number): void {
        this.audioEngine.setFeedback(amount);
    }

    private onGeneratorParamsChange(dataSet: string, params: GeneratorParams): void {
        // Regenerate with new params
        this.renderer.updateSpectralData(dataSet, params);
    }

    private onMidiNote(note: number | null): void {
        // Handle Note Off / All Keys Up
        if (note === null) {
            this.currentNote = null;
            this.audioEngine.triggerRelease();
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
            // Override frequency slider
            this.audioEngine.setWavetableFrequency(freq);

            // Update UI slider to match
            // We need to access the controls to update the slider visual
            // Currently controls doesn't expose a method to set value, so we might need to add one
            // or just let it diverge. But better to update it.
            // Let's add setFrequencyValue to ControlPanel in next step if needed.
            if (this.controls) {
                this.controls.setFrequency(freq);
            }
        } else if (mode === SynthMode.SPECTRAL) {
            // Spectral Mode Pitch Strategy
            // Root = 440Hz (A4)
            // Multiplier = TargetFreq / Root
            const rootFreq = 440;
            const multiplier = freq / rootFreq;

            this.audioEngine.setSpectralPitch(multiplier);
        }

        // Trigger Envelope Attack (Multi-trigger behavior: every new note triggers attack)
        this.audioEngine.triggerAttack();
    }

    private async onWavUpload(files: FileList): Promise<void> {
        const fileArray = Array.from(files);
        console.log(`Processing ${fileArray.length} audio file(s) for morphing`);

        try {
            // Show progress
            this.controls.showProgress();
            this.controls.updateProgress(0);

            // Get current volume resolution
            const resolution = this.renderer.getSpectralVolume().getResolution();

            // Set Y density to number of files
            const numSamples = fileArray.length;
            const newResolution = {
                ...resolution,
                y: numSamples
            };

            // Update Y density slider
            this.controls.setVolumeDensity(newResolution);
            this.renderer.updateVolumeResolution(newResolution);

            // Analyze all files and build the morphing volume
            const volumeData = await this.audioAnalyzer.analyzeMultipleFiles(
                fileArray,
                newResolution,
                (percent) => this.controls.updateProgress(percent)
            );

            // Store the volume data
            const volumeName = fileArray.length === 1
                ? fileArray[0].name.replace(/\.[^/.]+$/, '')
                : `Morph_${fileArray.length}_samples`;

            this.uploadedVolumes.set(volumeName, volumeData);

            // Set volume data directly
            this.renderer.getSpectralVolume().setData(volumeData);

            // Add to dropdown and select it
            this.controls.addSpectralDataOption(volumeName, volumeName);

            console.log(`✓ Processed ${fileArray.length} file(s) into morphing volume`);
        } catch (error) {
            console.error('Failed to process audio file(s):', error);
            alert(`Error processing audio file(s): ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            // Hide progress
            setTimeout(() => this.controls.hideProgress(), 500);
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
                    this.sinePlasmaLastUpdate = time;
                }
            }

            // LFO Updates
            const lfo1Out = this.lfo1.update(deltaTime);
            const lfo2Out = this.lfo2.update(deltaTime);

            // Modulation
            if (this.pathYSource !== 'none') {
                const val = this.pathYSource === 'lfo1' ? lfo1Out : lfo2Out;
                this.controls.updatePathY(val);
            }

            if (this.scanPhaseSource !== 'none') {
                const val = this.scanPhaseSource === 'lfo1' ? lfo1Out : lfo2Out;
                this.controls.updateScanPosition(val);
            }

            if (this.shapePhaseSource !== 'none') {
                const val = this.shapePhaseSource === 'lfo1' ? lfo1Out : lfo2Out;
                // Since we don't have a slider for shape phase, we update renderer directly
                // We merge with current controls state to prevent overwriting other params
                const state = this.controls.getState();
                state.shapePhase = val;
                this.renderer.updateReadingPath(state);
            }

            this.renderer.render(deltaTime);

            // Get spectral data (RGBA)
            const spectralData = this.renderer.getReadingLineSpectralData();

            // Update Audio
            this.audioEngine.updateSpectralData(spectralData);

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
