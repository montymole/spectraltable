# Spectral Table Audio Engine Enhancements - Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add waveshaping UI controls, filter section, and image-to-volume data source to the prototype browser synthesizer.

**Architecture:** All 4 features involve wiring existing or new worklet message handlers to the UI control panel. The worklets already support waveshaping messages. Filter and image features require adding new worklet capabilities and UI sections. The filter will be implemented as an AudioWorklet-based State Variable Filter (SVF) chain.

**Tech Stack:** TypeScript, Web Audio API (AudioWorklet), WebGL2, Vite

---

## Feature 1: Waveshaping UI Section (Controls Only)

The worklets already support waveshaping via `postMessage({ type: 'waveshape', curve, drive, mix })`. The `WaveshapeState` type exists in `types/index.ts`. The worklets implement: 0=none, 1=tanh, 2=polynomial, 3=sine fold with drive (1-20) and mix (0-1). Just need the UI controls and wiring.

### Task 1.1: Add waveshaping state to ControlPanel class

**Files:**
- Modify: `proto/src/ui/controls.ts` (ControlPanel class)

**Changes:**
1. Import `WaveshapeState` and `defaultWaveshapeState` from types
2. Add private member: `private waveshapeState: WaveshapeState = defaultWaveshapeState`
3. Add private member: `private onWaveshapeChange: ((state: WaveshapeState) => void) | null = null`
4. Add setter: `public setWaveshapeChangeCallback(callback: (state: WaveshapeState) => void): void`
5. Add setter for state restoration: `public setWaveshapeState(state: WaveshapeState): void`

### Task 1.2: Add waveshaping controls to synthesis section UI

**Files:**
- Modify: `proto/src/ui/controls.ts` (populateSynthesisSection method)

**Changes:**
After the Spectral Copy controls (line 384), add a new subGroup with:
1. Section label "Waveshaping"
2. Select dropdown for curve type: "None", "Tanh", "Polynomial", "Sine Fold" (values 0-3)
3. Slider "Drive" (1.0 - 20.0, default 1.0, step 0.1)
4. Slider "Mix" (0.0 - 1.0, default 0.0, step 0.01)
5. Wire all three to update `waveshapeState` and call `onWaveshapeChange`

### Task 1.3: Add waveshape message sending to AudioEngine

**Files:**
- Modify: `proto/src/audio/audio-engine.ts`

**Changes:**
1. Add private members for waveshape state in AudioEngine
2. Add `setWaveshapeState(state: { curve: number, drive: number, mix: number })` method that:
   - Sends `postMessage({ type: 'waveshape', curve, drive, mix })` to worklet
   - Stores state for offline rendering
3. Update `createWorkletNode` to send initial waveshape state on node creation
4. Update `renderOffline` to send waveshape params

### Task 1.4: Wire waveshape in main.ts and add to preset serialization

**Files:**
- Modify: `proto/src/main.ts`
- Modify: `proto/src/types/index.ts` (PresetControls interface)

**Changes:**
1. In `main.ts`, wire `controls.setWaveshapeChangeCallback(...)`
2. Add `waveshapeState` to `getFullState()` return in controls.ts
3. Add `waveshape?: WaveshapeState` to `PresetControls` interface (already exists)
4. Restore waveshaping state when preset is loaded

### Task 1.5: Update TODO.md checklist

**Files:**
- Modify: `TODO.md`

**Changes:**
Mark items related to waveshaping as completed:
- [x] Waveshaping section
- [x] Built-in curves dropdown
- [x] Drive/amount control

---

## Feature 2: Filter Section (SVF Implementation)

Add a multimode State Variable Filter with cutoff, resonance, and modulation routing. This is implemented as a new AudioWorklet processor that receives the synth worklet's output and applies filtering before the master gain.

### Task 2.1: Create filter.worklet.ts with SVF implementation

**Files:**
- Create: `proto/src/audio/worklets/filter.worklet.ts`

**Implementation:**
A State Variable Filter worklet that:
1. Accepts input from previous worklet node
2. Implements SVF topology with 4 modes: LP, HP, BP, Notch
3. Parameters: cutoff (20-20000 Hz), resonance (0-18 dB), type (0-3)
4. Pre-computed coefficients updated on parameter change
5. Standard biquad-style SVF formulation

SVF equations (per sample):
```
hi = (cutoff * dt) * (x + b * band)
band += -hi * (1 / (cutoff * dt)) + resonance * band
lp = hi
hp = x - lp - band
```

### Task 2.2: Add filter routing to AudioEngine

**Files:**
- Modify: `proto/src/audio/audio-engine.ts`

**Changes:**
1. Add `private filterNode: AudioWorkletNode | null = null`
2. Add filter state members: cutoff (20-20000), resonance (0-18dB), type (0-3), bypass (boolean)
3. Add `initialize` method to load `filter.worklet.ts` via URL import
4. Rewrite signal chain: workletNode -> filterNode -> masterGain -> destination + splitNode
5. Add `setFilterParams` method that updates filter node params via postMessage
6. In `createWorkletNode`, insert filter node between worklet and master gain
7. Update `renderOffline` to include filter in offline chain

### Task 2.3: Add filter state types and defaults

**Files:**
- Modify: `proto/src/types/index.ts`

**Changes:**
1. Add `FilterState` interface:
   - `cutoff: number` (20-20000 Hz)
   - `resonance: number` (0-18 dB)
   - `type: number` (0=LP, 1=HP, 2=BP, 3=Notch)
   - `bypass: boolean`
2. Add `defaultFilterState` constant
3. Add `filter` field to `PresetControls` interface

### Task 2.4: Add filter controls to UI

**Files:**
- Modify: `proto/src/ui/controls.ts`

**Changes:**
1. Add filter section to Audio Synthesis (after waveshaping, subGroup6)
2. Controls:
   - "Filter Type" select: Low Pass, High Pass, Band Pass, Notch
   - "Cutoff" slider (20-20000, log scaling, default 5000)
   - "Resonance" slider (0-18 dB, default 0)
   - Toggle button or checkbox for bypass
3. Wire to update filter state and call callback

### Task 2.5: Add LFO routing to filter cutoff and resonance

**Files:**
- Modify: `proto/src/types/index.ts` (existing ModulatorState or new filter routing)
- Modify: `proto/src/ui/controls.ts`
- Modify: `proto/src/main.ts`

**Changes:**
1. In types, add `filterCutoff` and `filterResonance` to modulator routing state
2. In controls, extend modulation routing dropdown to include filter targets
3. In main.ts, when LFO/envelope modulators fire, apply modulation amount to filter params
4. The actual modulation is handled by adjusting the cutoff/resonance values in the main thread before sending to worklet

### Task 2.6: Wire filter in main.ts and update presets

**Files:**
- Modify: `proto/src/main.ts`

**Changes:**
1. Call `audioEngine.setFilterParams(...)` when filter state changes
2. Add filter state to preset save/load flow

### Task 2.7: Update TODO.md

**Files:**
- Modify: `TODO.md`

**Changes:**
Mark filter-related items as completed.

---

## Feature 3: Image Data Sources

Allow uploading images and converting pixel data to spectral volumes. Draw image to canvas, extract RGBA data, map to volume RGBA format (R=magnitude, G=phase, B=pan, A=width).

### Task 3.1: Add image upload to AudioAnalyzer

**Files:**
- Modify: `proto/src/audio/audio-analyzer.ts`

**Changes:**
Add method `analyzeImageToVolume(file: File, volumeSize: { x, y, z }): Promise<Float32Array>`

Implementation:
1. Load image via `URL.createObjectURL(file)` and `<img>` element
2. Draw to offscreen canvas
3. Extract pixel data via `getImageData()`
4. Map tiles: divide image width into X bins, height into Y morph layers
5. For Z dimension, replicate the image data across all Z slices (or tile multiple times)
6. Map RGBA from image to volume format:
   - Volume R = (brightness of pixel) scaled 0-1
   - Volume G = normalized x position (0-1)
   - Volume B = normalized x position (stereo spread by frequency)
   - Volume A = normalized z position (time)
7. Return Float32Array in volume format

### Task 3.2: Add image upload button to Volume Section UI

**Files:**
- Modify: `proto/src/ui/controls.ts` (populateVolumeSection)

**Changes:**
1. Add file input for images: `createFileInput(subGroup2, 'image-upload', 'Upload Image', '.png,.jpg,.webp', false, callback)`
2. Add progress indicator for image processing
3. Wire callback to call `audioAnalyzer.analyzeImageToVolume()`
4. After processing, populate spectral volume and add to data source dropdown

### Task 3.3: Integrate image data into main.ts data loading flow

**Files:**
- Modify: `proto/src/main.ts`

**Changes:**
1. Add `onImageUpload` callback on controls
2. Process image through audioAnalyzer, get volume data
3. Pass volume data to renderer/SpectralVolume
4. Add "uploaded-image" to spectral data dropdown selection
5. Handle cleanup of object URLs

### Task 3.4: Update TODO.md

**Files:**
- Modify: `TODO.md`

**Changes:**
Mark image-related items as completed.

---

## Development Order

1. Feature 1 (Waveshaping UI) - Easiest, pure wiring, 5 tasks
2. Feature 3 (Image data sources) - Medium, new analyzer method + UI, 4 tasks
3. Feature 2 (Filter) - Hardest, new worklet + audio chain rewrite, 7 tasks

## Testing Strategy

For each feature:
1. Manual testing in browser: open dev, load prototype, verify controls appear and affect sound
2. Listen for clicks/pops when toggling waveshaping/filter
3. Verify preset save/load preserves new states
4. Test offline render includes new parameters

---

## Environment Setup for Subagents

- Working directory: `proto/`
- Dev server: `npm run dev` (Vite HMR on port 3000)
- TypeScript: strict mode, no external deps
- Testing: browser-based manual verification (no unit test framework)
- Git: commit after each task with descriptive messages
