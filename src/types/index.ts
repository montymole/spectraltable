// Type definitions for Spectra Table Synthesis

export interface Vec3 {
    x: number;
    y: number;
    z: number;
}

export interface ReadingPathState {
    position: Vec3;     // Current XYZ position in spectral cube
    rotation: Vec3;     // Rotation of the reading plane (euler angles)
    scanPosition: number; // Position of reading line on plane (-1 to 1)
    planeType: PlaneType;
    shapePhase: number; // Phase offset for plane shape modulation
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
    WHITENOISE_BAND_Q_FILTER = 'whitenoise_band_q_filter', // Subtractive noise filtering
}

// Carrier waveform types for wavetable AM synthesis
export enum CarrierType {
    SINE = 0,
    SAW = 1,
    SQUARE = 2,
    TRIANGLE = 3,
}

export interface LFOState {
    waveform: string;
    frequency: number;
    amplitude: number;
    offset: number;
}

// Generator parameter interfaces
export interface JuliaParams {
    scale: number;      // 0.5 - 2.0, default 1.2
    cReal: number;      // -1 to 1, default -0.4
    cImag: number;      // -1 to 1, default 0.6
}

export interface MandelbulbParams {
    power: number;      // 2 - 12, default 8
    scale: number;      // 0.5 - 2.0, default 1.2
    iterations: number; // 4 - 20, default 12
}

export interface MengerParams {
    iterations: number; // 1 - 5, default 4
    scale: number;      // 0.5 - 2.0, default 1.0
    holeSize: number;   // 0.2 - 0.5, default 0.33
}

export interface PlasmaParams {
    frequency: number;  // 1 - 10, default 3
    complexity: number; // 1 - 6, default 4
    contrast: number;   // 0.5 - 3.0, default 2.0
}

export interface GameOfLifeParams {
    density: number;    // 0.1 - 0.5, default 0.3
    birthMin: number;   // 4 - 6, default 5
    surviveMin: number; // 3 - 6, default 4
}

export type GeneratorParams = JuliaParams | MandelbulbParams | MengerParams | PlasmaParams | GameOfLifeParams;

// Default generator parameters
export const defaultJuliaParams: JuliaParams = { scale: 1.0, cReal: -0.4, cImag: 0.6 };
export const defaultMandelbulbParams: MandelbulbParams = { power: 8, scale: 1.2, iterations: 12 };
export const defaultMengerParams: MengerParams = { iterations: 4, scale: 1.0, holeSize: 0.33 };
export const defaultPlasmaParams: PlasmaParams = { frequency: 3, complexity: 4, contrast: 2.0 };
export const defaultGameOfLifeParams: GameOfLifeParams = { density: 0.3, birthMin: 5, surviveMin: 4 };

// Preset system
export interface PresetControls {
    pathY: number;
    scanPosition: number;
    planeType: string;
    synthMode: string;
    frequency: number;
    carrier: number;
    feedback: number;
    densityX: number;
    densityY: number;
    densityZ: number;
    spectralData: string;
    generatorParams?: GeneratorParams;
    lfos: { waveform: string; frequency: number; amplitude: number; offset: number }[];
    envelopes: { attack: number; decay: number; sustain: number; release: number }[];
    modRouting: { pathY: string; scanPhase: string; shapePhase: string };
    octave: number;
}

export interface PresetData {
    name: string;
    timestamp: number;
    controls: PresetControls;
}

export const STORAGE_KEY_STATE = 'spectraltable_state';
export const STORAGE_KEY_PRESETS = 'spectraltable_presets';
