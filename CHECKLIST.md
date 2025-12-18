# Spectra Table Synthesis - Feature Checklist

This document tracks all features with their implementation status.

**Legend:**
- ✅ `COMPLETE` - Fully implemented and working
- 🔶 `PARTIAL` - Partially implemented or has known issues
- ⬜ `INCOMPLETE` - Not yet implemented

---

## GPU / Visualization

### Visual Aids

- [x] **Rotating Axis Explanations** `COMPLETE`
  - Dynamic arrows for Time/Morph/Bins
  - Labels rotate with cube orientation

### WebGL Rendering

- [x] **Vite + TypeScript Setup** `COMPLETE`
  - TypeScript strict mode enabled
  - Hot Module Replacement working
  - Production build configured

- [x] **WebGL2 Context** `COMPLETE`
  - WebGL2 initialization with error handling
  - RGBA32F texture format support
  - Required extensions enabled

- [x] **Project Structure** `COMPLETE`
  - Modular architecture (gpu/, audio/, ui/, types/)
  - Clean separation of concerns

---

## GPU / Visualization

### WebGL Rendering

- [x] **Wireframe Cube** `COMPLETE`
  - GL_LINES rendering
  - Proper depth handling

- [x] **Spectral Point Cloud** `COMPLETE`
  - Configurable density (X: 16-512, Y: 1-16, Z: 16-1024)
  - Color-coded by spectral magnitude
  - Real-time updates

- [x] **Reading Plane** `COMPLETE`
  - Transparent plane visualization
  - Position controls (X, Y, Z)
  - Rotation controls (X, Y, Z euler angles)

- [x] **Plane Geometry Types** `COMPLETE`
  - Flat plane
  - SinCos (Plot 1)
  - Wave (Plot 2)
  - Ripple (Plot 3)

- [x] **Reading Line** `COMPLETE`
  - Animated scan line
  - Follows plane contour
  - Bi-directional scrubbing

### Camera & Interaction

- [x] **Orbit Camera** `COMPLETE`
  - Mouse drag rotation
  - Left-click orbit
  - Smooth interpolation

- [x] **Zoom Control** `COMPLETE`
  - Scroll wheel zoom

- [x] **Reset View Button** `COMPLETE`
  - Reset camera to default position

---

## 3D Spectral Volume

### Texture Management

- [x] **3D RGBA32F Texture** `COMPLETE`
  - Dynamic allocation
  - Resolution changes supported
  - Proper cleanup

- [x] **Trilinear Sampling** `COMPLETE`
  - Smooth interpolation between voxels
  - Used for reading line extraction

### Procedural Generators

- [x] **3D Julia Set** `COMPLETE` ⚠️ BUG-001
  - Quaternion Julia fractal
  - Low-frequency concentration
  - ⚠️ Volume mostly empty due to poor centering/scale

- [x] **Mandelbulb** `COMPLETE` ⚠️ BUG-002
  - 3D Mandelbrot variant
  - Spherical coordinate mapping
  - ⚠️ Volume mostly empty, samples outside fractal

- [x] **Menger Sponge** `COMPLETE` ⚠️ BUG-003
  - Recursive cubic fractal
  - ⚠️ Erratic patterns, recursion logic broken



- [x] **Game of Life** `COMPLETE`
  - 3D cellular automata
  - Step-by-step animation

- [x] **LFO Modulation** `COMPLETE`
  - 3 LFO units with sine, square, saw, triangle waveforms
  - Modulation routing to Scan Phase, Path Y (Morph), Shape Phase
  - Frequency (0-1Hz), Amplitude, Offset controls

---

## Audio Engine

### Core Pipeline

- [x] **AudioContext Management** `COMPLETE`
  - Lazy initialization on user interaction
  - Resume handling for autoplay policy

- [x] **AudioWorklet Processor** `COMPLETE`
  - Inline worklet definition
  - Real-time spectral processing

- [x] **iFFT Implementation** `COMPLETE`
  - Cooley-Tukey radix-2 algorithm
  - TypeScript implementation (no WASM)

- [x] **Stereo Spatialization** `COMPLETE`
  - Pan per frequency bin
  - Width/spread control

### Signal Quality

- [x] **Smooth Spectral Transitions** `COMPLETE`
  - Sample-level interpolation between frames
  - Prevents "rattling" artifacts during fast movement

- [x] **Anti-Aliasing** `COMPLETE`
  - Nyquist frequency rolloff
  - Prevents high-frequency folding artifacts

- [ ] **Double Buffering** `INCOMPLETE`
  - No explicit double-buffer for GPU readback

- [ ] **PBO Async Readback** `INCOMPLETE`
  - Synchronous readback currently

### Audio Analysis

- [x] **WAV File Import** `COMPLETE`
  - Drag & drop or file picker
  - Multiple file support

- [x] **FFT Analysis** `COMPLETE`
  - Simple FFT implementation
  - Configurable bin count

- [x] **Logarithmic Frequency Mapping** `COMPLETE`
  - Accurate spectral distribution

- [x] **Time Stretching** `COMPLETE`
  - Linear interpolation
  - Match samples to Z-axis length

- [x] **Multi-File Morphing** `COMPLETE`
  - Multiple files → Y-axis positions
  - Smooth transitions

- [x] **Progress Indicator** `COMPLETE`
  - Visual feedback during analysis

---

## UI Components

### Control Panel

- [x] **Path Position Sliders (X/Y/Z)** `COMPLETE`
- [x] **Plane Rotation Sliders (X/Y/Z)** `COMPLETE`
- [x] **Plane Type Dropdown** `COMPLETE`
- [x] **Speed/Scrub Slider** `COMPLETE`
- [x] **Scan Position Slider** `COMPLETE`
- [x] **Volume Density Sliders (X/Y/Z)** `COMPLETE`
- [x] **Spectral Data Dropdown** `COMPLETE`
- [x] **Dynamic Parameter Slider** `COMPLETE`
- [x] **WAV Upload Button** `COMPLETE`
- [x] **Reset Button** `COMPLETE`
- [x] **Progress Bar** `COMPLETE`

### Visualizers

- [x] **Stereo Scope** `COMPLETE`
  - Lissajous mode (click to toggle)
  - Dual-channel waveform mode
  - High-DPI support

- [x] **Spectrogram** `COMPLETE`
  - Scrolling frequency display
  - Cyan-white color mapping
  - Real-time updates

---

## LFO / Modulation

- [x] **LFO Units** `COMPLETE`
  - 3 independent LFO units
  - Waveforms: Sine, Square, Saw, Triangle

- [x] **LFO Parameters** `COMPLETE`
  - Frequency: 0-1 Hz
  - Amplitude: 0-1
  - Offset: -1 to +1

- [x] **Modulation Routing** `COMPLETE`
  - Path Y (Morph position)
  - Scan Phase (reading line position)
  - Shape Phase (plane geometry animation)

- [x] **UI Integration** `COMPLETE`
  - Collapsible LFO control sections
  - Per-parameter source selection dropdowns
  - Visual feedback on modulated parameters

---

## Envelope System

- [x] **ADSR Envelope** `COMPLETE`
  - Attack, Decay, Sustain, Release parameters
  - Applied to master gain

- [x] **Interactive Envelope Editor** `COMPLETE`
  - Canvas-based visual editor
  - Drag nodes to adjust A, D, S, R values
  - Real-time playhead visualization

- [x] **Note Integration** `COMPLETE`
  - Attack triggers on note-on
  - Release triggers on note-off
  - Proper scheduling with Web Audio API

---

## MIDI / Input

- [x] **Web MIDI Access** `COMPLETE`
  - Auto-detects MIDI devices on page load
  - Handles device connect/disconnect events

- [x] **MIDI Device Selection** `COMPLETE`
  - Dropdown selector in UI
  - Dynamic device list updates

- [x] **Note On/Off Handling** `COMPLETE`
  - Note On triggers ADSR attack
  - Note Off triggers ADSR release
  - Highest-note priority for monophonic playback

- [x] **Pitch Scaling (Note → Frequency)** `COMPLETE`
  - MIDI note to Hz conversion (A4 = 440Hz reference)
  - Wavetable mode: direct frequency control
  - Spectral mode: frequency multiplier scaling

- [x] **On-Screen Piano Keyboard** `COMPLETE`
  - 3-octave clickable keyboard
  - Mouse drag to play multiple notes
  - Visual feedback on MIDI input
  - Octave selector (0-7)

- [ ] **CC → Parameter Mapping** `INCOMPLETE`
- [ ] **Polyphony (Multiple Voices)** `INCOMPLETE`
- [ ] **Voice Stealing** `INCOMPLETE`

---

## Optimizations

- [ ] **WASM iFFT** `INCOMPLETE` - Not needed yet, TS is fast enough
- [ ] **Memory Pool Allocation** `INCOMPLETE`
- [ ] **AudioWorklet Underrun Prevention** `INCOMPLETE`
- [ ] **GPU Compute Shaders** `INCOMPLETE` - Not using compute shaders

---

## UX / Polish

- [ ] **Keyboard Shortcuts** `INCOMPLETE`
- [ ] **Export Audio** `INCOMPLETE`
- [ ] **Touch Controls** `INCOMPLETE`
- [ ] **Dark/Light Theme Toggle** `INCOMPLETE`
- [ ] **Help/Tutorial Overlay** `INCOMPLETE`

---

## Browser Compatibility

- [x] **Chrome/Edge** `COMPLETE` - Primary target, fully tested
- [x] **Firefox** `COMPLETE` - Works with WebGL2
- [ ] **Safari** `INCOMPLETE` - WebGL2 support varies
- [ ] **Mobile Browsers** `INCOMPLETE` - Not tested

---

---

## Known Bugs / Issues (Resolved)

### BUG-001: 3D Julia generator produces mostly empty volume
**Status:** ✅ Fixed  
**File:** `src/gpu/spectral-volume.ts` → `generate3DJulia()`  
**Resolution:** Rewrote algorithm with centered coordinates, configurable C constants, and interior-based magnitude mapping.

---

### BUG-002: Mandelbulb generator produces mostly empty volume
**Status:** ✅ Fixed  
**File:** `src/gpu/spectral-volume.ts` → `generateMandelbulb()`  
**Resolution:** Centered coordinate mapping, iteration-based coloring, interior points mapped to high magnitude.

---

### BUG-003: Menger Sponge produces erratic/chaotic patterns
**Status:** ✅ Fixed  
**File:** `src/gpu/spectral-volume.ts` → `generateMengerSponge()`  
**Resolution:** Rewrote algorithm to use proper Menger subdivision logic with fixed coordinates and correct hole detection.

---

## Implemented Features

### FEAT-001: Adjustable Generator Parameters
**Status:** ✅ Complete  
**Description:** Each procedural generator exposes 2-3 key parameters via UI sliders.

**Parameters per Generator:**

| Generator | Param 1 | Param 2 | Param 3 |
|-----------|---------|---------|---------|
| **3D Julia** | Scale (0.5-2.0) | C Real (-1 to 1) | C Imaginary (-1 to 1) |
| **Mandelbulb** | Power (2-12) | Scale (0.5-2.0) | Iterations (4-20) |
| **Menger Sponge** | Iterations (1-5) | Scale (0.5-2.0) | Hole Size (0.2-0.5) |
| **Sine Plasma** | Frequency (1-10) | Complexity (1-6) | Contrast (0.5-3.0) |
| **Game of Life** | Initial Density (0.1-0.5) | Birth Rule (4-6) | Survival Rule (3-6) |

**Files Changed:**
- `src/types/index.ts` - Added generator param interfaces
- `src/gpu/spectral-volume.ts` - Updated all generators to accept params
- `src/ui/controls.ts` - Dynamic generator param UI

---

### FEAT-002: Preset System with localStorage Persistence
**Status:** ✅ Complete  
**Description:** Save and restore control positions using browser localStorage.

**Phase A: Auto-save Current State**
- Save all control values to localStorage on change
- Restore values on page load
- No UI needed for this phase

**Phase B: Named Presets**
- localStorage structure:
```typescript
interface PresetData {
  name: string;
  timestamp: number;
  controls: {
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
    generatorParams?: Record<string, number>;
    lfo1: { waveform: string; frequency: number; amplitude: number; offset: number };
    lfo2: { waveform: string; frequency: number; amplitude: number; offset: number };
    modRouting: { pathY: string; scanPhase: string; shapePhase: string };
    envelope: { attack: number; decay: number; sustain: number; release: number };
  };
}

// localStorage key: "spectraltable_presets"
// Value: PresetData[]
```

**UI Components:**
- Preset dropdown selector (shows saved preset names)
- "Save" button → prompts for name via `prompt()` or modal
- "Delete" button → removes currently selected preset
- "Default" option always available (factory reset)

**Implementation Order:**
1. Define `PresetData` interface in `types/index.ts`
2. Add `PresetManager` class to handle localStorage CRUD
3. Phase A: Auto-save/restore on page load
4. Phase B: Add preset UI to controls panel

---

## Summary Statistics

| Category | Complete | Partial | Incomplete | Total |
|----------|----------|---------|------------|-------|
| Infrastructure | 3 | 0 | 0 | 3 |
| GPU/Visualization | 6 | 0 | 2 | 8 |
| Spectral Volume | 9 | 0 | 0 | 9 |
| Audio Engine | 10 | 0 | 2 | 12 |
| UI Components | 13 | 0 | 0 | 13 |
| LFO/Modulation | 4 | 0 | 0 | 4 |
| Envelope System | 3 | 0 | 0 | 3 |
| MIDI/Input | 5 | 0 | 3 | 8 |
| Presets | 2 | 0 | 0 | 2 |
| Generator Params | 5 | 0 | 0 | 5 |
| Optimizations | 0 | 0 | 4 | 4 |
| UX/Polish | 0 | 0 | 5 | 5 |
| Browser Compat | 2 | 0 | 2 | 4 |
| **TOTAL** | **62** | **0** | **18** | **80** |

**Overall Progress: ~78% Complete**

### Bugs & Features Status

| Type | Open | Completed |
|------|------|-----------|
| Bugs | 0 | 3 |
| Features | 0 | 2 |
