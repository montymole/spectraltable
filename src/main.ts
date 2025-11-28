import './style.css';
import { WebGLContext } from './gpu/context';
import { Renderer } from './gpu/renderer';
import { ControlPanel } from './ui/controls';
import { ReadingPathState, SpatialState, VolumeResolution, VOLUME_DENSITY_DEFAULT } from './types';

// Main application entry point
// Initializes WebGL, UI, and wires up event handling

class SpectralTableApp {
    private glContext: WebGLContext;
    private renderer: Renderer;
    private controls: ControlPanel;
    private canvas: HTMLCanvasElement;
    private animationFrameId: number = 0;

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

        // Wire up callbacks
        this.controls.setPathChangeCallback(this.onPathChange.bind(this));
        this.controls.setSpatialChangeCallback(this.onSpatialChange.bind(this));
        this.controls.setVolumeResolutionChangeCallback(this.onVolumeResolutionChange.bind(this));

        // Handle window resize
        window.addEventListener('resize', this.onResize.bind(this));
        this.onResize();

        // Wire up mouse events for 3D rotation
        this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
        this.canvas.addEventListener('mouseleave', this.onMouseUp.bind(this));

        // Start render loop
        this.startRenderLoop();

        console.log('✓ Application initialized');
    }

    private onPathChange(state: ReadingPathState): void {
        // console.log('Path changed:', state); // Too noisy for continuous updates
        this.renderer.updateReadingPath(state);
    }

    private onSpatialChange(state: SpatialState): void {
        console.log('Spatial state changed:', state);
        // TODO: Update spatial audio processing
    }

    private onVolumeResolutionChange(resolution: VolumeResolution): void {
        console.log('Volume resolution changed:', resolution);
        this.renderer.updateVolumeResolution(resolution);
    }

    private onResize(): void {
        const rect = this.canvas.getBoundingClientRect();
        this.renderer.resize(rect.width, rect.height);
    }

    private onMouseDown(event: MouseEvent): void {
        this.renderer.onMouseDown(event.clientX, event.clientY);
    }

    private onMouseMove(event: MouseEvent): void {
        this.renderer.onMouseMove(event.clientX, event.clientY);
    }

    private onMouseUp(): void {
        this.renderer.onMouseUp();
    }

    private startRenderLoop(): void {
        const render = () => {
            this.renderer.render();
            this.animationFrameId = requestAnimationFrame(render);
        };
        render();
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
