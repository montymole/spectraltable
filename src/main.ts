import './style.css';
import { WebGLContext } from './gpu/context';
import { Renderer } from './gpu/renderer';
import { ControlPanel } from './ui/controls';
import { Spectrogram } from './ui/spectrogram';
import { StereoScope } from './ui/scope';
import { AudioEngine } from './audio/audio-engine';
import { AudioAnalyzer } from './audio/audio-analyzer';
import { ReadingPathState, SpatialState, VolumeResolution, VOLUME_DENSITY_DEFAULT } from './types';

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
    private canvas: HTMLCanvasElement;
    private animationFrameId: number = 0;

    // Store uploaded spectral volumes
    private uploadedVolumes: Map<string, Float32Array> = new Map();

    constructor() {
        console.log('Spectra Table Synthesis - Initializing...');

        // Initialize WebGL
        this.canvas = document.getElementById('gl-canvas') as HTMLCanvasElement;
        if (!this.canvas) throw new Error('Canvas not found');

        this.glContext = new WebGLContext(this.canvas);

        // Create renderer with default resolution
        const defaultResolution: VolumeResolution = {
            x: VOLUME_DENSITY_DEFAULT,
            y: VOLUME_DENSITY_DEFAULT,
            z: VOLUME_DENSITY_DEFAULT,
        };
        this.renderer = new Renderer(this.glContext, defaultResolution);

        // Initialize UI controls
        this.controls = new ControlPanel('control-sliders');

        // Get top section for appending visualization canvases
        const topSection = document.querySelector('.top-section');
        if (!topSection) throw new Error('Top section not found');

        // Create Spectrogram and Scope - they will append their canvases directly to top-section
        this.spectrogram = new Spectrogram(topSection as HTMLElement);
        this.scope = new StereoScope(topSection as HTMLElement);

        // Initialize Audio Engine
        this.audioEngine = new AudioEngine();

        // Initialize Audio Analyzer
        this.audioAnalyzer = new AudioAnalyzer();

        // Wire up callbacks
        this.controls.setPathChangeCallback(this.onPathChange.bind(this));
        this.controls.setSpatialChangeCallback(this.onSpatialChange.bind(this));
        this.controls.setVolumeResolutionChangeCallback(this.onVolumeResolutionChange.bind(this));
        this.controls.setSpectralDataChangeCallback(this.onSpectralDataChange.bind(this));
        this.controls.setWavUploadCallback(this.onWavUpload.bind(this));

        // Handle window resize
        window.addEventListener('resize', this.onResize.bind(this));
        this.onResize();

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

        // Start render loop
        this.startRenderLoop();

        console.log('✓ Application initialized');
    }

    private onPathChange(state: ReadingPathState): void {
        this.renderer.updateReadingPath(state);
    }

    private onSpatialChange(state: SpatialState): void {
        console.log('Spatial state changed:', state);
    }

    private onVolumeResolutionChange(resolution: VolumeResolution): void {
        console.log('Volume resolution changed:', resolution);
        this.renderer.updateVolumeResolution(resolution);

        // Re-generate current spectral data with new resolution
        // We need to know what the current data set is.
        // Ideally we store this state, or just ask the controls.
        // For now, let's just trigger a regeneration of 'clouds' if that was selected,
        // or 'blank'.
        // A better way is to have the renderer/volume manage this, but we can cheat:
        const currentData = (document.getElementById('spectral-data-type') as HTMLSelectElement)?.value || 'blank';
        this.renderer.updateSpectralData(currentData);
    }

    private onSpectralDataChange(dataSet: string): void {
        console.log('Spectral data changed:', dataSet);

        // Check if it's an uploaded volume
        if (this.uploadedVolumes.has(dataSet)) {
            const volumeData = this.uploadedVolumes.get(dataSet)!;
            this.renderer.getSpectralVolume().setData(volumeData);
        } else {
            // Built-in data sets
            this.renderer.updateSpectralData(dataSet);
        }
    }

    private async onWavUpload(file: File): Promise<void> {
        console.log('Processing audio file:', file.name);

        try {
            // Get current volume resolution
            const resolution = this.renderer.getSpectralVolume().getResolution();

            // Analyze the audio file and convert to spectral volume
            const result = await this.audioAnalyzer.analyzeFile(file, resolution);

            // Check if resolution was adjusted
            if (result.adjustedSize.z !== resolution.z) {
                console.log(`Volume resolution adjusted: Z ${resolution.z} → ${result.adjustedSize.z}`);

                // Update the volume resolution
                this.renderer.updateVolumeResolution(result.adjustedSize);
            }

            // Store the volume data with filename as key
            const fileName = file.name.replace(/\.[^/.]+$/, ''); // Remove extension
            this.uploadedVolumes.set(fileName, result.data);

            // Add to dropdown and select it
            this.controls.addSpectralDataOption(fileName, fileName);

            console.log('✓ Audio file converted and added to data sets');
        } catch (error) {
            console.error('Failed to process audio file:', error);
        }
    }

    private onResize(): void {
        const rect = this.canvas.getBoundingClientRect();
        this.renderer.resize(rect.width, rect.height);
    }

    private onMouseDown(event: MouseEvent): void {
        this.renderer.onMouseDown(event.clientX, event.clientY, event.button);

        // Resume audio context on user interaction
        this.audioEngine.initialize().then(() => {
            this.audioEngine.resume();
        });
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

            // Animate reading position (Scrub)
            const speed = this.controls.getSpeed();

            if (speed > 0) {
                const currentState = this.controls.getState();
                let newScanPos = currentState.scanPosition + (speed * 0.5 * deltaTime);

                if (newScanPos > 1) {
                    newScanPos = -1;
                }

                this.controls.updateScanPosition(newScanPos);
            }

            this.renderer.render();

            // Get spectral data (RGBA)
            const spectralData = this.renderer.getReadingLineSpectralData();

            // Update Visualizations
            this.spectrogram.addData(spectralData);

            // Update Audio
            this.audioEngine.updateSpectralData(spectralData);

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
