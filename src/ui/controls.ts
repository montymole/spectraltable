import { LFO } from '../modulators/lfo';
import {
    ReadingPathState, VolumeResolution, SynthMode, CarrierType, PlaneType,
    VOLUME_DENSITY_X_MIN, VOLUME_DENSITY_X_MAX, VOLUME_DENSITY_X_DEFAULT,
    VOLUME_DENSITY_Y_MIN, VOLUME_DENSITY_Y_MAX, VOLUME_DENSITY_Y_DEFAULT,
    VOLUME_DENSITY_Z_MIN, VOLUME_DENSITY_Z_MAX, VOLUME_DENSITY_Z_DEFAULT,
    GeneratorParams, JuliaParams, MandelbulbParams, MengerParams, PlasmaParams, GameOfLifeParams,
    defaultJuliaParams, defaultMandelbulbParams, defaultMengerParams, defaultPlasmaParams, defaultGameOfLifeParams,
    PresetControls, LFOState, OctaveDoublingState, defaultOctaveDoublingState
} from '../types';
import { PresetManager } from './preset-manager';
import {
    createSection, createSlider, createSelect, createModulatableSlider,
    createFileInput, createButton, createNumberInput, WAVEFORM_ICONS, CONTROL_STYLE,
    noteToName, createProgressUI, ProgressUI, createEnumSlider
} from './ui-elements';

interface SectionOpts {
    title: string;
    populate: (container: HTMLElement) => void;
    mode?: 'slider' | 'knob';
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
    private synthParamsContainer: HTMLElement | null = null;
    private interpSamplesSlider!: HTMLInputElement;
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
    private uploadProgressUI!: ProgressUI;
    public renderProgressUI!: ProgressUI;

    // Callbacks
    private onPathChange: ((state: ReadingPathState) => void) | null = null;
    private onVolumeResolutionChange?: (resolution: VolumeResolution) => void;
    private onSpectralDataChange?: (dataSet: string) => void;
    private onWavUpload?: (files: FileList) => void;
    private onSynthModeChange: ((mode: SynthMode) => void) | null = null;
    private onCarrierChange: ((carrier: CarrierType) => void) | null = null;
    private onFeedbackChange: ((amount: number) => void) | null = null;
    private onMidiInputChange: ((id: string) => void) | null = null;
    private onOctaveChange: ((octave: number) => void) | null = null;
    private onOctaveDoublingChange: ((state: OctaveDoublingState) => void) | null = null;
    private onInterpSamplesChange: ((samples: number) => void) | null = null;

    // LFO Callbacks
    private onLFOParamChange: ((index: number, param: string, value: any) => void) | null = null;
    private onModulationRoutingChange: ((target: string, source: string) => void) | null = null;

    // Generator params callback
    private onGeneratorParamsChange: ((dataSet: string, params: GeneratorParams) => void) | null = null;

    // Offline Render callback
    private onRenderWav: ((note: number, duration: number) => void) | null = null;

    // Preset system
    private presetManager: PresetManager;
    private presetSelect: HTMLSelectElement | null = null;
    private onPresetLoad: ((controls: PresetControls) => void) | null = null;

    // LFO state for serialization
    private lfoLabels: string[] = ['None'];
    private lfoState: LFOState[] = [];
    private modRoutingState = { pathY: 'none', scanPhase: 'none', shapePhase: 'none' };
    private octaveValue = 3;

    // Octave doubling state
    private octaveDoublingState: OctaveDoublingState = { ...defaultOctaveDoublingState };
    private octaveLowSlider!: HTMLInputElement;
    private octaveHighSlider!: HTMLInputElement;
    private octaveMultSlider!: HTMLInputElement;

    // Debounce timer for auto-save
    private autoSaveTimer: number | null = null;

    private bpmSlider!: HTMLInputElement;
    private bpmValue: number = 140;
    private onBPMChange: ((bpm: number) => void) | null = null;

    // LFO UI element references for state restoration
    private lfoWaveSelects: HTMLSelectElement[] = [];
    private lfoFreqSliders: HTMLInputElement[] = [];
    private lfoAmpSliders: HTMLInputElement[] = [];
    private lfoOffsetSliders: HTMLInputElement[] = [];
    private lfoSyncCheckboxes: HTMLInputElement[] = [];
    private lfoDivisionSliders: HTMLInputElement[] = [];

    private renderDurationLabel: HTMLElement | null = null;

    // Waveform Icon containers
    private carrierIconContainer: HTMLElement | null = null;
    private lfoIconContainers: HTMLElement[] = [];

    // Modulation routing selects
    private pathYSourceSelect: HTMLSelectElement | null = null;
    private scanPhaseSourceSelect: HTMLSelectElement | null = null;
    private shapePhaseSourceSelect: HTMLSelectElement | null = null;

    public envelopeCanvas: HTMLCanvasElement | null = null;

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
                offset: lfo.offset,
                isSynced: lfo.isSynced,
                division: lfo.division
            };
        });

        // Initialize preset manager
        this.presetManager = new PresetManager();
        this.presetManager.setPresetsChangeCallback(() => this.updatePresetDropdown());

        const sections: SectionOpts[] = [
            { title: 'Wave/Spectral Volume', populate: (c) => this.populateVolumeSection(c) },
            { title: 'Audio Synthesis', populate: (c) => this.populateSynthesisSection(c) },
            { title: 'Reading Path', populate: (c) => this.populatePathSection(c) },
            { title: 'LFOs', populate: (c) => this.populateLFOSection(c) },
            { title: 'Visualization', populate: (c) => this.populateVisualizationSection(c), mode: 'slider' },
            { title: 'Offline Render', populate: (c) => this.populateOfflineRenderSection(c) }
        ];

        sections.forEach(s => {
            const container = createSection(this.container, s.title, s.mode);
            s.populate(container);
        });

        this.updateModulationRanges();
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
        this.uploadProgressUI = createProgressUI(subGroup2);
        this.presetSelect = createSelect(subGroup2, 'preset-select', 'Load Preset', [], (val) => {
            if (val && this.onPresetLoad) {
                const preset = this.presetManager.getPreset(val);
                if (preset) this.onPresetLoad(preset.controls);
            }
        });
        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = '-- Select Preset --';
        this.presetSelect.insertBefore(defaultOpt, this.presetSelect.firstChild);
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
        subGroup2.appendChild(buttonGroup);
    }

    private populatePathSection(container: HTMLElement): void {
        const lfoOptions = this.lfoLabels.map(l => ({
            value: l.toLowerCase().replace(' ', ''),
            label: l
        }));
        const spGroup = document.createElement('div');
        spGroup.className = 'control-group';
        container.appendChild(spGroup);
        this.planeTypeSelect = createSelect(spGroup, 'plane-type', 'Plane Type', [
            PlaneType.FLAT, PlaneType.SINCOS, PlaneType.WAVE, PlaneType.RIPPLE
        ], (_val) => {
            if (this.onPathChange) this.onPathChange(this.getState());
            this.scheduleAutoSave();
        });
        this.shapePhaseSourceSelect = createSelect(spGroup, 'shape-phase-source', 'Shape Phase Source', lfoOptions, (source) => {
            this.modRoutingState.shapePhase = source;
            if (this.onModulationRoutingChange) this.onModulationRoutingChange('shapePhase', source);
            this.scheduleAutoSave();
        });
        const nGroup = document.createElement('div');
        nGroup.className = 'control-group';
        container.appendChild(nGroup);
        const pathYControl = createModulatableSlider(nGroup, 'path-y', 'Position Y (Morph)', -1, 1, 0, 0.001, lfoOptions,
            (_v) => { if (this.onPathChange) this.onPathChange(this.getState()); this.scheduleAutoSave(); },
            (source) => {
                this.modRoutingState.pathY = source;
                if (this.onModulationRoutingChange) this.onModulationRoutingChange('pathY', source);
                this.scheduleAutoSave();
                this.updateModulationRanges();
            },
            CONTROL_STYLE, 'linear', 3
        );
        this.pathYSlider = pathYControl.slider;
        this.pathYSourceSelect = pathYControl.select;
        const scanControl = createModulatableSlider(nGroup, 'scan-pos', 'Scan Phase', -1, 1, 0, 0.001, lfoOptions as any,
            (_v) => { if (this.onPathChange) this.onPathChange(this.getState()); this.scheduleAutoSave(); },
            (source) => {
                this.modRoutingState.scanPhase = source;
                if (this.onModulationRoutingChange) this.onModulationRoutingChange('scanPhase', source);
                this.scheduleAutoSave();
                this.updateModulationRanges();
            },
            CONTROL_STYLE, 'linear', 3
        );
        this.scanPositionSlider = scanControl.slider;
        this.scanPhaseSourceSelect = scanControl.select;
    }

    private populateSynthesisSection(container: HTMLElement): void {
        const subGroup = document.createElement('div');
        subGroup.classList.add('sub-group');
        container.appendChild(subGroup);

        this.synthModeSelect = createSelect(subGroup, 'synth-mode', 'Mode', [
            SynthMode.WAVETABLE, SynthMode.SPECTRAL, SynthMode.SPECTRAL_CHIRP, SynthMode.WHITENOISE_BAND_Q_FILTER
        ], (val) => {
            const mode = val as SynthMode;
            this.updateSynthModeUI(mode);
            if (this.onSynthModeChange) this.onSynthModeChange(mode);
            this.scheduleAutoSave();
        });

        this.createEnvelopeUI(subGroup);
        this.midiSelect = this.createMidiSelect(subGroup);
        this.createOctaveSelect(subGroup);

        // Dynamic synth parameter container
        this.synthParamsContainer = document.createElement('div');
        this.synthParamsContainer.id = 'synth-params-container';
        this.synthParamsContainer.classList.add('sub-group');
        container.appendChild(this.synthParamsContainer);

        // Global synthesis settings (like Interpolation)
        const subGroup2 = document.createElement('div');
        subGroup2.classList.add('sub-group');
        container.appendChild(subGroup2);

        // Interpolation samples control (all modes)
        this.interpSamplesSlider = createSlider(subGroup2, 'interp-samples', 'Interp Samples', 16, 1024, 64, 1, (val) => {
            if (this.onInterpSamplesChange) this.onInterpSamplesChange(val);
            this.scheduleAutoSave();
        });

        // Octave doubling controls (available for all modes)
        const subGroup3 = document.createElement('div');
        subGroup3.classList.add('sub-group');
        container.appendChild(subGroup3);
        const harmTitle = document.createElement('label');
        harmTitle.textContent = 'Octave Doubling';
        harmTitle.style.fontWeight = 'bold';
        harmTitle.style.marginBottom = '8px';
        harmTitle.style.display = 'block';
        subGroup3.appendChild(harmTitle);

        const octaveUpdate = () => {
            if (this.onOctaveDoublingChange) this.onOctaveDoublingChange(this.octaveDoublingState);
            this.scheduleAutoSave();
        };

        this.octaveLowSlider = createSlider(subGroup3, 'octave-low', 'Low (octaves below)', 0, 10, 0, 1, (val) => {
            this.octaveDoublingState.lowCount = val;
            octaveUpdate();
        });
        this.octaveHighSlider = createSlider(subGroup3, 'octave-high', 'High (octaves above)', 0, 10, 0, 1, (val) => {
            this.octaveDoublingState.highCount = val;
            octaveUpdate();
        });
        this.octaveMultSlider = createSlider(subGroup3, 'octave-mult', 'Decay (per octave)', 0, 1, 0.5, 0.001, (val) => {
            this.octaveDoublingState.multiplier = val;
            octaveUpdate();
        }, undefined, 'linear', 3);

        // Initialize dynamic UI
        this.updateSynthModeUI(this.synthModeSelect.value as SynthMode);
    }

    private updateSynthModeUI(mode: SynthMode): void {
        if (!this.synthParamsContainer) return;
        this.synthParamsContainer.innerHTML = '';

        if (mode === SynthMode.WAVETABLE) {
            this.createCarrierSelect(this.synthParamsContainer);
            this.createFeedbackSlider(this.synthParamsContainer);
        }
    }

    private populateLFOSection(container: HTMLElement): void {
        this.lfoState.forEach((_, index) => this.createLFOUnit(container, index));
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
        this.densityXSlider = createSlider(container, 'density-x', 'Freq Bins (X)', VOLUME_DENSITY_X_MIN, VOLUME_DENSITY_X_MAX, VOLUME_DENSITY_X_DEFAULT, 1, volUpdate, 'slider');
        this.densityYSlider = createSlider(container, 'density-y', 'Morph Layers (Y)', VOLUME_DENSITY_Y_MIN, VOLUME_DENSITY_Y_MAX, VOLUME_DENSITY_Y_DEFAULT, 1, volUpdate, 'slider');
        this.densityZSlider = createSlider(container, 'density-z', 'Time Res (Z)', VOLUME_DENSITY_Z_MIN, VOLUME_DENSITY_Z_MAX, VOLUME_DENSITY_Z_DEFAULT, 1, volUpdate, 'slider');
    }

    private appendControl(container: HTMLElement, element: HTMLElement): void {
        container.appendChild(element);
    }

    private populateOfflineRenderSection(container: HTMLElement): void {
        const subGroup = document.createElement('div');
        subGroup.classList.add('sub-group');
        subGroup.style.display = 'flex';
        subGroup.style.flexDirection = 'column';
        subGroup.style.gap = '8px';
        container.appendChild(subGroup);

        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.gap = '12px';
        subGroup.appendChild(row);

        const noteOptions = [];
        for (let n = 0; n <= 108; n++) {
            noteOptions.push({ value: String(n), label: noteToName(n) });
        }

        const baseNoteSelect = createSelect(row, 'render-base-note', 'Base Note', noteOptions, () => { });
        baseNoteSelect.value = '48'; // Default to C3
        const durationControl = createNumberInput(row, 'render-duration', 'Duration (s)', 2.0, 0.1, 10.0, 0.1);

        // Grab the label element to update it dynamically
        const durationGroup = durationControl.closest('.control-group-row');
        if (durationGroup) {
            this.renderDurationLabel = durationGroup.querySelector('label') as HTMLElement;
        }

        // Global BPM control at the bottom of the section
        const tempoGroup = document.createElement('div');
        tempoGroup.className = 'control-group';
        subGroup.appendChild(tempoGroup);

        this.bpmSlider = createSlider(tempoGroup, 'global-bpm', 'Global BPM', 30, 300, this.bpmValue, 1, (val) => {
            this.bpmValue = val;
            if (this.onBPMChange) this.onBPMChange(val);
            // Re-trigger value update to refresh the Hz display in division sliders
            this.lfoDivisionSliders.forEach(slider => {
                if (slider) slider.value = slider.value;
            });
            this.scheduleAutoSave();
            this.updateSyncUI();
        }, CONTROL_STYLE, 'linear', 0);

        createButton(subGroup, 'render-wav-btn', 'RENDER WAV', () => {
            const note = parseInt(baseNoteSelect.value);
            const duration = parseFloat(durationControl.value);
            if (this.onRenderWav) this.onRenderWav(note, duration);
        }, 'reset-button');

        this.renderProgressUI = createProgressUI(subGroup);
        this.updateSyncUI();
    }

    public setRenderWavCallback(callback: (note: number, duration: number) => void): void {
        this.onRenderWav = callback;
    }

    public setBPMCallback(callback: (bpm: number) => void): void {
        this.onBPMChange = callback;
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

        // Sync Controls
        const syncRow = document.createElement('div');
        syncRow.className = 'control-group';
        syncRow.style.display = 'flex';
        syncRow.style.alignItems = 'center';
        syncRow.style.gap = '8px';
        wrapper.appendChild(syncRow);

        const syncLabel = document.createElement('label');
        syncLabel.textContent = 'Tempo Sync';
        syncRow.appendChild(syncLabel);

        const syncCheck = document.createElement('input');
        syncCheck.type = 'checkbox';
        syncCheck.checked = this.lfoState[index].isSynced;
        syncCheck.addEventListener('change', () => {
            const synced = syncCheck.checked;
            this.lfoState[index].isSynced = synced;
            if (this.onLFOParamChange) this.onLFOParamChange(index, 'isSynced', synced);

            freqContainer.style.display = synced ? 'none' : 'block';
            syncParamsRow.style.display = synced ? 'flex' : 'none';
            this.updateSyncUI();
            this.scheduleAutoSave();
        });
        syncRow.appendChild(syncCheck);
        this.lfoSyncCheckboxes[index] = syncCheck;

        const freqContainer = document.createElement('div');
        this.lfoFreqSliders[index] = createSlider(freqContainer, `lfo-${index}-freq`, 'Freq', 0, 5.0, this.lfoState[index].frequency, 0.001, (val) => {
            this.lfoState[index].frequency = val;
            if (this.onLFOParamChange) this.onLFOParamChange(index, 'frequency', val);
            this.scheduleAutoSave();
        }, CONTROL_STYLE, 'linear', 3);
        wrapper.appendChild(freqContainer);

        const syncParamsRow = document.createElement('div');
        syncParamsRow.className = 'control-group';
        syncParamsRow.style.display = this.lfoState[index].isSynced ? 'flex' : 'none';
        syncParamsRow.style.alignItems = 'center';
        syncParamsRow.style.gap = '8px';
        wrapper.appendChild(syncParamsRow);

        const divisionOptions = [
            '1/1', '1/1T', '1/2', '1/2T', '1/4', '1/4T', '1/8', '1/8T', '1/16', '1/16T'
        ];

        const divSlider = createEnumSlider(syncParamsRow, `lfo-${index}-div`, 'Div', divisionOptions, this.lfoState[index].division, (val: string) => {
            this.lfoState[index].division = val;
            if (this.onLFOParamChange) this.onLFOParamChange(index, 'division', val);
            this.scheduleAutoSave();
        }, CONTROL_STYLE, (val: string) => {
            // Calculate Hz for display
            const isTriplet = val.endsWith('T');
            const cleanDiv = isTriplet ? val.slice(0, -1) : val;
            const parts = cleanDiv.split('/');
            const num = parseInt(parts[0]);
            const den = parseInt(parts[1]);
            const durationInBeats = 4 * (num / den);
            const bps = this.bpmValue / 60;
            let freq = bps / durationInBeats;
            if (isTriplet) freq *= 1.5;
            return `${val} (${freq.toFixed(2)} Hz)`;
        });

        this.lfoDivisionSliders[index] = divSlider;

        freqContainer.style.display = this.lfoState[index].isSynced ? 'none' : 'block';

        this.lfoAmpSliders[index] = createSlider(wrapper, `lfo-${index}-amp`, 'Amp', 0, 1, this.lfoState[index].amplitude, 0.001, (val) => {
            this.lfoState[index].amplitude = val;
            if (this.onLFOParamChange) this.onLFOParamChange(index, 'amplitude', val);
            this.scheduleAutoSave();
            this.updateModulationRanges();
        });

        this.lfoOffsetSliders[index] = createSlider(wrapper, `lfo-${index}-offset`, 'Offset', -1, 1, this.lfoState[index].offset, 0.001, (val) => {
            this.lfoState[index].offset = val;
            if (this.onLFOParamChange) this.onLFOParamChange(index, 'offset', val);
            this.scheduleAutoSave();
            this.updateModulationRanges();
        });

        this.appendControl(container, wrapper);
    }

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
        return select;
    }

    private createFeedbackSlider(container: HTMLElement): HTMLInputElement {
        const slider = createSlider(container, 'feedback', 'Feedback', 0, 0.99, 0, 0.001, (val) => {
            if (this.onFeedbackChange) this.onFeedbackChange(val);
        }, undefined, 'linear', 3);
        const group = slider.closest('.control-group') as HTMLElement;
        if (group) {
            group.id = 'feedback-container';
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
            bpm: this.bpmValue,
            pathY: parseFloat(this.pathYSlider.value),
            scanPosition: parseFloat(this.scanPositionSlider.value),
            planeType: this.planeTypeSelect.value as PlaneType,
            synthMode: this.synthModeSelect.value as SynthMode,
            frequency: 220, // Deprecated, kept for preset compatibility
            carrier: parseInt((document.getElementById('carrier') as HTMLSelectElement)?.value || '0') as CarrierType,
            feedback: parseFloat((document.getElementById('feedback') as HTMLInputElement)?.value || '0'),
            densityX: parseFloat(this.densityXSlider.value),
            densityY: parseFloat(this.densityYSlider.value),
            densityZ: parseFloat(this.densityZSlider.value),
            spectralData: this.spectralDataSelect.value,
            generatorParams: this.currentGeneratorParams || undefined,
            lfos: this.lfoState.map(lfo => ({ ...lfo })),
            modRouting: { ...this.modRoutingState },
            envelopes: [{ attack: 0.1, decay: 0.2, sustain: 0.5, release: 0.5 }], // Will be updated from AudioEngine
            octave: this.octaveValue,
            octaveDoubling: { ...this.octaveDoublingState },
            interpSamples: parseFloat(this.interpSamplesSlider.value)
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
        // Note: frequency slider removed, pitch controlled via MIDI/piano
        this.densityXSlider.value = String(state.densityX);
        this.densityYSlider.value = String(state.densityY);
        this.densityZSlider.value = String(state.densityZ);
        this.spectralDataSelect.value = state.spectralData;
        this.interpSamplesSlider.value = String(state.interpSamples || 64);

        // Refresh dynamic synth UI
        this.updateSynthModeUI(state.synthMode as SynthMode);

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
            if (this.onOctaveChange) this.onOctaveChange(state.octave);
        }

        if (state.bpm !== undefined) {
            this.bpmValue = state.bpm;
            if (this.bpmSlider) {
                this.bpmSlider.value = String(state.bpm);
            }
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
        this.updateSyncUI();

        // Store generator params
        if (state.generatorParams) {
            this.currentGeneratorParams = state.generatorParams;
        }

        // Restore octave doubling state
        if (state.octaveDoubling) {
            this.octaveDoublingState = { ...state.octaveDoubling };
            this.octaveLowSlider.value = String(state.octaveDoubling.lowCount);
            this.octaveHighSlider.value = String(state.octaveDoubling.highCount);
            this.octaveMultSlider.value = String(state.octaveDoubling.multiplier);
        }

        this.updateAllDisplays();
        this.updateModulationRanges();

        // Refresh division slider displays AFTER lfoState is fully populated
        this.lfoDivisionSliders.forEach(slider => {
            if (slider) slider.value = slider.value;
        });

        this.updateSyncUI();
    }

    private updateLFOUI(index: number, lfo: LFOState): void {
        if (this.lfoWaveSelects[index]) {
            this.lfoWaveSelects[index].value = lfo.waveform;
            if (this.lfoIconContainers[index]) {
                this.lfoIconContainers[index].innerHTML = WAVEFORM_ICONS[lfo.waveform] || WAVEFORM_ICONS['sine'];
            }
        }
        if (this.lfoSyncCheckboxes[index]) {
            this.lfoSyncCheckboxes[index].checked = lfo.isSynced;
        }
        if (this.lfoDivisionSliders[index]) {
            this.lfoDivisionSliders[index].value = lfo.division;
        }

        if (this.lfoFreqSliders[index]) {
            this.lfoFreqSliders[index].value = String(lfo.frequency);
        }
        if (this.lfoAmpSliders[index]) {
            this.lfoAmpSliders[index].value = String(lfo.amplitude);
        }
        if (this.lfoOffsetSliders[index]) {
            this.lfoOffsetSliders[index].value = String(lfo.offset);
        }

        // Find the LFO unit's elements to toggle visibility
        const sliderGroup = this.lfoFreqSliders[index]?.parentElement;
        const freqContainer = sliderGroup?.parentElement;

        const divSliderGroup = this.lfoDivisionSliders[index]?.parentElement;
        const syncParamsRow = divSliderGroup?.parentElement;

        if (freqContainer && syncParamsRow) {
            freqContainer.style.display = lfo.isSynced ? 'none' : 'block';
            syncParamsRow.style.display = lfo.isSynced ? 'flex' : 'none';
        } else if (this.lfoSyncCheckboxes[index]) {
            // Fallback: If we can't find containers via parent-traversal, 
            // the createLFOUnit logic should have initialized them correctly.
        }
    }

    private updateSyncUI(): void {
        const anySynced = this.lfoState.some(lfo => lfo.isSynced);
        if (this.renderDurationLabel) {
            this.renderDurationLabel.textContent = anySynced ? 'Duration (beats)' : 'Duration (s)';
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
        this.updateModulationRanges();
    }

    private updateAllDisplays(): void {
        // Update path Y display
        const pathYDisplay = document.getElementById('path-y-value');
        if (pathYDisplay) pathYDisplay.textContent = parseFloat(this.pathYSlider.value).toFixed(3);

        // Update scan position display
        const scanDisplay = document.getElementById('scan-pos-value');
        if (scanDisplay) scanDisplay.textContent = parseFloat(this.scanPositionSlider.value).toFixed(3);

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

    private updateModulationRanges(): void {
        const syncMod = (slider: HTMLInputElement, source: string) => {
            if (!slider) return;
            const inputAny = slider as any;
            if (source === 'none') {
                inputAny.hasModulation = false;
            } else {
                const lfoIdx = parseInt(source.replace('lfo', '')) - 1;
                const lfo = this.lfoState[lfoIdx];
                if (lfo) {
                    inputAny.hasModulation = true;
                    inputAny.modOffset = lfo.offset;
                    inputAny.modAmplitude = lfo.amplitude;
                } else {
                    inputAny.hasModulation = false;
                }
            }
            if (inputAny.updateKnob) inputAny.updateKnob();
        };

        syncMod(this.pathYSlider, this.modRoutingState.pathY);
        syncMod(this.scanPositionSlider, this.modRoutingState.scanPhase);
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
                createParamSlider('Scale', 0.5, 2.0, params.scale, 0.001, (v) => { params.scale = v; triggerUpdate(); });
                createParamSlider('C Real', -1, 1, params.cReal, 0.001, (v) => { params.cReal = v; triggerUpdate(); });
                createParamSlider('C Imaginary', -1, 1, params.cImag, 0.001, (v) => { params.cImag = v; triggerUpdate(); });
                break;
            }
            case 'mandelbulb': {
                const params = { ...(initialParams as MandelbulbParams || defaultMandelbulbParams) };
                this.currentGeneratorParams = params;
                createParamSlider('Power', 2, 12, params.power, 0.001, (v) => { params.power = v; triggerUpdate(); });
                createParamSlider('Scale', 0.5, 2.0, params.scale, 0.001, (v) => { params.scale = v; triggerUpdate(); });
                createParamSlider('Iterations', 4, 20, params.iterations, 1, (v) => { params.iterations = v; triggerUpdate(); });
                break;
            }
            case 'menger-sponge': {
                const params = { ...(initialParams as MengerParams || defaultMengerParams) };
                this.currentGeneratorParams = params;
                createParamSlider('Iterations', 1, 5, params.iterations, 1, (v) => { params.iterations = v; triggerUpdate(); });
                createParamSlider('Scale', 0.5, 2.0, params.scale, 0.001, (v) => { params.scale = v; triggerUpdate(); });
                createParamSlider('Hole Size', 0.2, 0.5, params.holeSize, 0.001, (v) => { params.holeSize = v; triggerUpdate(); });
                break;
            }
            case 'sine-plasma': {
                const params = { ...(initialParams as PlasmaParams || defaultPlasmaParams) };
                this.currentGeneratorParams = params;
                createParamSlider('Frequency', 1, 10, params.frequency, 0.001, (v) => { params.frequency = v; triggerUpdate(); });
                createParamSlider('Complexity', 1, 6, params.complexity, 1, (v) => { params.complexity = v; triggerUpdate(); });
                createParamSlider('Contrast', 0.5, 3.0, params.contrast, 0.001, (v) => { params.contrast = v; triggerUpdate(); });
                break;
            }
            case 'game-of-life': {
                const params = { ...(initialParams as GameOfLifeParams || defaultGameOfLifeParams) };
                this.currentGeneratorParams = params;
                createParamSlider('Density', 0.1, 0.5, params.density, 0.001, (v) => { params.density = v; triggerUpdate(); });
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

    public async showRenderDialog(blob: Blob, defaultFilename: string): Promise<void> {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            document.body.appendChild(overlay);

            // Force reflow for transition
            overlay.offsetHeight;
            overlay.classList.add('active');

            const content = document.createElement('div');
            content.className = 'modal-content';
            overlay.appendChild(content);

            const title = document.createElement('h2');
            title.textContent = 'Render WAV Complete';
            content.appendChild(title);

            const info = document.createElement('p');
            const sizeMB = (blob.size / (1024 * 1024)).toFixed(2);
            info.textContent = `File size: ${sizeMB} MB`;
            content.appendChild(info);

            // Audio player preview
            const playerContainer = document.createElement('div');
            playerContainer.className = 'render-result-player';
            content.appendChild(playerContainer);

            const audio = document.createElement('audio');
            audio.controls = true;
            const audioUrl = URL.createObjectURL(blob);
            audio.src = audioUrl;
            playerContainer.appendChild(audio);

            const filenameInput = createNumberInput(content, 'filename-input', 'Filename', 0, 0, 0, 0) as any;
            filenameInput.type = 'text';
            filenameInput.value = defaultFilename;
            filenameInput.classList.add('filename-input');

            const actions = document.createElement('div');
            actions.className = 'modal-actions';
            content.appendChild(actions);

            createButton(actions, 'download-render-btn', 'Download', () => {
                const a = document.createElement('a');
                a.href = audioUrl;
                a.download = filenameInput.value || defaultFilename;
                a.click();
                overlay.classList.remove('active');
                setTimeout(() => {
                    URL.revokeObjectURL(audioUrl);
                    overlay.remove();
                    resolve();
                }, 300);
            }, 'reset-button'); // Using reset-button style for secondary look or custom

            createButton(actions, 'close-render-btn', 'Close', () => {
                overlay.classList.remove('active');
                setTimeout(() => {
                    URL.revokeObjectURL(audioUrl);
                    overlay.remove();
                    resolve();
                }, 300);
            }, 'reset-button');
        });
    }

    public getState(): ReadingPathState {
        return {
            position: {
                x: 0,
                y: parseFloat(this.pathYSlider.value),
                z: 0
            },
            rotation: { x: 0, y: 0, z: 0 },
            planeType: this.planeTypeSelect.value as PlaneType,
            scanPosition: parseFloat(this.scanPositionSlider.value),
            shapePhase: 0
        };
    }

    public showProgress(type: 'upload' | 'render'): void {
        if (type === 'upload') this.uploadProgressUI.show();
        else this.renderProgressUI.show();
    }

    public hideProgress(type: 'upload' | 'render'): void {
        if (type === 'upload') this.uploadProgressUI.hide();
        else this.renderProgressUI.hide();
    }

    public updateProgress(type: 'upload' | 'render', percent: number, text?: string): void {
        const ui = type === 'upload' ? this.uploadProgressUI : this.renderProgressUI;
        if (ui) ui.update(percent, text);
    }

    public setPathChangeCallback(callback: (state: ReadingPathState) => void): void {
        this.onPathChange = callback;
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

    public setSynthModeChangeCallback(callback: (mode: SynthMode) => void): void {
        this.onSynthModeChange = callback;
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

    public setLFOParamChangeCallback(callback: (index: number, param: string, value: any) => void): void {
        this.onLFOParamChange = callback;
    }

    public setModulationRoutingChangeCallback(callback: (target: string, source: string) => void): void {
        this.onModulationRoutingChange = callback;
    }

    public setGeneratorParamsChangeCallback(callback: (dataSet: string, params: GeneratorParams) => void): void {
        this.onGeneratorParamsChange = callback;
    }

    public setInterpSamplesChangeCallback(callback: (samples: number) => void): void {
        this.onInterpSamplesChange = callback;
    }

    public setOctaveDoublingChangeCallback(callback: (state: OctaveDoublingState) => void): void {
        this.onOctaveDoublingChange = callback;
    }

    public updateMidiInputs(inputs: { id: string, name: string }[]): void {
        if (!this.midiSelect) return;
        this.midiSelect.innerHTML = '';
        if (inputs.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'No Devices Found';
            this.midiSelect.appendChild(opt);
        } else {
            inputs.forEach(input => {
                const opt = document.createElement('option');
                opt.value = input.id;
                opt.textContent = input.name;
                this.midiSelect.appendChild(opt);
            });
        }
    }

    public updateGeneratorParamsUI(dataSet: string, params?: GeneratorParams): void {
        this.showGeneratorParams(dataSet, params);
    }

    public getCurrentGeneratorParams(): GeneratorParams | null {
        return this.currentGeneratorParams;
    }

    public showDynamicParam(label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void): void {
        if (!this.dynamicParamContainer) return;
        this.dynamicParamContainer.innerHTML = '';
        this.dynamicParamSlider = createSlider(this.dynamicParamContainer, 'dynamic-param', label, min, max, value, step, onChange);
        this.dynamicParamContainer.style.display = 'block';
    }

    public hideDynamicParam(): void {
        if (this.dynamicParamContainer) {
            this.dynamicParamContainer.style.display = 'none';
            this.dynamicParamContainer.innerHTML = '';
        }
        this.dynamicParamSlider = null;
    }

    public setVolumeDensity(x: number, y: number, z: number): void {
        if (this.densityXSlider) this.densityXSlider.value = String(x);
        if (this.densityYSlider) this.densityYSlider.value = String(y);
        if (this.densityZSlider) this.densityZSlider.value = String(z);
        this.updateAllDisplays();
    }

    public addSpectralDataOption(name: string): void {
        if (!this.spectralDataSelect) return;
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        this.spectralDataSelect.appendChild(opt);
    }

    public updatePathY(val: number): void {
        const display = document.getElementById('path-y-value');
        if (display) display.textContent = val.toFixed(3);
    }

    public updateScanPosition(val: number): void {
        const display = document.getElementById('scan-pos-value');
        if (display) display.textContent = val.toFixed(3);
    }
}
