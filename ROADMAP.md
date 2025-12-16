# Spectra Table Synthesis - Technical Roadmap

## Project Overview

**Spectra Table Synthesis** is a WebGL-intensive, real-time audio synthesis application that combines GPU-accelerated spectral processing with 3D visualization. The project uses browser-based technologies (WebGL 2.0, Web Audio API, TypeScript) to create a novel synthesizer controlled through a 3D spectral volume interface.

---

## Technical Stack

```
┌─────────────────────────────────────────────┐
│  TypeScript (strict mode)                   │
├─────────────────────────────────────────────┤
│  WebGL 2.0 (raw API, no three.js bloat)     │
│  Web Audio API (AudioWorklet)               │
│  Web MIDI API (planned)                     │
├─────────────────────────────────────────────┤
│  Build: Vite 5.x                            │
│  Bundler: Rollup (via Vite)                 │
└─────────────────────────────────────────────┘
```

### Design Philosophy

- **Zero Abstraction Tax** - Direct WebGL/Web Audio calls, no framework overhead
- **Minimal Bundle Size** - Zero runtime dependencies, ~50KB production build
- **Performance First** - Every frame matters for 60fps rendering + audio
- **Debuggability** - Stack traces point to our code, not library internals

---

## Project Structure

```
spectraltable/
├── src/
│   ├── main.ts                 # App entry point, orchestration
│   ├── style.css               # UI styling
│   ├── audio/
│   │   ├── audio-engine.ts     # AudioContext, worklet, iFFT synthesis
│   │   └── audio-analyzer.ts   # WAV file FFT analysis
│   ├── gpu/
│   │   ├── context.ts          # WebGL2 context setup
│   │   ├── math.ts             # Vector/matrix utilities
│   │   ├── reading-path.ts     # Path calculation logic
│   │   ├── renderer.ts         # 3D rendering pipeline
│   │   ├── shaders.ts          # GLSL shaders
│   │   └── spectral-volume.ts  # 3D texture + data generators
│   ├── types/
│   │   └── index.ts            # Shared type definitions
│   └── ui/
│       ├── controls.ts         # ControlPanel - sliders, selects, file inputs
│       ├── scope.ts            # StereoScope - Lissajous/channel visualizer
│       └── spectrogram.ts      # Spectrogram - scrolling frequency display
├── index.html                  # HTML entry point
├── vite.config.ts              # Vite configuration
├── tsconfig.json               # TypeScript config
└── package.json                # Dependencies
```

---

## Current Implementation Status

### Phase 1: Core Infrastructure ✅ COMPLETE

| Component | Status | Details |
|-----------|--------|---------|
| Vite + TypeScript Setup | ✅ | Strict mode, HMR, production builds |
| WebGL2 Context | ✅ | RGBA32F texture support verified |
| 3D Texture Management | ✅ | SpectralVolume class with full CRUD |
| Basic Shaders | ✅ | Wireframe, point cloud, plane shaders |

### Phase 2: Visualization Pipeline ✅ COMPLETE

| Component | Status | Details |
|-----------|--------|---------|
| Wireframe Cube | ✅ | GL_LINES rendering |
| Spectral Point Cloud | ✅ | Adjustable density (16-512 × 1-16 × 16-1024) |
| Reading Plane | ✅ | Multiple geometries: Flat, SinCos, Wave, Ripple |
| Reading Line | ✅ | Animated scan line across plane |
| Mouse Orbit | ✅ | Drag to rotate, scroll to zoom |
| Camera Controls | ✅ | Orbit camera with smooth transitions |

### Phase 3: Audio Engine ✅ COMPLETE

| Component | Status | Details |
|-----------|--------|---------|
| AudioContext Setup | ✅ | Lazy init on user interaction |
| AudioWorklet Processor | ✅ | Inline worklet with iFFT |
| iFFT Implementation | ✅ | Cooley-Tukey radix-2 |
| Stereo Panning | ✅ | Pan/width from spectral data |
| Scope Visualizer | ✅ | Lissajous + dual-channel modes |
| Spectrogram Display | ✅ | Scrolling frequency visualization |

### Phase 4: Spectral Data Sources ✅ COMPLETE

| Component | Status | Details |
|-----------|--------|---------|
| WAV File Analysis | ✅ | Multi-file upload, FFT analysis |
| Logarithmic Freq Mapping | ✅ | Accurate frequency distribution |
| Time Stretching | ✅ | Match samples to volume Z-axis |
| Morphing Support | ✅ | Multiple files → Y-axis interpolation |
| Progress Indicator | ✅ | Processing feedback |

### Phase 5: Procedural Generators ✅ COMPLETE

| Generator | Status | Details |
|-----------|--------|---------|
| 3D Julia | ✅ | Fractal with low-freq concentration |
| Mandelbulb | ✅ | 3D Mandelbrot variant |
| Menger Sponge | ✅ | Recursive cubic fractal |
| Perlin Noise | ✅ | Animated 4D noise, scrub control |
| Game of Life | ✅ | 3D cellular automata |

### Phase 6: UI Controls ✅ COMPLETE

| Component | Status | Details |
|-----------|--------|---------|
| Path Position (X/Y/Z) | ✅ | Reading plane position sliders |
| Plane Rotation (X/Y/Z) | ✅ | Euler angle controls |
| Plane Type Select | ✅ | Flat, SinCos, Wave, Ripple |
| Speed/Scrub Control | ✅ | Animation rate ± bidirectional |
| Scan Position | ✅ | Manual line position override |
| Volume Density (X/Y/Z) | ✅ | Adjustable resolution |
| Spectral Data Select | ✅ | Dropdown for data source |
| Dynamic Parameter | ✅ | Context-sensitive param slider |
| WAV Upload | ✅ | Multi-file input |
| Reset Button | ✅ | One-click state reset |

---

## Planned Features (Not Yet Implemented)

### Phase 7: MIDI Integration

| Component | Status | Priority |
|-----------|--------|----------|
| Web MIDI Access | 🔜 | HIGH |
| Note → Pitch Scaling | 🔜 | HIGH |
| CC → Parameter Mapping | 🔜 | MEDIUM |
| Polyphony/Voice Stealing | 🔜 | LOW |

### Phase 8: GPU Animation

| Component | Status | Priority |
|-----------|--------|----------|
| Compute Shader Morphing | 🔜 | MEDIUM |
| LFO-driven Spectral Animation | 🔜 | MEDIUM |
| Audio Clock Sync | 🔜 | LOW |

### Phase 9: Optimization

| Component | Status | Priority |
|-----------|--------|----------|
| PBO Async Readback | 🔜 | MEDIUM |
| WASM iFFT (if needed) | 🔜 | LOW |
| AudioWorklet Underrun Prevention | 🔜 | MEDIUM |
| Memory Pool Allocation | 🔜 | LOW |

### Phase 10: UX Polish

| Component | Status | Priority |
|-----------|--------|----------|
| Keyboard Shortcuts | 🔜 | LOW |
| Preset System | 🔜 | MEDIUM |
| Export Audio | 🔜 | LOW |
| Touch Controls | 🔜 | LOW |

---

## Success Criteria

| Metric | Target | Current Status |
|--------|--------|----------------|
| **Functionality** | GPU → CPU → iFFT → Audio pipeline | ✅ Working |
| **Interactivity** | Path controls change timbre <50ms | ✅ Achieved |
| **Visuals** | 60fps cube + path rendering | ✅ Achieved |
| **Latency** | <100ms stable audio latency | ✅ Achieved |

---

## Build Commands

```bash
# Development (HMR enabled)
npm run dev

# Production build
npm run build

# Preview production build
npm run preview
```

---

## Dependencies

```json
{
  "devDependencies": {
    "typescript": "^5.x",
    "vite": "^5.x"
  },
  "dependencies": {}
}
```

**Zero runtime dependencies.** Everything is native Web APIs.
