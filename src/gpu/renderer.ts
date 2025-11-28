import { WebGLContext } from './context';
import {
    wireframeVertexShader,
    wireframeFragmentShader,
    pointVertexShader,
    pointFragmentShader
} from './shaders';
import { mat4Perspective, mat4LookAt, mat4Multiply, mat4RotateX, mat4RotateY } from './math';
import { SpectralVolume } from './spectral-volume';
import { VolumeResolution } from '../types';

// Renderer for wireframe cube + spectral volume points

export class Renderer {
    private ctx: WebGLContext;

    // Wireframe rendering
    private wireframeProgram: WebGLProgram;
    private wireframeVAO: WebGLVertexArrayObject;
    private wireframeUMVP: WebGLUniformLocation;
    private wireframeUColor: WebGLUniformLocation;

    // Point cloud rendering
    private pointProgram: WebGLProgram;
    private pointVAO: WebGLVertexArrayObject | null = null;
    private pointCount = 0;
    private pointUMVP: WebGLUniformLocation;
    private pointUColor: WebGLUniformLocation;
    private pointUAlpha: WebGLUniformLocation;
    private pointUSize: WebGLUniformLocation;

    // Spectral volume
    private spectralVolume: SpectralVolume;

    // Camera state
    private rotationX = 0.3;
    private rotationY = 0.4;
    private isDragging = false;
    private lastMouseX = 0;
    private lastMouseY = 0;

    constructor(ctx: WebGLContext, initialResolution: VolumeResolution) {
        this.ctx = ctx;

        // Create spectral volume
        this.spectralVolume = new SpectralVolume(ctx, initialResolution);

        // Compile wireframe shaders
        this.wireframeProgram = this.createProgram(wireframeVertexShader, wireframeFragmentShader);
        const wireMVP = ctx.gl.getUniformLocation(this.wireframeProgram, 'uModelViewProjection');
        const wireColor = ctx.gl.getUniformLocation(this.wireframeProgram, 'uColor');
        if (!wireMVP || !wireColor) throw new Error('Failed to get wireframe uniform locations');
        this.wireframeUMVP = wireMVP;
        this.wireframeUColor = wireColor;
        this.wireframeVAO = this.createWireframeCube();

        // Compile point cloud shaders
        this.pointProgram = this.createProgram(pointVertexShader, pointFragmentShader);
        const pointMVP = ctx.gl.getUniformLocation(this.pointProgram, 'uModelViewProjection');
        const pointColor = ctx.gl.getUniformLocation(this.pointProgram, 'uColor');
        const pointAlpha = ctx.gl.getUniformLocation(this.pointProgram, 'uAlpha');
        const pointSize = ctx.gl.getUniformLocation(this.pointProgram, 'uPointSize');
        if (!pointMVP || !pointColor || !pointAlpha || !pointSize) {
            throw new Error('Failed to get point uniform locations');
        }
        this.pointUMVP = pointMVP;
        this.pointUColor = pointColor;
        this.pointUAlpha = pointAlpha;
        this.pointUSize = pointSize;

        // Create point cloud geometry
        this.updatePointCloud(initialResolution);

        console.log('✓ Renderer initialized');
    }

    private createProgram(vertexSrc: string, fragmentSrc: string): WebGLProgram {
        const gl = this.ctx.gl;

        const vertexShader = gl.createShader(gl.VERTEX_SHADER);
        if (!vertexShader) throw new Error('Failed to create vertex shader');
        gl.shaderSource(vertexShader, vertexSrc);
        gl.compileShader(vertexShader);

        if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
            const log = gl.getShaderInfoLog(vertexShader);
            throw new Error(`Vertex shader compile error: ${log}`);
        }

        const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
        if (!fragmentShader) throw new Error('Failed to create fragment shader');
        gl.shaderSource(fragmentShader, fragmentSrc);
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

    private createWireframeCube(): WebGLVertexArrayObject {
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

        const aPositionLoc = gl.getAttribLocation(this.wireframeProgram, 'aPosition');
        gl.enableVertexAttribArray(aPositionLoc);
        gl.vertexAttribPointer(aPositionLoc, 3, gl.FLOAT, false, 0, 0);

        const indexBuffer = gl.createBuffer();
        if (!indexBuffer) throw new Error('Failed to create index buffer');
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

        gl.bindVertexArray(null);

        return vao;
    }

    private generatePointCloud(resolution: VolumeResolution): Float32Array {
        const { x, y, z } = resolution;
        const totalPoints = x * y * z;
        const positions = new Float32Array(totalPoints * 3);

        let idx = 0;
        for (let iz = 0; iz < z; iz++) {
            for (let iy = 0; iy < y; iy++) {
                for (let ix = 0; ix < x; ix++) {
                    // Map from grid indices to normalized cube space [-1, 1]
                    positions[idx++] = (ix / (x - 1)) * 2 - 1;
                    positions[idx++] = (iy / (y - 1)) * 2 - 1;
                    positions[idx++] = (iz / (z - 1)) * 2 - 1;
                }
            }
        }

        return positions;
    }

    private updatePointCloud(resolution: VolumeResolution): void {
        const gl = this.ctx.gl;

        // Delete old VAO if exists
        if (this.pointVAO) {
            gl.deleteVertexArray(this.pointVAO);
        }

        const positions = this.generatePointCloud(resolution);
        this.pointCount = positions.length / 3;

        const vao = gl.createVertexArray();
        if (!vao) throw new Error('Failed to create point VAO');
        gl.bindVertexArray(vao);

        const buffer = gl.createBuffer();
        if (!buffer) throw new Error('Failed to create point buffer');
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

        const aPositionLoc = gl.getAttribLocation(this.pointProgram, 'aPosition');
        gl.enableVertexAttribArray(aPositionLoc);
        gl.vertexAttribPointer(aPositionLoc, 3, gl.FLOAT, false, 0, 0);

        gl.bindVertexArray(null);

        this.pointVAO = vao;

        console.log(`✓ Point cloud: ${this.pointCount} points`);
    }

    public render(): void {
        const gl = this.ctx.gl;

        // Clear
        this.ctx.clear(0.08, 0.08, 0.12);

        // Enable blending for transparent points
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        // Calculate MVP matrix (shared by both renderers)
        const aspect = gl.canvas.width / gl.canvas.height;
        const projection = mat4Perspective(Math.PI / 4, aspect, 0.1, 100.0);
        const view = mat4LookAt([0, 0, 5], [0, 0, 0], [0, 1, 0]);

        const rotX = mat4RotateX(this.rotationX);
        const rotY = mat4RotateY(this.rotationY);
        const model = mat4Multiply(rotY, rotX);

        const viewModel = mat4Multiply(view, model);
        const mvp = mat4Multiply(projection, viewModel);

        // Draw point cloud (faint blue dots)
        if (this.pointVAO) {
            gl.useProgram(this.pointProgram);
            gl.uniformMatrix4fv(this.pointUMVP, false, mvp);
            gl.uniform3f(this.pointUColor, 0.3, 0.6, 1.0); // Blue
            gl.uniform1f(this.pointUAlpha, 0.15); // Very faint
            gl.uniform1f(this.pointUSize, 3.0); // 3 pixel points

            gl.bindVertexArray(this.pointVAO);
            gl.drawArrays(gl.POINTS, 0, this.pointCount);
            gl.bindVertexArray(null);
        }

        // Draw wireframe cube on top
        gl.useProgram(this.wireframeProgram);
        gl.uniformMatrix4fv(this.wireframeUMVP, false, mvp);
        gl.uniform3f(this.wireframeUColor, 0.3, 0.6, 1.0); // Blue

        gl.bindVertexArray(this.wireframeVAO);
        gl.drawElements(gl.LINES, 24, gl.UNSIGNED_SHORT, 0);
        gl.bindVertexArray(null);

        gl.disable(gl.BLEND);
    }

    public resize(width: number, height: number): void {
        this.ctx.resize(width, height);
    }

    public updateVolumeResolution(resolution: VolumeResolution): void {
        this.spectralVolume.updateResolution(resolution);
        this.updatePointCloud(resolution);
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

    public destroy(): void {
        this.spectralVolume.destroy();
    }
}
