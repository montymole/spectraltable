import { PlaneType } from '../types';

// Generate reading path plane geometry with different algorithms

export class ReadingPathGeometry {
    // Helper to calculate 3D vertex position for generic UV coordinates
    // u: [-1, 1] (usually frequency axis)
    // v: [-1, 1] (usually time/history axis)
    private static calculateVertex(u: number, v: number, planeType: PlaneType, phase: number = 0): { x: number, y: number, z: number } {
        // Default flat plane
        let x = u;
        let z = v;
        let y = 0;

        switch (planeType) {
            case PlaneType.FLAT:
                y = 0;
                break;

            case PlaneType.SINCOS:
                // Sine and cosine modulation with phase
                y = 0.3 * (Math.sin((u + phase) * Math.PI * 2) * Math.cos((v + phase) * Math.PI * 2));
                break;

            case PlaneType.WAVE:
                // Wave pattern
                y = 0.2 * Math.sin((u + v + phase) * Math.PI * 3);
                break;

            case PlaneType.RIPPLE:
                // Circular ripple from center
                const dist = Math.sqrt(u * u + v * v);
                y = 0.25 * Math.sin((dist - phase) * Math.PI * 4) / (1 + dist * 2);
                break;

            case PlaneType.TUBE:
                // Tube: Circular curve on Y axis phase adjusts radius
                // We wrap the history (v) around the tube? Or the frequency (u)?
                // Interpretation: Reading line (u) is flat line. History (v) wraps around X axis.
                // y = cos(theta) * radius, z = sin(theta) * radius
                // "shape phase adjusts radius" -> Let's map phase to radius modulation? 
                // Actually TODO says "shape phase adjusts radius".
                // Let's make radius dynamic.
                const tubeRadius = 0.5 + phase * 0.2;
                // Map v (history) to angle. v is -1 to 1.
                const tubeAngle = v * Math.PI; // -PI to PI (half cylinder? or full?)
                // If we want full cylinder, maybe v * PI.
                // Formula: y = cos(theta) * radius, z = sin(theta) * radius.
                // x remains u.
                y = Math.cos(tubeAngle) * tubeRadius;
                z = Math.sin(tubeAngle) * tubeRadius;
                x = u;
                break;

            case PlaneType.BELL:
                // Bell: Gaussian curve on center.
                // "shape phase adjusts magnitude"
                const sigma = 0.2;
                // bell curve on U (frequency axis)
                const bellMag = 0.5 + phase * 0.5;
                // exp(-pow(x, 2) / sigma) where x is u
                y = bellMag * Math.exp(-Math.pow(u, 2) / sigma);
                x = u;
                z = v;
                break;

            case PlaneType.SPIRAL:
                // Spiral: Z-axis spiral from center outward
                // "x = t * cos(t * turns), y = t * sin(t * turns)"
                // Here "t" is history (v). 
                // Remap v from [-1, 1] to [0, 1] for spiral growth? Or just use v.
                // Let's use t = (v + 1) * 0.5 to go from 0 to 1? Or just magnitude of v?
                // "center outward" implies start at 0.
                const t = (v + 1); // 0 to 2
                const turns = 2 + phase * 2; // "shape adjusts rotation count"
                // Spiral in X-Z plane? (The prompt says "Z-axis spiral", usually implies spiral AROUND Z).
                // But formula says x = ..., y = ... (implies spiral in XY).
                // Let's assume spiral in XY plane.
                // Where does u go? Making it "ribbon" height (Z axis)
                x = t * 0.5 * Math.cos(t * turns * Math.PI);
                y = t * 0.5 * Math.sin(t * turns * Math.PI);
                z = u * 0.5; // Thickness of the spiral ribbon
                break;

            case PlaneType.SPRING:
                // Spring: Y-axis spiral with height variation
                // "helix: x = cos(t * turns), y = t * height, z = sin(t * turns)"
                // Helix around Y axis.
                // t comes from v.
                // u adds thickness (radial).
                const springTurns = 2; // Fixed turns? Or existing phase?
                // "shape adjusts height" -> scaling of Y
                const heightScale = 1.0 + phase;
                const springT = v * Math.PI * springTurns;
                const springR = 0.5 + u * 0.2; // Width of the ribbon
                x = Math.cos(springT) * springR;
                z = Math.sin(springT) * springR;
                y = v * heightScale;
                break;
        }

        return { x, y, z };
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
                const u = (ix / (gridSize - 1)) * 2 - 1;
                const v = (iz / (gridSize - 1)) * 2 - 1;

                const vert = this.calculateVertex(u, v, planeType, phase);

                positions.push(vert.x, vert.y, vert.z);
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
        const v = Math.max(-1, Math.min(1, currentZ));

        for (let i = 0; i < resolutionX; i++) {
            const u = (i / (resolutionX - 1)) * 2 - 1;
            const vert = this.calculateVertex(u, v, planeType, phase);

            positions.push(vert.x, vert.y, vert.z);
        }

        return new Float32Array(positions);
    }
}
