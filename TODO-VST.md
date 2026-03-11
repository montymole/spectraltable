# TODO-VST - VST3 Parity With HTML Prototype

This list is organized by the web prototype phases in `ROADMAP.md` and calls out what the JUCE VST3 still needs to implement to reach parity.

## Phase 1-2: Core + Visualization Pipeline
- [x] Implement `SpectralCubePanel` OpenGL rendering (wireframe cube + point cloud).
- [ ] Implement reading plane + reading line rendering.
- [ ] Stream `SpectralVolume` data into an OpenGL 3D texture and refresh on generator/data changes.
- [x] Add orbit camera + zoom + mouse controls to the cube view.
- [ ] Add axis labels and visual cues (Time / Morph / Bins) like the web prototype.

## Phase 3: Audio Engine Parity
- [ ] Match web log-frequency mapping in `SpectralSynth` (web uses logarithmic bin spacing, plugin currently uses linear).
- [ ] Align magnitude scaling, rolloff, and interpolation behavior with the web worklets (confirm gain staging and anti-aliasing).
- [ ] Add spectral timeline support if needed for animated data sources (plasma / GoL).

## Phase 4: Spectral Data Sources
- [ ] Implement WAV import + FFT analysis pipeline (multi-file morphing along Y).
- [ ] Add data source selection UI (procedural vs WAV vs external).
- [ ] Add progress reporting UI for analysis/import.

## Phase 5: Procedural Generators
- [ ] Wire `ParamID::GENERATOR` to `SpectralVolume` (Julia, Mandelbulb, Menger, Sine Plasma, Game of Life).
- [ ] Add per-generator parameters and a dynamic parameter UI (matching the web prototype controls).
- [ ] Add animation/ticking for Sine Plasma and Game of Life with speed controls.

## Phase 6: Wavetable Synthesis Mode
- [ ] Verify wavetable mode parity (carrier types, feedback, interpolation, octave doubling, harmonic injection) vs web worklet.
- [ ] Ensure envelope normalization and gain scaling match the web output.

## Phase 7: UI Controls
- [x] Replace `juce::GenericAudioProcessorEditor` with a custom UI skeleton.
- [x] Add controls for path position X/Y/Z and plane rotation X/Y/Z.
- [x] Add scan position and plane type selection.
- [x] Add volume density X/Y/Z controls and rebuild volume when changed.
- [x] Add spectral data select (generator).
- [x] Add controls for remaining synthesis params (octave, harmonics, copy, shape, interp, LFOs, BPM, ADSR, master).
- [ ] Add scrub/speed control.
- [ ] Add dynamic parameter slider + reset action.
- [ ] Style controls to match the web knob/section look (colors, spacing, icons).

## Phase 8: MIDI Integration
- [ ] Map MIDI note to pitch for wavetable mode (frequency) and spectral mode (frequency multiplier).
- [ ] Apply velocity to amplitude (ADSR gain scaling).
- [ ] Add on-screen piano UI for parity with web prototype.

## Phase 9: Modulation System (LFOs)
- [ ] Expand to 4 LFOs (web prototype has four).
- [ ] Implement waveform, rate, amp, offset, sync, division, BPM per LFO.
- [ ] Implement routing to Path Y, Scan Phase, Shape Phase (and any other modulatable params).
- [ ] Add modulation source selectors in the UI for each modulatable control.

## Phase 10: Envelope System
- [ ] Add ADSR editor UI with draggable nodes and a playhead.
- [ ] Keep ADSR state in sync between UI and DSP.

## Visualizers (Web Parity)
- [ ] Implement spectrogram view driven by spectral data.
- [ ] Implement stereo scope view (Lissajous + dual-channel modes).

## Presets / State
- [ ] Add named preset management UI (save/load/delete) on top of APVTS state.
- [ ] Persist additional UI-only state that is not in APVTS (layout, selected data source, etc).

## QA / Parity Checks
- [ ] Build a parity checklist that maps each web control/feature to a VST control/feature.
- [ ] Create a small set of reference presets and compare audio output between web and VST.
