import './style.css';
import { WebGLContext } from './gpu/context';
import { Renderer } from './gpu/renderer';
import { ControlPanel } from './ui/controls';
import { Spectrogram } from './ui/spectrogram';
import { StereoScope } from './ui/scope';
import { AudioEngine } from './audio/audio-engine';
import { AudioAnalyzer } from './audio/audio-analyzer';
import { MidiHandler } from './audio/midi-handler';
import { ReadingPathState, VolumeResolution, SynthMode, CarrierType, VOLUME_DENSITY_X_DEFAULT, VOLUME_DENSITY_Y_DEFAULT, VOLUME_DENSITY_Z_DEFAULT } from './types';

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
    private canvas: HTMLCanvasElement;
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

        // Initialize Audio Analyzer
        this.audioAnalyzer = new AudioAnalyzer();

        // Initialize MIDI Handler
        this.midiHandler = new MidiHandler();
        this.midiHandler.setNoteChangeCallback(this.onMidiNote.bind(this));
        this.midiHandler.setConnectionChangeCallback((isConnected) => {
            if (isConnected) console.log('✓ MIDI Device Connected');
        });

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

        console.log('✓ Application initialized');
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

    private onSpectralDataChange(dataSet: string): void {
        console.log('Spectral data changed:', dataSet);

        // Stop any active animations
        this.gameOfLifeActive = false;
        this.sinePlasmaActive = false;

        // Check if it's an uploaded volume
        if (this.uploadedVolumes.has(dataSet)) {
            const volumeData = this.uploadedVolumes.get(dataSet)!;
            this.renderer.getSpectralVolume().setData(volumeData);
            this.controls.hideDynamicParam();
        } else if (dataSet === 'game-of-life') {
            // Initialize Game of Life
            this.renderer.getSpectralVolume().initGameOfLife();
            this.gameOfLifeActive = true;
            this.gameOfLifeLastUpdate = performance.now();

            // Show dynamic parameter slider for evolution speed (0-1)
            this.controls.showDynamicParam('Evolution Speed', 0, 1, 0.5, 0.01);
            console.log('✓ Game of Life initialized');
        } else if (dataSet === 'sine-plasma') {
            // Initialize Sine Plasma
            this.renderer.getSpectralVolume().generateSinePlasma(0);
            this.sinePlasmaActive = true;
            this.sinePlasmaLastUpdate = performance.now();

            // Show dynamic parameter slider for evolution speed (0-1)
            this.controls.showDynamicParam('Evolution Speed', 0, 1, 0.5, 0.01);
            console.log('✓ Sine Plasma initialized with evolution');
        } else {
            // Built-in data sets
            this.renderer.updateSpectralData(dataSet);
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

    private onMidiNote(note: number | null): void {
        if (note === null) return; // Ignore note off for now (pitch stays at last note)

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
        this.renderer.resize(rect.width, rect.height);
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

            // Animate reading position (Scrub)
            // Speed range: -1 (backwards) to +1 (forwards), 0 = stationary
            const speed = this.controls.getSpeed();

            if (speed !== 0) {
                const currentState = this.controls.getState();
                // Use speed directly - negative values move backwards
                let newScanPos = currentState.scanPosition + (speed * 0.5 * deltaTime);

                // Wrap around in both directions
                if (newScanPos > 1) {
                    newScanPos = -1 + (newScanPos - 1);
                } else if (newScanPos < -1) {
                    newScanPos = 1 + (newScanPos + 1);
                }

                this.controls.updateScanPosition(newScanPos);
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
