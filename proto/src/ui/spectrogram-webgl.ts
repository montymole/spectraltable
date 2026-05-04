
export class SpectrogramWebGL {
    private canvas: HTMLCanvasElement;
    private gl: WebGL2RenderingContext;
    private program!: WebGLProgram;
    private planeProgram!: WebGLProgram;
    private texture!: WebGLTexture;
    private vao!: WebGLVertexArrayObject;
    private planeVao!: WebGLVertexArrayObject;
    private planeIndexCount: number = 0;

    private titleElement: HTMLElement | null = null;
    private width: number = 320;
    private height: number = 320;
    private dpr: number = 1;

    private mode: 'SCANLINE' | 'AUDIO_OUTPUT' | 'AUDIO_PLANE_3D' = 'AUDIO_OUTPUT';
    private planeRotationX = -0.74;
    private planeRotationY = -0.38;
    private planeCameraDistance = 3.1;
    private isDragging = false;
    private didDrag = false;
    private lastPointerX = 0;
    private lastPointerY = 0;

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
                val = clamp(val, 0.0, 1.0);
                float hue = 0.35 + val * 0.15;
                float lightness = 0.05 + val * 0.50;
                color = hsl2rgb(vec3(hue, 0.8, lightness));
            }

            outColor = vec4(color, 1.0);
        }
    `;

    private planeVertexShaderSource = `#version 300 es
        layout(location = 0) in vec2 a_grid;

        uniform sampler2D u_history;
        uniform float u_writeIndex;
        uniform float u_historyHeight;
        uniform float u_dataWidth;
        uniform float u_textureWidth;
        uniform int u_isAudio;
        uniform float u_rotationX;
        uniform float u_rotationY;
        uniform float u_cameraDistance;

        out vec3 v_color;
        out float v_intensity;

        vec3 hsl2rgb(vec3 c) {
            vec3 rgb = clamp(abs(mod(c.x*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0, 0.0, 1.0);
            return c.z + c.y * (rgb-0.5) * (1.0-abs(2.0*c.z-1.0));
        }

        mat4 rotationX(float angle) {
            float s = sin(angle);
            float c = cos(angle);
            return mat4(
                1.0, 0.0, 0.0, 0.0,
                0.0, c, s, 0.0,
                0.0, -s, c, 0.0,
                0.0, 0.0, 0.0, 1.0
            );
        }

        mat4 rotationY(float angle) {
            float s = sin(angle);
            float c = cos(angle);
            return mat4(
                c, 0.0, -s, 0.0,
                0.0, 1.0, 0.0, 0.0,
                s, 0.0, c, 0.0,
                0.0, 0.0, 0.0, 1.0
            );
        }

        mat4 perspective(float fov, float aspect, float near, float far) {
            float f = 1.0 / tan(fov * 0.5);
            return mat4(
                f / aspect, 0.0, 0.0, 0.0,
                0.0, f, 0.0, 0.0,
                0.0, 0.0, (far + near) / (near - far), -1.0,
                0.0, 0.0, (2.0 * far * near) / (near - far), 0.0
            );
        }

        void main() {
            float freq = a_grid.x;
            float time = a_grid.y;
            float sampleX = freq;
            if (u_isAudio == 1) {
                float factor = 100.0;
                sampleX = (pow(factor, freq) - 1.0) / (factor - 1.0);
            }

            float historyY = mod(u_writeIndex - 1.0 - (time * u_historyHeight), u_historyHeight);
            float normY = (historyY + 0.5) / u_historyHeight;
            float normX = (sampleX * u_dataWidth + 0.5) / u_textureWidth;
            float raw = texture(u_history, vec2(normX, normY)).r;

            float intensity = raw;
            if (u_isAudio == 1) {
                intensity = clamp((raw + 100.0) / 70.0, 0.0, 1.0);
            }
            intensity = clamp(intensity, 0.0, 1.0);
            v_intensity = intensity;

            float x = (freq - 0.5) * 1.38;
            float z = mix(0.48, -0.78, time);
            float y = -0.44 + pow(intensity, 1.35) * 0.82;

            vec4 world = vec4(x, y, z, 1.0);
            world = rotationY(u_rotationY) * rotationX(u_rotationX) * world;
            world.z -= u_cameraDistance;

            mat4 projection = perspective(0.85, 1.0, 0.1, 10.0);
            gl_Position = projection * world;

            float hue = freq * 0.85;
            vec3 bandColor = hsl2rgb(vec3(hue, 0.9, 0.5));
            vec3 brightColor = mix(bandColor, vec3(1.0), smoothstep(0.68, 1.0, intensity));
            v_color = mix(vec3(0.0), brightColor, smoothstep(0.02, 0.72, intensity));
        }
    `;

    private planeFragmentShaderSource = `#version 300 es
        precision highp float;
        in vec3 v_color;
        in float v_intensity;
        out vec4 outColor;

        void main() {
            float alpha = 0.5 + v_intensity * 0.5;
            outColor = vec4(v_color, alpha);
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
        this.planeProgram = this.createProgram(this.planeVertexShaderSource, this.planeFragmentShaderSource);
        this.initBuffers();
        this.initPlaneBuffers();
        this.initTexture();
        this.resize();

        window.addEventListener('resize', () => this.resize());

        this.canvas.addEventListener('click', () => {
            if (this.didDrag) {
                this.didDrag = false;
                return;
            }
            this.mode = this.mode === 'AUDIO_OUTPUT'
                ? 'SCANLINE'
                : this.mode === 'SCANLINE'
                    ? 'AUDIO_PLANE_3D'
                    : 'AUDIO_OUTPUT';
            this.updateTitle();
        });
        this.canvas.addEventListener('mousedown', (event) => this.onMouseDown(event));
        this.canvas.addEventListener('mousemove', (event) => this.onMouseMove(event));
        this.canvas.addEventListener('mouseup', () => this.onMouseUp());
        this.canvas.addEventListener('mouseleave', () => this.onMouseUp());
        this.canvas.addEventListener('wheel', (event) => this.onWheel(event), { passive: false });
        this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
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

    private initPlaneBuffers(): void {
        const gl = this.gl;
        const columns = 96;
        const rows = 96;
        const vertices = new Float32Array(columns * rows * 2);
        let vertexOffset = 0;

        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < columns; x++) {
                vertices[vertexOffset++] = x / (columns - 1);
                vertices[vertexOffset++] = y / (rows - 1);
            }
        }

        const indices: number[] = [];
        for (let y = 0; y < rows - 1; y++) {
            for (let x = 0; x < columns - 1; x++) {
                const i = y * columns + x;
                indices.push(i, i + 1, i + columns);
                indices.push(i + 1, i + columns + 1, i + columns);
            }
        }
        this.planeIndexCount = indices.length;

        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        const ibo = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

        this.planeVao = gl.createVertexArray()!;
        gl.bindVertexArray(this.planeVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
        gl.enableVertexAttribArray(0);
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

        const silentHistory = new Float32Array(this.textureWidth * this.historyHeight);
        silentHistory.fill(-100);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, this.textureWidth, this.historyHeight, 0, gl.RED, gl.FLOAT, silentHistory);

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    }

    private updateTitle(): void {
        if (!this.titleElement) return;
        if (this.mode === 'AUDIO_OUTPUT') {
            this.titleElement.textContent = 'Spectrogram';
        } else if (this.mode === 'AUDIO_PLANE_3D') {
            this.titleElement.textContent = 'Spectrogram 3D';
        } else {
            this.titleElement.textContent = 'ReadLine Output';
        }
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

        if ((this.mode === 'AUDIO_OUTPUT' || this.mode === 'AUDIO_PLANE_3D') && audioDataLeft) {
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

        if (this.mode === 'AUDIO_PLANE_3D') {
            this.drawPlane(dataWidth, isAudio);
            return;
        }

        // Draw quad
        gl.disable(gl.DEPTH_TEST);
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

    private drawPlane(dataWidth: number, isAudio: boolean): void {
        const gl = this.gl;

        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.clearColor(0.005, 0.012, 0.02, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        gl.useProgram(this.planeProgram);
        gl.bindVertexArray(this.planeVao);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);

        gl.uniform1i(gl.getUniformLocation(this.planeProgram, 'u_history'), 0);
        gl.uniform1f(gl.getUniformLocation(this.planeProgram, 'u_writeIndex'), this.writeIndex);
        gl.uniform1f(gl.getUniformLocation(this.planeProgram, 'u_historyHeight'), this.historyHeight);
        gl.uniform1f(gl.getUniformLocation(this.planeProgram, 'u_dataWidth'), dataWidth);
        gl.uniform1f(gl.getUniformLocation(this.planeProgram, 'u_textureWidth'), this.textureWidth);
        gl.uniform1i(gl.getUniformLocation(this.planeProgram, 'u_isAudio'), isAudio ? 1 : 0);
        gl.uniform1f(gl.getUniformLocation(this.planeProgram, 'u_rotationX'), this.planeRotationX);
        gl.uniform1f(gl.getUniformLocation(this.planeProgram, 'u_rotationY'), this.planeRotationY);
        gl.uniform1f(gl.getUniformLocation(this.planeProgram, 'u_cameraDistance'), this.planeCameraDistance);

        gl.drawElements(gl.TRIANGLES, this.planeIndexCount, gl.UNSIGNED_SHORT, 0);
    }

    private onMouseDown(event: MouseEvent): void {
        if (this.mode !== 'AUDIO_PLANE_3D') return;
        this.isDragging = true;
        this.didDrag = false;
        this.lastPointerX = event.clientX;
        this.lastPointerY = event.clientY;
    }

    private onMouseMove(event: MouseEvent): void {
        if (!this.isDragging || this.mode !== 'AUDIO_PLANE_3D') return;

        const dx = event.clientX - this.lastPointerX;
        const dy = event.clientY - this.lastPointerY;
        this.lastPointerX = event.clientX;
        this.lastPointerY = event.clientY;

        if (Math.abs(dx) + Math.abs(dy) > 2) this.didDrag = true;

        const sensitivity = 0.01;
        this.planeRotationY += dx * sensitivity;
        this.planeRotationX += dy * sensitivity;
        this.planeRotationX = Math.max(-1.35, Math.min(0.1, this.planeRotationX));
    }

    private onMouseUp(): void {
        this.isDragging = false;
    }

    private onWheel(event: WheelEvent): void {
        if (this.mode !== 'AUDIO_PLANE_3D') return;
        event.preventDefault();
        const zoomSpeed = 0.004;
        this.planeCameraDistance += event.deltaY * zoomSpeed;
        this.planeCameraDistance = Math.max(1.8, Math.min(6.0, this.planeCameraDistance));
    }
}
