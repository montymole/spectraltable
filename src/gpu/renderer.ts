import { WebGLContext } from './context';
import { vertexShaderSource, fragmentShaderSource } from './shaders';
import { mat4Perspective, mat4LookAt, mat4Multiply, mat4RotateX, mat4RotateY } from './math';

// Wireframe cube renderer with mouse rotation
// Represents the bounds of the spectral volume

export class Renderer {
    private ctx: WebGLContext;
    private program: WebGLProgram;
    private vao: WebGLVertexArrayObject;

    private uMVPLocation: WebGLUniformLocation;
    private uColorLocation: WebGLUniformLocation;

    // Camera state
    private rotationX = 0.3;
    private rotationY = 0.4;
    private isDragging = false;
    private lastMouseX = 0;
    private lastMouseY = 0;

    constructor(ctx: WebGLContext) {
        this.ctx = ctx;

        // Compile shaders and link program
        this.program = this.createProgram();

        // Get uniform locations
        const mvpLoc = this.ctx.gl.getUniformLocation(this.program, 'uModelViewProjection');
        const colorLoc = this.ctx.gl.getUniformLocation(this.program, 'uColor');
        if (!mvpLoc || !colorLoc) throw new Error('Failed to get uniform locations');
        this.uMVPLocation = mvpLoc;
        this.uColorLocation = colorLoc;

        // Create cube geometry
        this.vao = this.createCubeGeometry();

        console.log('✓ Renderer initialized');
    }

    private createProgram(): WebGLProgram {
        const gl = this.ctx.gl;

        const vertexShader = gl.createShader(gl.VERTEX_SHADER);
        if (!vertexShader) throw new Error('Failed to create vertex shader');
        gl.shaderSource(vertexShader, vertexShaderSource);
        gl.compileShader(vertexShader);

        if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
            const log = gl.getShaderInfoLog(vertexShader);
            throw new Error(`Vertex shader compile error: ${log}`);
        }

        const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
        if (!fragmentShader) throw new Error('Failed to create fragment shader');
        gl.shaderSource(fragmentShader, fragmentShaderSource);
        gl.compileShader(fragmentShader);

        if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
            const log = gl.getShaderInfoLog(fragmentShader);
            throw new Error(`Fragment shader compile error: ${log}`);
        }

        const program = gl.createProgram();
        if (!program) throw new Error('Failed to create program');
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            const log = gl.getProgramInfoLog(program);
            throw new Error(`Program link error: ${log}`);
        }

        return program;
    }

    private createCubeGeometry(): WebGLVertexArrayObject {
        const gl = this.ctx.gl;

        // Cube vertices (centered at origin, size 2x2x2)
        const vertices = new Float32Array([
            -1, -1, -1,  // 0
            1, -1, -1,  // 1
            1, 1, -1,  // 2
            -1, 1, -1,  // 3
            -1, -1, 1,  // 4
            1, -1, 1,  // 5
            1, 1, 1,  // 6
            -1, 1, 1,  // 7
        ]);

        // Wireframe edges (12 edges of a cube)
        const indices = new Uint16Array([
            0, 1, 1, 2, 2, 3, 3, 0,  // Front face
            4, 5, 5, 6, 6, 7, 7, 4,  // Back face
            0, 4, 1, 5, 2, 6, 3, 7,  // Connecting edges
        ]);

        const vao = gl.createVertexArray();
        if (!vao) throw new Error('Failed to create VAO');
        gl.bindVertexArray(vao);

        const vertexBuffer = gl.createBuffer();
        if (!vertexBuffer) throw new Error('Failed to create vertex buffer');
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        const aPositionLoc = gl.getAttribLocation(this.program, 'aPosition');
        gl.enableVertexAttribArray(aPositionLoc);
        gl.vertexAttribPointer(aPositionLoc, 3, gl.FLOAT, false, 0, 0);

        const indexBuffer = gl.createBuffer();
        if (!indexBuffer) throw new Error('Failed to create index buffer');
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);


        gl.bindVertexArray(null);

        return vao;
    }

    public render(): void {
        const gl = this.ctx.gl;

        // Clear
        this.ctx.clear(0.08, 0.08, 0.12);

        // Use program
        gl.useProgram(this.program);

        // Calculate MVP matrix
        const aspect = gl.canvas.width / gl.canvas.height;
        const projection = mat4Perspective(Math.PI / 4, aspect, 0.1, 100.0);
        const view = mat4LookAt([0, 0, 5], [0, 0, 0], [0, 1, 0]);

        const rotX = mat4RotateX(this.rotationX);
        const rotY = mat4RotateY(this.rotationY);
        const model = mat4Multiply(rotY, rotX);

        const viewModel = mat4Multiply(view, model);
        const mvp = mat4Multiply(projection, viewModel);

        // Set uniforms
        gl.uniformMatrix4fv(this.uMVPLocation, false, mvp);
        gl.uniform3f(this.uColorLocation, 0.3, 0.6, 1.0); // Blue

        // Draw wireframe
        gl.bindVertexArray(this.vao);
        gl.drawElements(gl.LINES, 24, gl.UNSIGNED_SHORT, 0);
        gl.bindVertexArray(null);
    }

    public resize(width: number, height: number): void {
        this.ctx.resize(width, height);
    }

    // Mouse interaction
    public onMouseDown(x: number, y: number): void {
        this.isDragging = true;
        this.lastMouseX = x;
        this.lastMouseY = y;
    }

    public onMouseMove(x: number, y: number): void {
        if (!this.isDragging) return;

        const deltaX = x - this.lastMouseX;
        const deltaY = y - this.lastMouseY;

        this.rotationY += deltaX * 0.01;
        this.rotationX += deltaY * 0.01;

        // Clamp rotation X to avoid gimbal lock
        this.rotationX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.rotationX));

        this.lastMouseX = x;
        this.lastMouseY = y;
    }

    public onMouseUp(): void {
        this.isDragging = false;
    }
}
