// Type definitions for Spectra Table Synthesis

export interface Vec3 {
    x: number;
    y: number;
    z: number;
}

export interface ReadingPathState {
    position: Vec3;  // Current XYZ position in spectral cube
    speed: number;    // Scrub rate (0-1)
}

export interface SpatialState {
    stereoSpread: number;  // Width of stereo field (0-1)
}

export interface SpectralSlice {
    magnitude: Float32Array;  // Frequency magnitudes
    phase: Float32Array;      // Phase values
    pan: Float32Array;        // Stereo pan per frequency
    width: Float32Array;      // Stereo width per frequency
}

export interface VolumeResolution {
    x: number;  // Frequency bins (horizontal)
    y: number;  // Index/harmonic (vertical)
    z: number;  // Morph/timbre (depth)
}

// Sensible density ranges for the spectral volume
export const VOLUME_DENSITY_MIN = 8;
export const VOLUME_DENSITY_MAX = 128;
export const VOLUME_DENSITY_DEFAULT = 32;
