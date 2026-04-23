export class ModulatorPreviewWebGL {
    private canvas: HTMLCanvasElement;
    private gl: WebGL2RenderingContext;
    private program: WebGLProgram;
    private vao: WebGLVertexArrayObject;
    private vbo: WebGLBuffer;
    private samples: Float32Array;
    private resizeHandler: () => void;

    private vertexShaderSource = `#version 300 es
        layout(location = 0) in float a_sample;
        uniform float u_numSamples;

        void main() {
            float x = (float(gl_VertexID) / max(u_numSamples - 1.0, 1.0)) * 2.0 - 1.0;
            float y = clamp(a_sample, -1.0, 1.0) * 0.96;
            gl_Position = vec4(x, y, 0.0, 1.0);
        }
    `;

    private fragmentShaderSource = `#version 300 es
        precision highp float;
        uniform vec4 u_color;
        out vec4 outColor;

        void main() {
            outColor = u_color;
        }
    `;

    constructor(canvas: HTMLCanvasElement, sampleCount: number = 256) {
        this.canvas = canvas;
        this.samples = new Float32Array(Math.max(2, sampleCount));
        const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
        if (!gl) throw new Error('WebGL2 not supported for modulator preview');
        this.gl = gl;
        this.program = this.createProgram(this.vertexShaderSource, this.fragmentShaderSource);
        this.vao = gl.createVertexArray()!;
        this.vbo = gl.createBuffer()!;

        gl.bindVertexArray(this.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
        gl.bufferData(gl.ARRAY_BUFFER, this.samples.byteLength, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 1, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);

        this.resizeHandler = () => this.resize();
        window.addEventListener('resize', this.resizeHandler);
        requestAnimationFrame(() => {
            this.resize();
            this.draw();
        });
    }

    public setSamples(samples: Float32Array): void {
        if (samples.length !== this.samples.length) {
            this.samples = new Float32Array(samples.length);
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vbo);
            this.gl.bufferData(this.gl.ARRAY_BUFFER, this.samples.byteLength, this.gl.DYNAMIC_DRAW);
        }
        this.samples.set(samples);
        this.draw();
    }

    public destroy(): void {
        window.removeEventListener('resize', this.resizeHandler);
        this.gl.deleteBuffer(this.vbo);
        this.gl.deleteVertexArray(this.vao);
        this.gl.deleteProgram(this.program);
    }

    private resize(): void {
        const width = Math.max(1, this.canvas.clientWidth);
        const height = Math.max(1, this.canvas.clientHeight);
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = Math.max(1, Math.floor(width * dpr));
        this.canvas.height = Math.max(1, Math.floor(height * dpr));
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        this.draw();
    }

    private draw(): void {
        const gl = this.gl;
        const colorLocation = gl.getUniformLocation(this.program, 'u_color');
        const sampleCountLocation = gl.getUniformLocation(this.program, 'u_numSamples');
        const zeroLine = new Float32Array([0, 0]);

        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(this.program);
        gl.bindVertexArray(this.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);

        gl.uniform4f(colorLocation, 0.0, 0.32, 0.12, 1.0);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, zeroLine);
        gl.uniform1f(sampleCountLocation, zeroLine.length);
        gl.drawArrays(gl.LINE_STRIP, 0, zeroLine.length);

        gl.uniform4f(colorLocation, 0.0, 1.0, 0.45, 1.0);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.samples);
        gl.uniform1f(sampleCountLocation, this.samples.length);
        gl.drawArrays(gl.LINE_STRIP, 0, this.samples.length);

        gl.bindVertexArray(null);
    }

    private createShader(type: number, source: string): WebGLShader {
        const shader = this.gl.createShader(type)!;
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            throw new Error(this.gl.getShaderInfoLog(shader) || 'Shader compile failed');
        }
        return shader;
    }

    private createProgram(vertexSource: string, fragmentSource: string): WebGLProgram {
        const vs = this.createShader(this.gl.VERTEX_SHADER, vertexSource);
        const fs = this.createShader(this.gl.FRAGMENT_SHADER, fragmentSource);
        const program = this.gl.createProgram()!;
        this.gl.attachShader(program, vs);
        this.gl.attachShader(program, fs);
        this.gl.linkProgram(program);
        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            throw new Error(this.gl.getProgramInfoLog(program) || 'Program link failed');
        }
        this.gl.deleteShader(vs);
        this.gl.deleteShader(fs);
        return program;
    }
}
