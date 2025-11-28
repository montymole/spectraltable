## 🚀 Spectra Table Synthesis: Web Prototype (Proof of Concept)

This is a **Proof of Concept (PoC)** prototype for the **Spectra Table Synthesis** method, leveraging browser-based technologies (WebGL 2.0, Web Audio, Web MIDI, and TypeScript). The goal is to create a visually rich, functional interface for controlling GPU-accelerated spectral synthesis with a 3D interactive volume.

## 📊 Current Status

**Implemented:**
- ✅ WebGL 2.0 context with RGBA32F texture support
- ✅ 3D wireframe cube visualization (mouse rotation)
- ✅ Spectral volume as 3D point cloud (adjustable density 8-128)
- ✅ UI controls: Path X/Y/Z, Stereo Spread, Speed, Volume Density X/Y/Z
- ✅ Vite dev server with HMR and TypeScript strict mode

**Next:**
- 🔜 Reading path visualization (curve inside cube)
- 🔜 Web Audio integration (AudioWorklet + iFFT)
- 🔜 Web MIDI input for pitch control
- 🔜 GPU-CPU data synchronization (double buffering)

---

## 1. Project Goals and Scope

### 1.1. Primary Goals
* **Proof of Concept:** Validate the feasibility of the GPU/CPU/Web Audio pipeline for Spectra Table Synthesis.
* **User Interface (UI):** Create a compelling, visually-driven interface (VST-style) that allows intuitive control of the multi-dimensional spectral volume.
* **Sound Exploration:** Demonstrate the unique sonic capabilities enabled by the **Reading Path** concept.
* **Performance Flexibility:** Allow flexibility with real-time performance by utilizing large read buffers to prioritize stability and visual fidelity over absolute low-latency.

### 1.2. Technology Stack (Implemented)
* **Core Logic:** **TypeScript** (strict mode)
* **Build Tool:** **Vite 5.x** (dev server, HMR, production builds)
* **Graphics/GPU:** **WebGL 2.0** (3D visualization, RGBA32F textures, point cloud rendering)
* **Audio Output:** **Web Audio API** (AudioWorklet - planned)
* **Input:** **Web MIDI API** (planned)
* **UI:** **Vanilla HTML/CSS** (no framework - minimal dependencies, direct DOM control)

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

The CPU handles all communication with the GPU, runs the core synthesis engine, and manages the Web Audio graph.

| Component | Technology | Description |
| :--- | :--- | :--- |
| **Data Synchronization** | **Double Buffering** (ArrayBuffers) | Manages two small, CPU-mappable buffers for non-blocking transfer of the **Spectral Slice** data from the GPU. |
| **Audio Processing** | **AudioWorklet** (Preferred) or ScriptProcessorNode | The core real-time loop. Fetches the next available chunk of spectral data from the buffer. |
| **Inverse Transform** | TypeScript/WASM (for performance) | Performs the **iFFT** (Inverse Fast Fourier Transform) on the **Magnitude (R)** and **Phase (G)** channels of the slice data. |
| **Spatialization** | TypeScript | Uses the **Pan (B)** and **Width (A)** channels of the slice data to mix the mono iFFT output into a stereo signal. |
| **MIDI Interface** | Web MIDI API | Handles pitch/note input and maps MIDI CC messages to UI parameters (e.g., Reading Path Position). |

### 2.3. 🎛️ Presentation Layer (UI/UX)

The user interface integrates the visual and control elements, mimicking a high-end plugin.

| Component | Description |
| :--- | :--- |
| **3D Viewer** | The central view displaying the **Spectral Cube** and the **Reading Path**. This is the primary control surface. |
| **Path Controls** | Sliders/Dials for: **Reading Path Position** ($X, Y, Z, W$), **Scrub Rate** (Speed), and **Path Geometry** (Curve Type). |
| **Spectral Controls** | Dials for secondary parameters (e.g., Harmonicity Warp, Spectral Blur amount). |
| **Performance Controls** | Master Volume, Unison Spread, and the Note/Pitch Input section (Web MIDI mapping). |

---

## 3. Implementation Steps & Timeline (Phases)

We prioritize the fundamental pipeline first, then integrate visualization and controls.

### Phase 1: Core Synthesis Pipeline (Weeks 1-2)

1.  **TypeScript Setup:** Establish the basic project structure and WebGL context.
2.  **GPU Data Setup:** Implement the WebGL shaders to create a **static 3D RGBA32F texture** representing a basic spectral volume (e.g., containing data for a simple saw, square, and sine wave along the Z-axis).
3.  **AudioWorklet/iFFT:** Implement the **iFFT algorithm** in the AudioWorklet. Create the function to read a pre-calculated, hardcoded chunk of (Magnitude/Phase) data.
4.  **CPU-GPU Bridge (PoC):** Implement the **Double Buffering** system. Successfully transfer a static **Spectral Slice** chunk from the GPU to the CPU, run the iFFT, and generate sound at a fixed pitch. (Focus on stability, not low latency).

### Phase 2: Dynamic Controls and Visualization (Weeks 3-4)

1.  **Reading Path Logic:** Implement the GPU logic to calculate the **Reading Path** based on $X, Y, Z$ user input, and extract the corresponding spectral slices from the 3D texture.
2.  **UI Integration:** Build the HTML/CSS UI around the central WebGL canvas. Implement basic controls for **Reading Path Position** ($X, Y, Z$).
3.  **3D Visualization:** Render the **Spectral Cube** and a simple **Line/Path** representing the reading location. Ensure the path dynamically updates with user input.
4.  **Spatialization Integration:** Implement the stereo processing logic on the CPU, using the **Pan (Z)** and **Width (W)** channels to demonstrate the unique spatial capabilities of the synth.

### Phase 3: Pitch & Performance (Weeks 5-6)

1.  **Web MIDI:** Integrate Web MIDI for pitch input. Implement the **iFFT scale factor** to allow the generated sound to follow played notes.
2.  **GPU Animation:** Implement the **Compute Shader** logic to animate and morph the entire spectral volume based on time or an LFO, demonstrating the dynamic nature of the data.
3.  **Refinement:** Optimization pass on the iFFT/AudioWorklet logic. Bug fixing and user feedback integration.

---

## 4. Key Metrics for Success (PoC)

| Metric | Target | Notes |
| :--- | :--- | :--- |
| **Functionality** | Sound generated successfully using the full GPU $\to$ CPU $\to$ iFFT $\to$ Audio pipeline. | Pitch changes and envelope/amplitude modulation (via a basic ADSR) work. |
| **Interactivity** | **Reading Path Position** can be controlled via UI and changes sound/timbre immediately. | $X, Y, Z$ controls must have a distinct sonic effect. |
| **Visuals** | **Spectral Cube** and **Reading Path** are rendered in 3D and accurately reflect the current sound generation state. | High frame rate for the visualization to maintain smooth UI experience. |
| **Latency** | Acceptable for a PoC (e.g., $<100ms$ stable latency). | Achieved by utilizing a sufficiently large audio buffer (e.g., 2048 or 4096 samples). |