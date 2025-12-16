import { WebGLContext } from './context';
import {
    VolumeResolution,
    JuliaParams, MandelbulbParams, MengerParams, PlasmaParams, GameOfLifeParams,
    defaultJuliaParams, defaultMandelbulbParams, defaultMengerParams, defaultPlasmaParams, defaultGameOfLifeParams
} from '../types';

// 3D Spectral Volume - GPU storage for RGBA spectral data
// Each voxel stores: R=Magnitude, G=Phase, B=Custom1, A=Custom2

export class SpectralVolume {
    private ctx: WebGLContext;
    private texture: WebGLTexture | null = null;
    private resolution: VolumeResolution;

    private data: Float32Array | null = null;

    // Game of Life 3D state
    private gameOfLifeState: Uint8Array | null = null;  // Binary cell states
    private gameOfLifeBuffer: Uint8Array | null = null; // Double buffer for updates

    constructor(ctx: WebGLContext, resolution: VolumeResolution) {
        this.ctx = ctx;
        this.resolution = resolution;
        this.initialize();
    }

    private initialize(): void {
        const gl = this.ctx.gl;

        // Clean up old texture if exists
        if (this.texture) {
            gl.deleteTexture(this.texture);
        }

        // Create 3D texture
        this.texture = gl.createTexture();
        if (!this.texture) throw new Error('Failed to create 3D texture');

        gl.bindTexture(gl.TEXTURE_3D, this.texture);

        // Allocate storage (RGBA32F format)
        const { x, y, z } = this.resolution;
        const totalVoxels = x * y * z;

        // Initialize data array if not exists or size changed
        if (!this.data || this.data.length !== totalVoxels * 4) {
            this.data = new Float32Array(totalVoxels * 4); // RGBA
            this.data.fill(0.0);
        }

        gl.texImage3D(
            gl.TEXTURE_3D,
            0,                    // mip level
            gl.RGBA32F,           // internal format
            x, y, z,              // dimensions
            0,                    // border (must be 0)
            gl.RGBA,              // format
            gl.FLOAT,             // type
            this.data             // data
        );

        // Set texture parameters (no filtering for now, nearest neighbor)
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);

        gl.bindTexture(gl.TEXTURE_3D, null);

        const memoryMB = (totalVoxels * 4 * 4) / (1024 * 1024); // 4 floats, 4 bytes each
        console.log(`✓ Spectral Volume: ${x}×${y}×${z} = ${totalVoxels} voxels (${memoryMB.toFixed(2)} MB)`);
    }

    public setData(data: Float32Array): void {
        const gl = this.ctx.gl;
        const { x, y, z } = this.resolution;

        if (data.length !== x * y * z * 4) {
            throw new Error('Data length does not match volume resolution');
        }

        this.data = data; // Store reference

        gl.bindTexture(gl.TEXTURE_3D, this.texture);
        gl.texSubImage3D(
            gl.TEXTURE_3D,
            0,
            0, 0, 0,
            x, y, z,
            gl.RGBA,
            gl.FLOAT,
            data
        );
        gl.bindTexture(gl.TEXTURE_3D, null);
    }

    public generate3DJulia(params: JuliaParams = defaultJuliaParams): void {
        const { x, y, z } = this.resolution;
        const totalVoxels = x * y * z;
        const data = new Float32Array(totalVoxels * 4);

        const { scale, cReal, cImag } = params;
        const maxIter = 16;
        const power = 8.0;

        // Julia C constant (quaternion-style: real + i*imag + j*0)
        const cx = cReal;
        const cy = cImag;
        const cz = 0.0;

        let idx = 0;
        for (let iz = 0; iz < z; iz++) {
            for (let iy = 0; iy < y; iy++) {
                for (let ix = 0; ix < x; ix++) {
                    // Map to centered coordinates [-scale, scale]
                    const px = ((ix / (x - 1)) * 2 - 1) * scale;
                    const py = ((iy / (y - 1)) * 2 - 1) * scale;
                    const pz = ((iz / (z - 1)) * 2 - 1) * scale;

                    let zx = px;
                    let zy = py;
                    let zz = pz;

                    let r = 0.0;
                    let iter = 0;

                    for (; iter < maxIter; iter++) {
                        r = Math.sqrt(zx * zx + zy * zy + zz * zz);
                        if (r > 2.0) break;

                        // Spherical coordinates for 3D power
                        const theta = Math.acos(zz / (r + 0.0001));
                        const phi = Math.atan2(zy, zx);

                        const zr = Math.pow(r, power);
                        const newTheta = theta * power;
                        const newPhi = phi * power;

                        zx = zr * Math.sin(newTheta) * Math.cos(newPhi) + cx;
                        zy = zr * Math.sin(newTheta) * Math.sin(newPhi) + cy;
                        zz = zr * Math.cos(newTheta) + cz;
                    }

                    // Interior points (didn't escape) get high magnitude
                    // This fills the volume better than boundary-only coloring
                    let mag = 0.0;
                    if (iter === maxIter) {
                        // Inside the set - use distance from origin as intensity
                        mag = 0.8 - r * 0.3;
                        mag = Math.max(0.2, Math.min(1.0, mag));
                    } else if (iter > 3) {
                        // Boundary region - smooth coloring
                        const smoothVal = iter - Math.log2(Math.log2(r + 1));
                        mag = (smoothVal / maxIter) * 0.6;
                    }

                    // Frequency-dependent boost (bass emphasis)
                    const freqPos = ix / x;
                    const freqBoost = 1.0 + (1.0 - freqPos) * 0.4;
                    mag *= freqBoost;
                    mag = Math.min(1.0, mag);

                    const phase = (iter / maxIter + px * 0.1) % 1.0;
                    const custom1 = (py / scale + 1) * 0.5;
                    const custom2 = (pz / scale + 1) * 0.5;

                    data[idx++] = mag;
                    data[idx++] = phase;
                    data[idx++] = custom1;
                    data[idx++] = custom2;
                }
            }
        }

        this.setData(data);
    }

    public generateMandelbulb(params: MandelbulbParams = defaultMandelbulbParams): void {
        const { x, y, z } = this.resolution;
        const totalVoxels = x * y * z;
        const data = new Float32Array(totalVoxels * 4);

        const { power, scale, iterations } = params;
        const maxIter = Math.round(iterations);

        let idx = 0;
        for (let iz = 0; iz < z; iz++) {
            for (let iy = 0; iy < y; iy++) {
                for (let ix = 0; ix < x; ix++) {
                    // Map to centered coordinates [-scale, scale]
                    const px = ((ix / (x - 1)) * 2 - 1) * scale;
                    const py = ((iy / (y - 1)) * 2 - 1) * scale;
                    const pz = ((iz / (z - 1)) * 2 - 1) * scale;

                    // Mandelbulb: z = z^n + c where c is the starting point
                    let zx = 0, zy = 0, zz = 0;
                    let r = 0.0;
                    let iter = 0;

                    for (; iter < maxIter; iter++) {
                        r = Math.sqrt(zx * zx + zy * zy + zz * zz);
                        if (r > 2.0) break;

                        // Spherical coordinates
                        const theta = Math.acos(zz / (r + 0.0001));
                        const phi = Math.atan2(zy, zx);

                        const zr = Math.pow(r, power);
                        const newTheta = theta * power;
                        const newPhi = phi * power;

                        // z^n + c
                        zx = zr * Math.sin(newTheta) * Math.cos(newPhi) + px;
                        zy = zr * Math.sin(newTheta) * Math.sin(newPhi) + py;
                        zz = zr * Math.cos(newTheta) + pz;
                    }

                    // Interior points get high magnitude
                    let mag = 0.0;
                    if (iter === maxIter) {
                        // Inside the Mandelbulb
                        mag = 0.9 - r * 0.2;
                        mag = Math.max(0.3, Math.min(1.0, mag));
                    } else if (iter > 2) {
                        // Boundary - iteration-based coloring
                        mag = (iter / maxIter) * 0.5;
                    }

                    // Frequency-dependent boost
                    const freqPos = ix / x;
                    const freqBoost = 1.0 + (1.0 - freqPos) * 0.4;
                    mag *= freqBoost;
                    mag = Math.min(1.0, mag);

                    const phase = (iter / maxIter);
                    const custom1 = (py / scale + 1) * 0.5;
                    const custom2 = (pz / scale + 1) * 0.5;

                    data[idx++] = mag;
                    data[idx++] = phase;
                    data[idx++] = custom1;
                    data[idx++] = custom2;
                }
            }
        }

        this.setData(data);
    }

    public generateMengerSponge(params: MengerParams = defaultMengerParams): void {
        const { x, y, z } = this.resolution;
        const totalVoxels = x * y * z;
        const data = new Float32Array(totalVoxels * 4);

        const { iterations, scale, holeSize } = params;
        const maxIter = Math.round(iterations);

        // Menger sponge: at each level, divide into 3x3x3 grid
        // Remove center cube of each face (cross pattern)
        const isInSponge = (px: number, py: number, pz: number): boolean => {
            // Map to [0, 1] range
            let ux = (px / scale + 1) * 0.5;
            let uy = (py / scale + 1) * 0.5;
            let uz = (pz / scale + 1) * 0.5;

            for (let i = 0; i < maxIter; i++) {
                // Scale up to [0, 3] and get position in 3x3x3 grid
                ux *= 3;
                uy *= 3;
                uz *= 3;

                const gx = Math.floor(ux) % 3;
                const gy = Math.floor(uy) % 3;
                const gz = Math.floor(uz) % 3;

                // Check if in hole (middle of any 2 axes)
                const midX = gx === 1;
                const midY = gy === 1;
                const midZ = gz === 1;

                // Hole if at least 2 coordinates are in the middle
                const holeCount = (midX ? 1 : 0) + (midY ? 1 : 0) + (midZ ? 1 : 0);
                if (holeCount >= 2) {
                    return false; // In a hole
                }

                // Continue to next subdivision level
                ux = ux % 1;
                uy = uy % 1;
                uz = uz % 1;
            }

            return true; // Solid
        };

        let idx = 0;
        for (let iz = 0; iz < z; iz++) {
            for (let iy = 0; iy < y; iy++) {
                for (let ix = 0; ix < x; ix++) {
                    // Map to centered coordinates [-scale, scale]
                    const px = ((ix / (x - 1)) * 2 - 1) * scale;
                    const py = ((iy / (y - 1)) * 2 - 1) * scale;
                    const pz = ((iz / (z - 1)) * 2 - 1) * scale;

                    const inSponge = isInSponge(px, py, pz);
                    let mag = inSponge ? 0.8 : 0.0;

                    // Add subtle variation based on position
                    if (inSponge) {
                        const detail = Math.sin(px * 10) * Math.sin(py * 10) * Math.sin(pz * 10);
                        mag += detail * 0.1;
                    }

                    // Frequency-dependent boost
                    const freqPos = ix / x;
                    const freqBoost = 1.0 + (1.0 - freqPos) * 0.3;
                    mag *= freqBoost;
                    mag = Math.max(0, Math.min(1.0, mag));

                    const phase = ((px + py + pz) / scale + 3) / 6 % 1.0;
                    const custom1 = (py / scale + 1) * 0.5;
                    const custom2 = (pz / scale + 1) * 0.5;

                    data[idx++] = mag;
                    data[idx++] = phase;
                    data[idx++] = custom1;
                    data[idx++] = custom2;
                }
            }
        }

        this.setData(data);
    }

    // Sine Plasma state for evolution
    private plasmaTime: number = 0;
    private plasmaParams: PlasmaParams = defaultPlasmaParams;

    public generateSinePlasma(timeOffset: number = 0, params: PlasmaParams = defaultPlasmaParams): void {
        this.plasmaParams = params;
        const { x, y, z } = this.resolution;
        const totalVoxels = x * y * z;
        const data = new Float32Array(totalVoxels * 4);

        const { frequency, complexity, contrast } = params;

        let idx = 0;
        for (let iz = 0; iz < z; iz++) {
            for (let iy = 0; iy < y; iy++) {
                for (let ix = 0; ix < x; ix++) {
                    // Normalized coordinates -1 to 1
                    const nx = (ix / x) * 2 - 1;
                    const ny = (iy / y) * 2 - 1;
                    const nz = (iz / z) * 2 - 1;

                    // Demo-scene style plasma: sum of sines
                    let v = 0.0;
                    const layers = Math.round(complexity);

                    // 1. Basic waves along axes
                    v += Math.sin(nx * frequency + timeOffset);
                    v += Math.sin(ny * frequency * 0.8 + timeOffset * 0.8);
                    v += Math.sin(nz * frequency * 0.6 + timeOffset * 1.2);

                    // 2. Diagonal wave (if complexity > 1)
                    if (layers > 1) {
                        v += Math.sin((nx + ny + nz) * frequency * 0.7 + timeOffset * 0.5);
                    }

                    // 3. Circular pattern (if complexity > 2)
                    if (layers > 2) {
                        const dist = Math.sqrt(nx * nx + ny * ny + nz * nz);
                        v += Math.sin(dist * frequency * 2 - timeOffset * 1.5);
                    }

                    // 4. Spiral twisting (if complexity > 3)
                    if (layers > 3) {
                        const angle = Math.atan2(ny, nx);
                        v += Math.sin(angle * 3.0 + nz * frequency + timeOffset);
                    }

                    // Normalize v roughly to 0..1
                    const maxV = 3 + Math.min(layers - 1, 3);
                    let mag = (v + maxV) / (maxV * 2);

                    // Add hard edges (classic demo effect)
                    mag = (Math.sin(mag * 10 * contrast) + 1.0) * 0.5;

                    // Apply contrast curve
                    mag = Math.pow(mag, contrast);

                    // Frequency-dependent boost
                    const freqPos = ix / x;
                    const freqBoost = 1.0 + (1.0 - freqPos) * 0.5;
                    mag *= freqBoost;

                    mag = Math.max(0.0, Math.min(0.95, mag));

                    const phase = (mag + timeOffset * 0.2) % 1.0;
                    const custom1 = (Math.sin(nx * Math.PI + timeOffset) + 1.0) * 0.5;
                    const custom2 = (Math.cos(ny * Math.PI + timeOffset) + 1.0) * 0.5;

                    data[idx++] = mag;
                    data[idx++] = phase;
                    data[idx++] = custom1;
                    data[idx++] = custom2;
                }
            }
        }

        this.setData(data);
    }

    public stepSinePlasma(): void {
        this.plasmaTime += 0.02;
        this.generateSinePlasma(this.plasmaTime, this.plasmaParams);
    }

    public clearData(): void {
        const { x, y, z } = this.resolution;
        const totalVoxels = x * y * z;
        const data = new Float32Array(totalVoxels * 4);
        data.fill(0.0);
        this.setData(data);
    }

    public sample(x: number, y: number, z: number): Float32Array {
        if (!this.data) return new Float32Array([0, 0, 0, 0]);

        const { x: w, y: h, z: d } = this.resolution;

        // Clamp coordinates to [0, 1]
        const u = Math.max(0, Math.min(1, x));
        const v = Math.max(0, Math.min(1, y));
        const w_coord = Math.max(0, Math.min(1, z));

        // Convert to grid coordinates
        const gx = u * (w - 1);
        const gy = v * (h - 1);
        const gz = w_coord * (d - 1);

        // Integer parts
        const x0 = Math.floor(gx);
        const y0 = Math.floor(gy);
        const z0 = Math.floor(gz);

        // Fractional parts
        const fx = gx - x0;
        const fy = gy - y0;
        const fz = gz - z0;

        // Next neighbors (clamp to max index)
        const x1 = Math.min(x0 + 1, w - 1);
        const y1 = Math.min(y0 + 1, h - 1);
        const z1 = Math.min(z0 + 1, d - 1);

        // Helper to get index
        const getIdx = (ix: number, iy: number, iz: number) => (iz * h * w + iy * w + ix) * 4;

        // Sample 8 corners
        const c000 = getIdx(x0, y0, z0);
        const c100 = getIdx(x1, y0, z0);
        const c010 = getIdx(x0, y1, z0);
        const c110 = getIdx(x1, y1, z0);
        const c001 = getIdx(x0, y0, z1);
        const c101 = getIdx(x1, y0, z1);
        const c011 = getIdx(x0, y1, z1);
        const c111 = getIdx(x1, y1, z1);

        const result = new Float32Array(4);

        // Trilinear interpolation for each channel
        for (let i = 0; i < 4; i++) {
            const v000 = this.data[c000 + i];
            const v100 = this.data[c100 + i];
            const v010 = this.data[c010 + i];
            const v110 = this.data[c110 + i];
            const v001 = this.data[c001 + i];
            const v101 = this.data[c101 + i];
            const v011 = this.data[c011 + i];
            const v111 = this.data[c111 + i];

            // Interpolate along x
            const c00 = v000 * (1 - fx) + v100 * fx;
            const c10 = v010 * (1 - fx) + v110 * fx;
            const c01 = v001 * (1 - fx) + v101 * fx;
            const c11 = v011 * (1 - fx) + v111 * fx;

            // Interpolate along y
            const c0 = c00 * (1 - fy) + c10 * fy;
            const c1 = c01 * (1 - fy) + c11 * fy;

            // Interpolate along z
            result[i] = c0 * (1 - fz) + c1 * fz;
        }

        return result;
    }

    public updateResolution(resolution: VolumeResolution): void {
        this.resolution = resolution;
        this.data = null; // Force reallocation
        this.initialize();
    }

    public getResolution(): VolumeResolution {
        return { ...this.resolution };
    }

    public getTexture(): WebGLTexture | null {
        return this.texture;
    }

    public destroy(): void {
        if (this.texture) {
            this.ctx.gl.deleteTexture(this.texture);
            this.texture = null;
        }
        this.data = null;
        this.gameOfLifeState = null;
        this.gameOfLifeBuffer = null;
    }

    // ===== 3D Game of Life =====
    private golParams: GameOfLifeParams = defaultGameOfLifeParams;

    public initGameOfLife(params: GameOfLifeParams = defaultGameOfLifeParams): void {
        this.golParams = params;
        const { x, y, z } = this.resolution;
        const totalCells = x * y * z;

        // Initialize state arrays
        this.gameOfLifeState = new Uint8Array(totalCells);
        this.gameOfLifeBuffer = new Uint8Array(totalCells);

        // Fill with random blobs based on density parameter
        for (let i = 0; i < totalCells; i++) {
            this.gameOfLifeState[i] = Math.random() < params.density ? 1 : 0;
        }

        // Convert initial state to spectral data
        this.gameOfLifeToSpectral();
    }

    public stepGameOfLife(): void {
        if (!this.gameOfLifeState || !this.gameOfLifeBuffer) return;

        const { x, y, z } = this.resolution;
        const { birthMin, surviveMin } = this.golParams;

        // Helper to get cell index with wrapping (toroidal topology)
        const getIdx = (ix: number, iy: number, iz: number): number => {
            const wx = ((ix % x) + x) % x;
            const wy = ((iy % y) + y) % y;
            const wz = ((iz % z) + z) % z;
            return wz * y * x + wy * x + wx;
        };

        // Count neighbors for each cell
        for (let iz = 0; iz < z; iz++) {
            for (let iy = 0; iy < y; iy++) {
                for (let ix = 0; ix < x; ix++) {
                    const idx = getIdx(ix, iy, iz);
                    let neighbors = 0;

                    // Check all 26 neighbors (3x3x3 - 1)
                    for (let dz = -1; dz <= 1; dz++) {
                        for (let dy = -1; dy <= 1; dy++) {
                            for (let dx = -1; dx <= 1; dx++) {
                                if (dx === 0 && dy === 0 && dz === 0) continue;
                                const nIdx = getIdx(ix + dx, iy + dy, iz + dz);
                                neighbors += this.gameOfLifeState![nIdx];
                            }
                        }
                    }

                    // Configurable 3D Game of Life rules
                    // Survive if neighbors >= surviveMin and <= surviveMin + 1
                    // Born if neighbors === birthMin
                    const alive = this.gameOfLifeState[idx] === 1;

                    if (alive) {
                        this.gameOfLifeBuffer[idx] = (neighbors >= surviveMin && neighbors <= surviveMin + 1) ? 1 : 0;
                    } else {
                        this.gameOfLifeBuffer[idx] = (neighbors === birthMin) ? 1 : 0;
                    }
                }
            }
        }

        // Swap buffers
        const temp = this.gameOfLifeState;
        this.gameOfLifeState = this.gameOfLifeBuffer;
        this.gameOfLifeBuffer = temp;

        // Update spectral data
        this.gameOfLifeToSpectral();
    }

    private gameOfLifeToSpectral(): void {
        if (!this.gameOfLifeState) return;

        const { x, y, z } = this.resolution;
        const totalVoxels = x * y * z;
        const data = new Float32Array(totalVoxels * 4);

        let idx = 0;
        for (let iz = 0; iz < z; iz++) {
            for (let iy = 0; iy < y; iy++) {
                for (let ix = 0; ix < x; ix++) {
                    const cellIdx = iz * y * x + iy * x + ix;
                    const alive = this.gameOfLifeState[cellIdx];

                    // Convert to spectral data
                    const nx = (ix / x) * 2 - 1;
                    const ny = (iy / y) * 2 - 1;
                    const nz = (iz / z) * 2 - 1;

                    let mag = alive ? 0.8 : 0.0;

                    // Boost low frequencies
                    if (alive) {
                        const freqBoost = 1.0 + (1.0 - (nx + 1) * 0.5) * 0.4;
                        mag *= freqBoost;
                    }

                    // Phase varies by position
                    const phase = (ix / x + iy / y + iz / z) / 3.0;
                    const custom1 = (ny + 1) * 0.5;
                    const custom2 = (nz + 1) * 0.5;

                    data[idx++] = mag;
                    data[idx++] = phase;
                    data[idx++] = custom1;
                    data[idx++] = custom2;
                }
            }
        }

        this.setData(data);
    }
}
