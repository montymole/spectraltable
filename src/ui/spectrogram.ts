
export class Spectrogram {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private width: number;
    private height: number;
    private tempCanvas: HTMLCanvasElement;
    private tempCtx: CanvasRenderingContext2D;

    private mode: 'SCANLINE' | 'AUDIO_OUTPUT' = 'SCANLINE';

    constructor(contaiderId: string) {
        this.canvas = document.getElementById(contaiderId) as HTMLCanvasElement;

        const ctx = this.canvas.getContext('2d');
        if (!ctx) throw new Error('Failed to get 2D context');
        this.ctx = ctx;

        // Create temp canvas for scrolling
        this.tempCanvas = document.createElement('canvas');
        const tempCtx = this.tempCanvas.getContext('2d');
        if (!tempCtx) throw new Error('Failed to get temp 2D context');
        this.tempCtx = tempCtx;

        this.width = 320;
        this.height = 160;
        this.resize();

        window.addEventListener('resize', () => this.resize());

        // Toggle mode on click
        this.canvas.addEventListener('click', () => {
            this.mode = this.mode === 'SCANLINE' ? 'AUDIO_OUTPUT' : 'SCANLINE';
        });
    }

    private resize(): void {
        // Get the display size from the canvas element (set by CSS)
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;

        // Handle high DPI displays
        const dpr = window.devicePixelRatio || 1;

        this.canvas.width = width * dpr;
        this.canvas.height = height * dpr;

        this.width = width * dpr;
        this.height = height * dpr;

        // Update temp canvas size
        this.tempCanvas.width = width * dpr;
        this.tempCanvas.height = height * dpr;

        // Clear
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.width, this.height);
    }

    public update(scanlineData: Float32Array, audioDataLeft?: Float32Array): void {
        if (!scanlineData) return;

        // 1. Shift existing content upwards
        this.tempCtx.drawImage(this.canvas, 0, 0);
        this.ctx.drawImage(this.tempCtx.canvas, 0, -1);

        // 2. Draw new row at the bottom edge
        const y = this.height - 1;
        const w = this.width;

        let dataToVisualize: Float32Array;
        let isAudioData = false;

        if (this.mode === 'AUDIO_OUTPUT' && audioDataLeft) {
            dataToVisualize = audioDataLeft;
            isAudioData = true;
        } else {
            // Default to scanline (RGBA stride)
            dataToVisualize = scanlineData;
        }

        const numPoints = isAudioData ? dataToVisualize.length : dataToVisualize.length / 4;

        const row = this.ctx.createImageData(w, 1);
        const buf = row.data; // RGBA

        for (let x = 0; x < w; x++) {
            // Map x (0..w-1) to data index
            const normalizedX = x / w; // 0..1

            // Logarithmic mapping for audio visualization looks better
            let readIndex: number;
            if (isAudioData) {
                // Log scale: buffer index ~ exp(x)
                // We want to map x=[0..1] to freq=[0..Nyquist]
                // Simple log approximation
                const logX = Math.pow(normalizedX, 2.0); // Simple exp-like curve
                readIndex = Math.floor(logX * (numPoints - 1));
            } else {
                // Linear for scanline
                readIndex = Math.floor(normalizedX * (numPoints - 1));
            }

            let val: number;

            if (isAudioData) {
                // Audio data is in dB (-100 to 0 typically)
                // Map to 0..1
                // -100dB -> 0
                // -30dB -> 1
                const db = dataToVisualize[readIndex];
                val = (db + 100) / 70;
                val = Math.max(0, Math.min(1, val));
            } else {
                // Scanline data is RGBA, magnitude is R (index * 4)
                val = dataToVisualize[readIndex * 4];
            }

            // Color map: Black -> Cyan -> White
            let r = 0, g = 0, b = 0;

            if (val < 0.5) {
                // Black to Cyan
                const t = val * 2.0;
                r = 0;
                g = t * 255;
                b = t * 255;
            } else {
                // Cyan to White
                const t = (val - 0.5) * 2.0;
                r = t * 255;
                g = 255;
                b = 255;
            }

            const idx = x * 4;
            buf[idx + 0] = r;
            buf[idx + 1] = g;
            buf[idx + 2] = b;
            buf[idx + 3] = 255; // Alpha
        }

        this.ctx.putImageData(row, 0, y);

        // Draw label
        this.drawLabel();
    }

    private drawLabel(): void {
        this.ctx.save();
        this.ctx.font = 'bold 12px Inter, sans-serif';
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'top';

        const label = this.mode === 'SCANLINE' ? 'SCANLINE' : 'AUDIO OUT';
        const x = 10;
        const y = 10;

        // Shadow/Outline
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        this.ctx.fillText(label, x + 1, y + 1);

        // Text
        this.ctx.fillStyle = '#0ff'; // Cyan matches theme
        this.ctx.fillText(label, x, y);
        this.ctx.restore();
    }
}
