# SpectralTable TODO

## Immediate Improvements

### Render WAV Dialog
- [ ] Add progress indicator (match load wav progress style)
- [ ] Replace base note input with dropdown selector (C-1 → C-8, display as C-3 format)
      *→ generate options array with noteToName() helper*
- [ ] Replace direct download with embedded audio player
  - [ ] Add play/replay button in render dialog
        *→ use `<audio>` element with blob URL from rendered buffer*
  - [ ] Add save button with filename picker
        *→ `showSaveFilePicker()` (File System Access API) with fallback to `<a download>`*
  - [ ] Default filename to "preset name-basenote.wav" or "synthesistype-basenote.wav"

### LFO Enhancements
- [ ] Extend frequency range down to 0.001 Hz
      *→ update min in lfo.ts, ensure phase accumulator precision (use double or modulo)*
- [ ] Add more decimal precision to frequency control and display
- [ ] Implement logarithmic mode for knob control
      *→ `value = min * Math.pow(max/min, normalized)` for log scaling*
- [ ] Apply logarithmic scaling to LFO frequency dial

---

## Short-Term Features

### Harmonics section to UI and audio engine

#### Spectral (Frequency-Domain) Methods
- [ ] **Additive harmonic injection**
      *→ in worklet: loop `bin = fundamental * n` for n=1..N, add magnitude*
  - [ ] Add energy at integer multiples of fundamental in spectrum
  - [ ] Harmonic count control (1–32 partials)
  - [ ] Per-harmonic amplitude falloff curve (e.g. 1/n, 1/n², custom)
  - [ ] Limit harmonics below Nyquist to avoid aliasing
        *→ `maxHarmonic = floor(nyquist / fundamental)`*
- [ ] **Spectral copying / scaling**
      *→ read bins 0..k, write to bins k..2k with scaling*
  - [ ] Duplicate low-frequency spectrum regions
  - [ ] Shift or scale copied regions upward
  - [ ] Blend control for copied partials
- [ ] **Spectral shaping**
      *→ apply curve to magnitude array before IFFT*
  - [ ] Apply nonlinear curves to spectral magnitudes
  - [ ] Compression mode (reduce dynamic range of partials)
        *→ `mag = sign(mag) * pow(abs(mag), 0.5)` style*
  - [ ] Soft clip mode (emphasize higher partials)
  - [ ] Preserve phase during magnitude shaping
        *→ store phase separately, only modify magnitude*

### Soft clipping and compression saturation+waveshaping
*→ can run in worklet post-synthesis or as separate AudioWorkletNode*
- [ ] **Waveshaping section**
  - [ ] Implement transfer function processor
        *→ `output[i] = curve(input[i])` per sample*
  - [ ] Built-in curves: tanh, polynomial, sine fold, add dropdowbn selector for curves include None.
        *→ tanh: `Math.tanh(drive * x)`, fold: `Math.sin(drive * x)`*
  - [ ] Custom curve editor
        *→ store as lookup table Float32Array[1024], linear interp*
  - [ ] Drive/amount control
- [ ] **Saturation / soft clipping**
  - [ ] Gentle harmonic addition mode
  - [ ] Tube-style vs transistor-style character
        *→ tube: asymmetric curve, transistor: symmetric*
  - [ ] Mix (dry/wet) control


### Tempo Sync LFO
*→ extend LFO class with sync mode, compute freq from BPM*
- [ ] Add BPM input field
- [ ] Add sync mode toggle (free / synced)
- [ ] Add beat division selector: 1/16, 1/8, 1/4, 1/2, 1/1
      *→ freq = bpm / 60 * division (e.g. 1/4 = 0.25)*
- [ ] Add triplet variants for each division
      *→ multiply division by 2/3*

### Additional Plot Types
*→ add to reading-path.ts generatePlane() and generateReadingLine()*
- [ ] **Tube**: circular curve on Y axis, shape phase adjusts radius
      *→ `y = cos(theta) * radius, z = sin(theta) * radius`*
- [ ] **Bell**: zero at ends with curved center, shape phase adjusts magnitude (0 = flat)
      *→ gaussian: `exp(-pow(x - 0.5, 2) / sigma)`*
- [ ] **Spiral**: Z-axis spiral from center outward, shape adjusts rotation count
      *→ `x = t * cos(t * turns), y = t * sin(t * turns)`*
- [ ] **Spring**: Y-axis spiral with height variation, shape adjusts height
      *→ helix: `x = cos(t * turns), y = t * height, z = sin(t * turns)`*

### Image Data Sources
- [ ] Preset dataset browser for local images
      *-> local asset files
- [ ] Image upload button
      *→ use `<input type="file" accept="image/*">` with FileReader*
- [ ] Image-to-volumetric conversion pipeline, converts image in width x height tiles y number of layers
      *→ draw to canvas, getImageData(), map RGB to volume RGBA*
      *→ tile: slice image into rows = Y layers*

### Filter Section
*→ add BiquadFilterNode chain or implement in worklet for modulation*
- [ ] Add optional multimode filter to audio synthesis
- [ ] Implement filter types (LP, HP, BP, notch)
      *→ BiquadFilterNode types or SVF (state variable filter) in worklet*
- [ ] Add cutoff and resonance controls
- [ ] Add LFO routing to cutoff
- [ ] Add LFO routing to resonance
- [ ] Add envelope routing to cutoff
      *→ sample envelope in worklet, modulate filter coeffs per block*

---

## Medium-Term Features

### Modulator Count
*→ lfos array already dynamic, need UI to add/remove*
- [ ] Make LFO count adjustable (default: 2)
- [ ] Add/remove LFO UI buttons
      *→ clone LFO control group DOM, update array index refs*
- [ ] Store LFO count in preset
- [ ] Make ENV count adjustable (similar as LFO)
- [ ] Unify LFO and ENV target routing system
      *→ abstract Modulator interface with getValue(time)*

### Offline Render Options
- [ ] Add note range selector (start note → end note)
- [ ] Add step interval selector (every Nth semitone)
- [ ] Batch render to several wav files "filename-nth-<note>.wav"
      *→ loop: set note, render, encode WAV, store in array, zip at end*
      *→ use JSZip or similar for bundling*
- [ ] Progress indicator for batch operations

### Preset loading
- [ ] Save volumetric data as byte array (needed for imported data wav or image)
      *→ Float32Array.buffer → base64 or use pako for gzip compression*

### Preset Sharing
*→ complex: needs backend or GitHub API integration*
- [ ] GitHub integration for preset repository
      *→ use GitHub REST API, store presets as JSON in repo*
- [ ] Share button → opens PR flow
      *→ fork repo, create branch, commit file, open PR via API*
- [ ] GitHub OAuth login prompt
      *→ OAuth app registration required, use PKCE flow*
- [ ] Serialize volumetric data as compressed byte array
      *→ pako.deflate() on Float32Array buffer*
- [ ] Handle large preset sizes gracefully
      *→ split into chunks or use Git LFS for large volumes*

### Custom Algorithm Editor
*→ significant complexity: runtime shader compilation*
- [ ] Add code editor for fragment shader style input
      *→ Monaco editor or CodeMirror, syntax highlight GLSL*
- [ ] Expose x, y, z as inputs
      *→ normalize coords 0..1, user returns vec4(r,g,b,a)*
- [ ] Compile and apply to volumetric data
      *→ run on GPU via compute shader or CPU fallback with eval (sandboxed)*
- [ ] Error handling and preview
      *→ catch compile errors, show line numbers*

---

## Major Refactoring

### Code structure
- [ ] Audioworklet types in separate src files
### Layout System
*→ consider existing libs: golden-layout, react-mosaic, or custom CSS grid*
- [ ] Implement tabs for section grouping
- [ ] Implement accordions for collapsible groups
- [ ] Rearrange control groups logically
- [ ] Support relative and absolute positioning
- [ ] Detachable/floating panels
      *→ reparent DOM to overlay container, add drag handle*
- [ ] Resizable panels
      *→ CSS resize or custom drag handles with pointer events*
- [ ] Save layout state in preset
      *→ serialize panel positions/sizes as JSON*

### Polyphony
*→ requires voice pool architecture, significant refactor*
- [ ] Multi-voice architecture
      *→ array of voice states in worklet, each with phase/envelope*
- [ ] Voice allocation and stealing
      *→ find free voice or steal oldest/quietest*
- [ ] Per-voice parameter state
      *→ note, velocity, envelope stage per voice*

### Chords
*→ depends on polyphony*
- [ ] Chord detection from MIDI input
      *→ track held notes in Set, detect when 3+ notes*
- [ ] Chord voicing modes
- [ ] Spread and detune controls
      *→ per-voice pitch offset in cents*

### Sequencer (303 Style)
*→ can be standalone module, triggers existing noteOn/noteOff*
- [ ] Step sequencer grid UI
      *→ CSS grid or canvas, click to toggle notes*
- [ ] Note entry per step
- [ ] Accent and slide per step
      *→ accent: higher velocity, slide: portamento*
- [ ] Pattern length selector (8, 16, 32 steps)
- [ ] Pattern save/load
- [ ] Sync to tempo
      *→ use AudioContext.currentTime for precise scheduling*


## Optimize

### Audio Worklet
- [ ] Pre-allocate Float32Arrays in worklet processor (avoid GC during playback)
- [ ] Reduce FFT size for lower latency modes
- [ ] Cache twiddle factors for FFT/CZT between calls
      *→ compute once in constructor, reuse*
- [ ] Use TypedArray.set() instead of per-element copies

### GPU / WebGL
- [ ] Frustum cull point cloud (skip points outside camera view)
      *→ compute AABB in JS, skip draw if outside frustum*
- [ ] LOD for point cloud (fewer points when zoomed out)
      *→ stride through points based on camera distance*
- [ ] Batch geometry updates (reduce buffer rebinds)
- [ ] Use half-float (RGBA16F) instead of RGBA32F where precision allows
      *→ check EXT_color_buffer_half_float support*
- [ ] Pool WebGL buffer objects instead of recreating
- [ ] Reduce draw calls by merging static geometry (axes, wireframe)

### 3D Volume
- [ ] Lazy volume regeneration (only when parameters actually change)
      *→ hash params, skip if unchanged*
- [ ] Incremental texture updates (texSubImage3D for partial changes)
- [ ] Compress volumetric data for presets (quantize + zlib)
      *→ quantize to 8-bit, pako compress, ~10x smaller*
- [ ] Downsample volume for preview, full resolution on demand (render offline)

### Spectrogram / Scope
- [ ] Skip frames when tab not visible (requestAnimationFrame already does this, but also skip texture updates)
      *→ check document.hidden*
- [ ] Reduce history buffer size when performance drops
- [ ] Use ring buffer write without full row copy

### Memory
- [ ] Reuse Float32Array for reading line data instead of allocating each frame
      *→ single buffer in Renderer, overwrite each frame*
- [ ] Object pooling for frequently created small objects
- [ ] Clear uploaded volumes when switching presets
- [ ] Lazy load preset volumetric data

### General
- [ ] Throttle expensive recalculations (e.g., reading path geometry)
      *→ requestAnimationFrame or setTimeout debounce*
- [ ] Debounce slider/knob input events
- [ ] Profile render loop and identify bottlenecks
      *→ use Chrome DevTools Performance tab*
- [ ] Consider Web Workers for heavy CPU tasks (volume generation)
      *→ postMessage Float32Array (transferable)*
