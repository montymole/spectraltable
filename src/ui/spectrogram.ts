
export class Spectrogram {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private width: number;
    private height: number;
    private tempCanvas: HTMLCanvasElement;
    private tempCtx: CanvasRenderingContext2D;
    private titleElement: HTMLElement | null = null;

    private mode: 'SCANLINE' | 'AUDIO_OUTPUT' = 'AUDIO_OUTPUT'; // Default to spectrogram

    constructor(containerId: string) {
        this.canvas = document.getElementById(containerId) as HTMLCanvasElement;

        const ctx = this.canvas.getContext('2d');
        if (!ctx) throw new Error('Failed to get 2D context');
        this.ctx = ctx;

        // Find the parent vis-group and its header element
        const visContent = this.canvas.closest('.vis-content');
        if (visContent) {
            const visGroup = visContent.closest('.vis-group');
            if (visGroup) {
                this.titleElement = visGroup.querySelector('.vis-header');
            }
        }
        this.updateTitle();

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
            this.updateTitle();
        });
    }

    private updateTitle(): void {
        if (!this.titleElement) return;
        this.titleElement.textContent = this.mode === 'AUDIO_OUTPUT'
            ? 'Spectrogram'
            : 'ReadLine Output';
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

    // HSL to RGB conversion
    private hslToRgb(h: number, s: number, l: number): [number, number, number] {
        let r: number, g: number, b: number;

        if (s === 0) {
            r = g = b = l;
        } else {
            const hue2rgb = (p: number, q: number, t: number) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1 / 6) return p + (q - p) * 6 * t;
                if (t < 1 / 2) return q;
                if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                return p;
            };

            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1 / 3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1 / 3);
        }

        return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    }

    // Frequency color wheel: low freq = red, mid = green, high = blue/violet
    private frequencyToColor(normalizedFreq: number, intensity: number): [number, number, number] {
        // Map frequency to hue (0-1)
        // Low frequencies (bass): red-orange (hue ~0-0.1)
        // Mid frequencies: yellow-green (hue ~0.15-0.4)
        // High frequencies: blue-violet (hue ~0.6-0.85)
        const hue = normalizedFreq * 0.85; // 0 to 0.85 covers red through violet

        // Saturation high for visibility
        const saturation = 0.9;

        // Lightness based on intensity (louder = brighter)
        // Min ~0.05 (nearly black for silence), max ~0.6 (vivid, not washed out)
        const lightness = 0.05 + intensity * 0.55;

        return this.hslToRgb(hue, saturation, lightness);
    }

    // Green/cyan color scheme for readline mode
    private readlineColor(intensity: number): [number, number, number] {
        // Shades of green to cyan
        // Hue range: ~0.33 (green) to ~0.5 (cyan)
        const hue = 0.35 + intensity * 0.15; // Green -> Cyan as intensity increases
        const saturation = 0.8;
        const lightness = 0.05 + intensity * 0.50;

        return this.hslToRgb(hue, saturation, lightness);
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
                const logX = Math.pow(normalizedX, 2.0);
                readIndex = Math.floor(logX * (numPoints - 1));
            } else {
                // Linear for scanline
                readIndex = Math.floor(normalizedX * (numPoints - 1));
            }

            let val: number;

            if (isAudioData) {
                // Audio data is in dB (-100 to 0 typically)
                // Map to 0..1
                const db = dataToVisualize[readIndex];
                val = (db + 100) / 70;
                val = Math.max(0, Math.min(1, val));
            } else {
                // Scanline data is RGBA, magnitude is R (index * 4)
                val = dataToVisualize[readIndex * 4];
            }

            let r: number, g: number, b: number;

            if (isAudioData) {
                // Frequency color wheel for spectrogram
                [r, g, b] = this.frequencyToColor(normalizedX, val);
            } else {
                // Green/cyan for readline output
                [r, g, b] = this.readlineColor(val);
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
