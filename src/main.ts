import './style.css';
import { WebGLContext } from './gpu/context';
import { Renderer } from './gpu/renderer';
import { ControlPanel } from './ui/controls';
import { ReadingPathState, SpatialState } from './types';

// Main application entry point
// Initializes WebGL, UI, and wires up event handling

class SpectralTableApp {
    private glContext: WebGLContext;
    private renderer: Renderer;
    private controls: ControlPanel;
    private animationFrameId: number = 0;

    constructor() {
        console.log('Spectra Table Synthesis - Initializing...');

        // Initialize WebGL
        const canvas = document.getElementById('gl-canvas') as HTMLCanvasElement;
        if (!canvas) throw new Error('Canvas not found');

        this.glContext = new WebGLContext(canvas);
        this.renderer = new Renderer(this.glContext);

        // Initialize UI controls
        this.controls = new ControlPanel('control-sliders');

        // Wire up callbacks
        this.controls.setPathChangeCallback(this.onPathChange.bind(this));
        this.controls.setSpatialChangeCallback(this.onSpatialChange.bind(this));

        // Handle window resize
        window.addEventListener('resize', this.onResize.bind(this));
        this.onResize();

        // Start render loop
        this.startRenderLoop();

        console.log('✓ Application initialized');
    }

    private onPathChange(state: ReadingPathState): void {
        console.log('Path changed:', state);
        // TODO: Update reading path in renderer
        // TODO: Trigger audio parameter update
    }

    private onSpatialChange(state: SpatialState): void {
        console.log('Spatial state changed:', state);
        // TODO: Update spatial audio processing
    }

    private onResize(): void {
        const canvas = document.getElementById('gl-canvas') as HTMLCanvasElement;
        const rect = canvas.getBoundingClientRect();
        this.renderer.resize(rect.width, rect.height);
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
    }
}

// Initialize app when DOM is ready
const app = new SpectralTableApp();

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    app.destroy();
});
