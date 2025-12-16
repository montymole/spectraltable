
export class Spectrogram {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private width: number;
    private height: number;
    private tempCanvas: HTMLCanvasElement;
    private tempCtx: CanvasRenderingContext2D;

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
