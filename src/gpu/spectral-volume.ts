import { WebGLContext } from './context';
import { VolumeResolution } from '../types';

// 3D Spectral Volume - GPU storage for RGBA spectral data
// Each voxel stores: R=Magnitude, G=Phase, B=Pan, A=Width

export class SpectralVolume {
    private ctx: WebGLContext;
    private texture: WebGLTexture | null = null;
    private resolution: VolumeResolution;

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
        const data = new Float32Array(totalVoxels * 4); // RGBA

        // Initialize with zeros (empty spectral data)
        // Could initialize with test data here later
        data.fill(0.0);

        gl.texImage3D(
            gl.TEXTURE_3D,
            0,                    // mip level
            gl.RGBA32F,           // internal format
            x, y, z,              // dimensions
            0,                    // border (must be 0)
            gl.RGBA,              // format
            gl.FLOAT,             // type
            data                  // data
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

    public updateResolution(resolution: VolumeResolution): void {
        this.resolution = resolution;
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
    }
}
