import { ReadingPathState, SpatialState } from '../types';

// UI control panel with sliders for path control, stereo spread, and speed
// Matches the concept image layout

export class ControlPanel {
    private container: HTMLElement;

    private pathXSlider: HTMLInputElement;
    private pathYSlider: HTMLInputElement;
    private pathZSlider: HTMLInputElement;
    private stereoSpreadSlider: HTMLInputElement;
    private speedSlider: HTMLInputElement;

    private onPathChange?: (state: ReadingPathState) => void;
    private onSpatialChange?: (state: SpatialState) => void;

    constructor(containerId: string) {
        const el = document.getElementById(containerId);
        if (!el) throw new Error(`Container not found: ${containerId}`);
        this.container = el;

        this.pathXSlider = this.createSlider('path-x', 'Path X', -1, 1, 0, 0.01);
        this.pathYSlider = this.createSlider('path-y', 'Path Y', -1, 1, 0, 0.01);
        this.pathZSlider = this.createSlider('path-z', 'Path Z', -1, 1, 0, 0.01);
        this.stereoSpreadSlider = this.createSlider('stereo-spread', 'Stereo Spread', 0, 1, 0.5, 0.01);
        this.speedSlider = this.createSlider('speed', 'Speed / Scrub', 0, 1, 0.5, 0.01);

        this.wireUpEvents();
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
        valueDisplay.textContent = value.toFixed(2);
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
            valueDisplay.textContent = parseFloat(slider.value).toFixed(2);
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

    private wireUpEvents(): void {
        const pathUpdate = () => {
            if (this.onPathChange) {
                this.onPathChange({
                    position: {
                        x: parseFloat(this.pathXSlider.value),
                        y: parseFloat(this.pathYSlider.value),
                        z: parseFloat(this.pathZSlider.value),
                    },
                    speed: parseFloat(this.speedSlider.value),
                });
            }
        };

        const spatialUpdate = () => {
            if (this.onSpatialChange) {
                this.onSpatialChange({
                    stereoSpread: parseFloat(this.stereoSpreadSlider.value),
                });
            }
        };

        this.pathXSlider.addEventListener('input', pathUpdate);
        this.pathYSlider.addEventListener('input', pathUpdate);
        this.pathZSlider.addEventListener('input', pathUpdate);
        this.speedSlider.addEventListener('input', pathUpdate);
        this.stereoSpreadSlider.addEventListener('input', spatialUpdate);
    }

    public setPathChangeCallback(callback: (state: ReadingPathState) => void): void {
        this.onPathChange = callback;
    }

    public setSpatialChangeCallback(callback: (state: SpatialState) => void): void {
        this.onSpatialChange = callback;
    }
}
