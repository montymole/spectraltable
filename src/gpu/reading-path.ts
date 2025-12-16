import { PlaneType } from '../types';

// Generate reading path plane geometry with different algorithms

export class ReadingPathGeometry {
    // Helper to calculate Y height for a given X, Z and plane type with phase
    private static calculateHeight(x: number, z: number, planeType: PlaneType, phase: number = 0): number {
        switch (planeType) {
            case PlaneType.FLAT:
                return 0;

            case PlaneType.SINCOS:
                // Sine and cosine modulation with phase
                // Add phase to create movement
                return 0.3 * (Math.sin((x + phase) * Math.PI * 2) * Math.cos((z + phase) * Math.PI * 2));

            case PlaneType.WAVE:
                // Wave pattern
                return 0.2 * Math.sin((x + z + phase) * Math.PI * 3);

            case PlaneType.RIPPLE:
                // Circular ripple from center
                const dist = Math.sqrt(x * x + z * z);
                // Invert phase for outward ripple effect
                return 0.25 * Math.sin((dist - phase) * Math.PI * 4) / (1 + dist * 2);

            default:
                return 0;
        }
    }

    // Generate a grid-based plane with various height modulation functions
    public static generatePlane(
        planeType: PlaneType,
        gridSize: number = 32,
        phase: number = 0
    ): { positions: Float32Array; indices: Uint16Array } {
        const positions: number[] = [];
        const indices: number[] = [];

        // Generate grid vertices
        for (let iz = 0; iz < gridSize; iz++) {
            for (let ix = 0; ix < gridSize; ix++) {
                // Normalize to [-1, 1]
                const x = (ix / (gridSize - 1)) * 2 - 1;
                const z = (iz / (gridSize - 1)) * 2 - 1;

                const y = this.calculateHeight(x, z, planeType, phase);

                positions.push(x, y, z);
            }
        }

        // Generate triangle indices for wireframe edges
        for (let iz = 0; iz < gridSize - 1; iz++) {
            for (let ix = 0; ix < gridSize - 1; ix++) {
                const topLeft = iz * gridSize + ix;
                const topRight = topLeft + 1;
                const bottomLeft = (iz + 1) * gridSize + ix;
                const bottomRight = bottomLeft + 1;

                // Horizontal lines
                if (ix < gridSize - 1) {
                    indices.push(topLeft, topRight);
                    indices.push(bottomLeft, bottomRight);
                }

                // Vertical lines
                if (iz < gridSize - 1) {
                    indices.push(topLeft, bottomLeft);
                    indices.push(topRight, bottomRight);
                }
            }
        }

        return {
            positions: new Float32Array(positions),
            indices: new Uint16Array(indices),
        };
    }

    // Generate the reading line that follows the plane contour
    // This line represents the current spectral slice being read
    // It spans X [-1, 1] at a specific Z (relative to plane)
    public static generateReadingLine(
        planeType: PlaneType,
        resolutionX: number,
        currentZ: number = 0, // Z position relative to plane space [-1, 1]
        phase: number = 0
    ): Float32Array {
        const positions: number[] = [];

        // Ensure we stay within bounds
        const z = Math.max(-1, Math.min(1, currentZ));

        for (let i = 0; i < resolutionX; i++) {
            const x = (i / (resolutionX - 1)) * 2 - 1;
            const y = this.calculateHeight(x, z, planeType, phase);

            positions.push(x, y, z);
        }

        return new Float32Array(positions);
    }
}
