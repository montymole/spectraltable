import { WebGLContext } from './context';
import { VolumeResolution } from '../types';

// 3D Spectral Volume - GPU storage for RGBA spectral data
// Each voxel stores: R=Magnitude, G=Phase, B=Pan, A=Width

export class SpectralVolume {
    private ctx: WebGLContext;
    private texture: WebGLTexture | null = null;
    private resolution: VolumeResolution;

    private data: Float32Array | null = null;

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

    public generateCloudData(): void {
        const { x, y, z } = this.resolution;
        const totalVoxels = x * y * z;
        const data = new Float32Array(totalVoxels * 4);

        // Mandelbulb / Julia-like parameters
        // We'll use a simplified iterative function to generate fractal-like noise
        // Seed is Y axis as requested (varying structure along Y)

        const maxIter = 5;
        const power = 8.0;

        let idx = 0;
        for (let iz = 0; iz < z; iz++) {
            for (let iy = 0; iy < y; iy++) {
                for (let ix = 0; ix < x; ix++) {
                    // Normalize coordinates to [-1, 1]
                    const nx = (ix / x) * 2 - 1;
                    const ny = (iy / y) * 2 - 1;
                    const nz = (iz / z) * 2 - 1;

                    // Julia set seed varies with Y (or just use position)
                    // Let's make a 3D Julia set where C varies slightly or is fixed
                    // To make it "cloudy" and less chaotic, we mix in some noise or smooth functions

                    // Let's try a hybrid: Smooth noise modulated by fractal iteration
                    // Or just a 3D noise function. 
                    // User asked for "Julia mandelbrot in 3d where seed is y axis"
                    // This implies C = f(y)

                    const cx = 0.0;
                    const cy = ny * 0.8; // Seed varies with Y
                    const cz = 0.0;

                    let zx = nx;
                    let zy = ny; // We use Y as spatial dimension too
                    let zz = nz;

                    let dr = 1.0;
                    let r = 0.0;
                    let iter = 0;

                    // Simple Julia iteration (z^2 + c for quaternions is complex, let's use a simpler 3D folding)
                    // Or just standard Mandelbulb logic but with C varying

                    for (; iter < maxIter; iter++) {
                        r = Math.sqrt(zx * zx + zy * zy + zz * zz);
                        if (r > 2.0) break;

                        // Convert to polar
                        let theta = Math.acos(zz / r);
                        let phi = Math.atan2(zy, zx);
                        dr = Math.pow(r, power - 1.0) * power * dr + 1.0;

                        // Scale and rotate
                        const zr = Math.pow(r, power);
                        theta = theta * power;
                        phi = phi * power;

                        // Convert back to cartesian
                        zx = zr * Math.sin(theta) * Math.cos(phi);
                        zy = zr * Math.sin(theta) * Math.sin(phi);
                        zz = zr * Math.cos(theta);

                        // Add C (Julia)
                        zx += cx;
                        zy += cy;
                        zz += cz;
                    }

                    // Distance estimator-ish or just iteration count
                    // Smooth coloring
                    // const val = iter / maxIter;
                    // Let's use the final distance or trap

                    // Map to 0..1 magnitude
                    // Invert: points inside set are dense
                    let mag = 0.0;
                    if (r < 2.0) {
                        mag = 1.0; // Inside
                    } else {
                        // Smooth falloff
                        mag = Math.max(0, 1.0 - (r - 2.0) * 0.5);
                    }

                    // Add some sine modulation to make it less blocky and more "spectral"
                    mag *= 0.5 + 0.5 * Math.sin(nx * 10 + ny * 10);

                    // Phase (G) - varied
                    const phase = (iter / maxIter);

                    // Pan (B) - based on X
                    const pan = (nx + 1) * 0.5; // 0..1

                    // Width (A) - based on Z
                    const width = (nz + 1) * 0.5;

                    data[idx++] = mag;      // R: Magnitude
                    data[idx++] = phase;    // G: Phase
                    data[idx++] = pan;      // B: Pan
                    data[idx++] = width;    // A: Width
                }
            }
        }

        this.setData(data);
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
    }
}
