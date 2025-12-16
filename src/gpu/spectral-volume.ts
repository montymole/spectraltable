import { WebGLContext } from './context';
import { VolumeResolution } from '../types';

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

    public generate3DJulia(): void {
        const { x, y, z } = this.resolution;
        const totalVoxels = x * y * z;
        const data = new Float32Array(totalVoxels * 4);

        // 3D Julia Set - using parameters that create a sparser structure
        const maxIter = 12;  // More iterations for better detail
        const power = 8.0;
        const scale = 2.2;   // Larger scale to sample outside dense core

        let idx = 0;
        for (let iz = 0; iz < z; iz++) {
            for (let iy = 0; iy < y; iy++) {
                for (let ix = 0; ix < x; ix++) {
                    const nx = (ix / x) * 2 - 1;
                    const ny = (iy / y) * 2 - 1;
                    const nz = (iz / z) * 2 - 1;

                    const shiftedX = (nx + 1) * scale - 1.0;
                    const shiftedY = ny * scale;
                    const shiftedZ = nz * scale;

                    // Different C constant for sparser region
                    const cx = -0.2;
                    const cy = 0.6;
                    const cz = 0.2;

                    let zx = shiftedX;
                    let zy = shiftedY;
                    let zz = shiftedZ;

                    let r = 0.0;
                    let iter = 0;

                    for (; iter < maxIter; iter++) {
                        r = Math.sqrt(zx * zx + zy * zy + zz * zz);
                        if (r > 2.0) break;  // Lower threshold

                        let theta = Math.acos(zz / r);
                        let phi = Math.atan2(zy, zx);

                        const zr = Math.pow(r, power);
                        theta = theta * power;
                        phi = phi * power;

                        zx = zr * Math.sin(theta) * Math.cos(phi);
                        zy = zr * Math.sin(theta) * Math.sin(phi);
                        zz = zr * Math.cos(theta);

                        zx += cx;
                        zy += cy;
                        zz += cz;
                    }

                    let mag = 0.0;

                    // Only the boundary region (escaped points) will have magnitude
                    if (iter < maxIter && iter > 2) {
                        const smoothIter = iter + 1 - Math.log(Math.log(r)) / Math.log(2);
                        mag = Math.max(0, 1.0 - (smoothIter / maxIter));

                        // Apply power curve to create gaps (more aggressive)
                        mag = Math.pow(mag, 2.5);

                        // Apply threshold - only keep stronger values
                        if (mag < 0.25) {
                            mag = 0.0;
                        } else {
                            // Rescale after threshold
                            mag = (mag - 0.25) / 0.75;
                        }
                    }

                    // Boost low frequencies slightly
                    const freqBoost = 1.0 + (1.0 - (nx + 1) * 0.5) * 0.3;
                    mag *= freqBoost;
                    mag = Math.min(1.0, mag);

                    const phase = (iter / maxIter + nx * 0.1) % 1.0;
                    const custom1 = (ny + 1) * 0.5;  // Generic value (Y-based)
                    const custom2 = (nz + 1) * 0.5;  // Generic value (Z-based)

                    data[idx++] = mag;
                    data[idx++] = phase;
                    data[idx++] = custom1;
                    data[idx++] = custom2;
                }
            }
        }

        this.setData(data);
    }

    public generateMandelbulb(): void {
        const { x, y, z } = this.resolution;
        const totalVoxels = x * y * z;
        const data = new Float32Array(totalVoxels * 4);

        const maxIter = 12;
        const power = 8.0;

        let idx = 0;
        for (let iz = 0; iz < z; iz++) {
            for (let iy = 0; iy < y; iy++) {
                for (let ix = 0; ix < x; ix++) {
                    const nx = (ix / x) * 2 - 1;
                    const ny = (iy / y) * 2 - 1;
                    const nz = (iz / z) * 2 - 1;

                    // Shift to low freq corner
                    const px = (nx + 1) * 1.2 - 1.0;
                    const py = ny * 1.2;
                    const pz = nz * 1.2;

                    let zx = 0, zy = 0, zz = 0;
                    let dr = 1.0;
                    let r = 0.0;
                    let iter = 0;

                    for (; iter < maxIter; iter++) {
                        r = Math.sqrt(zx * zx + zy * zy + zz * zz);
                        if (r > 2.0) break;

                        let theta = Math.acos(zz / r);
                        let phi = Math.atan2(zy, zx);
                        dr = Math.pow(r, power - 1.0) * power * dr + 1.0;

                        const zr = Math.pow(r, power);
                        theta = theta * power;
                        phi = phi * power;

                        zx = zr * Math.sin(theta) * Math.cos(phi) + px;
                        zy = zr * Math.sin(theta) * Math.sin(phi) + py;
                        zz = zr * Math.cos(theta) + pz;
                    }

                    let mag = 0.0;
                    if (iter < maxIter) {
                        const dist = 0.5 * Math.log(r) * r / dr;
                        mag = Math.max(0, 1.0 - dist * 8.0);
                    }

                    // Apply gamma to create gaps
                    mag = Math.pow(mag, 1.8);

                    const freqBoost = 1.0 + (1.0 - (nx + 1) * 0.5) * 0.4;
                    mag *= freqBoost;

                    const phase = (iter / maxIter);
                    const custom1 = (ny + 1) * 0.5;  // Generic value (Y-based)
                    const custom2 = (nz + 1) * 0.5;  // Generic value (Z-based)

                    data[idx++] = mag;
                    data[idx++] = phase;
                    data[idx++] = custom1;
                    data[idx++] = custom2;
                }
            }
        }

        this.setData(data);
    }

    public generateMengerSponge(): void {
        const { x, y, z } = this.resolution;
        const totalVoxels = x * y * z;
        const data = new Float32Array(totalVoxels * 4);

        let idx = 0;
        for (let iz = 0; iz < z; iz++) {
            for (let iy = 0; iy < y; iy++) {
                for (let ix = 0; ix < x; ix++) {
                    const nx = (ix / x) * 2 - 1;
                    const ny = (iy / y) * 2 - 1;
                    const nz = (iz / z) * 2 - 1;

                    // Shift to low freq
                    let px = (nx + 1) * 1.5;
                    let py = (ny + 1) * 1.5;
                    let pz = (nz + 1) * 1.5;

                    let inSponge = true;
                    let scale = 1.0;

                    // Iterate sponge subdivisions
                    for (let i = 0; i < 4; i++) {
                        px = Math.abs(px);
                        py = Math.abs(py);
                        pz = Math.abs(pz);

                        // Check if in center third (hole)
                        if (px > scale / 3 && px < 2 * scale / 3 &&
                            py > scale / 3 && py < 2 * scale / 3) {
                            inSponge = false;
                            break;
                        }
                        if (py > scale / 3 && py < 2 * scale / 3 &&
                            pz > scale / 3 && pz < 2 * scale / 3) {
                            inSponge = false;
                            break;
                        }
                        if (pz > scale / 3 && pz < 2 * scale / 3 &&
                            px > scale / 3 && px < 2 * scale / 3) {
                            inSponge = false;
                            break;
                        }

                        px = px * 3.0 % scale;
                        py = py * 3.0 % scale;
                        pz = pz * 3.0 % scale;
                        scale /= 3.0;
                    }

                    let mag = inSponge ? 0.7 : 0.0;

                    // Add surface detail
                    const dist = Math.sqrt(px * px + py * py + pz * pz);
                    mag *= 0.8 + 0.2 * Math.sin(dist * 20);

                    const freqBoost = 1.0 + (1.0 - (nx + 1) * 0.5) * 0.3;
                    mag *= freqBoost;

                    const phase = (px + py + pz) % 1.0;
                    const custom1 = (ny + 1) * 0.5;  // Generic value (Y-based)
                    const custom2 = (nz + 1) * 0.5;  // Generic value (Z-based)

                    data[idx++] = mag;
                    data[idx++] = phase;
                    data[idx++] = custom1;
                    data[idx++] = custom2;
                }
            }
        }

        this.setData(data);
    }

    // Perlin noise state for evolution
    private perlinNoiseTime: number = 0;

    public generatePerlinNoise(timeOffset: number = 0): void {
        const { x, y, z } = this.resolution;
        const totalVoxels = x * y * z;
        const data = new Float32Array(totalVoxels * 4);

        // Noise function for cloud-like blobs
        const noise = (x: number, y: number, z: number): number => {
            // Pseudo-random hash
            const hash = (x: number, y: number, z: number) => {
                let h = (x * 374761393 + y * 668265263 + z * 1610612741) >>> 0;
                h = (h ^ (h >>> 13)) * 1274126177 >>> 0;
                return (h ^ (h >>> 16)) / 4294967296;
            };

            const fx = Math.floor(x);
            const fy = Math.floor(y);
            const fz = Math.floor(z);

            const tx = x - fx;
            const ty = y - fy;
            const tz = z - fz;

            // Smooth interpolation
            const sx = tx * tx * (3 - 2 * tx);
            const sy = ty * ty * (3 - 2 * ty);
            const sz = tz * tz * (3 - 2 * tz);

            // 3D interpolation
            const c000 = hash(fx, fy, fz);
            const c100 = hash(fx + 1, fy, fz);
            const c010 = hash(fx, fy + 1, fz);
            const c110 = hash(fx + 1, fy + 1, fz);
            const c001 = hash(fx, fy, fz + 1);
            const c101 = hash(fx + 1, fy, fz + 1);
            const c011 = hash(fx, fy + 1, fz + 1);
            const c111 = hash(fx + 1, fy + 1, fz + 1);

            const c00 = c000 * (1 - sx) + c100 * sx;
            const c10 = c010 * (1 - sx) + c110 * sx;
            const c01 = c001 * (1 - sx) + c101 * sx;
            const c11 = c011 * (1 - sx) + c111 * sx;

            const c0 = c00 * (1 - sy) + c10 * sy;
            const c1 = c01 * (1 - sy) + c11 * sy;

            return c0 * (1 - sz) + c1 * sz;
        };

        // Temporary buffer for generating sparse dots
        const tempData = new Float32Array(totalVoxels);
        const blurred = new Float32Array(totalVoxels);

        // First pass: Generate sparse "hot spots" using noise
        let idx = 0;
        for (let iz = 0; iz < z; iz++) {
            for (let iy = 0; iy < y; iy++) {
                for (let ix = 0; ix < x; ix++) {
                    const nx = (ix / x) * 2 - 1;
                    const ny = (iy / y) * 2 - 1;
                    const nz = (iz / z) * 2 - 1;

                    // Smaller scale for tighter features
                    const scale = 1.2;
                    const px = (nx + 1) * scale + timeOffset * 0.3;
                    const py = (ny + 1) * scale + timeOffset * 0.2;
                    const pz = (nz + 1) * scale + timeOffset * 0.1;

                    // High frequency noise for sparse dots
                    let mag = 0;
                    mag += noise(px * 2.0, py * 2.0, pz * 2.0) * 0.4;
                    mag += noise(px * 4.0, py * 4.0, pz * 4.0) * 0.3;
                    mag += noise(px * 8.0, py * 8.0, pz * 8.0) * 0.3;

                    // Create sparse hot spots - only keep strong peaks
                    if (mag > 0.65) {
                        // This is a hot spot - boost it significantly
                        mag = 0.5 + (mag - 0.65) * 2.0;  // Map 0.65-1.0 to 0.5-1.2
                        mag = Math.min(1.0, mag);
                    } else {
                        // Everything else becomes very weak or zero
                        mag = Math.pow(mag / 0.65, 3.0) * 0.2;  // Compress to 0-0.2 range
                    }

                    tempData[idx++] = mag;
                }
            }
        }

        // Second pass: Blur to create halos around hot spots
        idx = 0;
        for (let iz = 0; iz < z; iz++) {
            for (let iy = 0; iy < y; iy++) {
                for (let ix = 0; ix < x; ix++) {
                    let sum = 0;
                    let count = 0;

                    // 3x3x3 blur
                    for (let dz = -1; dz <= 1; dz++) {
                        for (let dy = -1; dy <= 1; dy++) {
                            for (let dx = -1; dx <= 1; dx++) {
                                const sx = ix + dx;
                                const sy = iy + dy;
                                const sz = iz + dz;

                                if (sx >= 0 && sx < x && sy >= 0 && sy < y && sz >= 0 && sz < z) {
                                    const sampleIdx = sz * y * x + sy * x + sx;
                                    const weight = (dx === 0 && dy === 0 && dz === 0) ? 8.0 : 1.0;
                                    sum += tempData[sampleIdx] * weight;
                                    count += weight;
                                }
                            }
                        }
                    }

                    blurred[idx++] = sum / count;
                }
            }
        }

        // Third pass: Second blur for very soft edges
        idx = 0;
        for (let iz = 0; iz < z; iz++) {
            for (let iy = 0; iy < y; iy++) {
                for (let ix = 0; ix < x; ix++) {
                    let sum = 0;
                    let count = 0;

                    for (let dz = -1; dz <= 1; dz++) {
                        for (let dy = -1; dy <= 1; dy++) {
                            for (let dx = -1; dx <= 1; dx++) {
                                const sx = ix + dx;
                                const sy = iy + dy;
                                const sz = iz + dz;

                                if (sx >= 0 && sx < x && sy >= 0 && sy < y && sz >= 0 && sz < z) {
                                    const sampleIdx = sz * y * x + sy * x + sx;
                                    const weight = (dx === 0 && dy === 0 && dz === 0) ? 6.0 : 1.0;
                                    sum += blurred[sampleIdx] * weight;
                                    count += weight;
                                }
                            }
                        }
                    }

                    tempData[idx++] = sum / count;
                }
            }
        }

        // Fourth pass: Final processing
        idx = 0;
        for (let iz = 0; iz < z; iz++) {
            for (let iy = 0; iy < y; iy++) {
                for (let ix = 0; ix < x; ix++) {
                    const nx = (ix / x) * 2 - 1;
                    const ny = (iy / y) * 2 - 1;
                    const nz = (iz / z) * 2 - 1;

                    let mag = tempData[idx];

                    // Gentle threshold to remove near-zero values
                    if (mag < 0.08) {
                        mag = 0.0;
                    } else {
                        // Scale to usable range
                        mag = (mag - 0.08) * 1.1;  // Slight boost
                    }

                    // Boost low frequencies moderately
                    const freqBoost = 1.0 + (1.0 - (nx + 1) * 0.5) * 0.5;
                    mag *= freqBoost;

                    // Cap at reasonable level for audio
                    mag = Math.min(0.7, mag);

                    // Phase varies spatially for interesting interference patterns
                    const phase = (ix / x * 0.3 + iy / y * 0.4 + iz / z * 0.3 + timeOffset * 0.1) % 1.0;
                    const custom1 = (ny + 1) * 0.5;
                    const custom2 = (nz + 1) * 0.5;

                    data[idx * 4] = mag;
                    data[idx * 4 + 1] = phase;
                    data[idx * 4 + 2] = custom1;
                    data[idx * 4 + 3] = custom2;
                    idx++;
                }
            }
        }

        this.setData(data);
    }

    public stepPerlinNoise(): void {
        this.perlinNoiseTime += 0.05;  // Evolution speed
        this.generatePerlinNoise(this.perlinNoiseTime);
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

    public initGameOfLife(): void {
        const { x, y, z } = this.resolution;
        const totalCells = x * y * z;

        // Initialize state arrays
        this.gameOfLifeState = new Uint8Array(totalCells);
        this.gameOfLifeBuffer = new Uint8Array(totalCells);

        // Fill with random blobs (30% density)
        for (let i = 0; i < totalCells; i++) {
            this.gameOfLifeState[i] = Math.random() < 0.3 ? 1 : 0;
        }

        // Convert initial state to spectral data
        this.gameOfLifeToSpectral();
    }

    public stepGameOfLife(): void {
        if (!this.gameOfLifeState || !this.gameOfLifeBuffer) return;

        const { x, y, z } = this.resolution;

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

                    // 3D Game of Life rule: 4-5-5
                    // Survive if 4 or 5 neighbors
                    // Born if exactly 5 neighbors
                    const alive = this.gameOfLifeState[idx] === 1;

                    if (alive) {
                        this.gameOfLifeBuffer[idx] = (neighbors === 4 || neighbors === 5) ? 1 : 0;
                    } else {
                        this.gameOfLifeBuffer[idx] = (neighbors === 5) ? 1 : 0;
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
