import { ReadingPathState, VolumeResolution, SynthMode, CarrierType, VOLUME_DENSITY_X_MIN, VOLUME_DENSITY_X_MAX, VOLUME_DENSITY_X_DEFAULT, VOLUME_DENSITY_Y_MIN, VOLUME_DENSITY_Y_MAX, VOLUME_DENSITY_Y_DEFAULT, VOLUME_DENSITY_Z_MIN, VOLUME_DENSITY_Z_MAX, VOLUME_DENSITY_Z_DEFAULT, PlaneType } from '../types';

// UI control panel with sliders for all parameters

export class ControlPanel {
    private container: HTMLElement;

    // Path controls
    private pathYSlider: HTMLInputElement;
    // Rotation sliders removed - now controlled by mouse
    private planeTypeSelect: HTMLSelectElement;

    private speedSlider: HTMLInputElement;
    private scanPositionSlider: HTMLInputElement;

    // Synth mode controls
    private synthModeSelect: HTMLSelectElement;
    private frequencySlider: HTMLInputElement;
    private frequencyContainer: HTMLElement | null = null;
    private carrierSelect: HTMLSelectElement;
    private carrierContainer: HTMLElement | null = null;
    private feedbackSlider: HTMLInputElement;
    private feedbackContainer: HTMLElement | null = null;

    // Volume density controls
    private densityXSlider: HTMLInputElement;
    private densityYSlider: HTMLInputElement;
    private densityZSlider: HTMLInputElement;

    // Spectral data controls
    private spectralDataSelect: HTMLSelectElement;
    private wavUploadInput: HTMLInputElement;
    private dynamicParamSlider: HTMLInputElement | null = null;
    private dynamicParamContainer: HTMLElement | null = null;

    private onPathChange?: (state: ReadingPathState) => void;
    private onVolumeResolutionChange?: (resolution: VolumeResolution) => void;
    private onSpectralDataChange?: (dataSet: string) => void;
    private onWavUpload?: (files: FileList) => void;
    private onDynamicParamChange?: (value: number) => void;
    private onSynthModeChange?: (mode: SynthMode) => void;
    private onFrequencyChange?: (freq: number) => void;
    private onCarrierChange?: (carrier: CarrierType) => void;
    private onFeedbackChange?: (amount: number) => void;

    constructor(containerId: string) {
        const el = document.getElementById(containerId);
        if (!el) throw new Error(`Container not found: ${containerId}`);
        this.container = el;

        this.createSection('Spectral Data');
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

        // Add WAV upload (multi-select for morphing)
        this.wavUploadInput = this.createFileInput('wav-upload', 'Upload WAV (Multi-select)', '.wav,.mp3,.ogg', true);

        // Add progress indicator
        this.createProgressIndicator();

        // Create section headers
        this.createSection('Reading Path');
        this.pathYSlider = this.createSlider('path-y', 'Position Y (Morph)', -1, 1, 0, 0.01);
        // Rotation is now controlled by mouse - removed sliders
        this.planeTypeSelect = this.createSelect('plane-type', 'Plane Type', [
            PlaneType.FLAT,
            PlaneType.SINCOS,
            PlaneType.WAVE,
            PlaneType.RIPPLE,
        ]);
        this.speedSlider = this.createSlider('speed', 'Scrub Speed', -1, 1, 0, 0.01);
        this.scanPositionSlider = this.createSlider('scan-pos', 'Scan Phase', -1, 1, 0, 0.01);

        // Synthesis mode section
        this.createSection('Synthesis');
        this.synthModeSelect = this.createSelect('synth-mode', 'Mode', [
            SynthMode.WAVETABLE,
            SynthMode.SPECTRAL,
        ]);
        this.carrierSelect = this.createCarrierSelect();
        this.frequencySlider = this.createFrequencySlider();
        this.feedbackSlider = this.createFeedbackSlider();

        this.createSection('Volume Density');
        this.densityXSlider = this.createSlider('density-x', 'Freq Bins (X)', VOLUME_DENSITY_X_MIN, VOLUME_DENSITY_X_MAX, VOLUME_DENSITY_X_DEFAULT, 1);
        this.densityYSlider = this.createSlider('density-y', 'Morph Layers (Y)', VOLUME_DENSITY_Y_MIN, VOLUME_DENSITY_Y_MAX, VOLUME_DENSITY_Y_DEFAULT, 1);
        this.densityZSlider = this.createSlider('density-z', 'Time Res (Z)', VOLUME_DENSITY_Z_MIN, VOLUME_DENSITY_Z_MAX, VOLUME_DENSITY_Z_DEFAULT, 1);

        this.wireUpEvents();
    }

    // ... (createSection, createSlider, createSelect methods remain same)

    private createSection(title: string): void {
        const section = document.createElement('div');
        section.className = 'control-section-title';
        section.textContent = title;
        this.container.appendChild(section);
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
        this.container.appendChild(group);

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
        this.container.appendChild(group);

        return select;
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
        this.container.appendChild(group);

        this.frequencyContainer = group;
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
        this.container.appendChild(group);

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
        this.container.appendChild(group);

        this.feedbackContainer = group;
        return slider;
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
        this.container.appendChild(group);

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
        this.container.appendChild(group);
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
        valueDisplay.textContent = '500';

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.id = 'dynamic-param';
        slider.min = '0';
        slider.max = '1000';
        slider.value = '500';
        slider.step = '10';
        slider.className = 'slider';

        // Update value display on change
        slider.addEventListener('input', () => {
            const val = parseFloat(slider.value);
            valueDisplay.textContent = Math.round(val).toString();
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
        this.container.appendChild(container);

        this.dynamicParamSlider = slider;
        this.dynamicParamContainer = container;
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

        this.container.appendChild(progressContainer);
    }

    private wireUpEvents(): void {
        const pathUpdate = () => {
            if (this.onPathChange) {
                this.onPathChange(this.getState());
            }
        };



        const volumeUpdate = () => {
            if (this.onVolumeResolutionChange) {
                this.onVolumeResolutionChange({
                    x: Math.round(parseFloat(this.densityXSlider.value)),
                    y: Math.round(parseFloat(this.densityYSlider.value)),
                    z: Math.round(parseFloat(this.densityZSlider.value)),
                });
            }
        };

        const spectralDataUpdate = () => {
            if (this.onSpectralDataChange) {
                this.onSpectralDataChange(this.spectralDataSelect.value);
            }
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
        this.speedSlider.addEventListener('input', pathUpdate);
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

    public setCarrierChangeCallback(callback: (carrier: CarrierType) => void): void {
        this.onCarrierChange = callback;
    }

    public setFeedbackChangeCallback(callback: (amount: number) => void): void {
        this.onFeedbackChange = callback;
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

    public getSpeed(): number {
        return parseFloat(this.speedSlider.value);
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
            speed: parseFloat(this.speedSlider.value),
            scanPosition: parseFloat(this.scanPositionSlider.value),
            planeType: this.planeTypeSelect.value as PlaneType,
        };
    }

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
