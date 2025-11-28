# Spectra Table Synthesis - Technical Roadmap

## Project Analysis

Based on the README.md, this is a **WebGL-intensive, real-time audio synthesis application** with the following core requirements:

- **GPU-accelerated spectral processing** (WebGL 2.0 compute shaders)
- **Real-time audio synthesis** (Web Audio API with AudioWorklet)
- **3D visualization** (spectral cube, reading path)
- **MIDI input handling** (Web MIDI API)
- **Low-level performance requirements** (iFFT, double buffering, CPU-GPU sync)

---

## Framework Recommendation: **Vanilla TypeScript + Vite**

### Rationale

Given the constraints and your coding philosophy (Linus + Carmack style), here's why **no framework** is the right choice:

1. **Direct Metal Access**
   - WebGL requires direct GPU state management
   - AudioWorklet runs in a separate thread - frameworks add zero value here
   - Web MIDI is a simple event-driven API - no abstraction needed

2. **Performance Critical**
   - Every frame matters for 60fps 3D rendering
   - Audio buffer deadlines are non-negotiable (AudioWorklet runs at ~48kHz)
   - Framework overhead (VDOM, reactivity, etc.) is pure waste here

3. **Memory Layout Matters**
   - Double buffering requires explicit ArrayBuffer management
   - Texture data needs careful packing (RGBA32F)
   - Frameworks hide this, you need to control it

4. **No UI Complexity**
   - The UI is mostly sliders, knobs, and a WebGL canvas
   - No dynamic lists, no routing, no state management hell
   - Raw DOM manipulation is faster and clearer

### Why Vite?

Vite is not a framework - it's a **build tool** that provides:

- TypeScript compilation (esbuild, blazing fast)
- Hot Module Replacement (dev experience)
- Production bundling (Rollup, tree-shaking)
- Zero config for WebGL/WASM/Web Audio

**Vite adds ~5KB to your bundle. React adds ~40KB. Vue adds ~33KB.**

---

## Technical Stack (Final)

```
┌─────────────────────────────────────────────┐
│  TypeScript (strict mode)                   │
├─────────────────────────────────────────────┤
│  WebGL 2.0 (raw API, no three.js bloat)     │
│  Web Audio API (AudioWorklet)               │
│  Web MIDI API                               │
├─────────────────────────────────────────────┤
│  Build: Vite 5.x                            │
│  Bundler: Rollup (via Vite)                 │
│  Optional: WASM for iFFT (if TS too slow)   │
└─────────────────────────────────────────────┘
```

### What We're NOT Using

- ❌ **React/Vue/Svelte** - Unnecessary abstraction, VDOM overhead
- ❌ **Three.js** - 600KB library for what you can do in 2KB of raw WebGL
- ❌ **Tone.js** - High-level audio library that hides the critical path
- ❌ **WebGL frameworks** (Babylon, etc.) - Same bloat issue as Three.js

---

## Project Structure

```
spectraltable/
├── src/
│   ├── main.ts                 # Entry point, app initialization
│   ├── gpu/
│   │   ├── context.ts          # WebGL context setup
│   │   ├── spectral-volume.ts  # 3D texture management
│   │   ├── shaders.ts          # Vertex/fragment/compute shaders
│   │   ├── reading-path.ts     # Path calculation logic
│   │   └── renderer.ts         # 3D cube + path visualization
│   ├── audio/
│   │   ├── worklet.ts          # AudioWorklet processor (separate file)
│   │   ├── synthesis-engine.ts # Main audio graph setup
│   │   ├── ifft.ts             # Inverse FFT implementation
│   │   └── double-buffer.ts    # GPU→CPU data bridge
│   ├── midi/
│   │   └── input-handler.ts    # Web MIDI event handling
│   ├── ui/
│   │   ├── controls.ts         # Knobs/sliders (vanilla DOM)
│   │   └── canvas-wrapper.ts   # WebGL canvas lifecycle
│   └── types/
│       └── index.ts            # Shared type definitions
├── public/
│   └── index.html              # Minimal HTML entrypoint
├── vite.config.ts              # Vite configuration
├── tsconfig.json               # TypeScript strict config
└── package.json
```

---

## Implementation Path (Phase-by-Phase)

### Phase 0: Bootstrapping (Day 1)

**Goal:** Get a minimal Vite + TypeScript project running

```bash
# Initialize project
npm create vite@latest . -- --template vanilla-ts

# Install (no dependencies except dev tools)
npm install

# Verify build works
npm run dev
```

**Deliverables:**
- ✅ Vite dev server running
- ✅ TypeScript strict mode enabled
- ✅ Hot reload working
- ✅ Green canvas rendered

---

### Phase 1: Core Synthesis Pipeline (Week 1-2)

**Critical Path:** Prove GPU → CPU → Audio works

#### 1.1 WebGL Context Setup
```typescript
// src/gpu/context.ts
export class WebGLContext {
  gl: WebGL2RenderingContext;
  
  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2');
    if (!gl) throw new Error('WebGL2 not supported');
    this.gl = gl;
  }
}
```

**Tasks:**
- [ ] Create WebGL2 context with proper error handling
- [ ] Enable required extensions (GL_EXT_color_buffer_float)
- [ ] Verify 3D texture support

#### 1.2 Static Spectral Volume
```typescript
// src/gpu/spectral-volume.ts
export class SpectralVolume {
  texture: WebGLTexture;
  
  // Static test data: sawtooth/square/sine along Z-axis
  initTestData(gl: WebGL2RenderingContext) {
    // RGBA32F texture: [Magnitude, Phase, Pan, Width]
    // Dimensions: 2048 (freq) × 8 (index) × 16 (morph)
  }
}
```

**Tasks:**
- [ ] Allocate 3D RGBA32F texture (GL_TEXTURE_3D)
- [ ] Generate hardcoded spectral data (3 basic waveforms)
- [ ] Verify texture can be sampled in fragment shader

#### 1.3 AudioWorklet + iFFT
```typescript
// src/audio/worklet.ts
class SpectralWorkletProcessor extends AudioWorkletProcessor {
  process(inputs, outputs, parameters) {
    // 1. Read from double buffer
    // 2. Run iFFT on spectral slice
    // 3. Write to output buffer
    return true;
  }
}
registerProcessor('spectral-processor', SpectralWorkletProcessor);
```

**Tasks:**
- [ ] Implement basic iFFT (Cooley-Tukey, radix-2)
- [ ] Create AudioWorklet boilerplate
- [ ] Test with hardcoded spectral data (no GPU yet)
- [ ] Verify audio output at 440Hz

#### 1.4 CPU-GPU Bridge (Double Buffering)
```typescript
// src/audio/double-buffer.ts
export class DoubleBuffer {
  buffers: [Float32Array, Float32Array];
  readIndex: number = 0;
  
  // Non-blocking swap
  swap() { this.readIndex = 1 - this.readIndex; }
  
  // GPU writes to write buffer via PBO read
  gpuWrite(gl: WebGL2RenderingContext, data: Float32Array) {
    const writeBuffer = this.buffers[1 - this.readIndex];
    // Use glReadPixels to fill writeBuffer
  }
}
```

**Tasks:**
- [ ] Implement lock-free double buffer (atomic swap)
- [ ] Use Pixel Buffer Objects (PBO) for async GPU readback
- [ ] Measure latency (target: stable, not necessarily low)
- [ ] **CRITICAL:** Prove GPU texture → CPU AudioWorklet → Speaker works

**Milestone:** Generate a constant tone using GPU-sourced spectral data

---

### Phase 2: Dynamic Controls + Visualization (Week 3-4)

#### 2.1 Reading Path Logic
```typescript
// src/gpu/reading-path.ts
export class ReadingPath {
  // Generates a curve in (X, Y, Z) space
  calculatePath(position: vec3, geometry: PathType): vec3[] {
    // Returns sequence of texture coordinates
  }
}
```

**Tasks:**
- [ ] Implement linear path (PoC)
- [ ] Add spiral path (Phase 3)
- [ ] Shader samples texture along path
- [ ] Extract Magnitude/Phase/Pan/Width channels

#### 2.2 UI Controls (Vanilla DOM)
```html
<!-- public/index.html -->
<canvas id="gl-canvas"></canvas>
<div id="controls">
  <input type="range" id="path-x" min="-1" max="1" step="0.01">
  <input type="range" id="path-y" min="-1" max="1" step="0.01">
  <input type="range" id="path-z" min="-1" max="1" step="0.01">
</div>
```

```typescript
// src/ui/controls.ts
export class PathControls {
  private xSlider: HTMLInputElement;
  
  constructor(onChange: (xyz: vec3) => void) {
    this.xSlider = document.getElementById('path-x') as HTMLInputElement;
    this.xSlider.addEventListener('input', () => {
      onChange(this.getPosition());
    });
  }
}
```

**Tasks:**
- [ ] Create minimal HTML structure
- [ ] Wire up event listeners (no framework needed)
- [ ] Update shader uniforms on input change
- [ ] Add FPS counter (measure overhead)

#### 2.3 3D Visualization
```glsl
// Vertex shader for spectral cube
#version 300 es
in vec3 position;
uniform mat4 viewProjection;

void main() {
  gl_Position = viewProjection * vec4(position, 1.0);
}
```

**Tasks:**
- [ ] Render wireframe cube (GL_LINES)
- [ ] Render reading path as line strip
- [ ] Basic camera controls (orbit, zoom)
- [ ] Keep shader lean (no lighting, just wireframes)

#### 2.4 Spatialization
```typescript
// src/audio/synthesis-engine.ts
applySpatialization(monoSignal: Float32Array, panValue: number, widthValue: number): [Float32Array, Float32Array] {
  // Simple stereo panning + width
  const left = new Float32Array(monoSignal.length);
  const right = new Float32Array(monoSignal.length);
  // ... pan logic
  return [left, right];
}
```

**Tasks:**
- [ ] Extract Pan/Width from spectral data
- [ ] Implement stereo mixing algorithm
- [ ] Verify stereo output in AudioWorklet

**Milestone:** Move slider → path updates → timbre changes in real-time

---

### Phase 3: MIDI + GPU Animation (Week 5-6)

#### 3.1 Web MIDI Integration
```typescript
// src/midi/input-handler.ts
export class MidiHandler {
  init() {
    navigator.requestMIDIAccess().then((access) => {
      access.inputs.forEach((input) => {
        input.onmidimessage = this.handleMessage.bind(this);
      });
    });
  }
  
  handleMessage(event: MIDIMessageEvent) {
    const [status, note, velocity] = event.data;
    if (status === 0x90) { // Note On
      this.onNoteOn(note, velocity);
    }
  }
}
```

**Tasks:**
- [ ] Request MIDI access on load
- [ ] Map MIDI note → iFFT pitch scaling factor
- [ ] Map MIDI CC → path position (optional)
- [ ] Handle polyphony (voice stealing, simple)

#### 3.2 GPU Spectral Animation
```glsl
// Compute shader (via transform feedback or manual)
#version 300 es
uniform float time;
uniform vec3 volume; // texture dimensions

// Morph spectral data over time
void main() {
  vec3 coord = gl_GlobalInvocationID.xyz / volume;
  vec4 spectral = texelFetch(spectralVolume, ivec3(gl_GlobalInvocationID), 0);
  
  // Animate phase
  spectral.g += time * 0.1; // Phase shift
  
  // Write back
  imageStore(spectralVolume, ivec3(gl_GlobalInvocationID), spectral);
}
```

**Tasks:**
- [ ] Implement compute shader (or transform feedback if no compute support)
- [ ] Animate spectral volume per frame
- [ ] Sync animation time with audio clock
- [ ] Add LFO for morphing between spectral slices

#### 3.3 Optimization Pass
**Critical bottlenecks:**
- [ ] Profile iFFT (consider WASM if < 1ms target missed)
- [ ] Minimize GPU readback stalls (verify PBO async works)
- [ ] Reduce AudioWorklet underruns (measure with telemetry)
- [ ] Check memory allocations (zero-copy where possible)

**Milestone:** Play notes via MIDI, hear animated spectra, see 3D path in sync

---

## Success Criteria (from README)

| Metric | Target | Validation |
|--------|--------|------------|
| **Functionality** | GPU → CPU → iFFT → Audio pipeline works | Play 440Hz tone from GPU texture |
| **Interactivity** | Path controls change timbre immediately | < 50ms UI → audio latency |
| **Visuals** | Cube + path render at 60fps | RequestAnimationFrame never drops |
| **Latency** | < 100ms stable (PoC acceptable) | Use 2048-sample buffer, measure RTT |

---

## Build Commands

```bash
# Development (HMR enabled)
npm run dev

# Production build (minified, tree-shaken)
npm run build

# Preview production build
npm run preview

# Type checking (no emit)
npm run typecheck
```

---

## Dependencies (Minimal)

```json
{
  "devDependencies": {
    "typescript": "^5.3.0",
    "vite": "^5.0.0"
  },
  "dependencies": {}
}
```

**Zero runtime dependencies.** Everything is native Web APIs.

---

## Risk Mitigation

### High-Risk Items

1. **iFFT Performance**
   - **Risk:** TypeScript iFFT too slow for real-time
   - **Mitigation:** Benchmark early (Phase 1). If < 1ms budget, port to WASM

2. **GPU Readback Latency**
   - **Risk:** Synchronous glReadPixels stalls pipeline
   - **Mitigation:** Use PBO async readback, accept 1-2 frame delay

3. **Browser Compatibility**
   - **Risk:** WebGL2 not universal (iOS Safari)
   - **Mitigation:** Check on load, show error if unsupported

### Medium-Risk Items

- **AudioWorklet underruns:** Use large buffer (2048) for PoC
- **MIDI device availability:** Graceful fallback to UI-only control
- **3D rendering complexity:** Start wireframe, avoid lighting/materials

---

## Why This Approach Wins

1. **Zero Abstraction Tax**
   - Direct WebGL calls → knows exactly what GPU does
   - Direct AudioWorklet → knows exactly what audio thread does
   - No framework mystery bugs

2. **Minimal Bundle Size**
   - Production build: ~50KB (vs. 500KB+ with frameworks)
   - Faster load, less parse time, better for PoC demo

3. **Debuggability**
   - No framework magic → stack traces make sense
   - WebGL errors point to YOUR code, not library internals
   - Audio profiling works (no VDOM noise)

4. **Performance Ceiling**
   - Can squeeze every microsecond from iFFT
   - Full control over GPU state (no hidden draws)
   - Memory layout matches hardware (cache-friendly)

---

## Next Steps

1. **Bootstrap** (30 minutes)
   ```bash
   npm create vite@latest . -- --template vanilla-ts
   npm install
   npm run dev
   ```

2. **Validate WebGL2** (1 hour)
   - Clear canvas to red
   - Create 1x1x1 RGBA32F texture
   - Read back value, print to console

3. **Validate Web Audio** (1 hour)
   - Create AudioContext
   - Add AudioWorklet with sine wave
   - Hear 440Hz tone

4. **First Integration** (Rest of Week 1)
   - Pass hardcoded spectral data to AudioWorklet
   - Run iFFT, output audio
   - **This proves the concept viability**

---

## Conclusion

**Recommendation: Vanilla TypeScript + Vite**

- Aligns with your coding philosophy (Linus + Carmack)
- Optimal for low-level GPU/Audio work
- Minimal dependencies = minimal surface area for bugs
- Fast iteration, clear architecture
- Production-ready build tooling without runtime overhead

The framework question isn't "which framework?" but "why add a framework?". For this project, the answer is: **you don't need one**.
