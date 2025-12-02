import { ReadingPathState, SpatialState, VolumeResolution, VOLUME_DENSITY_MIN, VOLUME_DENSITY_MAX, VOLUME_DENSITY_DEFAULT, PlaneType } from '../types';

// UI control panel with sliders for all parameters

export class ControlPanel {
    private container: HTMLElement;

    // Path controls
    private pathYSlider: HTMLInputElement;
    // Rotation sliders removed - now controlled by mouse
    private planeTypeSelect: HTMLSelectElement;
    private stereoSpreadSlider: HTMLInputElement;
    private speedSlider: HTMLInputElement;
    private scanPositionSlider: HTMLInputElement;

    // Volume density controls
    private densityXSlider: HTMLInputElement;
    private densityYSlider: HTMLInputElement;
    private densityZSlider: HTMLInputElement;

    // Spectral data controls
    private spectralDataSelect: HTMLSelectElement;
    private wavUploadInput: HTMLInputElement;

    private onPathChange?: (state: ReadingPathState) => void;
    private onSpatialChange?: (state: SpatialState) => void;
    private onVolumeResolutionChange?: (resolution: VolumeResolution) => void;
    private onSpectralDataChange?: (dataSet: string) => void;
    private onWavUpload?: (file: File) => void;

    constructor(containerId: string) {
        const el = document.getElementById(containerId);
        if (!el) throw new Error(`Container not found: ${containerId}`);
        this.container = el;

        this.createSection('Spectral Data');
        this.spectralDataSelect = this.createSelect('spectral-data-type', 'Data Set', [
            'blank',
            'clouds'
        ]);

        // Add WAV upload
        this.wavUploadInput = this.createFileInput('wav-upload', 'Upload WAV', '.wav,.mp3,.ogg');

        // Create section headers
        this.createSection('Reading Path');
        this.pathYSlider = this.createSlider('path-y', 'Position Y', -1, 1, 0, 0.01);
        // Rotation is now controlled by mouse - removed sliders
        this.planeTypeSelect = this.createSelect('plane-type', 'Plane Type', [
            PlaneType.FLAT,
            PlaneType.SINCOS,
            PlaneType.WAVE,
            PlaneType.RIPPLE,
        ]);
        this.speedSlider = this.createSlider('speed', 'Speed / Scrub', 0, 1, 0.5, 0.01);
        this.scanPositionSlider = this.createSlider('scan-pos', 'Scan Phase', -1, 1, 0, 0.01);

        this.createSection('Spatial Audio');
        this.stereoSpreadSlider = this.createSlider('stereo-spread', 'Stereo Spread', 0, 1, 0.5, 0.01);

        this.createSection('Volume Density');
        this.densityXSlider = this.createSlider('density-x', 'Density X (Frequency)', VOLUME_DENSITY_MIN, VOLUME_DENSITY_MAX, VOLUME_DENSITY_DEFAULT, 1);
        this.densityYSlider = this.createSlider('density-y', 'Density Y (Index)', VOLUME_DENSITY_MIN, VOLUME_DENSITY_MAX, VOLUME_DENSITY_DEFAULT, 1);
        this.densityZSlider = this.createSlider('density-z', 'Density Z (Morph)', VOLUME_DENSITY_MIN, VOLUME_DENSITY_MAX, VOLUME_DENSITY_DEFAULT, 1);

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

    private createFileInput(id: string, label: string, accept: string): HTMLInputElement {
        const group = document.createElement('div');
        group.className = 'control-group';

        const labelEl = document.createElement('label');
        labelEl.htmlFor = id;
        labelEl.textContent = label;

        const input = document.createElement('input');
        input.type = 'file';
        input.id = id;
        input.accept = accept;
        input.className = 'file-input';

        const labelRow = document.createElement('div');
        labelRow.className = 'label-row';
        labelRow.appendChild(labelEl);

        group.appendChild(labelRow);
        group.appendChild(input);
        this.container.appendChild(group);

        return input;
    }

    private wireUpEvents(): void {
        const pathUpdate = () => {
            if (this.onPathChange) {
                this.onPathChange(this.getState());
            }
        };

        const spatialUpdate = () => {
            if (this.onSpatialChange) {
                this.onSpatialChange({
                    stereoSpread: parseFloat(this.stereoSpreadSlider.value),
                });
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

        // WAV upload
        this.wavUploadInput.addEventListener('change', () => {
            const file = this.wavUploadInput.files?.[0];
            if (file && this.onWavUpload) {
                this.onWavUpload(file);
            }
        });

        this.pathYSlider.addEventListener('input', pathUpdate);
        // Rotation sliders removed - controlled by mouse
        this.planeTypeSelect.addEventListener('change', pathUpdate);
        this.speedSlider.addEventListener('input', pathUpdate);
        this.scanPositionSlider.addEventListener('input', pathUpdate);
        this.stereoSpreadSlider.addEventListener('input', spatialUpdate);

        // Volume density sliders trigger on change (not input) to avoid too many reinits
        this.densityXSlider.addEventListener('change', volumeUpdate);
        this.densityYSlider.addEventListener('change', volumeUpdate);
        this.densityZSlider.addEventListener('change', volumeUpdate);
    }

    public setPathChangeCallback(callback: (state: ReadingPathState) => void): void {
        this.onPathChange = callback;
    }

    public setSpatialChangeCallback(callback: (state: SpatialState) => void): void {
        this.onSpatialChange = callback;
    }

    public setVolumeResolutionChangeCallback(callback: (resolution: VolumeResolution) => void): void {
        this.onVolumeResolutionChange = callback;
    }

    public setSpectralDataChangeCallback(callback: (dataSet: string) => void): void {
        this.onSpectralDataChange = callback;
    }

    public setWavUploadCallback(callback: (file: File) => void): void {
        this.onWavUpload = callback;
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
}
