## 🚀 Spectra Table Synthesis: Web Prototype

A WebGL-intensive, real-time audio synthesis application that combines GPU-accelerated spectral processing with 3D visualization. Uses browser-based technologies (WebGL 2.0, Web Audio, Web MIDI, TypeScript) to create a novel synthesizer controlled through a 3D spectral volume interface.

## 📊 Current Status: ~74% Complete

**Core Features (Complete):**
- ✅ WebGL 2.0 context with RGBA32F 3D texture support
- ✅ 3D wireframe cube + spectral point cloud visualization
- ✅ Reading plane with multiple geometries (Flat, SinCos, Wave, Ripple)
- ✅ Mouse orbit camera controls (drag to rotate)
- ✅ Two synthesis modes: Spectral (iFFT/additive) & Wavetable (AM)
- ✅ ADSR envelope with interactive visual editor
- ✅ Web MIDI integration with on-screen piano keyboard
- ✅ 2 LFOs with modulation routing (Scan Phase, Morph Y, Shape Phase)
- ✅ WAV file import with FFT analysis and multi-file morphing
- ✅ Procedural generators: 3D Julia, Mandelbulb, Menger Sponge, Sine Plasma, Game of Life
- ✅ Real-time visualizers: Stereo Scope (Lissajous), Spectrogram

**Planned:**
- 🔜 MIDI CC parameter mapping
- 🔜 Polyphony / voice stealing
- 🔜 Preset save/load system
- 🔜 Audio export

---

## 1. Project Goals and Scope

### 1.1. Primary Goals
* **Proof of Concept:** Validate the feasibility of the GPU/CPU/Web Audio pipeline for Spectra Table Synthesis.
* **User Interface (UI):** Create a compelling, visually-driven interface (VST-style) that allows intuitive control of the multi-dimensional spectral volume.
* **Sound Exploration:** Demonstrate the unique sonic capabilities enabled by the **Reading Path** concept.
* **Performance Flexibility:** Allow flexibility with real-time performance by utilizing large read buffers to prioritize stability and visual fidelity over absolute low-latency.

### 1.2. Technology Stack
* **Core Logic:** **TypeScript** (strict mode)
* **Build Tool:** **Vite 5.x** (dev server, HMR, production builds)
* **Graphics/GPU:** **WebGL 2.0** (3D visualization, RGBA32F textures, point cloud rendering)
* **Audio Output:** **Web Audio API** (AudioWorklet with iFFT/AM synthesis)
* **Input:** **Web MIDI API** (device selection, note handling, pitch control)
* **UI:** **Vanilla HTML/CSS** (zero runtime dependencies)

---

## 2. Technical Architecture & Component Breakdown

The prototype will be divided into three core functional layers: **GPU Logic, CPU/Audio Logic, and the Presentation Layer.**

### 2.1. 🧠 GPU Logic (WebGL Compute & Visualization)

The GPU is responsible for managing the high-dimensional data and rendering the UI.

| Component | Technology | Description |
| :--- | :--- | :--- |
| **Spectral Volume Management** | WebGL Textures, Shaders | Maintains the $X \times Y \times Z$ (Frequency, Index, Morph) spectral data in a **3D Texture** (RGBA32F). |
| **Spectral Animation** | **Compute Shaders** (via Transform Feedback or equivalent) | Continuously runs shaders to morph, warp, and animate the data within the spectral volume (e.g., animating the Z/W channels). |
| **Reading Path Calculation** | Vertex/Fragment Shaders | Calculates the sequence of spectral slices based on the user's $X, Y, Z, W$ position and the chosen **path geometry** (e.g., spiral, curve). |
| **Visualization Rendering** | WebGL 3D Scene | Renders the spectral volume as a transparent **3D Cube** and the **Animated Reading Path** as a wireframe curve inside the cube. |

### 2.2. 🔊 CPU & Audio Logic (Web Audio API)

The CPU handles GPU communication, runs the synthesis engine, and manages the Web Audio graph.

| Component | Technology | Description |
| :--- | :--- | :--- |
| **Spectral Mode** | AudioWorklet + iFFT | Additive synthesis from frequency bins with per-bin panning. |
| **Wavetable Mode** | AudioWorklet + AM | Carrier wave (sine/saw/square/tri) modulated by reading line magnitudes with feedback. |
| **ADSR Envelope** | Web Audio Gain | Attack, Decay, Sustain, Release with interactive visual editor. |
| **Spatialization** | TypeScript | Uses spectral slice data for per-frequency stereo positioning. |
| **MIDI Interface** | Web MIDI API | Device selection, note on/off handling, pitch-to-frequency conversion. |

### 2.3. 🎛️ Presentation Layer (UI/UX)

The user interface integrates the visual and control elements, mimicking a high-end plugin.

| Component | Description |
| :--- | :--- |
| **3D Viewer** | The central view displaying the **Spectral Cube** and the **Reading Path**. This is the primary control surface. |
| **Path Controls** | Sliders/Dials for: **Reading Path Position** ($X, Y, Z, W$), **Scrub Rate** (Speed), and **Path Geometry** (Curve Type). |
| **Spectral Controls** | Dials for secondary parameters (e.g., Harmonicity Warp, Spectral Blur amount). |
| **Performance Controls** | Master Volume, Unison Spread, and the Note/Pitch Input section (Web MIDI mapping). |

---

## 3. Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

The application runs at http://localhost:3000 with hot module replacement enabled.

## 4. Usage

1. **Select a data source** from the "Data Set" dropdown (try "3d-julia" or "sine-plasma")
2. **Click anywhere** on the 3D canvas to start audio
3. **Drag** to rotate the view, adjust **Path Y** slider to morph between layers
4. **Play notes** using the on-screen piano or connect a MIDI controller
5. **Experiment** with LFOs by selecting a modulation source from the dropdown next to each parameter

---

## 5. Success Criteria (All Achieved ✅)

| Metric | Target | Status |
| :--- | :--- | :--- |
| **Functionality** | GPU → CPU → Synthesis → Audio pipeline | ✅ Working (both Spectral & Wavetable modes) |
| **Interactivity** | Controls change timbre <50ms | ✅ Achieved |
| **Visuals** | 60fps cube + path rendering | ✅ Achieved |
| **Latency** | <100ms stable audio | ✅ Achieved |
| **MIDI** | Note input controls pitch | ✅ Achieved |
| **Modulation** | LFO-driven parameter automation | ✅ Achieved |

See [ROADMAP.md](./ROADMAP.md) for detailed implementation status and [CHECKLIST.md](./CHECKLIST.md) for feature tracking.