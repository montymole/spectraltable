import { WebGLContext } from './context';
import {
    wireframeVertexShader,
    wireframeFragmentShader,
    pointVertexShader,
    pointFragmentShader,
    planeVertexShader,
    planeFragmentShader
} from './shaders';
import {
    mat4Perspective, mat4LookAt, mat4Multiply,
    mat4RotateX, mat4RotateY, mat4RotateZ, mat4Translate,
    vec3TransformMat4
} from './math';
import { SpectralVolume } from './spectral-volume';
import { ReadingPathGeometry } from './reading-path';
import {
    VolumeResolution, ReadingPathState, PlaneType,
    JuliaParams, MandelbulbParams, MengerParams, PlasmaParams, GameOfLifeParams,
    GeneratorParams
} from '../types';

// Renderer for wireframe cube + spectral volume points + reading path

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
    private pointUVolume: WebGLUniformLocation; // Changed from pointUColor
    private pointUAlpha: WebGLUniformLocation;
    private pointUSize: WebGLUniformLocation;
    private pointUVolumeRes: WebGLUniformLocation;

    // Reading path rendering
    private planeProgram: WebGLProgram;
    private planeVAO: WebGLVertexArrayObject | null = null;
    private planeIndexCount = 0;
    private planeUMVP: WebGLUniformLocation;
    private planeUModel: WebGLUniformLocation;
    private planeUVolume: WebGLUniformLocation;
    private planeUAlpha: WebGLUniformLocation;

    private lineVAO: WebGLVertexArrayObject | null = null;
    private lineUMVP: WebGLUniformLocation;
    private lineUColor: WebGLUniformLocation;
    private lineVertexCount = 0; // Added this property

    // Axes rendering
    private axesVAO: WebGLVertexArrayObject | null = null;
    private axesCounts: [number, number, number] = [0, 0, 0]; // Vertex counts for X, Y, Z axes
    private axesUMVP: WebGLUniformLocation;
    private axesUColor: WebGLUniformLocation;

    // State
    private spectralVolume: SpectralVolume;
    private pathState: ReadingPathState = {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scanPosition: 0,
        planeType: PlaneType.FLAT,
        shapePhase: 0
    };

    // Camera state
    private rotationX = 0.3;
    private rotationY = 0.4;
    private cameraDistance = 6.5;
    private isDragging = false;
    private lastMouseX = 0;
    private lastMouseY = 0;
    private activeMouseButton = -1; // -1: None, 0: Left, 2: Right

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

        // Axes shaders (reuse wireframe)
        this.axesUMVP = wireMVP;
        this.axesUColor = wireColor;
        this.updateAxesGeometry();

        // Compile point cloud shaders
        this.pointProgram = this.createProgram(pointVertexShader, pointFragmentShader);
        const pointMVP = ctx.gl.getUniformLocation(this.pointProgram, 'uModelViewProjection');
        const pointVolume = ctx.gl.getUniformLocation(this.pointProgram, 'uVolume');
        const pointAlpha = ctx.gl.getUniformLocation(this.pointProgram, 'uAlpha');
        const pointSize = ctx.gl.getUniformLocation(this.pointProgram, 'uPointSize');
        const pointVolumeRes = ctx.gl.getUniformLocation(this.pointProgram, 'uVolumeRes');

        // Note: uVolume might be null if optimized out, but usually it shouldn't be if used.
        // However, getUniformLocation returns null if not found.
        if (!pointMVP || !pointAlpha || !pointSize) {
            throw new Error('Failed to get point uniform locations');
        }
        this.pointUMVP = pointMVP;
        this.pointUVolume = pointVolume!; // Assert non-null or handle it
        this.pointUAlpha = pointAlpha;
        this.pointUSize = pointSize;
        this.pointUVolumeRes = pointVolumeRes!;

        // Compile plane shaders (re-using wireframe shader for line, plane shader for surface)
        this.planeProgram = this.createProgram(planeVertexShader, planeFragmentShader);
        const planeMVP = ctx.gl.getUniformLocation(this.planeProgram, 'uModelViewProjection');
        const planeModel = ctx.gl.getUniformLocation(this.planeProgram, 'uModelMatrix');
        const planeVolume = ctx.gl.getUniformLocation(this.planeProgram, 'uVolume');
        const planeAlpha = ctx.gl.getUniformLocation(this.planeProgram, 'uAlpha');

        if (!planeMVP || !planeAlpha) throw new Error('Failed to get plane uniform locations');

        this.planeUMVP = planeMVP;
        this.planeUModel = planeModel!; // Assert non-null or handle
        this.planeUVolume = planeVolume!; // Assert non-null or handle
        this.planeUAlpha = planeAlpha;

        // Reuse wireframe program for the reading line (it's just a solid color line)
        this.lineUMVP = wireMVP;
        this.lineUColor = wireColor;

        // Initialize geometry
        this.updatePointCloud(initialResolution);
        this.updateReadingPathGeometry();

        console.log('✓ Renderer initialized');
    }

    private generateCharGeometry(char: string, x: number, y: number, z: number, scale: number): number[] {
        // Simple vector font
        // Returns [x1, y1, z1, x2, y2, z2, ...]
        const lines: number[] = [];
        const s = scale;

        // Helper to add line
        const l = (x1: number, y1: number, x2: number, y2: number) => {
            lines.push(x + x1 * s, y + y1 * s, z);
            lines.push(x + x2 * s, y + y2 * s, z);
        };

        // 5x7 grid concept (approx)
        switch (char.toUpperCase()) {
            case 'T':
                l(0, 2, 2, 2); // Top bar
                l(1, 2, 1, 0); // Vertical
                break;
            case 'I':
                l(1, 2, 1, 0);
                break;
            case 'M':
                l(0, 0, 0, 2); // Left
                l(2, 0, 2, 2); // Right
                l(0, 2, 1, 1); // Diag
                l(1, 1, 2, 2); // Diag
                break;
            case 'E':
                l(0, 2, 2, 2); // Top
                l(0, 1, 1.5, 1); // Mid
                l(0, 0, 2, 0); // Bot
                l(0, 0, 0, 2); // Vert
                break;
            case 'O':
                l(0, 0, 2, 0); l(2, 0, 2, 2); l(2, 2, 0, 2); l(0, 2, 0, 0);
                break;
            case 'R':
                l(0, 0, 0, 2); // Vert
                l(0, 2, 2, 2); l(2, 2, 2, 1); l(2, 1, 0, 1); // Head
                l(0, 1, 2, 0); // Leg
                break;
            case 'P':
                l(0, 0, 0, 2);
                l(0, 2, 2, 2); l(2, 2, 2, 1); l(2, 1, 0, 1);
                break;
            case 'H':
                l(0, 0, 0, 2); l(2, 0, 2, 2); l(0, 1, 2, 1);
                break;
            case 'A':
                l(0, 0, 0, 1.5); // Right leg (bottom to mid)
                l(2, 0, 2, 1.5); // Left leg
                l(0, 1.5, 1, 2); // Left slope
                l(2, 1.5, 1, 2); // Right slope
                l(0, 1, 2, 1);   // Crossbar
                break;
            case 'B':
                l(0, 0, 0, 2);
                l(0, 2, 1.5, 2); l(1.5, 2, 2, 1.5); l(2, 1.5, 1.5, 1); l(1.5, 1, 0, 1); // Top loop
                l(0, 1, 1.5, 1); l(1.5, 1, 2, 0.5); l(2, 0.5, 1.5, 0); l(1.5, 0, 0, 0); // Bot loop
                break;
            case 'N':
                l(0, 0, 0, 2); l(2, 0, 2, 2); l(0, 2, 2, 0);
                break;
            case 'S':
                l(2, 2, 0, 2); l(0, 2, 0, 1); l(0, 1, 2, 1); l(2, 1, 2, 0); l(2, 0, 0, 0);
                break;
        }
        return lines;
    }

    // Generate text geometry on a specific plane alignment
    private generateTextString(text: string, startX: number, startY: number, startZ: number, scale: number, axis: 'x' | 'y' | 'z'): number[] {
        const vertices: number[] = [];
        let cursor = 0;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];

            // Adjust cursor mapping based on axis
            let lx = startX, ly = startY, lz = startZ;

            if (axis === 'x') {
                lx += cursor;
                // For X axis label, we want it reading from left to right along X?
                // Or facing the camera? Let's just lay it flat next to the axis.
                // Text along X, Up is Y.
                // generateCharGeometry assumes X is horizontal char width, Y is vertical char height.
                // So default works for X.
                const newVerts = this.generateCharGeometry(char, lx, ly, lz, scale);
                vertices.push(...newVerts);
                cursor += scale * 3.0; // Spacing
            } else if (axis === 'y') {
                // Vertical text?
                // Let's stack letters.
                ly += cursor;
                const newVerts = this.generateCharGeometry(char, lx, ly, lz, scale);
                vertices.push(...newVerts);
                cursor += scale * 3.0; // Up
            } else {
                lz += cursor;
                // On Z axis
                // Need to rotate logic of char gen, but let's cheat by swapping coords in buffer
                const charPoints = this.generateCharGeometry(char, 0, ly, 0, scale);
                // Swap X (char horizontal) to Z
                for (let k = 0; k < charPoints.length; k += 3) {
                    vertices.push(
                        lx,                 // X fixed
                        charPoints[k + 1],    // Y same
                        lz + charPoints[k]  // X maps to Z
                    );
                }
                cursor += scale * 3.0;
            }
        }
        return vertices;
    }

    private updateAxesGeometry(): void {
        const gl = this.ctx.gl;
        if (this.axesVAO) gl.deleteVertexArray(this.axesVAO);

        const vertices: number[] = [];

        // Define origins and lengths
        const origin = -1.2;
        const length = 1.0;
        const arrowSize = 0.05;

        // --- X AXIS (BINS) ---
        // Line
        const xStart = vertices.length / 3;
        vertices.push(origin, origin, origin); // Start
        vertices.push(origin + length, origin, origin); // End

        // Arrowhead
        const tipX = origin + length;
        vertices.push(tipX, origin, origin, tipX - arrowSize, origin + arrowSize, origin);
        vertices.push(tipX, origin, origin, tipX - arrowSize, origin - arrowSize, origin);
        vertices.push(tipX, origin, origin, tipX - arrowSize, origin, origin + arrowSize);
        vertices.push(tipX, origin, origin, tipX - arrowSize, origin, origin - arrowSize);

        // Label "BINS"
        // Place along X, slightly below
        const labelX = this.generateTextString("BINS", origin + 0.2, origin - 0.2, origin, 0.05, 'x');
        vertices.push(...labelX);

        const xCount = (vertices.length / 3) - xStart;

        // --- Y AXIS (MORPH) ---
        const yStart = vertices.length / 3;
        // Line
        vertices.push(origin, origin, origin);
        vertices.push(origin, origin + length, origin);

        // Arrowhead
        const tipY = origin + length;
        vertices.push(origin, tipY, origin, origin + arrowSize, tipY - arrowSize, origin);
        vertices.push(origin, tipY, origin, origin - arrowSize, tipY - arrowSize, origin);
        vertices.push(origin, tipY, origin, origin, tipY - arrowSize, origin + arrowSize);
        vertices.push(origin, tipY, origin, origin, tipY - arrowSize, origin - arrowSize);

        // Label "MORPH"
        // Place along Y
        const labelY = this.generateTextString("MORPH", origin - 0.2, origin + 0.2, origin, 0.05, 'y');
        vertices.push(...labelY);

        const yCount = (vertices.length / 3) - yStart;

        // --- Z AXIS (TIME) ---
        const zStart = vertices.length / 3;
        // Line
        vertices.push(origin, origin, origin);
        vertices.push(origin, origin, origin + length);

        // Arrowhead
        const tipZ = origin + length;
        vertices.push(origin, origin, tipZ, origin + arrowSize, origin, tipZ - arrowSize);
        vertices.push(origin, origin, tipZ, origin - arrowSize, origin, tipZ - arrowSize);
        vertices.push(origin, origin, tipZ, origin, origin + arrowSize, tipZ - arrowSize);
        vertices.push(origin, origin, tipZ, origin, origin - arrowSize, tipZ - arrowSize);

        // Label "PHASE"
        const labelZ = this.generateTextString("PHASE", origin - 0.2, origin, origin + 0.2, 0.05, 'z');
        vertices.push(...labelZ);

        const zCount = (vertices.length / 3) - zStart;

        this.axesCounts = [xCount, yCount, zCount];

        // Create buffers
        const vao = gl.createVertexArray();
        if (!vao) throw new Error("Failed axes VAO");
        gl.bindVertexArray(vao);

        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

        const posLoc = gl.getAttribLocation(this.wireframeProgram, 'aPosition');
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);

        gl.bindVertexArray(null);
        this.axesVAO = vao;
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

        if (this.pointVAO) gl.deleteVertexArray(this.pointVAO);

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

    private updateReadingPathGeometry(): void {
        const gl = this.ctx.gl;

        // 1. Update Plane Geometry
        if (this.planeVAO) gl.deleteVertexArray(this.planeVAO);

        const { positions, indices } = ReadingPathGeometry.generatePlane(
            this.pathState.planeType,
            32,
            this.pathState.shapePhase
        );
        this.planeIndexCount = indices.length;

        const planeVAO = gl.createVertexArray();
        if (!planeVAO) throw new Error('Failed to create plane VAO');
        gl.bindVertexArray(planeVAO);

        const planeVBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, planeVBO);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

        const planePosLoc = gl.getAttribLocation(this.planeProgram, 'aPosition');
        gl.enableVertexAttribArray(planePosLoc);
        gl.vertexAttribPointer(planePosLoc, 3, gl.FLOAT, false, 0, 0);

        const planeIBO = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, planeIBO);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

        gl.bindVertexArray(null);
        this.planeVAO = planeVAO;

        // 2. Update Line Geometry
        // We use the current volume resolution X for the line detail
        const resolution = this.spectralVolume.getResolution();
        this.updateReadingLineGeometry(resolution.x);
    }

    private updateReadingLineGeometry(resolutionX: number): void {
        const gl = this.ctx.gl;

        if (this.lineVAO) gl.deleteVertexArray(this.lineVAO);

        const linePositions = ReadingPathGeometry.generateReadingLine(
            this.pathState.planeType,
            resolutionX,
            this.pathState.scanPosition,
            this.pathState.shapePhase
        );

        this.lineVertexCount = linePositions.length / 3;

        const lineVAO = gl.createVertexArray();
        if (!lineVAO) throw new Error('Failed to create line VAO');
        gl.bindVertexArray(lineVAO);

        const lineVBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, lineVBO);
        gl.bufferData(gl.ARRAY_BUFFER, linePositions, gl.DYNAMIC_DRAW);

        const linePosLoc = gl.getAttribLocation(this.wireframeProgram, 'aPosition');
        gl.enableVertexAttribArray(linePosLoc);
        gl.vertexAttribPointer(linePosLoc, 3, gl.FLOAT, false, 0, 0);

        gl.bindVertexArray(null);
        this.lineVAO = lineVAO;
    }

    public render(deltaTime: number = 0.016): void {
        // Update logic (auto-reset plane rotation, etc.)
        this.update(deltaTime);

        const gl = this.ctx.gl;

        // Clear
        this.ctx.clear(0.08, 0.08, 0.12);

        // Enable blending
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        // Calculate Camera MVP
        const aspect = gl.canvas.width / gl.canvas.height;
        const projection = mat4Perspective(Math.PI / 4, aspect, 0.1, 100.0);
        const view = mat4LookAt([0, 0, this.cameraDistance], [0, 0, 0], [0, 1, 0]);

        const rotX = mat4RotateX(this.rotationX);
        const rotY = mat4RotateY(this.rotationY);
        const model = mat4Multiply(rotY, rotX);

        const viewModel = mat4Multiply(view, model);
        const cameraMVP = mat4Multiply(projection, viewModel);

        // 1. Draw Axis Explanations (Time, Morph, Bins)
        // These share the same MVP as the cube so they rotate with it
        if (this.axesVAO) {
            gl.useProgram(this.wireframeProgram);
            gl.uniformMatrix4fv(this.axesUMVP, false, cameraMVP);
            gl.bindVertexArray(this.axesVAO);

            let offset = 0;
            const [cx, cy, cz] = this.axesCounts;

            // X (Bins) - Cyan/Red
            gl.uniform3f(this.axesUColor, 1.0, 0.3, 0.3); // Red
            gl.drawArrays(gl.LINES, offset, cx);
            offset += cx;

            // Y (Morph) - Green
            gl.uniform3f(this.axesUColor, 0.3, 1.0, 0.3); // Green
            gl.drawArrays(gl.LINES, offset, cy);
            offset += cy;

            // Z (Time) - Blue
            gl.uniform3f(this.axesUColor, 0.4, 0.4, 1.0); // Blue
            gl.drawArrays(gl.LINES, offset, cz);

            gl.bindVertexArray(null);
        }

        // 1. Draw Point Cloud
        if (this.pointVAO) {
            gl.useProgram(this.pointProgram);
            gl.uniformMatrix4fv(this.pointUMVP, false, cameraMVP);

            // Bind volume texture
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_3D, this.spectralVolume.getTexture());
            gl.uniform1i(this.pointUVolume, 0);

            gl.uniform1f(this.pointUAlpha, 0.15); // Base alpha
            gl.uniform1f(this.pointUSize, 3.0);   // Base size

            // Pass volume resolution for density-based size clamping
            const res = this.spectralVolume.getResolution();
            gl.uniform3f(this.pointUVolumeRes, res.x, res.y, res.z);

            gl.bindVertexArray(this.pointVAO);
            gl.drawArrays(gl.POINTS, 0, this.pointCount);
            gl.bindVertexArray(null);
        }

        // Calculate plane transform
        const pRotX = mat4RotateX(this.pathState.rotation.x);
        const pRotY = mat4RotateY(this.pathState.rotation.y);
        const pRotZ = mat4RotateZ(this.pathState.rotation.z);
        const pTrans = mat4Translate(
            this.pathState.position.x,
            this.pathState.position.y,
            this.pathState.position.z
        );

        let planeModel = mat4Multiply(pRotY, pRotX);
        planeModel = mat4Multiply(pRotZ, planeModel);
        planeModel = mat4Multiply(pTrans, planeModel);

        const worldPlaneModel = mat4Multiply(model, planeModel);
        const planeViewModel = mat4Multiply(view, worldPlaneModel);
        const planeMVP = mat4Multiply(projection, planeViewModel);

        // 2. Draw Reading Path Plane
        if (this.planeVAO) {
            gl.useProgram(this.planeProgram);
            gl.uniformMatrix4fv(this.planeUMVP, false, planeMVP);
            gl.uniformMatrix4fv(this.planeUModel, false, worldPlaneModel); // Pass model matrix

            // Bind volume texture (reuse slot 0)
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_3D, this.spectralVolume.getTexture());
            gl.uniform1i(this.planeUVolume, 0);

            gl.uniform1f(this.planeUAlpha, 0.3); // Slightly more opaque to see colors

            gl.bindVertexArray(this.planeVAO);
            gl.drawElements(gl.LINES, this.planeIndexCount, gl.UNSIGNED_SHORT, 0);
            gl.bindVertexArray(null);
        }

        // 3. Draw Reading Position Line (Green contour line)
        if (this.lineVAO) {
            // Use same MVP as plane so it sticks to it
            gl.useProgram(this.wireframeProgram);
            gl.uniformMatrix4fv(this.lineUMVP, false, planeMVP);
            gl.uniform3f(this.lineUColor, 0.2, 1.0, 0.2); // Bright Green

            gl.bindVertexArray(this.lineVAO);
            gl.drawArrays(gl.LINE_STRIP, 0, this.lineVertexCount);
            gl.bindVertexArray(null);
        }

        // 4. Draw Wireframe Cube (Bounds)
        gl.useProgram(this.wireframeProgram);
        gl.uniformMatrix4fv(this.wireframeUMVP, false, cameraMVP);
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
        this.updateReadingPathGeometry();
        // Also update reading line resolution
        this.updateReadingLineGeometry(resolution.x);
    }

    public getSpectralVolume(): SpectralVolume {
        return this.spectralVolume;
    }

    public updateReadingPath(state: ReadingPathState): void {
        const typeChanged = state.planeType !== this.pathState.planeType;
        const scanChanged = state.scanPosition !== this.pathState.scanPosition;
        const phaseChanged = state.shapePhase !== this.pathState.shapePhase;

        // Always preserve mouse-controlled rotation (x and z)
        // Since rotation sliders were removed, controls always return 0 for rotation
        // We maintain rotation state internally via mouse interaction
        this.pathState = {
            ...state,
            rotation: {
                x: this.pathState.rotation.x,  // Preserve mouse-controlled
                y: state.rotation.y,            // Not used
                z: this.pathState.rotation.z    // Preserve mouse-controlled
            }
        };

        if (typeChanged || phaseChanged) {
            this.updateReadingPathGeometry();
        } else if (scanChanged) {
            const resolution = this.spectralVolume.getResolution();
            this.updateReadingLineGeometry(resolution.x);
        }
    }

    public updateSpectralData(dataSet: string, params?: GeneratorParams): void {
        switch (dataSet) {
            case '3d-julia':
                this.spectralVolume.generate3DJulia(params as JuliaParams);
                break;
            case 'mandelbulb':
                this.spectralVolume.generateMandelbulb(params as MandelbulbParams);
                break;
            case 'menger-sponge':
                this.spectralVolume.generateMengerSponge(params as MengerParams);
                break;
            case 'sine-plasma':
                this.spectralVolume.generateSinePlasma(0, params as PlasmaParams);
                break;
            case 'game-of-life':
                this.spectralVolume.initGameOfLife(params as GameOfLifeParams);
                break;
            default:
                this.spectralVolume.clearData();
                break;
        }
    }

    public getReadingLineSpectralData(): Float32Array {
        // 1. Get reading line positions in plane space
        const resolution = this.spectralVolume.getResolution();
        const linePositions = ReadingPathGeometry.generateReadingLine(
            this.pathState.planeType,
            resolution.x, // Use X resolution for sampling density
            this.pathState.scanPosition,
            this.pathState.shapePhase
        );

        // 2. Calculate plane transform matrix
        const pRotX = mat4RotateX(this.pathState.rotation.x);
        const pRotY = mat4RotateY(this.pathState.rotation.y);
        const pRotZ = mat4RotateZ(this.pathState.rotation.z);
        const pTrans = mat4Translate(
            this.pathState.position.x,
            this.pathState.position.y,
            this.pathState.position.z
        );

        let planeModel = mat4Multiply(pRotY, pRotX);
        planeModel = mat4Multiply(pRotZ, planeModel);
        planeModel = mat4Multiply(pTrans, planeModel);

        // 3. Transform points to world space and sample volume
        const numPoints = linePositions.length / 3;
        const result = new Float32Array(numPoints * 4); // RGBA per point

        for (let i = 0; i < numPoints; i++) {
            const px = linePositions[i * 3];
            const py = linePositions[i * 3 + 1];
            const pz = linePositions[i * 3 + 2];

            // Transform to world space
            const worldPos = vec3TransformMat4([px, py, pz], planeModel);

            // Convert world space [-1, 1] to texture space [0, 1]
            const tx = (worldPos[0] + 1.0) * 0.5;
            const ty = (worldPos[1] + 1.0) * 0.5;
            const tz = (worldPos[2] + 1.0) * 0.5;

            // Sample volume
            const sample = this.spectralVolume.sample(tx, ty, tz);

            // Store all channels
            result[i * 4] = sample[0];     // R: Magnitude
            result[i * 4 + 1] = sample[1]; // G: Phase
            result[i * 4 + 2] = sample[2]; // B: Pan
            result[i * 4 + 3] = sample[3]; // A: Width
        }

        return result;
    }

    // Mouse interaction
    public onMouseDown(x: number, y: number, button: number): void {
        this.isDragging = true;
        this.lastMouseX = x;
        this.lastMouseY = y;
        this.activeMouseButton = button;
    }

    public onMouseMove(x: number, y: number): void {
        if (!this.isDragging) return;

        const dx = x - this.lastMouseX;
        const dy = y - this.lastMouseY;

        this.lastMouseX = x;
        this.lastMouseY = y;

        const sensitivity = 0.01;

        if (this.activeMouseButton === 2) {
            // Right click: Rotate Camera (Cube)
            this.rotationY += dx * sensitivity;
            this.rotationX += dy * sensitivity;
        } else if (this.activeMouseButton === 0) {
            // Left click: Rotate Reading Plane
            // We update the path state directly.
            // Note: This needs to be communicated back to controls if we want sliders to update.
            // For now, we just update local state which might get overwritten by controls if they change.
            // Ideally, we should emit an event.

            // Invert controls for intuitive feel
            this.pathState.rotation.z -= dx * sensitivity;
            this.pathState.rotation.x -= dy * sensitivity;

            // Limit rotation to avoid flipping
            this.pathState.rotation.x = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, this.pathState.rotation.x));
            this.pathState.rotation.z = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, this.pathState.rotation.z));
        }
    }

    public onMouseUp(): void {
        this.isDragging = false;
        this.activeMouseButton = -1;
    }

    public zoom(delta: number): void {
        const zoomSpeed = 0.005;
        this.cameraDistance += delta * zoomSpeed;
        // Clamp distance
        this.cameraDistance = Math.max(2.0, Math.min(20.0, this.cameraDistance));
    }

    public resetView(): void {
        this.rotationX = 0.3;
        this.rotationY = 0.4;
        this.cameraDistance = 6.5;
    }

    public update(deltaTime: number): void {
        // Auto-reset plane rotation if not dragging
        if (!this.isDragging) {
            const decay = 5.0 * deltaTime; // Speed of return

            // Lerp towards 0
            this.pathState.rotation.x += (0 - this.pathState.rotation.x) * decay;
            this.pathState.rotation.z += (0 - this.pathState.rotation.z) * decay;

            // Snap to 0 if very close
            if (Math.abs(this.pathState.rotation.x) < 0.001) this.pathState.rotation.x = 0;
            if (Math.abs(this.pathState.rotation.z) < 0.001) this.pathState.rotation.z = 0;
        }
    }

    public destroy(): void {
        this.spectralVolume.destroy();
    }
}
