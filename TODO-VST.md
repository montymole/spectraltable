# TODO-VST - Actual VST3 Status vs HTML Prototype

This file reflects the current codebase status more conservatively.

Rule used here:
- `[x]` means implemented and either clearly wired in code or already seen working in the JUCE host.
- `[ ]` means missing, partial, placeholder, or not verified enough to claim parity.

## Phase 1-2: Core + Visualization Pipeline
- [x] `SpectralCubePanel` OpenGL context clears correctly.
- [x] DPI-aware viewport fix is in place, so the cube panel now renders centered.
- [x] Basic wireframe cube renders visibly in the host.
- [x] Mouse orbit and wheel zoom are implemented for the cube view.
- [ ] Point cloud renderer now has a legacy-safe fallback path, but it is not yet host-verified in the current host.
- [ ] Reading line renderer now has a legacy-safe fallback path, but it is not yet host-verified in the current host.
- [ ] Reading plane geometry/render path now has a legacy-safe fallback path, but it is not yet host-verified in the current host.
- [ ] 3D texture upload code exists, but the renderer does not actually sample/use the volume texture yet.
- [ ] Axis/label geometry now has a legacy-safe render path, but host verification is still pending.
- [ ] Temporary GL debug text/path should be removed once the visualization pipeline is stable.

## Phase 3: Audio Engine Parity
- [x] `SpectralSynth` uses logarithmic bin-to-frequency mapping.
- [ ] Magnitude scaling, rolloff, interpolation behavior, and gain staging have not been compared closely enough to the HTML prototype to call them parity-complete.
- [ ] Spectral timeline behavior for animated sources still needs parity verification.

## Phase 4: Spectral Data Sources
- [x] WAV import + FFT analysis pipeline exists via `SpectralAnalyzer`.
- [x] Multi-file import is mapped across Y slices in the generated spectral volume.
- [x] The editor can switch between procedural generators and imported data.
- [ ] Import progress is tracked internally, but there is no visible progress UI yet.
- [ ] External/non-WAV data source workflows are still missing.

## Phase 5: Procedural Generators
- [x] Generator selection is wired to `SpectralVolume` regeneration.
- [x] Julia, Mandelbulb, Menger, Sine Plasma, Game of Life, Empty, and Imported modes are represented in the current UI/processor flow.
- [x] Per-generator parameter controls exist and are shown/hidden dynamically in the editor.
- [x] Sine Plasma and Game of Life have animation speed control and ticking in the processor.
- [ ] Generator outputs still need parity tuning against the HTML prototype.

## Phase 6: Wavetable Synthesis Mode
- [ ] Wavetable mode exists, but parity with the web worklet has not been verified.
- [ ] Carrier behavior, feedback, interpolation, octave doubling, and harmonic injection still need side-by-side comparison against the prototype.
- [ ] Envelope/gain normalization across synthesis modes still needs validation.

## Phase 7: UI Controls
- [x] `juce::GenericAudioProcessorEditor` has been replaced with a custom editor.
- [x] Core controls for path position, plane rotation, scan position, plane type, density, generator, synth params, ADSR, BPM, and master level are present.
- [x] Two LFO control sections exist in the UI.
- [x] Dynamic generator parameter controls exist.
- [x] A global reset button exists.
- [x] WAV import button exists.
- [x] Plane visibility is exposed as a UI toggle in the custom editor.
- [ ] The control styling is still mostly default JUCE, not parity with the HTML prototype.
- [ ] A dedicated scrub/transport-style interaction is still missing beyond the current scan/path controls.
- [ ] There is no per-control reset UX or more polished dynamic-control section behavior yet.

## Phase 8: MIDI Integration
- [ ] Full MIDI note-to-pitch parity is still missing.
- [ ] Velocity-to-amplitude parity is still missing.
- [ ] On-screen piano/keyboard UI is still missing.

## Phase 9: Modulation System
- [ ] Two LFOs are exposed in the UI, but actual parameter routing/modulation behavior is not implemented yet.
- [ ] Expansion to four LFOs is still missing.
- [ ] Waveform, sync, division, offset, and deeper LFO controls are still missing.
- [ ] Modulation routing UI comparable to the web prototype is still missing.

## Phase 10: Envelope System
- [x] Basic ADSR sliders are wired into the DSP envelope.
- [ ] Graphical ADSR editor with draggable nodes/playhead is still missing.
- [ ] Envelope editing parity with the prototype is still missing.

## Visualizers (Web Parity)
- [ ] The cube view is the only visualization with real rendering work in progress.
- [ ] The spectrogram panel is still a placeholder panel.
- [ ] The scope panel is still a placeholder panel.

## Presets / State
- [x] APVTS state save/restore is wired.
- [ ] Named preset management UI is still missing.
- [ ] Extra UI-only state persistence is still missing.

## QA / Parity Checks
- [ ] Build a proper parity checklist mapping each HTML control/feature to its VST implementation status.
- [ ] Create reference presets and compare audio output between the web prototype and the plugin.
- [ ] Verify point cloud, reading line, reading plane, and axes rendering in the current JUCE host path before marking them done.
