// WebGL2 context manager with extension validation

export class WebGLContext {
    public readonly gl: WebGL2RenderingContext;
    private canvas: HTMLCanvasElement;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;

        const gl = canvas.getContext('webgl2', {
            alpha: false,
            antialias: true,
            depth: true,
        });

        if (!gl) {
            throw new Error('WebGL2 not supported');
        }

        this.gl = gl;
        this.validateExtensions();
        this.logInfo();
    }

    private validateExtensions(): void {
        const required = ['EXT_color_buffer_float'];

        for (const ext of required) {
            if (!this.gl.getExtension(ext)) {
                throw new Error(`Required WebGL extension not available: ${ext}`);
            }
        }
    }

    private logInfo(): void {
        const gl = this.gl;
        console.log('✓ WebGL2 Context Created');
        console.log('  Vendor:', gl.getParameter(gl.VENDOR));
        console.log('  Renderer:', gl.getParameter(gl.RENDERER));
        console.log('  Version:', gl.getParameter(gl.VERSION));
        console.log('  GLSL Version:', gl.getParameter(gl.SHADING_LANGUAGE_VERSION));
    }

    public resize(width: number, height: number): void {
        this.canvas.width = width;
        this.canvas.height = height;
        this.gl.viewport(0, 0, width, height);
    }

    public clear(r: number, g: number, b: number): void {
        this.gl.clearColor(r, g, b, 1.0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
    }
}
