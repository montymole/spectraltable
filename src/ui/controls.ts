import { LFO } from '../modulators/lfo';
import {
    ReadingPathState, VolumeResolution, SynthMode, CarrierType, PlaneType,
    VOLUME_DENSITY_X_MIN, VOLUME_DENSITY_X_MAX, VOLUME_DENSITY_X_DEFAULT,
    VOLUME_DENSITY_Y_MIN, VOLUME_DENSITY_Y_MAX, VOLUME_DENSITY_Y_DEFAULT,
    VOLUME_DENSITY_Z_MIN, VOLUME_DENSITY_Z_MAX, VOLUME_DENSITY_Z_DEFAULT,
    GeneratorParams, JuliaParams, MandelbulbParams, MengerParams, PlasmaParams, GameOfLifeParams,
    defaultJuliaParams, defaultMandelbulbParams, defaultMengerParams, defaultPlasmaParams, defaultGameOfLifeParams,
    PresetControls, LFOState
} from '../types';
import { PresetManager } from './preset-manager';
import {
    createSection, createSlider, createSelect, createModulatableSlider,
    createFileInput, createButton, WAVEFORM_ICONS, CONTROL_STYLE
} from './ui-elements';

interface SectionOpts {
    title: string;
    populate: (container: HTMLElement) => void;
}

// UI control panel with sliders for all parameters
export class ControlPanel {
    private container: HTMLElement;

    // Path controls
    private pathYSlider!: HTMLInputElement;
    private planeTypeSelect!: HTMLSelectElement;
    private scanPositionSlider!: HTMLInputElement;

    // Synth mode controls
    private synthModeSelect!: HTMLSelectElement;
    private frequencySlider!: HTMLInputElement;
    private frequencyContainer: HTMLElement | null = null;
    private carrierContainer: HTMLElement | null = null;
    private feedbackContainer: HTMLElement | null = null;

    private midiSelect!: HTMLSelectElement;

    // Volume density controls
    private densityXSlider!: HTMLInputElement;
    private densityYSlider!: HTMLInputElement;
    private densityZSlider!: HTMLInputElement;

    // Spectral data controls
    private spectralDataSelect!: HTMLSelectElement;
    private dynamicParamSlider: HTMLInputElement | null = null;
    private dynamicParamContainer: HTMLElement | null = null;

    // Generator parameter sliders
    private generatorParamsContainer: HTMLElement | null = null;
    private currentGeneratorParams: GeneratorParams | null = null;
    private currentDataSet: string = 'blank';

    // Progress indicators
    private progressContainer: HTMLElement | null = null;
    private progressFill: HTMLElement | null = null;
    private progressText: HTMLElement | null = null;

    // Callbacks
    private onPathChange: ((state: ReadingPathState) => void) | null = null;
    private onVolumeResolutionChange?: (resolution: VolumeResolution) => void;
    private onSpectralDataChange?: (dataSet: string) => void;
    private onWavUpload?: (files: FileList) => void;
    private onSynthModeChange: ((mode: SynthMode) => void) | null = null;
    private onFrequencyChange: ((freq: number) => void) | null = null;
    private onCarrierChange: ((carrier: CarrierType) => void) | null = null;
    private onFeedbackChange: ((amount: number) => void) | null = null;
    private onMidiInputChange: ((id: string) => void) | null = null;
    private onOctaveChange: ((octave: number) => void) | null = null;

    // LFO Callbacks
    private onLFOParamChange: ((index: number, param: string, value: any) => void) | null = null;
    private onModulationRoutingChange: ((target: string, source: string) => void) | null = null;

    // Generator params callback
    private onGeneratorParamsChange: ((dataSet: string, params: GeneratorParams) => void) | null = null;

    // Preset system
    private presetManager: PresetManager;
    private presetSelect: HTMLSelectElement | null = null;
    private onPresetLoad: ((controls: PresetControls) => void) | null = null;

    // LFO state for serialization
    private lfoLabels: string[] = ['None'];
    private lfoState: LFOState[] = [];
    private modRoutingState = { pathY: 'none', scanPhase: 'none', shapePhase: 'none' };
    private octaveValue = 3;

    // Debounce timer for auto-save
    private autoSaveTimer: number | null = null;

    // LFO UI element references for state restoration
    private lfoWaveSelects: HTMLSelectElement[] = [];
    private lfoFreqSliders: HTMLInputElement[] = [];
    private lfoAmpSliders: HTMLInputElement[] = [];
    private lfoOffsetSliders: HTMLInputElement[] = [];
    private lfoFreqDisplays: HTMLSpanElement[] = [];
    private lfoAmpDisplays: HTMLSpanElement[] = [];
    private lfoOffsetDisplays: HTMLSpanElement[] = [];

    // Waveform Icon containers
    private carrierIconContainer: HTMLElement | null = null;
    private lfoIconContainers: HTMLElement[] = [];

    // Modulation routing selects
    private pathYSourceSelect: HTMLSelectElement | null = null;
    private scanPhaseSourceSelect: HTMLSelectElement | null = null;
    private shapePhaseSourceSelect: HTMLSelectElement | null = null;

    constructor(containerId: string, options: { lfos: LFO[] }) {
        const el = document.getElementById(containerId);
        if (!el) throw new Error(`Container not found: ${containerId}`);
        this.container = el;

        this.lfoState = options.lfos.map((lfo, index) => {
            const label = `LFO ${index + 1}`;
            this.lfoLabels.push(label);
            return {
                waveform: lfo.waveform,
                frequency: lfo.frequency,
                amplitude: lfo.amplitude,
                offset: lfo.offset
            };
        });

        // Initialize preset manager
        this.presetManager = new PresetManager();
        this.presetManager.setPresetsChangeCallback(() => this.updatePresetDropdown());

        const sections: SectionOpts[] = [
            { title: 'Wave/Spectral Volume', populate: (c) => this.populateVolumeSection(c) },
            { title: 'Reading Path', populate: (c) => this.populatePathSection(c) },
            { title: 'Audio Synthesis', populate: (c) => this.populateSynthesisSection(c) },
            { title: 'LFOs', populate: (c) => this.populateLFOSection(c) },
            { title: 'Envelopes', populate: (c) => this.populateEnvelopeSection(c) },
            { title: 'Visualization', populate: (c) => this.populateVisualizationSection(c) },
            { title: 'Presets', populate: (c) => this.populatePresetSection(c) },
        ];

        sections.forEach(s => {
            const container = createSection(this.container, s.title);
            s.populate(container);
        });


    }

    private populateVolumeSection(container: HTMLElement): void {
        const subGroup = document.createElement('div');
        subGroup.classList.add('sub-group');
        container.appendChild(subGroup);
        this.spectralDataSelect = createSelect(subGroup, 'spectral-data-type', 'Data Set', [
            'blank', '3d-julia', 'mandelbulb', 'menger-sponge', 'sine-plasma', 'game-of-life'
        ], (val) => {
            if (this.onSpectralDataChange) this.onSpectralDataChange(val);
            this.scheduleAutoSave();
        });
        this.createGeneratorParamsContainer(subGroup);
        createButton(subGroup, 'reset-dataset-btn', '↻ Reset Dataset', () => {
            if (this.onSpectralDataChange) this.onSpectralDataChange(this.spectralDataSelect.value);
        });
        const subGroup2 = document.createElement('div');
        subGroup2.classList.add('sub-group');
        container.appendChild(subGroup2);
        createFileInput(subGroup2, 'wav-upload', 'Upload WAV (Multi-select)', '.wav,.mp3,.ogg', true, (files) => {
            if (files && files.length > 0 && this.onWavUpload) this.onWavUpload(files);
        });
        this.createProgressIndicator(subGroup2);
    }

    private populatePathSection(container: HTMLElement): void {
        const lfoOptions = this.lfoLabels.map(l => ({
            value: l.toLowerCase().replace(' ', ''),
            label: l
        }));

        const pathYControl = createModulatableSlider(container, 'path-y', 'Position Y (Morph)', -1, 1, 0, 0.01, lfoOptions,
            (_v) => { if (this.onPathChange) this.onPathChange(this.getState()); this.scheduleAutoSave(); },
            (source) => {
                this.modRoutingState.pathY = source;
                if (this.onModulationRoutingChange) this.onModulationRoutingChange('pathY', source);
                this.scheduleAutoSave();
            }
        );
        this.pathYSlider = pathYControl.slider;
        this.pathYSourceSelect = pathYControl.select;

        this.planeTypeSelect = createSelect(container, 'plane-type', 'Plane Type', [
            PlaneType.FLAT, PlaneType.SINCOS, PlaneType.WAVE, PlaneType.RIPPLE
        ], (_val) => {
            if (this.onPathChange) this.onPathChange(this.getState());
            this.scheduleAutoSave();
        });

        // Shape Phase Modulation
        const spGroup = document.createElement('div');
        spGroup.className = 'control-group';

        this.shapePhaseSourceSelect = createSelect(spGroup, 'shape-phase-source', 'Shape Phase Source', lfoOptions, (source) => {
            this.modRoutingState.shapePhase = source;
            if (this.onModulationRoutingChange) this.onModulationRoutingChange('shapePhase', source);
            this.scheduleAutoSave();
        });

        container.appendChild(spGroup);

        const scanControl = createModulatableSlider(container, 'scan-pos', 'Scan Phase', -1, 1, 0, 0.01, lfoOptions as any,
            (_v) => { if (this.onPathChange) this.onPathChange(this.getState()); this.scheduleAutoSave(); },
            (source) => {
                this.modRoutingState.scanPhase = source;
                if (this.onModulationRoutingChange) this.onModulationRoutingChange('scanPhase', source);
                this.scheduleAutoSave();
            }
        );
        this.scanPositionSlider = scanControl.slider;
        this.scanPhaseSourceSelect = scanControl.select;
    }

    private populateSynthesisSection(container: HTMLElement): void {
        const subGroup = document.createElement('div');
        subGroup.classList.add('sub-group');
        container.appendChild(subGroup);
        this.synthModeSelect = createSelect(subGroup, 'synth-mode', 'Mode', [
            SynthMode.WAVETABLE, SynthMode.SPECTRAL, SynthMode.WHITENOISE_BAND_Q_FILTER
        ], (val) => {
            const mode = val as SynthMode;
            if (this.frequencyContainer) this.frequencyContainer.style.display = mode === SynthMode.WAVETABLE ? 'block' : 'none';
            if (this.carrierContainer) this.carrierContainer.style.display = mode === SynthMode.WAVETABLE ? 'block' : 'none';
            if (this.feedbackContainer) this.feedbackContainer.style.display = mode === SynthMode.WAVETABLE ? 'block' : 'none';
            if (this.onSynthModeChange) this.onSynthModeChange(mode);
            this.scheduleAutoSave();
        });
        this.midiSelect = this.createMidiSelect(subGroup);
        this.createOctaveSelect(subGroup);
        const subGroup2 = document.createElement('div');
        subGroup2.classList.add('sub-group');
        container.appendChild(subGroup2);
        this.createCarrierSelect(subGroup2);
        this.frequencySlider = this.createFrequencySlider(subGroup2);
        this.createFeedbackSlider(subGroup2);
    }

    private populateLFOSection(container: HTMLElement): void {
        this.lfoState.forEach((_, index) => this.createLFOUnit(container, index));
    }

    private populateEnvelopeSection(container: HTMLElement): void {
        this.createEnvelopeUI(container);
    }

    private populateVisualizationSection(container: HTMLElement): void {
        const volUpdate = () => {
            if (this.onVolumeResolutionChange) {
                this.onVolumeResolutionChange({
                    x: Math.round(parseFloat(this.densityXSlider.value)),
                    y: Math.round(parseFloat(this.densityYSlider.value)),
                    z: Math.round(parseFloat(this.densityZSlider.value)),
                });
            }
            this.scheduleAutoSave();
        };
        this.densityXSlider = createSlider(container, 'density-x', 'Freq Bins (X)', VOLUME_DENSITY_X_MIN, VOLUME_DENSITY_X_MAX, VOLUME_DENSITY_X_DEFAULT, 1, volUpdate);
        this.densityYSlider = createSlider(container, 'density-y', 'Morph Layers (Y)', VOLUME_DENSITY_Y_MIN, VOLUME_DENSITY_Y_MAX, VOLUME_DENSITY_Y_DEFAULT, 1, volUpdate);
        this.densityZSlider = createSlider(container, 'density-z', 'Time Res (Z)', VOLUME_DENSITY_Z_MIN, VOLUME_DENSITY_Z_MAX, VOLUME_DENSITY_Z_DEFAULT, 1, volUpdate);
    }

    private populatePresetSection(container: HTMLElement): void {
        this.createPresetUI(container);
    }

    // ... (createSection, createSlider, createSelect methods remain same)

    private appendControl(container: HTMLElement, element: HTMLElement): void {
        container.appendChild(element);
    }

    private createLFOUnit(container: HTMLElement, index: number): void {
        const wrapper = document.createElement('div');
        wrapper.className = 'lfo-unit';
        if (CONTROL_STYLE === 'knob') wrapper.classList.add('knob-layout');

        const title = document.createElement('label');
        title.innerText = `LFO ${index + 1}`;
        wrapper.appendChild(title);

        const iconContainer = document.createElement('div');
        iconContainer.className = 'waveform-icon';
        iconContainer.innerHTML = WAVEFORM_ICONS[this.lfoState[index].waveform] || WAVEFORM_ICONS['sine'];
        this.lfoIconContainers[index] = iconContainer;

        const waveSelect = createSelect(wrapper, `lfo-${index}-wave`, 'Waveform', [
            { value: 'sine', label: 'Sine' },
            { value: 'square', label: 'Square' },
            { value: 'saw', label: 'Saw' },
            { value: 'triangle', label: 'Triangle' }
        ], (val) => {
            this.lfoState[index].waveform = val;
            if (this.onLFOParamChange) this.onLFOParamChange(index, 'waveform', val);
            iconContainer.innerHTML = WAVEFORM_ICONS[val] || WAVEFORM_ICONS['sine'];
            this.scheduleAutoSave();
        });

        const waveLabelRow = wrapper.querySelector('.label-row') as HTMLElement;
        if (waveLabelRow) waveLabelRow.appendChild(iconContainer);

        this.lfoWaveSelects[index] = waveSelect;

        this.lfoFreqSliders[index] = createSlider(wrapper, `lfo-${index}-freq`, 'Freq', 0, 1, this.lfoState[index].frequency, 0.01, (val) => {
            this.lfoState[index].frequency = val;
            if (this.onLFOParamChange) this.onLFOParamChange(index, 'frequency', val);
            this.scheduleAutoSave();
        });

        this.lfoAmpSliders[index] = createSlider(wrapper, `lfo-${index}-amp`, 'Amp', 0, 1, this.lfoState[index].amplitude, 0.01, (val) => {
            this.lfoState[index].amplitude = val;
            if (this.onLFOParamChange) this.onLFOParamChange(index, 'amplitude', val);
            this.scheduleAutoSave();
        });

        this.lfoOffsetSliders[index] = createSlider(wrapper, `lfo-${index}-offset`, 'Offset', -1, 1, this.lfoState[index].offset, 0.01, (val) => {
            this.lfoState[index].offset = val;
            if (this.onLFOParamChange) this.onLFOParamChange(index, 'offset', val);
            this.scheduleAutoSave();
        });

        this.appendControl(container, wrapper);
    }

    public envelopeCanvas: HTMLCanvasElement | null = null;

    private createEnvelopeUI(container: HTMLElement): void {
        const wrapper = document.createElement('div');
        wrapper.className = 'control-group';
        wrapper.style.height = '150px';

        const canvas = document.createElement('canvas');
        canvas.id = 'envelope-canvas-control';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.display = 'block';
        canvas.style.background = '#08080c';
        canvas.style.borderRadius = '4px';
        canvas.style.border = '1px solid var(--border-subtle)';

        wrapper.appendChild(canvas);
        this.appendControl(container, wrapper);
        this.envelopeCanvas = canvas;
    }

    private createFrequencySlider(container: HTMLElement): HTMLInputElement {
        const slider = createSlider(container, 'frequency', 'Frequency', 20, 2000, 220, 1, (freq) => {
            const valDisplay = document.getElementById('frequency-value');
            if (valDisplay) {
                const noteName = this.freqToNoteName(freq);
                valDisplay.textContent = `${Math.round(freq)} Hz (${noteName})`;
            }
            if (this.onFrequencyChange) this.onFrequencyChange(freq);
        });

        const group = slider.closest('.control-group') as HTMLElement;
        if (group) {
            group.id = 'frequency-container';
            this.frequencyContainer = group;
        }

        this.frequencySlider = slider;
        return slider;
    }

    private createCarrierSelect(container: HTMLElement): HTMLSelectElement {
        const group = document.createElement('div');
        group.id = 'carrier-container';
        group.className = 'control-group';

        const labelEl = document.createElement('label');
        labelEl.htmlFor = 'carrier';
        labelEl.textContent = 'Carrier';

        const iconContainer = document.createElement('div');
        iconContainer.className = 'waveform-icon';
        iconContainer.innerHTML = WAVEFORM_ICONS['sine'];
        this.carrierIconContainer = iconContainer;

        const select = createSelect(group, 'carrier', 'Carrier', [
            { value: '0', label: 'Sine' },
            { value: '1', label: 'Saw' },
            { value: '2', label: 'Square' },
            { value: '3', label: 'Triangle' }
        ], (val) => {
            const carrierVal = parseInt(val) as CarrierType;
            if (this.onCarrierChange) this.onCarrierChange(carrierVal);
            const keys = ['sine', 'saw', 'square', 'triangle'];
            iconContainer.innerHTML = WAVEFORM_ICONS[keys[carrierVal]] || WAVEFORM_ICONS['sine'];
        });

        const labelRow = group.querySelector('.label-row') as HTMLElement;
        if (labelRow) labelRow.appendChild(iconContainer);

        this.appendControl(container, group);
        this.carrierContainer = group;
        return select;
    }

    private createFeedbackSlider(container: HTMLElement): HTMLInputElement {
        const slider = createSlider(container, 'feedback', 'Feedback', 0, 0.99, 0, 0.01, (val) => {
            if (this.onFeedbackChange) this.onFeedbackChange(val);
        });
        const group = slider.closest('.control-group') as HTMLElement;
        if (group) {
            group.id = 'feedback-container';
            this.feedbackContainer = group;
        }
        return slider;
    }

    private createMidiSelect(container: HTMLElement): HTMLSelectElement {
        const select = createSelect(container, 'midi-input', 'MIDI Input', [
            { value: '', label: 'No Devices Found' }
        ], (val) => {
            if (this.onMidiInputChange) this.onMidiInputChange(val);
        });
        return select;
    }

    private createOctaveSelect(container: HTMLElement): HTMLSelectElement {
        const select = createSelect(container, 'octave-select', 'Keyboard Octave', [
            '0', '1', '2', '3', '4', '5', '6', '7'
        ], (val) => {
            this.octaveValue = parseInt(val, 10);
            if (this.onOctaveChange) this.onOctaveChange(this.octaveValue);
            this.scheduleAutoSave();
        });
        select.value = '3';
        return select;
    }

    private freqToNoteName(freq: number): string {
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const midiNote = 12 * Math.log2(freq / 440) + 69;
        const roundedMidi = Math.round(midiNote);
        const octave = Math.floor(roundedMidi / 12) - 1;
        const noteIndex = roundedMidi % 12;
        return `${noteNames[noteIndex]}${octave}`;
    }

    private createPresetUI(container: HTMLElement): void {
        const selectGroup = document.createElement('div');
        selectGroup.className = 'control-group';

        this.presetSelect = createSelect(selectGroup, 'preset-select', 'Load Preset', [], (val) => {
            if (val && this.onPresetLoad) {
                const preset = this.presetManager.getPreset(val);
                if (preset) this.onPresetLoad(preset.controls);
            }
        });

        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = '-- Select Preset --';
        this.presetSelect.insertBefore(defaultOpt, this.presetSelect.firstChild);

        this.appendControl(container, selectGroup);
        this.updatePresetDropdown();

        const buttonGroup = document.createElement('div');
        buttonGroup.className = 'control-group';
        buttonGroup.style.display = 'flex';
        buttonGroup.style.gap = '8px';

        createButton(buttonGroup, 'save-preset-btn', '💾 Save', () => {
            const name = prompt('Enter preset name:');
            if (name && name.trim()) this.presetManager.savePreset(name.trim(), this.getFullState());
        });

        createButton(buttonGroup, 'delete-preset-btn', '🗑 Delete', () => {
            if (this.presetSelect && this.presetSelect.value) {
                if (confirm(`Delete preset "${this.presetSelect.value}"?`)) {
                    this.presetManager.deletePreset(this.presetSelect.value);
                }
            }
        });

        this.appendControl(container, buttonGroup);
    }

    private updatePresetDropdown(): void {
        if (!this.presetSelect) return;

        const currentValue = this.presetSelect.value;
        this.presetSelect.innerHTML = '';

        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = '-- Select Preset --';
        this.presetSelect.appendChild(defaultOpt);

        const presets = this.presetManager.getPresets();
        for (const preset of presets) {
            const opt = document.createElement('option');
            opt.value = preset.name;
            opt.textContent = preset.name;
            this.presetSelect.appendChild(opt);
        }

        // Restore selection if still exists
        if (presets.some(p => p.name === currentValue)) {
            this.presetSelect.value = currentValue;
        }
    }

    private scheduleAutoSave(): void {
        if (this.autoSaveTimer) {
            clearTimeout(this.autoSaveTimer);
        }
        this.autoSaveTimer = window.setTimeout(() => {
            this.presetManager.saveCurrentState(this.getFullState());
        }, 500);
    }

    public getFullState(): PresetControls {
        return {
            pathY: parseFloat(this.pathYSlider.value),
            scanPosition: parseFloat(this.scanPositionSlider.value),
            planeType: this.planeTypeSelect.value,
            synthMode: this.synthModeSelect.value,
            frequency: parseFloat(this.frequencySlider.value),
            carrier: parseInt((document.getElementById('carrier') as HTMLSelectElement)?.value || '0'),
            feedback: parseFloat((document.getElementById('feedback') as HTMLInputElement)?.value || '0'),
            densityX: parseFloat(this.densityXSlider.value),
            densityY: parseFloat(this.densityYSlider.value),
            densityZ: parseFloat(this.densityZSlider.value),
            spectralData: this.spectralDataSelect.value,
            generatorParams: this.currentGeneratorParams || undefined,
            lfos: this.lfoState.map(lfo => ({ ...lfo })),
            modRouting: { ...this.modRoutingState },
            envelopes: [{ attack: 0.1, decay: 0.2, sustain: 0.5, release: 0.5 }], // Will be updated from AudioEngine
            octave: this.octaveValue
        };
    }

    public setPresetLoadCallback(callback: (controls: PresetControls) => void): void {
        this.onPresetLoad = callback;
    }

    public loadSavedState(): PresetControls | null {
        return this.presetManager.loadCurrentState();
    }

    public applyState(state: PresetControls): void {
        // Apply all control values from state
        this.pathYSlider.value = String(state.pathY);
        this.scanPositionSlider.value = String(state.scanPosition);
        this.planeTypeSelect.value = state.planeType;
        this.synthModeSelect.value = state.synthMode;
        this.frequencySlider.value = String(state.frequency);
        this.densityXSlider.value = String(state.densityX);
        this.densityYSlider.value = String(state.densityY);
        this.densityZSlider.value = String(state.densityZ);
        this.spectralDataSelect.value = state.spectralData;

        // Update carrier and feedback
        const carrierEl = document.getElementById('carrier') as HTMLSelectElement;
        if (carrierEl) {
            carrierEl.value = String(state.carrier);
            if (this.carrierIconContainer) {
                const options = [
                    { value: '0', key: 'sine' },
                    { value: '1', key: 'saw' },
                    { value: '2', key: 'square' },
                    { value: '3', key: 'triangle' },
                ];
                const key = options.find(o => o.value === carrierEl.value)?.key || 'sine';
                this.carrierIconContainer.innerHTML = WAVEFORM_ICONS[key];
            }
        }

        const feedbackEl = document.getElementById('feedback') as HTMLInputElement;
        if (feedbackEl) feedbackEl.value = String(state.feedback);

        // Update octave
        const octaveEl = document.getElementById('octave-select') as HTMLSelectElement;
        if (octaveEl) {
            octaveEl.value = String(state.octave);
            this.octaveValue = state.octave;
        }

        // Store LFO and routing state
        if (state.lfos) {
            state.lfos.forEach((lfoData, index) => {
                if (this.lfoState[index]) {
                    this.lfoState[index] = { ...lfoData };
                    this.updateLFOUI(index, lfoData);
                }
            });
        }
        this.modRoutingState = { ...state.modRouting };

        // Update modulation routing UI
        this.updateModRoutingUI();

        // Store generator params
        if (state.generatorParams) {
            this.currentGeneratorParams = state.generatorParams;
        }

        // Update value displays
        this.updateAllDisplays();
    }

    private updateLFOUI(index: number, lfo: { waveform: string; frequency: number; amplitude: number; offset: number }): void {
        if (this.lfoWaveSelects[index]) {
            this.lfoWaveSelects[index].value = lfo.waveform;
            if (this.lfoIconContainers[index]) {
                this.lfoIconContainers[index].innerHTML = WAVEFORM_ICONS[lfo.waveform] || WAVEFORM_ICONS['sine'];
            }
        }
        if (this.lfoFreqSliders[index]) {
            this.lfoFreqSliders[index].value = String(lfo.frequency);
            if (this.lfoFreqDisplays[index]) {
                this.lfoFreqDisplays[index].textContent = `${lfo.frequency} Hz`;
            }
        }
        if (this.lfoAmpSliders[index]) {
            this.lfoAmpSliders[index].value = String(lfo.amplitude);
            if (this.lfoAmpDisplays[index]) {
                this.lfoAmpDisplays[index].textContent = String(lfo.amplitude);
            }
        }
        if (this.lfoOffsetSliders[index]) {
            this.lfoOffsetSliders[index].value = String(lfo.offset);
            if (this.lfoOffsetDisplays[index]) {
                this.lfoOffsetDisplays[index].textContent = String(lfo.offset);
            }
        }
    }

    private updateModRoutingUI(): void {
        // Update pathY source select
        if (this.pathYSourceSelect) {
            this.pathYSourceSelect.value = this.modRoutingState.pathY;
            this.pathYSlider.disabled = this.modRoutingState.pathY !== 'none';
        }
        // Update scanPhase source select
        if (this.scanPhaseSourceSelect) {
            this.scanPhaseSourceSelect.value = this.modRoutingState.scanPhase;
            this.scanPositionSlider.disabled = this.modRoutingState.scanPhase !== 'none';
        }
        // Update shapePhase source select
        if (this.shapePhaseSourceSelect) {
            this.shapePhaseSourceSelect.value = this.modRoutingState.shapePhase;
        }
    }

    private updateAllDisplays(): void {
        // Update path Y display
        const pathYDisplay = document.getElementById('path-y-value');
        if (pathYDisplay) pathYDisplay.textContent = parseFloat(this.pathYSlider.value).toFixed(2);

        // Update scan position display
        const scanDisplay = document.getElementById('scan-pos-value');
        if (scanDisplay) scanDisplay.textContent = parseFloat(this.scanPositionSlider.value).toFixed(2);

        // Update frequency display
        const freqDisplay = document.getElementById('frequency-value');
        if (freqDisplay) {
            const freq = parseFloat(this.frequencySlider.value);
            freqDisplay.textContent = `${Math.round(freq)} Hz (${this.freqToNoteName(freq)})`;
        }

        // Update feedback display
        const fbDisplay = document.getElementById('feedback-value');
        const fbEl = document.getElementById('feedback') as HTMLInputElement;
        if (fbDisplay && fbEl) {
            fbDisplay.textContent = Math.round(parseFloat(fbEl.value) * 100) + '%';
        }

        // Update density displays
        const dxDisplay = document.getElementById('density-x-value');
        const dyDisplay = document.getElementById('density-y-value');
        const dzDisplay = document.getElementById('density-z-value');
        if (dxDisplay) dxDisplay.textContent = String(Math.round(parseFloat(this.densityXSlider.value)));
        if (dyDisplay) dyDisplay.textContent = String(Math.round(parseFloat(this.densityYSlider.value)));
        if (dzDisplay) dzDisplay.textContent = String(Math.round(parseFloat(this.densityZSlider.value)));
    }

    private createGeneratorParamsContainer(container: HTMLElement): void {
        const group = document.createElement('div');
        group.id = 'generator-params-container';
        group.style.display = 'none';
        group.classList.add('lfo-unit');
        this.appendControl(container, group);
        this.generatorParamsContainer = group;
    }

    private showGeneratorParams(dataSet: string, initialParams?: GeneratorParams): void {
        if (!this.generatorParamsContainer) return;
        this.generatorParamsContainer.innerHTML = '';
        this.currentDataSet = dataSet;
        const triggerUpdate = () => {
            if (this.onGeneratorParamsChange && this.currentGeneratorParams) {
                this.onGeneratorParamsChange(this.currentDataSet, this.currentGeneratorParams);
            }
        };
        const createParamSlider = (label: string, min: number, max: number, value: number, step: number, onChange: (v: number) => void) => {
            return createSlider(this.generatorParamsContainer!, `gen-param-${label}`, label, min, max, value, step, onChange);
        };
        switch (dataSet) {
            case '3d-julia': {
                const params = { ...(initialParams as JuliaParams || defaultJuliaParams) };
                this.currentGeneratorParams = params;
                createParamSlider('Scale', 0.5, 2.0, params.scale, 0.1, (v) => { params.scale = v; triggerUpdate(); });
                createParamSlider('C Real', -1, 1, params.cReal, 0.05, (v) => { params.cReal = v; triggerUpdate(); });
                createParamSlider('C Imaginary', -1, 1, params.cImag, 0.05, (v) => { params.cImag = v; triggerUpdate(); });
                break;
            }
            case 'mandelbulb': {
                const params = { ...(initialParams as MandelbulbParams || defaultMandelbulbParams) };
                this.currentGeneratorParams = params;
                createParamSlider('Power', 2, 12, params.power, 1, (v) => { params.power = v; triggerUpdate(); });
                createParamSlider('Scale', 0.5, 2.0, params.scale, 0.1, (v) => { params.scale = v; triggerUpdate(); });
                createParamSlider('Iterations', 4, 20, params.iterations, 1, (v) => { params.iterations = v; triggerUpdate(); });
                break;
            }
            case 'menger-sponge': {
                const params = { ...(initialParams as MengerParams || defaultMengerParams) };
                this.currentGeneratorParams = params;
                createParamSlider('Iterations', 1, 5, params.iterations, 1, (v) => { params.iterations = v; triggerUpdate(); });
                createParamSlider('Scale', 0.5, 2.0, params.scale, 0.1, (v) => { params.scale = v; triggerUpdate(); });
                createParamSlider('Hole Size', 0.2, 0.5, params.holeSize, 0.01, (v) => { params.holeSize = v; triggerUpdate(); });
                break;
            }
            case 'sine-plasma': {
                const params = { ...(initialParams as PlasmaParams || defaultPlasmaParams) };
                this.currentGeneratorParams = params;
                createParamSlider('Frequency', 1, 10, params.frequency, 0.5, (v) => { params.frequency = v; triggerUpdate(); });
                createParamSlider('Complexity', 1, 6, params.complexity, 1, (v) => { params.complexity = v; triggerUpdate(); });
                createParamSlider('Contrast', 0.5, 3.0, params.contrast, 0.1, (v) => { params.contrast = v; triggerUpdate(); });
                break;
            }
            case 'game-of-life': {
                const params = { ...(initialParams as GameOfLifeParams || defaultGameOfLifeParams) };
                this.currentGeneratorParams = params;
                createParamSlider('Density', 0.1, 0.5, params.density, 0.05, (v) => { params.density = v; triggerUpdate(); });
                createParamSlider('Birth Neighbors', 4, 6, params.birthMin, 1, (v) => { params.birthMin = v; triggerUpdate(); });
                createParamSlider('Survive Neighbors', 3, 6, params.surviveMin, 1, (v) => { params.surviveMin = v; triggerUpdate(); });
                break;
            }
            default:
                this.currentGeneratorParams = null;
                this.generatorParamsContainer.style.display = 'none';
                return;
        }

        this.generatorParamsContainer.style.display = 'block';
    }

    private hideGeneratorParams(): void {
        if (this.generatorParamsContainer) {
            this.generatorParamsContainer.style.display = 'none';
            this.generatorParamsContainer.innerHTML = '';
        }
        this.currentGeneratorParams = null;
    }

    private createProgressIndicator(container: HTMLElement): void {
        const progressContainer = document.createElement('div');
        progressContainer.id = 'wav-progress-container';
        progressContainer.className = 'progress-container';
        progressContainer.style.display = 'none';

        const spinner = document.createElement('div');
        spinner.className = 'spinner';

        const progressBar = document.createElement('div');
        progressBar.className = 'progress-bar';

        const progressFill = document.createElement('div');
        progressFill.id = 'wav-progress-fill';
        progressFill.className = 'progress-fill';

        const progressText = document.createElement('span');
        progressText.id = 'wav-progress-text';
        progressText.className = 'progress-text';
        progressText.textContent = '0%';

        progressBar.appendChild(progressFill);
        progressContainer.appendChild(spinner);
        progressContainer.appendChild(progressBar);
        progressContainer.appendChild(progressText);

        this.appendControl(container, progressContainer);
        this.progressContainer = progressContainer;
        this.progressFill = progressFill;
        this.progressText = progressText;
    }

    public showProgress(): void {
        if (this.progressContainer) this.progressContainer.style.display = 'flex';
    }

    public hideProgress(): void {
        if (this.progressContainer) this.progressContainer.style.display = 'none';
    }

    public updateProgress(percent: number): void {
        if (this.progressFill) this.progressFill.style.width = `${percent}%`;
        if (this.progressText) this.progressText.textContent = `${Math.round(percent)}%`;
    }

    public setPathChangeCallback(callback: (state: ReadingPathState) => void): void {
        this.onPathChange = callback;
    }

    public setSynthModeChangeCallback(callback: (mode: SynthMode) => void): void {
        this.onSynthModeChange = callback;
    }

    public setFrequencyChangeCallback(callback: (freq: number) => void): void {
        this.onFrequencyChange = callback;
    }

    public setFrequency(freq: number): void {
        if (this.frequencySlider) {
            this.frequencySlider.value = String(freq);
        }
        const valueDisplay = document.getElementById('frequency-value');
        if (valueDisplay) {
            const noteName = this.freqToNoteName(freq);
            valueDisplay.textContent = `${Math.round(freq)} Hz (${noteName})`;
        }
    }

    public setCarrierChangeCallback(callback: (carrier: CarrierType) => void): void {
        this.onCarrierChange = callback;
    }

    public setFeedbackChangeCallback(callback: (amount: number) => void): void {
        this.onFeedbackChange = callback;
    }

    public setMidiInputChangeCallback(callback: (id: string) => void): void {
        this.onMidiInputChange = callback;
    }

    public setOctaveChangeCallback(callback: (octave: number) => void): void {
        this.onOctaveChange = callback;
    }

    public updateMidiInputs(inputs: { id: string, name: string }[]): void {
        const currentSelection = this.midiSelect.value;
        this.midiSelect.innerHTML = '';

        if (inputs.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'No Devices Found';
            this.midiSelect.appendChild(opt);
            this.midiSelect.disabled = true;
        } else {
            this.midiSelect.disabled = false;
            for (const input of inputs) {
                const opt = document.createElement('option');
                opt.value = input.id;
                opt.textContent = input.name;
                this.midiSelect.appendChild(opt);
            }

            if (inputs.some(i => i.id === currentSelection)) {
                this.midiSelect.value = currentSelection;
            } else if (inputs.length > 0) {
                this.midiSelect.selectedIndex = 0;
                if (this.onMidiInputChange) {
                    this.onMidiInputChange(this.midiSelect.value);
                }
            }
        }
    }

    public setVolumeResolutionChangeCallback(callback: (resolution: VolumeResolution) => void): void {
        this.onVolumeResolutionChange = callback;
    }

    public setSpectralDataChangeCallback(callback: (dataSet: string) => void): void {
        this.onSpectralDataChange = callback;
    }

    public setWavUploadCallback(callback: (files: FileList) => void): void {
        this.onWavUpload = callback;
    }

    public setLFOParamChangeCallback(callback: (index: number, param: string, value: any) => void): void {
        this.onLFOParamChange = callback;
    }

    public setModulationRoutingChangeCallback(callback: (target: string, source: string) => void): void {
        this.onModulationRoutingChange = callback;
    }

    public setGeneratorParamsChangeCallback(callback: (dataSet: string, params: GeneratorParams) => void): void {
        this.onGeneratorParamsChange = callback;
    }

    public getCurrentGeneratorParams(): GeneratorParams | null {
        return this.currentGeneratorParams;
    }

    public updateGeneratorParamsUI(dataSet: string, initialParams?: GeneratorParams): void {
        if (['3d-julia', 'mandelbulb', 'menger-sponge', 'sine-plasma', 'game-of-life'].includes(dataSet)) {
            this.showGeneratorParams(dataSet, initialParams);
        } else {
            this.hideGeneratorParams();
        }
    }

    public showDynamicParam(label: string, min: number, max: number, value: number, step: number): void {
        if (!this.dynamicParamSlider || !this.dynamicParamContainer) return;

        const labelEl = document.getElementById('dynamic-param-label');
        const valueDisplay = document.getElementById('dynamic-param-value');

        if (labelEl) labelEl.textContent = label;

        this.dynamicParamSlider.min = String(min);
        this.dynamicParamSlider.max = String(max);
        this.dynamicParamSlider.value = String(value);
        this.dynamicParamSlider.step = String(step);

        if (valueDisplay) {
            valueDisplay.textContent = step >= 1 ? String(Math.round(value)) : value.toFixed(2);
        }

        this.dynamicParamContainer.style.display = 'block';
    }

    public hideDynamicParam(): void {
        if (this.dynamicParamContainer) {
            this.dynamicParamContainer.style.display = 'none';
        }
    }

    public getState(): ReadingPathState {
        return {
            position: {
                x: 0,
                y: parseFloat(this.pathYSlider.value),
                z: 0,
            },
            rotation: {
                x: 0,
                y: 0,
                z: 0,
            },
            scanPosition: parseFloat(this.scanPositionSlider.value),
            planeType: this.planeTypeSelect.value as PlaneType,
            shapePhase: 0,
        };
    }

    public updateScanPosition(pos: number): void {
        this.scanPositionSlider.value = String(pos);
        const display = document.getElementById('scan-pos-value');
        if (display) display.textContent = pos.toFixed(2);

        if (this.onPathChange) {
            this.onPathChange(this.getState());
        }
    }

    public updatePathY(y: number): void {
        this.pathYSlider.value = String(y);
        const display = document.getElementById('path-y-value');
        if (display) display.textContent = y.toFixed(2);

        if (this.onPathChange) {
            this.onPathChange(this.getState());
        }
    }

    public addSpectralDataOption(value: string, label: string): void {
        const existingOption = Array.from(this.spectralDataSelect.options).find(
            opt => opt.value === value
        );

        if (!existingOption) {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            this.spectralDataSelect.appendChild(option);
        }

        this.spectralDataSelect.value = value;
        const event = new Event('change');
        this.spectralDataSelect.dispatchEvent(event);
    }

    public setVolumeDensity(resolution: VolumeResolution): void {
        this.densityXSlider.value = String(resolution.x);
        this.densityYSlider.value = String(resolution.y);
        this.densityZSlider.value = String(resolution.z);
        const xDisplay = document.getElementById('density-x-value');
        const yDisplay = document.getElementById('density-y-value');
        const zDisplay = document.getElementById('density-z-value');
        if (xDisplay) xDisplay.textContent = String(Math.round(resolution.x));
        if (yDisplay) yDisplay.textContent = String(Math.round(resolution.y));
        if (zDisplay) zDisplay.textContent = String(Math.round(resolution.z));
    }
}
