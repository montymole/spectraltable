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

// UI control panel with sliders for all parameters

export class ControlPanel {
    private container: HTMLElement;
    private currentSectionContainer: HTMLElement | null = null;

    // Path controls
    private pathYSlider: HTMLInputElement;
    // Rotation sliders removed - now controlled by mouse
    private planeTypeSelect: HTMLSelectElement;

    private scanPositionSlider: HTMLInputElement;

    // Synth mode controls
    private synthModeSelect: HTMLSelectElement;
    private frequencySlider: HTMLInputElement;
    private frequencyContainer: HTMLElement | null = null;
    private carrierContainer: HTMLElement | null = null;
    private feedbackContainer: HTMLElement | null = null;

    private midiSelect: HTMLSelectElement;

    // Volume density controls
    private densityXSlider: HTMLInputElement;
    private densityYSlider: HTMLInputElement;
    private densityZSlider: HTMLInputElement;

    // Spectral data controls
    private spectralDataSelect: HTMLSelectElement;
    private wavUploadInput: HTMLInputElement;
    private dynamicParamSlider: HTMLInputElement | null = null;
    private dynamicParamContainer: HTMLElement | null = null;

    // Generator parameter sliders
    private generatorParamsContainer: HTMLElement | null = null;
    private currentGeneratorParams: GeneratorParams | null = null;
    private currentDataSet: string = 'blank';

    // Callbacks
    private onPathChange: ((state: ReadingPathState) => void) | null = null;
    private onVolumeResolutionChange?: (resolution: VolumeResolution) => void;
    private onSpectralDataChange?: (dataSet: string) => void;
    private onWavUpload?: (files: FileList) => void;
    private onDynamicParamChange?: (value: number) => void;
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
    private lfoState: LFOState[] = []
    /*
        { waveform: 'sine', frequency: 0.5, amplitude: 0.5, offset: 0 },
        { waveform: 'sine', frequency: 0.5, amplitude: 0.5, offset: 0 },
        { waveform: 'sine', frequency: 0.5, amplitude: 0.5, offset: 0 }
    ];*/
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

    // Modulation routing selects
    private pathYSourceSelect: HTMLSelectElement | null = null;
    private scanPhaseSourceSelect: HTMLSelectElement | null = null;
    private shapePhaseSourceSelect: HTMLSelectElement | null = null;

    constructor(containerId: string, options: { lfos: LFO[] }) {
        const el = document.getElementById(containerId);
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
        if (!el) throw new Error(`Container not found: ${containerId}`);
        this.container = el;

        // Initialize preset manager
        this.presetManager = new PresetManager();
        this.presetManager.setPresetsChangeCallback(() => this.updatePresetDropdown());

        this.createSection('Wave/Spectral Volume');
        this.spectralDataSelect = this.createSelect('spectral-data-type', 'Data Set', [
            'blank',
            '3d-julia',
            'mandelbulb',
            'menger-sponge',
            'sine-plasma',
            'game-of-life'
        ]);

        // Add reset button next to dataset selector
        this.createResetButton();

        // Dynamic parameter slider (shown for certain datasets)
        this.createDynamicParameterSlider();

        // Generator parameter sliders container
        this.createGeneratorParamsContainer();

        // Add WAV upload (multi-select for morphing)
        this.wavUploadInput = this.createFileInput('wav-upload', 'Upload WAV (Multi-select)', '.wav,.mp3,.ogg', true);

        // Add progress indicator
        this.createProgressIndicator();

        // Create section headers
        this.createSection('Reading Path');
        // Modulatable Sliders
        const pathYControl = this.createModulatableSlider('path-y', 'Position Y (Morph)', -1, 1, 0, 0.01, 'pathY');
        this.pathYSlider = pathYControl.slider;
        this.pathYSourceSelect = pathYControl.select;

        this.planeTypeSelect = this.createSelect('plane-type', 'Plane Type', [
            PlaneType.FLAT,
            PlaneType.SINCOS,
            PlaneType.WAVE,
            PlaneType.RIPPLE,
        ]);

        // Add Shape Phase Modulation Selector
        const shapePhaseGroup = document.createElement('div');
        shapePhaseGroup.className = 'control-group';

        const shapePhaseLabel = document.createElement('label');
        shapePhaseLabel.textContent = 'Shape Phase';
        shapePhaseLabel.style.fontSize = '0.6rem';

        const shapePhaseSelect = document.createElement('select');
        shapePhaseSelect.className = 'source-select';
        shapePhaseSelect.style.marginLeft = 'auto';
        shapePhaseSelect.style.fontSize = '0.7rem';

        this.lfoLabels.forEach((label) => {
            const option = document.createElement('option');
            option.value = label.toLowerCase().replace(' ', '');
            option.textContent = label;
            shapePhaseSelect.appendChild(option);
        });

        shapePhaseSelect.addEventListener('change', () => {
            this.modRoutingState.shapePhase = shapePhaseSelect.value;
            if (this.onModulationRoutingChange) {
                this.onModulationRoutingChange('shapePhase', shapePhaseSelect.value);
            }
            this.scheduleAutoSave();
        });
        this.shapePhaseSourceSelect = shapePhaseSelect;

        const spLabelRow = document.createElement('div');
        spLabelRow.className = 'label-row';
        spLabelRow.appendChild(shapePhaseLabel);
        spLabelRow.appendChild(shapePhaseSelect);

        shapePhaseGroup.appendChild(spLabelRow);
        this.appendControl(shapePhaseGroup);


        const scanPosControl = this.createModulatableSlider('scan-pos', 'Scan Phase', -1, 1, 0, 0.01, 'scanPhase');
        this.scanPositionSlider = scanPosControl.slider;
        this.scanPhaseSourceSelect = scanPosControl.select;

        // Initialize controls
        this.createSection('Audio Synthesis');
        this.synthModeSelect = this.createSelect('synth-mode', 'Mode', [
            SynthMode.WAVETABLE,
            SynthMode.SPECTRAL,
        ]);
        this.frequencySlider = this.createFrequencySlider();
        this.createCarrierSelect();
        this.createFeedbackSlider();
        this.midiSelect = this.createMidiSelect();
        this.createOctaveSelect();

        // LFO Section
        this.createSection('LFOs');
        this.lfoState.forEach((lfo, index) => {
            this.createLFOUnit(index);
        })

        // Envelopes Section
        this.createSection('Envelopes');
        this.createEnvelopeUI();

        this.createSection('Visualization');
        this.densityXSlider = this.createSlider('density-x', 'Freq Bins (X)', VOLUME_DENSITY_X_MIN, VOLUME_DENSITY_X_MAX, VOLUME_DENSITY_X_DEFAULT, 1);
        this.densityYSlider = this.createSlider('density-y', 'Morph Layers (Y)', VOLUME_DENSITY_Y_MIN, VOLUME_DENSITY_Y_MAX, VOLUME_DENSITY_Y_DEFAULT, 1);
        this.densityZSlider = this.createSlider('density-z', 'Time Res (Z)', VOLUME_DENSITY_Z_MIN, VOLUME_DENSITY_Z_MAX, VOLUME_DENSITY_Z_DEFAULT, 1);

        // Create preset section first
        this.createSection('Presets');
        this.createPresetUI();

        this.wireUpEvents();
    }

    // ... (createSection, createSlider, createSelect methods remain same)

    private createSection(title: string): void {
        const card = document.createElement('div');
        card.className = 'control-card';

        const header = document.createElement('div');
        header.className = 'control-section-title';
        header.textContent = title;

        card.appendChild(header);
        this.container.appendChild(card);
        this.currentSectionContainer = card;
    }

    private appendControl(element: HTMLElement): void {
        (this.currentSectionContainer || this.container).prepend(element);
    }

    private createSlider(
        id: string,
        label: string,
        min: number,
        max: number,
        value: number,
        step: number
    ): HTMLInputElement {
        const group = document.createElement('div');
        group.className = 'control-group';

        const labelEl = document.createElement('label');
        labelEl.htmlFor = id;
        labelEl.textContent = label;

        const valueDisplay = document.createElement('span');
        valueDisplay.className = 'value-display';
        valueDisplay.textContent = step >= 1 ? String(Math.round(value)) : value.toFixed(2);
        valueDisplay.id = `${id}-value`;

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.id = id;
        slider.min = String(min);
        slider.max = String(max);
        slider.value = String(value);
        slider.step = String(step);
        slider.className = 'slider';

        // Update value display on change
        slider.addEventListener('input', () => {
            const val = parseFloat(slider.value);
            valueDisplay.textContent = step >= 1 ? String(Math.round(val)) : val.toFixed(2);
        });

        const labelRow = document.createElement('div');
        labelRow.className = 'label-row';
        labelRow.appendChild(labelEl);
        labelRow.appendChild(valueDisplay);

        group.appendChild(labelRow);
        group.appendChild(slider);
        this.appendControl(group);

        return slider;
    }

    private createSelect(id: string, label: string, options: string[]): HTMLSelectElement {
        const group = document.createElement('div');
        group.className = 'control-group';

        const labelEl = document.createElement('label');
        labelEl.htmlFor = id;
        labelEl.textContent = label;

        const select = document.createElement('select');
        select.id = id;
        select.className = 'select';

        for (const option of options) {
            const optEl = document.createElement('option');
            optEl.value = option;
            optEl.textContent = option;
            select.appendChild(optEl);
        }

        const labelRow = document.createElement('div');
        labelRow.className = 'label-row';
        labelRow.appendChild(labelEl);

        group.appendChild(labelRow);
        group.appendChild(select);
        this.appendControl(group);

        return select;
    }

    private createModulatableSlider(
        id: string,
        label: string,
        min: number,
        max: number,
        value: number,
        step: number,
        targetParam: string
    ): { slider: HTMLInputElement, select: HTMLSelectElement } {
        const group = document.createElement('div');
        group.className = 'control-group';

        const labelEl = document.createElement('label');
        labelEl.htmlFor = id;
        labelEl.textContent = label;

        // Source Selector (None, LFO1, LFO2)
        const sourceSelect = document.createElement('select');
        sourceSelect.className = 'source-select';
        sourceSelect.style.marginLeft = 'auto';
        sourceSelect.style.fontSize = '0.7rem';
        sourceSelect.style.padding = '2px';

        this.lfoLabels.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.toLowerCase().replace(' ', '');
            option.textContent = opt;
            if (opt === 'None') option.selected = true;
            sourceSelect.appendChild(option);
        });

        sourceSelect.addEventListener('change', () => {
            if (targetParam === 'pathY') this.modRoutingState.pathY = sourceSelect.value;
            if (targetParam === 'scanPhase') this.modRoutingState.scanPhase = sourceSelect.value;
            if (this.onModulationRoutingChange) {
                this.onModulationRoutingChange(targetParam, sourceSelect.value);
            }
            // Disable slider if modulated?
            slider.disabled = sourceSelect.value !== 'none';
            group.style.opacity = sourceSelect.value !== 'none' ? '0.8' : '1.0';
            this.scheduleAutoSave();
        });

        const valueDisplay = document.createElement('span');
        valueDisplay.className = 'value-display';
        valueDisplay.textContent = step >= 1 ? String(Math.round(value)) : value.toFixed(2);
        valueDisplay.id = `${id}-value`;

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.id = id;
        slider.min = String(min);
        slider.max = String(max);
        slider.value = String(value);
        slider.step = String(step);
        slider.className = 'slider';

        slider.addEventListener('input', () => {
            const val = parseFloat(slider.value);
            valueDisplay.textContent = step >= 1 ? String(Math.round(val)) : val.toFixed(2);
        });

        const labelRow = document.createElement('div');
        labelRow.className = 'label-row';
        labelRow.appendChild(labelEl);
        labelRow.appendChild(sourceSelect);

        const valueRow = document.createElement('div');
        valueRow.className = 'label-row';
        valueRow.style.justifyContent = 'flex-end';
        valueRow.appendChild(valueDisplay);

        group.appendChild(labelRow);
        group.appendChild(valueRow);
        group.appendChild(slider);
        this.appendControl(group);

        return { slider, select: sourceSelect };
    }

    private createLFOUnit(index: number): void {
        const wrapper = document.createElement('div');
        wrapper.className = 'lfo-unit';
        wrapper.style.marginBottom = '10px';
        wrapper.style.padding = '5px';
        wrapper.style.borderLeft = '2px solid #333';

        const title = document.createElement('div');
        title.className = 'label-row';
        title.innerHTML = `<label>LFO ${index + 1}</label>`;
        wrapper.appendChild(title);

        // Waveform
        const waveSelect = document.createElement('select');
        waveSelect.className = 'select';
        ['Sine', 'Square', 'Saw', 'Triangle'].forEach(w => {
            const opt = document.createElement('option');
            opt.value = w.toLowerCase();
            opt.textContent = w;
            waveSelect.appendChild(opt);
        });
        waveSelect.addEventListener('change', () => {
            this.lfoState[index].waveform = waveSelect.value;
            if (this.onLFOParamChange) this.onLFOParamChange(index, 'waveform', waveSelect.value);
            this.scheduleAutoSave();
        });
        wrapper.appendChild(waveSelect);
        this.lfoWaveSelects[index] = waveSelect;

        // Frequency (0 - 1Hz)
        const freqLabel = document.createElement('div');
        freqLabel.className = 'label-row';
        freqLabel.innerHTML = '<label>Freq</label><span class="value-display">0.5 Hz</span>';
        const freqDisplay = freqLabel.querySelector('span')!;

        const freqSlider = document.createElement('input');
        freqSlider.type = 'range';
        freqSlider.min = '0';
        freqSlider.max = '1';
        freqSlider.step = '0.01';
        freqSlider.value = '0.5';
        freqSlider.className = 'slider';
        freqSlider.addEventListener('input', () => {
            freqDisplay.textContent = `${freqSlider.value} Hz`;
            this.lfoState[index].frequency = parseFloat(freqSlider.value);
            if (this.onLFOParamChange) this.onLFOParamChange(index, 'frequency', parseFloat(freqSlider.value));
            this.scheduleAutoSave();
        });
        wrapper.appendChild(freqLabel);
        wrapper.appendChild(freqSlider);
        this.lfoFreqSliders[index] = freqSlider;
        this.lfoFreqDisplays[index] = freqDisplay;

        // Amplitude (0 - 1)
        const ampLabel = document.createElement('div');
        ampLabel.className = 'label-row';
        ampLabel.innerHTML = '<label>Amp</label><span class="value-display">0.5</span>';
        const ampDisplay = ampLabel.querySelector('span')!;

        const ampSlider = document.createElement('input');
        ampSlider.type = 'range';
        ampSlider.min = '0';
        ampSlider.max = '1';
        ampSlider.step = '0.01';
        ampSlider.value = '0.5';
        ampSlider.className = 'slider';
        ampSlider.addEventListener('input', () => {
            ampDisplay.textContent = ampSlider.value;
            this.lfoState[index].amplitude = parseFloat(ampSlider.value);
            if (this.onLFOParamChange) this.onLFOParamChange(index, 'amplitude', parseFloat(ampSlider.value));
            this.scheduleAutoSave();
        });
        wrapper.appendChild(ampLabel);
        wrapper.appendChild(ampSlider);
        this.lfoAmpSliders[index] = ampSlider;
        this.lfoAmpDisplays[index] = ampDisplay;

        // Offset (-1 to 1)
        const offsetLabel = document.createElement('div');
        offsetLabel.className = 'label-row';
        offsetLabel.innerHTML = '<label>Offset</label><span class="value-display">0.0</span>';
        const offsetDisplay = offsetLabel.querySelector('span')!;

        const offsetSlider = document.createElement('input');
        offsetSlider.type = 'range';
        offsetSlider.min = '-1';
        offsetSlider.max = '1';
        offsetSlider.step = '0.01';
        offsetSlider.value = '0.0';
        offsetSlider.className = 'slider';
        offsetSlider.addEventListener('input', () => {
            offsetDisplay.textContent = offsetSlider.value;
            this.lfoState[index].offset = parseFloat(offsetSlider.value);
            if (this.onLFOParamChange) this.onLFOParamChange(index, 'offset', parseFloat(offsetSlider.value));
            this.scheduleAutoSave();
        });
        wrapper.appendChild(offsetLabel);
        wrapper.appendChild(offsetSlider);
        this.lfoOffsetSliders[index] = offsetSlider;
        this.lfoOffsetDisplays[index] = offsetDisplay;

        this.appendControl(wrapper);
    }

    public envelopeCanvas: HTMLCanvasElement | null = null;

    private createEnvelopeUI(): void {
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
        this.appendControl(wrapper);
        this.envelopeCanvas = canvas;
    }

    private createFrequencySlider(): HTMLInputElement {
        // Frequency slider with note name display
        // Range: 20Hz to 2000Hz, default 220Hz (A3)
        const group = document.createElement('div');
        group.id = 'frequency-container';
        group.className = 'control-group';

        const labelEl = document.createElement('label');
        labelEl.htmlFor = 'frequency';
        labelEl.textContent = 'Frequency';

        const valueDisplay = document.createElement('span');
        valueDisplay.className = 'value-display';
        valueDisplay.id = 'frequency-value';
        valueDisplay.textContent = '220 Hz (A3)';

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.id = 'frequency';
        slider.min = '20';
        slider.max = '2000';
        slider.value = '220';
        slider.step = '1';
        slider.className = 'slider';

        // Update value display with note name
        slider.addEventListener('input', () => {
            const freq = parseFloat(slider.value);
            const noteName = this.freqToNoteName(freq);
            valueDisplay.textContent = `${Math.round(freq)} Hz (${noteName})`;
            if (this.onFrequencyChange) {
                this.onFrequencyChange(freq);
            }
        });

        const labelRow = document.createElement('div');
        labelRow.className = 'label-row';
        labelRow.appendChild(labelEl);
        labelRow.appendChild(valueDisplay);

        group.appendChild(labelRow);
        group.appendChild(slider);
        this.appendControl(group);

        this.frequencySlider = slider;
        return slider;
    }

    private createCarrierSelect(): HTMLSelectElement {
        const group = document.createElement('div');
        group.id = 'carrier-container';
        group.className = 'control-group';

        const labelEl = document.createElement('label');
        labelEl.htmlFor = 'carrier';
        labelEl.textContent = 'Carrier';

        const select = document.createElement('select');
        select.id = 'carrier';
        select.className = 'select';

        const options = [
            { value: '0', label: 'Sine' },
            { value: '1', label: 'Saw' },
            { value: '2', label: 'Square' },
            { value: '3', label: 'Triangle' },
        ];

        for (const opt of options) {
            const optEl = document.createElement('option');
            optEl.value = opt.value;
            optEl.textContent = opt.label;
            select.appendChild(optEl);
        }

        select.addEventListener('change', () => {
            if (this.onCarrierChange) {
                this.onCarrierChange(parseInt(select.value) as CarrierType);
            }
        });

        const labelRow = document.createElement('div');
        labelRow.className = 'label-row';
        labelRow.appendChild(labelEl);

        group.appendChild(labelRow);
        group.appendChild(select);
        this.appendControl(group);

        this.carrierContainer = group;
        return select;
    }

    private createFeedbackSlider(): HTMLInputElement {
        const group = document.createElement('div');
        group.id = 'feedback-container';
        group.className = 'control-group';

        const labelEl = document.createElement('label');
        labelEl.htmlFor = 'feedback';
        labelEl.textContent = 'Feedback';

        const valueDisplay = document.createElement('span');
        valueDisplay.className = 'value-display';
        valueDisplay.id = 'feedback-value';
        valueDisplay.textContent = '0%';

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.id = 'feedback';
        slider.min = '0';
        slider.max = '0.99';
        slider.value = '0';
        slider.step = '0.01';
        slider.className = 'slider';

        slider.addEventListener('input', () => {
            const val = parseFloat(slider.value);
            valueDisplay.textContent = Math.round(val * 100) + '%';
            if (this.onFeedbackChange) {
                this.onFeedbackChange(val);
            }
        });

        const labelRow = document.createElement('div');
        labelRow.className = 'label-row';
        labelRow.appendChild(labelEl);
        labelRow.appendChild(valueDisplay);

        group.appendChild(labelRow);
        group.appendChild(slider);
        this.appendControl(group);

        this.feedbackContainer = group;
        return slider;
    }

    private createMidiSelect(): HTMLSelectElement {
        const group = document.createElement('div');
        group.className = 'control-group';

        const labelEl = document.createElement('label');
        labelEl.htmlFor = 'midi-input';
        labelEl.textContent = 'MIDI Input';

        const select = document.createElement('select');
        select.id = 'midi-input';
        select.className = 'select';

        // Default option
        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = 'No Devices Found';
        select.appendChild(defaultOpt);

        select.addEventListener('change', () => {
            if (this.onMidiInputChange) {
                this.onMidiInputChange(select.value);
            }
        });

        const labelRow = document.createElement('div');
        labelRow.className = 'label-row';
        labelRow.appendChild(labelEl);

        group.appendChild(labelRow);
        group.appendChild(select);
        this.appendControl(group);

        return select;
    }

    private createOctaveSelect(): HTMLSelectElement {
        const select = this.createSelect('octave-select', 'Keyboard Octave', ['0', '1', '2', '3', '4', '5', '6', '7']);
        select.value = '3'; // Default C3
        select.addEventListener('change', () => {
            this.octaveValue = parseInt(select.value, 10);
            if (this.onOctaveChange) {
                this.onOctaveChange(this.octaveValue);
            }
            this.scheduleAutoSave();
        });
        return select;
    }

    private freqToNoteName(freq: number): string {
        // A4 = 440Hz = MIDI 69
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const midiNote = 12 * Math.log2(freq / 440) + 69;
        const roundedMidi = Math.round(midiNote);
        const octave = Math.floor(roundedMidi / 12) - 1;
        const noteIndex = roundedMidi % 12;
        return `${noteNames[noteIndex]}${octave}`;
    }

    private createFileInput(id: string, label: string, accept: string, multiple: boolean = false): HTMLInputElement {
        const group = document.createElement('div');
        group.className = 'control-group';

        const labelEl = document.createElement('label');
        labelEl.htmlFor = id;
        labelEl.textContent = label;

        const input = document.createElement('input');
        input.type = 'file';
        input.id = id;
        input.accept = accept;
        input.multiple = multiple;
        input.className = 'file-input';

        const labelRow = document.createElement('div');
        labelRow.className = 'label-row';
        labelRow.appendChild(labelEl);

        group.appendChild(labelRow);
        group.appendChild(input);
        this.appendControl(group);

        return input;
    }

    private createResetButton(): void {
        const group = document.createElement('div');
        group.className = 'control-group';

        const button = document.createElement('button');
        button.id = 'reset-dataset-btn';
        button.textContent = '↻ Reset Dataset';
        button.className = 'reset-button';

        button.addEventListener('click', () => {
            // Trigger spectral data change callback to reinit current dataset
            if (this.onSpectralDataChange) {
                const currentDataset = this.spectralDataSelect.value;
                this.onSpectralDataChange(currentDataset);
            }
        });

        group.appendChild(button);
        this.appendControl(group);
    }

    private createDynamicParameterSlider(): void {
        const container = document.createElement('div');
        container.id = 'dynamic-param-container';
        container.className = 'control-group';
        container.style.display = 'none'; // Hidden by default

        const labelEl = document.createElement('label');
        labelEl.htmlFor = 'dynamic-param';
        labelEl.id = 'dynamic-param-label';
        labelEl.textContent = 'Parameter';

        const valueDisplay = document.createElement('span');
        valueDisplay.className = 'value-display';
        valueDisplay.id = 'dynamic-param-value';
        valueDisplay.textContent = '0.50';

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.id = 'dynamic-param';
        slider.min = '0';
        slider.max = '1';
        slider.value = '0.5';
        slider.step = '0.01';
        slider.className = 'slider';

        // Update value display on change
        slider.addEventListener('input', () => {
            const val = parseFloat(slider.value);
            const step = parseFloat(slider.step);
            valueDisplay.textContent = step >= 1 ? String(Math.round(val)) : val.toFixed(2);
            if (this.onDynamicParamChange) {
                this.onDynamicParamChange(val);
            }
        });

        const labelRow = document.createElement('div');
        labelRow.className = 'label-row';
        labelRow.appendChild(labelEl);
        labelRow.appendChild(valueDisplay);

        container.appendChild(labelRow);
        container.appendChild(slider);
        this.appendControl(container);

        this.dynamicParamSlider = slider;
        this.dynamicParamContainer = container;
    }

    private createPresetUI(): void {
        // Preset dropdown
        const selectGroup = document.createElement('div');
        selectGroup.className = 'control-group';

        const selectLabel = document.createElement('label');
        selectLabel.textContent = 'Load Preset';

        const select = document.createElement('select');
        select.id = 'preset-select';
        select.className = 'select';

        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = '-- Select Preset --';
        select.appendChild(defaultOpt);

        select.addEventListener('change', () => {
            if (select.value && this.onPresetLoad) {
                const preset = this.presetManager.getPreset(select.value);
                if (preset) {
                    this.onPresetLoad(preset.controls);
                }
            }
        });

        const labelRow = document.createElement('div');
        labelRow.className = 'label-row';
        labelRow.appendChild(selectLabel);

        selectGroup.appendChild(labelRow);
        selectGroup.appendChild(select);
        this.appendControl(selectGroup);

        this.presetSelect = select;
        this.updatePresetDropdown();

        // Save / Delete buttons
        const buttonGroup = document.createElement('div');
        buttonGroup.className = 'control-group';
        buttonGroup.style.display = 'flex';
        buttonGroup.style.gap = '8px';

        const saveBtn = document.createElement('button');
        saveBtn.className = 'reset-button';
        saveBtn.textContent = '💾 Save';
        saveBtn.style.flex = '1';
        saveBtn.addEventListener('click', () => {
            const name = prompt('Enter preset name:');
            if (name && name.trim()) {
                this.presetManager.savePreset(name.trim(), this.getFullState());
            }
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'reset-button';
        deleteBtn.textContent = '🗑 Delete';
        deleteBtn.style.flex = '1';
        deleteBtn.addEventListener('click', () => {
            if (this.presetSelect && this.presetSelect.value) {
                if (confirm(`Delete preset "${this.presetSelect.value}"?`)) {
                    this.presetManager.deletePreset(this.presetSelect.value);
                }
            }
        });

        buttonGroup.appendChild(saveBtn);
        buttonGroup.appendChild(deleteBtn);
        this.appendControl(buttonGroup);
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
            lfo1: { ...this.lfoState[0] },
            lfo2: { ...this.lfoState[1] },
            modRouting: { ...this.modRoutingState },
            envelope: { attack: 0.1, decay: 0.2, sustain: 0.5, release: 0.5 }, // Will be updated from AudioEngine
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
        if (carrierEl) carrierEl.value = String(state.carrier);

        const feedbackEl = document.getElementById('feedback') as HTMLInputElement;
        if (feedbackEl) feedbackEl.value = String(state.feedback);

        // Update octave
        const octaveEl = document.getElementById('octave-select') as HTMLSelectElement;
        if (octaveEl) {
            octaveEl.value = String(state.octave);
            this.octaveValue = state.octave;
        }

        // Store LFO and routing state
        this.lfoState[0] = { ...state.lfo1 };
        this.lfoState[1] = { ...state.lfo2 };
        this.modRoutingState = { ...state.modRouting };

        // Update LFO UI elements
        this.updateLFOUI(0, state.lfo1);
        this.updateLFOUI(1, state.lfo2);

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

    private createGeneratorParamsContainer(): void {
        const container = document.createElement('div');
        container.id = 'generator-params-container';
        container.style.display = 'none';
        this.appendControl(container);
        this.generatorParamsContainer = container;
    }

    private showGeneratorParams(dataSet: string, initialParams?: GeneratorParams): void {
        if (!this.generatorParamsContainer) return;

        this.generatorParamsContainer.innerHTML = '';
        this.currentDataSet = dataSet;

        const createSlider = (label: string, min: number, max: number, value: number, step: number, onChange: (v: number) => void): HTMLInputElement => {
            const group = document.createElement('div');
            group.className = 'control-group';

            const labelEl = document.createElement('label');
            labelEl.textContent = label;

            const valueDisplay = document.createElement('span');
            valueDisplay.className = 'value-display';
            valueDisplay.textContent = step >= 1 ? String(Math.round(value)) : value.toFixed(2);

            const slider = document.createElement('input');
            slider.type = 'range';
            slider.min = String(min);
            slider.max = String(max);
            slider.value = String(value);
            slider.step = String(step);
            slider.className = 'slider';

            slider.addEventListener('input', () => {
                const val = parseFloat(slider.value);
                valueDisplay.textContent = step >= 1 ? String(Math.round(val)) : val.toFixed(2);
                onChange(val);
            });

            const labelRow = document.createElement('div');
            labelRow.className = 'label-row';
            labelRow.appendChild(labelEl);
            labelRow.appendChild(valueDisplay);

            group.appendChild(labelRow);
            group.appendChild(slider);
            this.generatorParamsContainer!.appendChild(group);

            return slider;
        };

        const triggerUpdate = () => {
            if (this.onGeneratorParamsChange && this.currentGeneratorParams) {
                this.onGeneratorParamsChange(this.currentDataSet, this.currentGeneratorParams);
            }
        };

        switch (dataSet) {
            case '3d-julia': {
                const saved = initialParams as JuliaParams | undefined;
                const params: JuliaParams = saved ? { ...saved } : { ...defaultJuliaParams };
                this.currentGeneratorParams = params;

                createSlider('Scale', 0.5, 2.0, params.scale, 0.1, (v) => { params.scale = v; triggerUpdate(); });
                createSlider('C Real', -1, 1, params.cReal, 0.05, (v) => { params.cReal = v; triggerUpdate(); });
                createSlider('C Imaginary', -1, 1, params.cImag, 0.05, (v) => { params.cImag = v; triggerUpdate(); });
                break;
            }
            case 'mandelbulb': {
                const saved = initialParams as MandelbulbParams | undefined;
                const params: MandelbulbParams = saved ? { ...saved } : { ...defaultMandelbulbParams };
                this.currentGeneratorParams = params;

                createSlider('Power', 2, 12, params.power, 1, (v) => { params.power = v; triggerUpdate(); });
                createSlider('Scale', 0.5, 2.0, params.scale, 0.1, (v) => { params.scale = v; triggerUpdate(); });
                createSlider('Iterations', 4, 20, params.iterations, 1, (v) => { params.iterations = v; triggerUpdate(); });
                break;
            }
            case 'menger-sponge': {
                const saved = initialParams as MengerParams | undefined;
                const params: MengerParams = saved ? { ...saved } : { ...defaultMengerParams };
                this.currentGeneratorParams = params;

                createSlider('Iterations', 1, 5, params.iterations, 1, (v) => { params.iterations = v; triggerUpdate(); });
                createSlider('Scale', 0.5, 2.0, params.scale, 0.1, (v) => { params.scale = v; triggerUpdate(); });
                createSlider('Hole Size', 0.2, 0.5, params.holeSize, 0.01, (v) => { params.holeSize = v; triggerUpdate(); });
                break;
            }
            case 'sine-plasma': {
                const saved = initialParams as PlasmaParams | undefined;
                const params: PlasmaParams = saved ? { ...saved } : { ...defaultPlasmaParams };
                this.currentGeneratorParams = params;

                createSlider('Frequency', 1, 10, params.frequency, 0.5, (v) => { params.frequency = v; triggerUpdate(); });
                createSlider('Complexity', 1, 6, params.complexity, 1, (v) => { params.complexity = v; triggerUpdate(); });
                createSlider('Contrast', 0.5, 3.0, params.contrast, 0.1, (v) => { params.contrast = v; triggerUpdate(); });
                break;
            }
            case 'game-of-life': {
                const saved = initialParams as GameOfLifeParams | undefined;
                const params: GameOfLifeParams = saved ? { ...saved } : { ...defaultGameOfLifeParams };
                this.currentGeneratorParams = params;

                createSlider('Density', 0.1, 0.5, params.density, 0.05, (v) => { params.density = v; triggerUpdate(); });
                createSlider('Birth Neighbors', 4, 6, params.birthMin, 1, (v) => { params.birthMin = v; triggerUpdate(); });
                createSlider('Survive Neighbors', 3, 6, params.surviveMin, 1, (v) => { params.surviveMin = v; triggerUpdate(); });
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

    private createProgressIndicator(): void {
        const progressContainer = document.createElement('div');
        progressContainer.id = 'wav-progress-container';
        progressContainer.className = 'progress-container';
        progressContainer.style.display = 'none'; // Hidden by default

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

        this.appendControl(progressContainer);
    }

    private wireUpEvents(): void {
        const pathUpdate = () => {
            if (this.onPathChange) {
                this.onPathChange(this.getState());
            }
            this.scheduleAutoSave();
        };



        const volumeUpdate = () => {
            if (this.onVolumeResolutionChange) {
                this.onVolumeResolutionChange({
                    x: Math.round(parseFloat(this.densityXSlider.value)),
                    y: Math.round(parseFloat(this.densityYSlider.value)),
                    z: Math.round(parseFloat(this.densityZSlider.value)),
                });
            }
            this.scheduleAutoSave();
        };

        const spectralDataUpdate = () => {
            if (this.onSpectralDataChange) {
                this.onSpectralDataChange(this.spectralDataSelect.value);
            }
            this.scheduleAutoSave();
        };

        this.spectralDataSelect.addEventListener('change', spectralDataUpdate);

        // WAV upload (multi-file support)
        this.wavUploadInput.addEventListener('change', () => {
            const files = this.wavUploadInput.files;
            if (files && files.length > 0 && this.onWavUpload) {
                this.onWavUpload(files);
            }
        });

        this.pathYSlider.addEventListener('input', pathUpdate);
        // Rotation sliders removed - controlled by mouse
        this.planeTypeSelect.addEventListener('change', pathUpdate);
        this.scanPositionSlider.addEventListener('input', pathUpdate);

        // Synth mode change
        this.synthModeSelect.addEventListener('change', () => {
            const mode = this.synthModeSelect.value as SynthMode;
            // Show/hide wavetable-specific controls based on mode
            const isWavetable = mode === SynthMode.WAVETABLE;
            if (this.frequencyContainer) {
                this.frequencyContainer.style.display = isWavetable ? 'block' : 'none';
            }
            if (this.carrierContainer) {
                this.carrierContainer.style.display = isWavetable ? 'block' : 'none';
            }
            if (this.feedbackContainer) {
                this.feedbackContainer.style.display = isWavetable ? 'block' : 'none';
            }
            if (this.onSynthModeChange) {
                this.onSynthModeChange(mode);
            }
            this.scheduleAutoSave();
        });

        // Volume density sliders trigger on change (not input) to avoid too many reinits
        this.densityXSlider.addEventListener('change', volumeUpdate);
        this.densityYSlider.addEventListener('change', volumeUpdate);
        this.densityZSlider.addEventListener('change', volumeUpdate);
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
        // Save current selection
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

            // Add "None" or placeholder? User probably wants to select one.
            // Let's rely on logic to select first one if not selected

            for (const input of inputs) {
                const opt = document.createElement('option');
                opt.value = input.id;
                opt.textContent = input.name;
                this.midiSelect.appendChild(opt);
            }

            // Restore selection if still exists, or select first
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

    public setDynamicParamChangeCallback(callback: (value: number) => void): void {
        this.onDynamicParamChange = callback;
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
                x: 0, // Controlled by mouse
                y: 0, // Not used
                z: 0, // Controlled by mouse
            },
            scanPosition: parseFloat(this.scanPositionSlider.value),
            planeType: this.planeTypeSelect.value as PlaneType,
            shapePhase: 0,
        };
    }

    // getSpeed Removed

    public updateScanPosition(pos: number): void {
        this.scanPositionSlider.value = String(pos);
        // Update display
        const display = document.getElementById('scan-pos-value');
        if (display) display.textContent = pos.toFixed(2);

        // Trigger callback manually
        if (this.onPathChange) {
            this.onPathChange(this.getState());
        }
    }

    public updatePathY(y: number): void {
        this.pathYSlider.value = String(y);
        const display = document.getElementById('path-y-value');
        if (display) display.textContent = y.toFixed(2);

        // Trigger callback manually
        if (this.onPathChange) {
            this.onPathChange(this.getState());
        }
    }

    public addSpectralDataOption(value: string, label: string): void {
        // Check if option already exists
        const existingOption = Array.from(this.spectralDataSelect.options).find(
            opt => opt.value === value
        );

        if (!existingOption) {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            this.spectralDataSelect.appendChild(option);
        }

        // Select the new option
        this.spectralDataSelect.value = value;

        // Trigger change event
        const event = new Event('change');
        this.spectralDataSelect.dispatchEvent(event);
    }

    public setVolumeDensity(resolution: VolumeResolution): void {
        // Update slider values
        this.densityXSlider.value = String(resolution.x);
        this.densityYSlider.value = String(resolution.y);
        this.densityZSlider.value = String(resolution.z);

        // Update displays
        const xDisplay = document.getElementById('density-x-value');
        const yDisplay = document.getElementById('density-y-value');
        const zDisplay = document.getElementById('density-z-value');

        if (xDisplay) xDisplay.textContent = String(Math.round(resolution.x));
        if (yDisplay) yDisplay.textContent = String(Math.round(resolution.y));
        if (zDisplay) zDisplay.textContent = String(Math.round(resolution.z));
    }

    public showProgress(): void {
        const container = document.getElementById('wav-progress-container');
        if (container) container.style.display = 'flex';
    }

    public hideProgress(): void {
        const container = document.getElementById('wav-progress-container');
        if (container) container.style.display = 'none';
    }

    public updateProgress(percent: number): void {
        const fill = document.getElementById('wav-progress-fill');
        const text = document.getElementById('wav-progress-text');

        if (fill) fill.style.width = `${percent}%`;
        if (text) text.textContent = `${Math.round(percent)}%`;
    }
}
