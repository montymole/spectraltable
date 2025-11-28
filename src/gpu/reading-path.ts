import { PlaneType } from '../types';

// Generate reading path plane geometry with different algorithms

export class ReadingPathGeometry {
    // Generate a grid-based plane with various height modulation functions
    public static generatePlane(
        planeType: PlaneType,
        gridSize: number = 32
    ): { positions: Float32Array; indices: Uint16Array } {
        const positions: number[] = [];
        const indices: number[] = [];

        // Generate grid vertices
        for (let iz = 0; iz < gridSize; iz++) {
            for (let ix = 0; ix < gridSize; ix++) {
                // Normalize to [-1, 1]
                const x = (ix / (gridSize - 1)) * 2 - 1;
                const z = (iz / (gridSize - 1)) * 2 - 1;

                // Calculate Y based on plane type
                let y = 0;
                switch (planeType) {
                    case PlaneType.FLAT:
                        y = 0;
                        break;

                    case PlaneType.SINCOS:
                        // Sine and cosine modulation
                        y = 0.3 * (Math.sin(x * Math.PI * 2) * Math.cos(z * Math.PI * 2));
                        break;

                    case PlaneType.WAVE:
                        // Wave pattern
                        y = 0.2 * Math.sin((x + z) * Math.PI * 3);
                        break;

                    case PlaneType.RIPPLE:
                        // Circular ripple from center
                        const dist = Math.sqrt(x * x + z * z);
                        y = 0.25 * Math.sin(dist * Math.PI * 4) / (1 + dist * 2);
                        break;
                }

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

    // Generate a simple line for reading position indicator
    public static generateReadingLine(): Float32Array {
        // Vertical line from bottom to top of cube
        return new Float32Array([
            0, -1, 0,  // Bottom
            0, 1, 0,  // Top
        ]);
    }
}
