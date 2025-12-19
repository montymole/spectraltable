
export class StereoScopeWebGL {
    private canvas: HTMLCanvasElement;
    private gl: WebGL2RenderingContext;
    private program!: WebGLProgram;
    private fadeProgram!: WebGLProgram;
    private vao!: WebGLVertexArrayObject;
    private quadVAO!: WebGLVertexArrayObject;
    private vboL!: WebGLBuffer;
    private vboR!: WebGLBuffer;

    private titleElement: HTMLElement | null = null;
    private width: number = 320;
    private height: number = 320;
    private dpr: number = 1;

    public mode: 'lissajous' | 'channels' = 'channels';

    private vertexShaderSource = `#version 300 es
        layout(location = 0) in float a_sample;
        layout(location = 1) in float a_other_sample; 
        
        uniform int u_mode; 
        uniform float u_numSamples;
        
        void main() {
            float x, y;
            float index = float(gl_VertexID);
            
            if (u_mode == 0) {
                // Channels mode: Linear X mapping
                x = (index / (u_numSamples - 1.0)) * 2.0 - 1.0;
                y = a_sample * 0.8;
            } else {
                // Lissajous mode: X=L, Y=R
                x = a_sample * 0.8;
                y = -a_other_sample * 0.8;
            }
            
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

    private fadeVertexShaderSource = `#version 300 es
        layout(location = 0) in vec2 a_position;
        void main() {
            gl_Position = vec4(a_position, 0.0, 1.0);
        }
    `;

    private fadeFragmentShaderSource = `#version 300 es
        precision highp float;
        uniform float u_alpha;
        out vec4 outColor;
        void main() {
            outColor = vec4(0.0, 0.0, 0.0, u_alpha);
        }
    `;

    constructor(containerId: string) {
        this.canvas = document.getElementById(containerId) as HTMLCanvasElement;
        const gl = this.canvas.getContext('webgl2', {
            antialias: true,
            alpha: false,
            preserveDrawingBuffer: true
        });
        if (!gl) throw new Error('WebGL2 not supported');
        this.gl = gl;

        const visContent = this.canvas.closest('.vis-content');
        if (visContent) {
            const visGroup = visContent.closest('.vis-group');
            if (visGroup) {
                this.titleElement = visGroup.querySelector('.vis-header');
            }
        }
        this.updateTitle();

        this.program = this.createProgram(this.vertexShaderSource, this.fragmentShaderSource);
        this.fadeProgram = this.createProgram(this.fadeVertexShaderSource, this.fadeFragmentShaderSource);

        this.initBuffers();
        this.resize();

        window.addEventListener('resize', () => this.resize());

        this.canvas.addEventListener('click', () => {
            this.mode = this.mode === 'lissajous' ? 'channels' : 'lissajous';
            this.updateTitle();
        });
    }

    private createShader(type: number, source: string): WebGLShader {
        const shader = this.gl.createShader(type)!;
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error('Shader compile error:', this.gl.getShaderInfoLog(shader));
            throw new Error('Shader compilation failed');
        }
        return shader;
    }

    private createProgram(vsSource: string, fsSource: string): WebGLProgram {
        const vs = this.createShader(this.gl.VERTEX_SHADER, vsSource);
        const fs = this.createShader(this.gl.FRAGMENT_SHADER, fsSource);
        const program = this.gl.createProgram()!;
        this.gl.attachShader(program, vs);
        this.gl.attachShader(program, fs);
        this.gl.linkProgram(program);
        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            console.error('Program link error:', this.gl.getProgramInfoLog(program));
            throw new Error('Program linking failed');
        }
        return program;
    }

    private initBuffers(): void {
        const gl = this.gl;
        this.vboL = gl.createBuffer()!;
        this.vboR = gl.createBuffer()!;
        this.vao = gl.createVertexArray()!;

        // Fader quad
        const quadVertices = new Float32Array([
            -1, -1, 1, -1, -1, 1,
            -1, 1, 1, -1, 1, 1,
        ]);
        const quadVBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
        gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);

        this.quadVAO = gl.createVertexArray()!;
        gl.bindVertexArray(this.quadVAO);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);
    }

    private updateTitle(): void {
        if (!this.titleElement) return;
        this.titleElement.textContent = this.mode === 'lissajous'
            ? 'Vectorscope'
            : 'Stereo Scope';
    }

    private resize(): void {
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientWidth;
        this.dpr = window.devicePixelRatio || 1;

        if (width === 0) return;

        this.canvas.width = width * this.dpr;
        this.canvas.height = height * this.dpr;
        this.width = width * this.dpr;
        this.height = height * this.dpr;

        this.gl.viewport(0, 0, this.width, this.height);

        // Initial clear
        this.gl.clearColor(0, 0, 0, 1);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    }

    public draw(left: Float32Array, right: Float32Array): void {
        if (this.width === 0) {
            this.resize();
            if (this.width === 0) return;
        }

        const gl = this.gl;
        const numSamples = left.length;

        // 1. Apply persistence fade
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        gl.useProgram(this.fadeProgram);
        gl.bindVertexArray(this.quadVAO);
        gl.uniform1f(gl.getUniformLocation(this.fadeProgram, 'u_alpha'), 0.2);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // 2. Draw active waveforms
        gl.useProgram(this.program);
        gl.bindVertexArray(this.vao);

        const modeLoc = gl.getUniformLocation(this.program, 'u_mode');
        const colorLoc = gl.getUniformLocation(this.program, 'u_color');
        const samplesLoc = gl.getUniformLocation(this.program, 'u_numSamples');

        gl.uniform1f(samplesLoc, numSamples);

        if (this.mode === 'channels') {
            gl.uniform1i(modeLoc, 0);

            // Left channel
            gl.bindBuffer(gl.ARRAY_BUFFER, this.vboL);
            gl.bufferData(gl.ARRAY_BUFFER, left, gl.DYNAMIC_DRAW);
            gl.enableVertexAttribArray(0);
            gl.vertexAttribPointer(0, 1, gl.FLOAT, false, 0, 0);
            gl.disableVertexAttribArray(1);

            gl.uniform4f(colorLoc, 0.6, 0.6, 0.6, 1.0);
            gl.drawArrays(gl.LINE_STRIP, 0, numSamples);

            // Right channel
            gl.bindBuffer(gl.ARRAY_BUFFER, this.vboR);
            gl.bufferData(gl.ARRAY_BUFFER, right, gl.DYNAMIC_DRAW);
            gl.enableVertexAttribArray(0);
            gl.vertexAttribPointer(0, 1, gl.FLOAT, false, 0, 0);

            gl.uniform4f(colorLoc, 1.0, 0.3, 0.3, 1.0);
            gl.drawArrays(gl.LINE_STRIP, 0, numSamples);
        } else {
            gl.uniform1i(modeLoc, 1);

            // Vectorscope/Lissajous
            gl.bindBuffer(gl.ARRAY_BUFFER, this.vboL);
            gl.bufferData(gl.ARRAY_BUFFER, left, gl.DYNAMIC_DRAW);
            gl.enableVertexAttribArray(0);
            gl.vertexAttribPointer(0, 1, gl.FLOAT, false, 0, 0);

            gl.bindBuffer(gl.ARRAY_BUFFER, this.vboR);
            gl.bufferData(gl.ARRAY_BUFFER, right, gl.DYNAMIC_DRAW);
            gl.enableVertexAttribArray(1);
            gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);

            gl.uniform4f(colorLoc, 0.0, 1.0, 0.6, 1.0);
            gl.drawArrays(gl.LINE_STRIP, 0, numSamples);
        }

        gl.disable(gl.BLEND);
        gl.bindVertexArray(null);
    }
}
