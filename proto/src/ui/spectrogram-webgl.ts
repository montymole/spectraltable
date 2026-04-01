
export class SpectrogramWebGL {
    private canvas: HTMLCanvasElement;
    private gl: WebGL2RenderingContext;
    private program!: WebGLProgram;
    private texture!: WebGLTexture;
    private vao!: WebGLVertexArrayObject;

    private titleElement: HTMLElement | null = null;
    private width: number = 320;
    private height: number = 320;
    private dpr: number = 1;

    private mode: 'SCANLINE' | 'AUDIO_OUTPUT' = 'AUDIO_OUTPUT';

    private writeIndex: number = 0;
    private historyHeight: number = 512;
    private textureWidth: number = 2048;

    private vertexShaderSource = `#version 300 es
        layout(location = 0) in vec2 a_position;
        out vec2 v_uv;
        void main() {
            v_uv = a_position * 0.5 + 0.5;
            gl_Position = vec4(a_position, 0.0, 1.0);
        }
    `;

    private fragmentShaderSource = `#version 300 es
        precision highp float;
        uniform sampler2D u_history;
        uniform float u_writeIndex;
        uniform float u_historyHeight;
        uniform float u_dataWidth;
        uniform float u_textureWidth;
        uniform int u_mode;
        in vec2 v_uv;
        out vec4 outColor;

        vec3 hsl2rgb(vec3 c) {
            vec3 rgb = clamp(abs(mod(c.x*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0, 0.0, 1.0);
            return c.z + c.y * (rgb-0.5) * (1.0-abs(2.0*c.z-1.0));
        }

        void main() {
            // Roll coords: latest row at bottom (v_uv.y = 0)
            float y = mod(u_writeIndex - 1.0 - (v_uv.y * u_historyHeight), u_historyHeight);
            float normY = (y + 0.5) / u_historyHeight;

            float x = v_uv.x;
            if (u_mode == 0) {
                // Audio log scale
                float factor = 100.0;
                x = (pow(factor, x) - 1.0) / (factor - 1.0);
            }

            // Map [0..1] range to active portion of texture
            float normX = (x * u_dataWidth + 0.5) / u_textureWidth;
            float val = texture(u_history, vec2(normX, normY)).r;

            vec3 color;
            if (u_mode == 0) {
                float hue = v_uv.x * 0.85;
                float intensity = (val + 100.0) / 70.0;
                intensity = clamp(intensity, 0.0, 1.0);
                float lightness = 0.05 + intensity * 0.55;
                color = hsl2rgb(vec3(hue, 0.9, lightness));
            } else {
                float hue = 0.35 + val * 0.15;
                float lightness = 0.05 + val * 0.50;
                color = hsl2rgb(vec3(hue, 0.8, lightness));
            }

            outColor = vec4(color, 1.0);
        }
    `;

    constructor(containerId: string) {
        this.canvas = document.getElementById(containerId) as HTMLCanvasElement;
        const gl = this.canvas.getContext('webgl2', {
            preserveDrawingBuffer: true,
            alpha: false,
            antialias: false
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
        this.initBuffers();
        this.initTexture();
        this.resize();

        window.addEventListener('resize', () => this.resize());

        this.canvas.addEventListener('click', () => {
            this.mode = this.mode === 'SCANLINE' ? 'AUDIO_OUTPUT' : 'SCANLINE';
            this.updateTitle();
        });
    }

    private createShader(type: number, source: string): WebGLShader {
        const shader = this.gl.createShader(type)!;
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error('Shader error:', this.gl.getShaderInfoLog(shader));
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
            console.error('Program error:', this.gl.getProgramInfoLog(program));
            throw new Error('Program linking failed');
        }
        return program;
    }

    private initBuffers(): void {
        const gl = this.gl;
        const positions = new Float32Array([
            -1.0, -1.0, 1.0, -1.0, -1.0, 1.0,
            -1.0, 1.0, 1.0, -1.0, 1.0, 1.0,
        ]);

        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

        this.vao = gl.createVertexArray()!;
        gl.bindVertexArray(this.vao);
        gl.enableVertexAttribArray(0); // layout(location = 0)
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);
    }

    private initTexture(): void {
        const gl = this.gl;
        this.texture = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, this.texture);

        gl.getExtension('EXT_color_buffer_float');
        gl.getExtension('OES_texture_float_linear');

        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, this.textureWidth, this.historyHeight, 0, gl.RED, gl.FLOAT, null);

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    }

    private updateTitle(): void {
        if (!this.titleElement) return;
        this.titleElement.textContent = this.mode === 'AUDIO_OUTPUT'
            ? 'Spectrogram'
            : 'ReadLine Output';
    }

    public resize(): void {
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientWidth;
        this.dpr = window.devicePixelRatio || 1;

        if (width === 0) return;

        this.canvas.width = width * this.dpr;
        this.canvas.height = height * this.dpr;
        this.width = width * this.dpr;
        this.height = height * this.dpr;

        this.gl.viewport(0, 0, this.width, this.height);
    }

    public update(scanlineData: Float32Array, audioDataLeft?: Float32Array): void {
        if (!scanlineData) return;

        const gl = this.gl;

        // Safety: ensure dimensions are valid
        if (this.width === 0) {
            this.resize();
            if (this.width === 0) return;
        }

        let uploadData: Float32Array;
        let isAudio = false;

        if (this.mode === 'AUDIO_OUTPUT' && audioDataLeft) {
            uploadData = audioDataLeft;
            isAudio = true;
        } else {
            const dataWidth = scanlineData.length / 4;
            uploadData = new Float32Array(dataWidth);
            for (let i = 0; i < dataWidth; i++) {
                uploadData[i] = scanlineData[i * 4];
            }
        }

        const dataWidth = Math.min(uploadData.length, this.textureWidth);
        if (dataWidth === 0) return;

        // Upload to current write row
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, this.writeIndex, dataWidth, 1, gl.RED, gl.FLOAT, uploadData, 0);

        // Advance write index
        this.writeIndex = (this.writeIndex + 1) % this.historyHeight;

        // Draw quad
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(this.program);
        gl.bindVertexArray(this.vao);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);

        gl.uniform1i(gl.getUniformLocation(this.program, 'u_history'), 0);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_writeIndex'), this.writeIndex);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_historyHeight'), this.historyHeight);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_dataWidth'), dataWidth);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_textureWidth'), this.textureWidth);
        gl.uniform1i(gl.getUniformLocation(this.program, 'u_mode'), isAudio ? 0 : 1);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
}
