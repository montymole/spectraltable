# SpectralTable TODO

## Immediate Improvements

### Render WAV Dialog
- [ ] Add progress indicator (match load wav progress style)
- [ ] Replace base note input with dropdown selector (C-1 → C-8, display as C-3 format)
- [ ] Replace direct download with embedded audio player
  - [ ] Add play/replay button in render dialog
  - [ ] Add save button with filename picker
  - [ ] Default filename to "preset name-basenote.wav" or "synthesistype-basenote.wav"

### LFO Enhancements
- [ ] Extend frequency range down to 0.001 Hz
- [ ] Add more decimal precision to frequency control and display
- [ ] Implement logarithmic mode for knob control
- [ ] Apply logarithmic scaling to LFO frequency dial

---

## Short-Term Features

### Tempo Sync LFO
- [ ] Add BPM input field
- [ ] Add sync mode toggle (free / synced)
- [ ] Add beat division selector: 1/16, 1/8, 1/4, 1/2, 1/1
- [ ] Add triplet variants for each division

### Additional Plot Types
- [ ] **Tube**: circular curve on Y axis, shape phase adjusts radius
- [ ] **Bell**: zero at ends with curved center, shape phase adjusts magnitude (0 = flat)
- [ ] **Spiral**: Z-axis spiral from center outward, shape adjusts rotation count
- [ ] **Spring**: Y-axis spiral with height variation, shape adjusts height

### Image Data Sources
- [ ] Preset dataset browser for local images
- [ ] Image upload button
- [ ] Image-to-volumetric conversion pipeline, converts image in width x height tiles y number of layers

### Filter Section
- [ ] Add optional multimode filter to audio synthesis
- [ ] Implement filter types (LP, HP, BP, notch)
- [ ] Add cutoff and resonance controls
- [ ] Add LFO routing to cutoff
- [ ] Add LFO routing to resonance
- [ ] Add envelope routing to cutoff

---

## Medium-Term Features

### Modulator Count
- [ ] Make LFO count adjustable (default: 2)
- [ ] Add/remove LFO UI buttons
- [ ] Store LFO count in preset
- [ ] Make ENV count adjustable (similar as LFO)
- [ ] Unify LFO and ENV target routing system

### Offline Render Options
- [ ] Add note range selector (start note → end note)
- [ ] Add step interval selector (every Nth semitone)
- [ ] Batch render to several wav files "filename-nth-<note>.wav"
- [ ] Progress indicator for batch operations

### Presest loading
- [ ] save volumetric data as byte array (needed for imported data wav or image)

### Preset Sharing
- [ ] GitHub integration for preset repository
- [ ] Share button → opens PR flow
- [ ] GitHub OAuth login prompt
- [ ] Serialize volumetric data as compressed byte array
- [ ] Handle large preset sizes gracefully

### Custom Algorithm Editor
- [ ] Add code editor for fragment shader style input
- [ ] Expose x, y, z as inputs
- [ ] Compile and apply to volumetric data
- [ ] Error handling and preview

---

## Major Refactoring

### Layout System
- [ ] Implement tabs for section grouping
- [ ] Implement accordions for collapsible groups
- [ ] Rearrange control groups logically
- [ ] Support relative and absolute positioning
- [ ] Detachable/floating panels
- [ ] Resizable panels
- [ ] Save layout state in preset

### Polyphony
- [ ] Multi-voice architecture
- [ ] Voice allocation and stealing
- [ ] Per-voice parameter state

### Chords
- [ ] Chord detection from MIDI input
- [ ] Chord voicing modes
- [ ] Spread and detune controls

### Sequencer (303 Style)
- [ ] Step sequencer grid UI
- [ ] Note entry per step
- [ ] Accent and slide per step
- [ ] Pattern length selector
- [ ] Pattern save/load
- [ ] Sync to tempo


## Optimize

### Audio Worklet
- [ ] Pre-allocate Float32Arrays in worklet processor (avoid GC during playback)
- [ ] Reduce FFT size for lower latency modes
- [ ] Cache twiddle factors for FFT/CZT between calls
- [ ] Use TypedArray.set() instead of per-element copies

### GPU / WebGL
- [ ] Frustum cull point cloud (skip points outside camera view)
- [ ] LOD for point cloud (fewer points when zoomed out)
- [ ] Batch geometry updates (reduce buffer rebinds)
- [ ] Use half-float (RGBA16F) instead of RGBA32F where precision allows
- [ ] Pool WebGL buffer objects instead of recreating
- [ ] Reduce draw calls by merging static geometry (axes, wireframe)

### 3D Volume
- [ ] Lazy volume regeneration (only when parameters actually change)
- [ ] Incremental texture updates (texSubImage3D for partial changes)
- [ ] Compress volumetric data for presets (quantize + zlib)
- [ ] Downsample volume for preview, full resolution on demand (render offline)

### Spectrogram / Scope
- [ ] Skip frames when tab not visible (requestAnimationFrame already does this, but also skip texture updates)
- [ ] Reduce history buffer size when performance drops
- [ ] Use ring buffer write without full row copy

### Memory
- [ ] Reuse Float32Array for reading line data instead of allocating each frame
- [ ] Object pooling for frequently created small objects
- [ ] Clear uploaded volumes when switching presets
- [ ] Lazy load preset volumetric data

### General
- [ ] Throttle expensive recalculations (e.g., reading path geometry)
- [ ] Debounce slider/knob input events
- [ ] Profile render loop and identify bottlenecks
- [ ] Consider Web Workers for heavy CPU tasks (volume generation)
