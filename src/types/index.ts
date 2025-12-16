// Type definitions for Spectra Table Synthesis

export interface Vec3 {
    x: number;
    y: number;
    z: number;
}

export interface ReadingPathState {
    position: Vec3;     // Current XYZ position in spectral cube
    rotation: Vec3;     // Rotation of the reading plane (euler angles)
    speed: number;      // Scrub rate (0-1)
    scanPosition: number; // Position of reading line on plane (-1 to 1)
    planeType: PlaneType;
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
    y: number;  // Morph axis - different samples at different Y positions (vertical)
    z: number;  // Time slices within each sample (depth)
}

// Plane types for reading path visualization
export enum PlaneType {
    FLAT = 'PLANE',
    SINCOS = 'PLOT 1',
    WAVE = 'PLOT 2',
    RIPPLE = 'PLOT 3',
}

// Sensible density ranges for the spectral volume
export const VOLUME_DENSITY_X_MIN = 16;
export const VOLUME_DENSITY_X_MAX = 512;
export const VOLUME_DENSITY_X_DEFAULT = 64;

export const VOLUME_DENSITY_Y_MIN = 1;  // Minimum 1 sample
export const VOLUME_DENSITY_Y_MAX = 16; // Max 16 samples to morph
export const VOLUME_DENSITY_Y_DEFAULT = 2;

export const VOLUME_DENSITY_Z_MIN = 16;  // Minimum time resolution
export const VOLUME_DENSITY_Z_MAX = 1024;
export const VOLUME_DENSITY_Z_DEFAULT = 128;

// Synthesis modes
export enum SynthMode {
    SPECTRAL = 'spectral',   // iFFT / additive synthesis from frequency bins
    WAVETABLE = 'wavetable', // Direct waveform playback from reading line
}

// Carrier waveform types for wavetable AM synthesis
export enum CarrierType {
    SINE = 0,
    SAW = 1,
    SQUARE = 2,
    TRIANGLE = 3,
}
