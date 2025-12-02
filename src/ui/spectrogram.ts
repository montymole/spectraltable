
export class Spectrogram {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private width: number;
    private height: number;
    private tempCanvas: HTMLCanvasElement;
    private tempCtx: CanvasRenderingContext2D;

    constructor(container: HTMLElement) {
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'spectrogram-canvas';
        container.appendChild(this.canvas);

        const ctx = this.canvas.getContext('2d');
        if (!ctx) throw new Error('Failed to get 2D context');
        this.ctx = ctx;

        // Create temp canvas for scrolling
        this.tempCanvas = document.createElement('canvas');
        const tempCtx = this.tempCanvas.getContext('2d');
        if (!tempCtx) throw new Error('Failed to get temp 2D context');
        this.tempCtx = tempCtx;

        this.width = 0;
        this.height = 0;
        this.resize();

        window.addEventListener('resize', () => this.resize());
    }

    private resize(): void {
        const rect = this.canvas.parentElement?.getBoundingClientRect();
        if (!rect) return;

        // Account for device pixel ratio
        const dpr = window.devicePixelRatio || 1;

        this.width = rect.width;
        this.height = rect.height || 150;

        // Set canvas display size (CSS pixels)
        this.canvas.style.width = `${this.width}px`;
        this.canvas.style.height = `${this.height}px`;

        // Set canvas buffer size (actual pixels)
        this.canvas.width = this.width * dpr;
        this.canvas.height = this.height * dpr;
        this.tempCanvas.width = this.width * dpr;
        this.tempCanvas.height = this.height * dpr;

        // Reset and scale context to match DPI
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(dpr, dpr);
        this.tempCtx.setTransform(1, 0, 0, 1, 0, 0);
        this.tempCtx.scale(dpr, dpr);

        // Clear
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.width, this.height);
    }

    public addData(data: Float32Array): void {
        if (data.length === 0) return;

        // 1. Shift existing content upwards
        this.tempCtx.drawImage(this.canvas, 0, 0);
        this.ctx.drawImage(this.tempCtx.canvas, 0, -1);

        // 2. Draw new row at the bottom edge
        const y = this.height - 1;
        const w = this.width;
        const numPoints = data.length / 4; // RGBA stride

        // Map data array (0..numPoints-1) to canvas width (0..w-1)
        // Left = Low Index (0), Right = High Index (numPoints-1)

        const row = this.ctx.createImageData(w, 1);
        const buf = row.data; // RGBA

        for (let x = 0; x < w; x++) {
            // Map x (0..w-1) to data index
            const normalizedX = x / w; // 0..1
            const dataIndex = Math.floor(normalizedX * (numPoints - 1));

            const val = data[dataIndex * 4]; // Magnitude (R channel)

            // Color map: Black -> Cyan -> White
            // Matches the cool blue aesthetic

            let r = 0, g = 0, b = 0;

            if (val < 0.5) {
                // Black to Cyan
                // val * 2 goes from 0 to 1
                const t = val * 2.0;
                r = 0;
                g = t * 255;
                b = t * 255;
            } else {
                // Cyan to White
                // (val - 0.5) * 2 goes from 0 to 1
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
    }
}
