
export class StereoScope {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private width: number;
    private height: number;

    public mode: 'lissajous' | 'channels' = 'channels';

    constructor(containerId: string) {
        this.canvas = document.getElementById(containerId) as HTMLCanvasElement;

        // Add click handler to toggle mode
        this.canvas.addEventListener('click', () => {
            this.mode = this.mode === 'lissajous' ? 'channels' : 'lissajous';
        });

        const ctx = this.canvas.getContext('2d');
        if (!ctx) throw new Error('Failed to get 2D context');
        this.ctx = ctx;

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
    }

    public draw(left: Float32Array, right: Float32Array): void {
        const w = this.width;
        const h = this.height;
        const cx = w / 2;
        const cy = h / 2;

        // Fade out
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        this.ctx.fillRect(0, 0, w, h);

        this.ctx.lineWidth = 1.5;

        if (this.mode === 'lissajous') {
            this.ctx.strokeStyle = '#00ff88'; // Greenish cyan
            this.ctx.beginPath();

            // Draw Lissajous (X=Left, Y=Right)
            // Or Vectorscope style: rotated 45 degrees
            // Standard Lissajous:
            // x = left * scale + cx
            // y = right * scale + cy

            const scale = Math.min(w, h) * 0.4;

            // Downsample for performance if needed
            const step = 2;

            for (let i = 0; i < left.length; i += step) {
                const l = left[i];
                const r = right[i];

                // Rotate 45 degrees for standard stereo field view
                // M = S (Mid = Sum)
                // S = D (Side = Diff)
                // But simple L/R plot is:
                const x = l * scale + cx;
                const y = -r * scale + cy; // Flip Y for audio convention usually

                if (i === 0) {
                    this.ctx.moveTo(x, y);
                } else {
                    this.ctx.lineTo(x, y);
                }
            }
            this.ctx.stroke();
        } else {
            // Channels mode: Left (Gray) and Right (Red)
            const scaleY = h * 0.4;
            const step = Math.ceil(left.length / w);

            // Draw Left (Gray)
            this.ctx.strokeStyle = '#888888';
            this.ctx.beginPath();
            for (let i = 0; i < left.length; i += step) {
                const x = (i / left.length) * w;
                const y = cy - left[i] * scaleY;
                if (i === 0) this.ctx.moveTo(x, y);
                else this.ctx.lineTo(x, y);
            }
            this.ctx.stroke();

            // Draw Right (Red)
            this.ctx.strokeStyle = '#ff4444';
            this.ctx.beginPath();
            for (let i = 0; i < right.length; i += step) {
                const x = (i / right.length) * w;
                const y = cy - right[i] * scaleY;
                if (i === 0) this.ctx.moveTo(x, y);
                else this.ctx.lineTo(x, y);
            }
            this.ctx.stroke();
        }
    }
}
