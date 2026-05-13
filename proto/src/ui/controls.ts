import {
    ReadingPathState, VolumeResolution, SynthMode, CarrierType, PlaneType,
    VOLUME_DENSITY_X_MIN, VOLUME_DENSITY_X_MAX, VOLUME_DENSITY_X_DEFAULT,
    VOLUME_DENSITY_Y_MIN, VOLUME_DENSITY_Y_MAX, VOLUME_DENSITY_Y_DEFAULT,
    VOLUME_DENSITY_Z_MIN, VOLUME_DENSITY_Z_MAX, VOLUME_DENSITY_Z_DEFAULT,
    GeneratorParams, JuliaParams, MandelbulbParams, MengerParams, PlasmaParams, GameOfLifeParams,
    defaultJuliaParams, defaultMandelbulbParams, defaultMengerParams, defaultPlasmaParams, defaultGameOfLifeParams,
    PresetControls, OctaveDoublingState, defaultOctaveDoublingState,
    HarmonicInjectionState, defaultHarmonicInjectionState,
    SpectralCopyState, defaultSpectralCopyState, ModulatorOperator, ModulatorSlotState, ModulatorSlotType, ModulatorState,
    WaveshapeState, defaultWaveshapeState, SaturationState, defaultSaturationState,
    FilterState, defaultFilterState, FILTER_CUTOFF_MIN, FILTER_CUTOFF_MAX, FILTER_RESONANCE_MIN, FILTER_RESONANCE_MAX,
    ModRoutingState
} from '../types';
import { createDefaultModulatorStates, defaultEnvelopeState, defaultLFOState, estimateModulatorRange, normalizeModulatorState, resolveModulatorStates } from '../modulators/modulator';
import { PresetManager } from './preset-manager';
import { ModulatorPreviewWebGL } from './modulator-preview-webgl';
import {
    createSection, createSlider, createSelect, createModulatableSlider,
    createFileInput, createButton, createNumberInput, WAVEFORM_ICONS, CONTROL_STYLE,
    noteToName, createProgressUI, ProgressUI, createEnumSlider
} from './ui-elements';

interface SectionOpts {
    key: string;
    title: string;
    populate: (container: HTMLElement) => void;
    mode?: 'slider' | 'knob';
}

type LayoutTab = 'synth' | 'mod' | 'perform' | 'fx' | 'global' | 'visual';

interface SectionPlacement {
    key: string;
    column: string;
    row: string;
    collapsed?: boolean;
    accent?: boolean;
    onShow?: Array<() => void>;
}

interface TabConfig {
    label: string;
    hint: string;
    sections: SectionPlacement[];
}

const TAB_CONFIGS: Record<LayoutTab, TabConfig> = {
    synth: {
        label: 'Synth',
        hint: 'Core synthesis and routing',
        sections: [
            { key: 'wave-spectral', column: '1 / span 5', row: '1', accent: true },
            { key: 'audio-synthesis', column: '6 / span 4', row: '1' },
            { key: 'reading-path', column: '10 / span 3', row: '1' },

            { key: 'mod-slots', column: '8 / span 4', row: '2' }
        ]
    },
    mod: {
        label: 'Mod',
        hint: 'Modulators and routing',
        sections: [
            { key: 'mod-slots', column: '1 / span 8', row: '1 / span 2', accent: true },
            { key: 'mod-matrix', column: '9 / span 6', row: '1 / span 2' }
        ]
    },
    perform: {
        label: 'Perform',
        hint: 'Macros and live control',
        sections: [
            { key: 'xy-pad', column: '1 / span 7', row: '1' },
            { key: 'macros', column: '8 / span 7', row: '1' }
        ]
    },
    fx: {
        label: 'FX',
        hint: 'Tone shaping and post processing',
        sections: [
            { key: 'spectral-shaping', column: '1 / span 8', row: '1 / span 2' },
            { key: 'effects-chain', column: '9 / span 6', row: '1', accent: true },
            { key: 'effect-details', column: '9 / span 3', row: '2' },
            { key: 'octave-harmonics', column: '12 / span 3', row: '2' }
        ]
    },
    visual: {
        label: 'Visual',
        hint: 'Display resolution and export views',
        sections: [
            { key: 'visual-controls', column: '1 / span 8', row: '1 / span 2', accent: true },
            { key: 'visualization', column: '9 / span 6', row: '1' }
        ]
    },
    global: {
        label: 'Global',
        hint: 'Preset, tuning, and engine setup',
        sections: [
            { key: 'global-settings', column: '1 / span 8', row: '1 / span 2', accent: true },
            { key: 'synth-voice', column: '9 / span 3', row: '1' },
            { key: 'render-export', column: '12 / span 3', row: '1' },
            { key: 'master', column: '9 / span 3', row: '2' }
        ]
    }
};

// UI control panel with sliders for all parameters
export class ControlPanel {
    private container: HTMLElement;
    private controlsGrid!: HTMLElement;
    private activeTab: LayoutTab = 'synth';

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
    private onImageUpload?: (file: File) => void;
    private onSynthModeChange: ((mode: SynthMode) => void) | null = null;
    private onCarrierChange: ((carrier: CarrierType) => void) | null = null;
    private onFeedbackChange: ((amount: number) => void) | null = null;
    private onMidiInputChange: ((id: string) => void) | null = null;
    private onOctaveChange: ((octave: number) => void) | null = null;
    private onOctaveDoublingChange: ((state: OctaveDoublingState) => void) | null = null;
    private onHarmonicInjectionChange: ((state: HarmonicInjectionState) => void) | null = null;
    private onSpectralCopyChange: ((state: SpectralCopyState) => void) | null = null;
    private onWaveshapeChange: ((state: WaveshapeState) => void) | null = null;
    private onSaturationChange: ((state: SaturationState) => void) | null = null;
    private onInterpSamplesChange: ((samples: number) => void) | null = null;
    private onFilterChange: ((state: FilterState) => void) | null = null;

    // Modulator Callbacks
    private onModulatorChange: ((index: number, state: ModulatorState) => void) | null = null;
    private onModulationRoutingChange: ((target: string, source: string) => void) | null = null;

    // Generator params callback
    private onGeneratorParamsChange: ((dataSet: string, params: GeneratorParams) => void) | null = null;

    public setHarmonicInjectionChangeCallback(callback: (state: HarmonicInjectionState) => void): void {
        this.onHarmonicInjectionChange = callback;
    }

    public setSpectralCopyChangeCallback(callback: (state: SpectralCopyState) => void): void {
        this.onSpectralCopyChange = callback;
    }

    public setWaveshapeChangeCallback(callback: (state: WaveshapeState) => void): void {
        this.onWaveshapeChange = callback;
    }

    public setSaturationChangeCallback(callback: (state: SaturationState) => void): void {
        this.onSaturationChange = callback;
    }

    public setFilterChangeCallback(callback: (state: FilterState) => void): void {
        this.onFilterChange = callback;
    }

    public setWaveshapeState(state: WaveshapeState): void {
        this.waveshapeState = state;
    }

    // Offline Render callback
    private onRenderWav: ((note: number, duration: number) => void) | null = null;

    // Preset system
    private presetManager: PresetManager;
    private presetSelect: HTMLSelectElement | null = null;
    private onPresetLoad: ((controls: PresetControls) => void) | null = null;

    // Modulator state for serialization
    private modulatorStates: ModulatorState[] = [];
    private modulatorOverviewContainer: HTMLElement | null = null;
    private modulatorDetailContainer: HTMLElement | null = null;
    private modulatorPreviews: ModulatorPreviewWebGL[] = [];
    private modMatrixContainer: HTMLElement | null = null;
    private modMatrixSourceSelects: Partial<Record<keyof ModRoutingState, HTMLSelectElement>> = {};
    private modRoutingState: ModRoutingState = {
        pathY: 'none',
        scanPhase: 'none',
        shapePhase: 'none',
        amplitude: 'mod1',
        filterCutoff: 'none',
        filterResonance: 'none'
    };
    private octaveValue = 3;

    // Octave doubling state
    private octaveDoublingState: OctaveDoublingState = { ...defaultOctaveDoublingState };
    private octaveLowSlider!: HTMLInputElement;
    private octaveHighSlider!: HTMLInputElement;
    private octaveMultSlider!: HTMLInputElement;

    // Harmonic injection state
    private harmonicInjectionState: HarmonicInjectionState = { ...defaultHarmonicInjectionState };
    private harmonicCountSlider!: HTMLInputElement;
    private harmonicFalloffSlider!: HTMLInputElement;

    // Spectral Copy state
    private spectralCopyState: SpectralCopyState = { ...defaultSpectralCopyState };
    private spectralShiftSlider!: HTMLInputElement;
    private spectralMixSlider!: HTMLInputElement;

    // Waveshaping state
    private waveshapeState: WaveshapeState = { ...defaultWaveshapeState };
    private waveshapeDriveSlider!: HTMLInputElement;
    private waveshapeMixSlider!: HTMLInputElement;
    private saturationState: SaturationState = { ...defaultSaturationState };
    private saturationDriveSlider!: HTMLInputElement;
    private saturationMixSlider!: HTMLInputElement;
    private filterState: FilterState = { ...defaultFilterState };
    private filterModeSelect!: HTMLSelectElement;
    private filterOrderSelect!: HTMLSelectElement;
    private filterCutoffSlider!: HTMLInputElement;
    private filterResonanceSlider!: HTMLInputElement;
    private filterCutoffSourceSelect: HTMLSelectElement | null = null;
    private filterResonanceSourceSelect: HTMLSelectElement | null = null;

    // Debounce timer for auto-save
    private autoSaveTimer: number | null = null;
    private lastAutoPresetTimestamp = 0;
    private readonly autoPresetIntervalMs = 15000;

    private bpmSlider!: HTMLInputElement;
    private bpmValue: number = 140;
    private onBPMChange: ((bpm: number) => void) | null = null;

    private renderDurationLabel: HTMLElement | null = null;

    // Waveform Icon containers
    private carrierIconContainer: HTMLElement | null = null;

    // Modulation routing selects
    private pathYSourceSelect: HTMLSelectElement | null = null;
    private scanPhaseSourceSelect: HTMLSelectElement | null = null;
    private shapePhaseSourceSelect: HTMLSelectElement | null = null;
    private amplitudeSourceSelect: HTMLSelectElement | null = null;

    constructor(containerId: string, options: { modulators?: ModulatorState[] }) {
        const el = document.getElementById(containerId);
        if (!el) throw new Error(`Container not found: ${containerId}`);
        this.container = el;
        this.container.innerHTML = '';

        this.controlsGrid = document.createElement('div');
        this.controlsGrid.id = 'controls-grid';
        this.container.appendChild(this.controlsGrid);

        this.modulatorStates = resolveModulatorStates({ modulators: options.modulators || createDefaultModulatorStates() });
        // Initialize preset manager
        this.presetManager = new PresetManager();
        this.presetManager.setPresetsChangeCallback(() => this.updatePresetDropdown());
        this.presetManager.ready().then(() => this.updatePresetDropdown());
        this.setupToolbar();

        const sections: SectionOpts[] = [
            { key: 'wave-spectral', title: 'Wave / Spectral', populate: (c) => this.populateVolumeSection(c) },
            { key: 'audio-synthesis', title: 'Audio Synthesis', populate: (c) => this.populateSynthesisSection(c) },
            { key: 'reading-path', title: 'Reading Path', populate: (c) => this.populatePathSection(c) },
            { key: 'visualization', title: 'Visualization', populate: (c) => this.populateVisualizationSection(c), mode: 'slider' },
            { key: 'render-export', title: 'Render / Export', populate: (c) => this.populateOfflineRenderSection(c) },
            { key: 'octave-harmonics', title: 'Octave & Harmonics', populate: (c) => this.populateOctaveHarmonicsSection(c) },
            { key: 'spectral-shaping', title: 'Spectral Shaping', populate: (c) => this.populateSpectralShapingSection(c) },
            { key: 'synth-voice', title: 'System / MIDI', populate: (c) => this.populateSynthVoiceSection(c) },
            { key: 'mod-slots', title: 'Mod Slots', populate: (c) => this.populateModulatorSection(c) },
            { key: 'master', title: 'Master', populate: (c) => this.populateMasterSection(c) },
            { key: 'mod-matrix', title: 'Mod Matrix', populate: (c) => this.populateModMatrixSection(c) },
            { key: 'macros', title: 'Macros', populate: (c) => this.populateMockSection(c, 'Reserved space for macro knobs and performance assignments.', ['Macro 1: Morph + Feedback', 'Macro 2: Harmonics + Saturation', 'Macro 3: Filter + Render State'], ['performance', 'planned']) },
            { key: 'xy-pad', title: 'XY Pad', populate: (c) => this.populateMockSection(c, 'Live gesture surface for crossfading between modulation targets.', ['X Axis: LFO 1', 'Y Axis: Envelope 1', 'Touch mapping planned'], ['expressive', 'planned']) },
            { key: 'effects-chain', title: 'Effects Chain', populate: (c) => this.populateMockSection(c, 'Future insert rack for time and tone effects after synthesis.', ['Reverb', 'Delay', 'Chorus', 'Compressor'], ['fx', 'planned']) },
            { key: 'effect-details', title: 'Effect Details', populate: (c) => this.populateMockSection(c, 'Focused editor for the currently selected effect block.', ['Mix / Time / Feedback', 'Tone curve preview', 'Slot-specific modulation'], ['detail', 'planned']) },
            { key: 'global-settings', title: 'Global Settings', populate: (c) => this.populateMockSection(c, 'System-level tuning, polyphony, and preset metadata live here.', ['Master Tune', 'Voice Count', 'Sample Rate / Buffer Size'], ['global', 'planned']) },
            { key: 'visual-controls', title: 'Visual Controls', populate: (c) => this.populateMockSection(c, 'Space for cube, spectrogram, and scope display preferences.', ['Rotate / Tilt', 'Grid + Axis overlays', 'Color mapping and contrast'], ['visual', 'planned']) }
        ];

        sections.forEach(s => {
            const container = createSection(this.controlsGrid, s.title, s.mode, s.key);
            s.populate(container);
        });

        this.registerSectionOnShow('mod-slots', () => this.refreshModulatorPreviews());

        this.applyTabLayout(this.activeTab);
        this.updateModulationRanges();
    }

    private setupToolbar(): void {
        const presetToolbar = document.getElementById('preset-toolbar');
        if (presetToolbar) {
            presetToolbar.innerHTML = '';

            const title = document.createElement('div');
            title.className = 'toolbar-title';
            title.textContent = 'Preset';
            presetToolbar.appendChild(title);

            const prevButton = document.createElement('button');
            prevButton.type = 'button';
            prevButton.className = 'toolbar-nav-button';
            prevButton.textContent = '‹';
            prevButton.addEventListener('click', () => this.stepPresetSelection(-1));
            presetToolbar.appendChild(prevButton);

            this.presetSelect = createSelect(presetToolbar, 'preset-select', 'Active Preset', [], (val) => {
                if (val && this.onPresetLoad) {
                    const preset = this.presetManager.getPreset(val);
                    if (preset) this.onPresetLoad(preset.controls);
                }
            });

            const nextButton = document.createElement('button');
            nextButton.type = 'button';
            nextButton.className = 'toolbar-nav-button';
            nextButton.textContent = '›';
            nextButton.addEventListener('click', () => this.stepPresetSelection(1));
            presetToolbar.appendChild(nextButton);

            const saveButton = document.createElement('button');
            saveButton.type = 'button';
            saveButton.className = 'toolbar-action-button';
            saveButton.textContent = 'Save';
            saveButton.addEventListener('click', () => {
                const state = this.getFullState();
                this.presetManager.savePreset(this.generateAutoPresetName(state, Date.now()), state);
            });
            presetToolbar.appendChild(saveButton);

            const deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.className = 'toolbar-action-button ghost';
            deleteButton.textContent = 'Delete';
            deleteButton.addEventListener('click', () => {
                if (this.presetSelect && this.presetSelect.value) {
                    if (confirm(`Delete preset "${this.presetSelect.value}"?`)) {
                        this.presetManager.deletePreset(this.presetSelect.value);
                    }
                }
            });
            presetToolbar.appendChild(deleteButton);

            this.updatePresetDropdown();
        }

        const tabToolbar = document.getElementById('tab-toolbar');
        if (tabToolbar) {
            tabToolbar.innerHTML = '';
            Object.entries(TAB_CONFIGS).forEach(([key, config]) => {
                const tabKey = key as LayoutTab;
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'layout-tab-button';
                button.dataset.tab = tabKey;
                button.textContent = config.label.toUpperCase();
                button.title = config.hint;
                button.addEventListener('click', () => this.applyTabLayout(tabKey));
                tabToolbar.appendChild(button);
            });
        }
    }

    private stepPresetSelection(direction: -1 | 1): void {
        if (!this.presetSelect) return;
        const presetOptions = Array.from(this.presetSelect.options).filter((option) => option.value);
        if (presetOptions.length === 0) return;

        const currentIndex = presetOptions.findIndex((option) => option.value === this.presetSelect!.value);
        const nextIndex = currentIndex < 0
            ? 0
            : (currentIndex + direction + presetOptions.length) % presetOptions.length;

        this.presetSelect.value = presetOptions[nextIndex].value;
        this.presetSelect.dispatchEvent(new Event('change'));
    }

    private registerSectionOnShow(sectionKey: string, callback: () => void): void {
        Object.values(TAB_CONFIGS).forEach((tab) => {
            tab.sections.forEach((section) => {
                if (section.key === sectionKey) {
                    section.onShow = section.onShow || [];
                    section.onShow.push(callback);
                }
            });
        });
    }

    private refreshModulatorPreviews(): void {
        this.modulatorPreviews.forEach((preview) => preview.refresh());
    }

    private applyTabLayout(tab: LayoutTab): void {
        this.activeTab = tab;
        const layout = TAB_CONFIGS[tab];
        const placements = new Map(layout.sections.map((section) => [section.key, section] as const));

        Array.from(this.controlsGrid.children).forEach((child) => {
            const card = child as HTMLElement;
            const key = card.dataset.sectionKey || '';
            const placement = placements.get(key);

            if (!placement) {
                card.classList.add('is-tab-hidden');
                card.classList.remove('is-tab-collapsed', 'is-accented');
                card.style.gridColumn = '';
                card.style.gridRow = '';
                return;
            }

            card.classList.remove('is-tab-hidden');
            card.classList.toggle('is-tab-collapsed', Boolean(placement.collapsed));
            card.classList.toggle('is-accented', Boolean(placement.accent));
            if (key === 'mod-slots') {
                card.classList.toggle('is-mod-overview', tab === 'synth');
            }
            card.style.gridColumn = placement.column;
            card.style.gridRow = placement.row;
            placement.onShow?.forEach((callback) => callback());
        });

        document.querySelectorAll<HTMLElement>('.layout-tab-button').forEach((button) => {
            button.classList.toggle('is-active', button.dataset.tab === tab);
        });
    }

    private populateMockSection(container: HTMLElement, description: string, rows: string[], chips: string[] = []): void {
        const copy = document.createElement('p');
        copy.className = 'mock-card-copy';
        copy.textContent = description;
        container.appendChild(copy);

        const list = document.createElement('div');
        list.className = 'mock-list';
        container.appendChild(list);

        rows.forEach((row) => {
            const item = document.createElement('div');
            item.className = 'mock-list-row';

            const label = document.createElement('span');
            label.textContent = row;
            item.appendChild(label);

            const badge = document.createElement('span');
            badge.className = 'mock-badge';
            badge.textContent = 'mock';
            item.appendChild(badge);

            list.appendChild(item);
        });

        if (chips.length > 0) {
            const chipRow = document.createElement('div');
            chipRow.className = 'mock-pill-row';
            chips.forEach((chip) => {
                const pill = document.createElement('span');
                pill.className = 'mock-pill';
                pill.textContent = chip;
                chipRow.appendChild(pill);
            });
            container.appendChild(chipRow);
        }
    }

    private getModMatrixTargets(): Array<{ key: keyof ModRoutingState, label: string, area: string, allowNone: boolean }> {
        return [
            { key: 'amplitude', label: 'Amplitude', area: 'Audio', allowNone: false },
            { key: 'pathY', label: 'Position Y', area: 'Reading Path', allowNone: true },
            { key: 'scanPhase', label: 'Scan Phase', area: 'Reading Path', allowNone: true },
            { key: 'shapePhase', label: 'Shape Phase', area: 'Reading Path', allowNone: true },
            { key: 'filterCutoff', label: 'Filter Cutoff', area: 'Filter', allowNone: true },
            { key: 'filterResonance', label: 'Filter Resonance', area: 'Filter', allowNone: true }
        ];
    }

    private populateModMatrixSection(container: HTMLElement): void {
        this.modMatrixSourceSelects = {};

        const list = document.createElement('div');
        list.className = 'mod-matrix-list';
        container.appendChild(list);
        this.modMatrixContainer = list;

        this.renderModMatrix();
    }

    private renderModMatrix(): void {
        if (!this.modMatrixContainer) return;
        this.modMatrixContainer.innerHTML = '';

        this.getModMatrixTargets().forEach((target) => {
            const row = document.createElement('div');
            row.className = 'mod-matrix-row';

            const labelGroup = document.createElement('div');
            labelGroup.className = 'mod-matrix-target';
            row.appendChild(labelGroup);

            const targetLabel = document.createElement('span');
            targetLabel.className = 'mod-matrix-target-label';
            targetLabel.textContent = target.label;
            labelGroup.appendChild(targetLabel);

            const targetArea = document.createElement('span');
            targetArea.className = 'mod-matrix-target-area';
            targetArea.textContent = target.area;
            labelGroup.appendChild(targetArea);

            const select = document.createElement('select');
            select.className = 'mod-matrix-source-select';
            this.populateModMatrixSelectOptions(select, target.allowNone);
            select.value = this.modRoutingState[target.key];
            select.addEventListener('change', () => {
                this.setModulationRoute(target.key, select.value);
            });
            row.appendChild(select);
            this.modMatrixSourceSelects[target.key] = select;

            this.modMatrixContainer!.appendChild(row);
        });

        this.updateModMatrixUI();
    }

    private populateModMatrixSelectOptions(select: HTMLSelectElement, allowNone: boolean): void {
        select.innerHTML = '';
        this.getModulatorOptions(allowNone).forEach((option) => {
            const optEl = document.createElement('option');
            optEl.value = option.value;
            optEl.textContent = option.label;
            select.appendChild(optEl);
        });
    }

    private setModulationRoute(target: keyof ModRoutingState, source: string): void {
        this.modRoutingState[target] = source;
        if (this.onModulationRoutingChange) this.onModulationRoutingChange(target, source);
        this.scheduleAutoSave();
        this.updateModRoutingUI();
    }

    private populateVolumeSection(container: HTMLElement): void {
        const subGroup = document.createElement('div');
        subGroup.classList.add('sub-group');
        container.appendChild(subGroup);
        const dataRow = document.createElement('div');
        dataRow.className = 'volume-dataset-row';
        subGroup.appendChild(dataRow);
        this.spectralDataSelect = createSelect(dataRow, 'spectral-data-type', 'Data Set', [
            'blank', '3d-julia', 'mandelbulb', 'menger-sponge', 'sine-plasma', 'game-of-life'
        ], (val) => {
            if (this.onSpectralDataChange) this.onSpectralDataChange(val);
            this.scheduleAutoSave();
        });
        this.createGeneratorParamsContainer(subGroup);
        this.dynamicParamContainer = document.createElement('div');
        this.dynamicParamContainer.className = 'sub-group dynamic-param-card';
        this.dynamicParamContainer.style.display = 'none';
        subGroup.appendChild(this.dynamicParamContainer);
        createButton(dataRow, 'reset-dataset-btn', '↻ Reset Dataset', () => {
            if (this.onSpectralDataChange) this.onSpectralDataChange(this.spectralDataSelect.value);
        });
        const subGroup2 = document.createElement('div');
        subGroup2.classList.add('sub-group');
        container.appendChild(subGroup2);
        createFileInput(subGroup2, 'wav-upload', 'Upload WAV (Multi-select)', '.wav,.mp3,.ogg', true, (files) => {
            if (files && files.length > 0 && this.onWavUpload) this.onWavUpload(files);
        });
        createFileInput(subGroup2, 'image-upload', 'Upload Image', '.png,.jpg,.jpeg,.webp,.gif,.bmp', false, (files) => {
            if (files && files.length > 0 && this.onImageUpload) this.onImageUpload(files[0]);
        });
        this.uploadProgressUI = createProgressUI(subGroup2);
    }

    private populatePathSection(container: HTMLElement): void {
        const modulatorOptions = this.getModulatorOptions(true);
        const spGroup = document.createElement('div');
        spGroup.className = 'control-group';
        container.appendChild(spGroup);
        this.planeTypeSelect = createSelect(spGroup, 'plane-type', 'Plane Type', [
            PlaneType.FLAT, PlaneType.SINCOS, PlaneType.WAVE, PlaneType.RIPPLE,
            PlaneType.TUBE, PlaneType.BELL, PlaneType.SPIRAL, PlaneType.SPRING
        ], (_val) => {
            if (this.onPathChange) this.onPathChange(this.getState());
            this.scheduleAutoSave();
        });
        this.shapePhaseSourceSelect = createSelect(spGroup, 'shape-phase-source', 'Shape Phase Source', modulatorOptions, (source) => {
            this.setModulationRoute('shapePhase', source);
        });
        const nGroup = document.createElement('div');
        nGroup.className = 'control-group';
        container.appendChild(nGroup);
        const pathYControl = createModulatableSlider(nGroup, 'path-y', 'Position Y (Morph)', -1, 1, 0, 0.001, modulatorOptions,
            (_v) => { if (this.onPathChange) this.onPathChange(this.getState()); this.scheduleAutoSave(); },
            (source) => {
                this.setModulationRoute('pathY', source);
            },
            CONTROL_STYLE, 'linear', 3
        );
        this.pathYSlider = pathYControl.slider;
        this.pathYSourceSelect = pathYControl.select;
        const scanControl = createModulatableSlider(nGroup, 'scan-pos', 'Scan Phase', -1, 1, 0, 0.001, modulatorOptions,
            (_v) => { if (this.onPathChange) this.onPathChange(this.getState()); this.scheduleAutoSave(); },
            (source) => {
                this.setModulationRoute('scanPhase', source);
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

        const modulatorOptions = this.getModulatorOptions(false);
        this.amplitudeSourceSelect = createSelect(subGroup, 'amplitude-source', 'Amplitude Source', modulatorOptions, (source) => {
            this.setModulationRoute('amplitude', source);
        });

        // Dynamic synth parameter container
        this.synthParamsContainer = document.createElement('div');
        this.synthParamsContainer.id = 'synth-params-container';
        this.synthParamsContainer.classList.add('sub-group');
        container.appendChild(this.synthParamsContainer);
        // Initialize dynamic UI
        this.updateSynthModeUI(this.synthModeSelect.value as SynthMode);
    }

    private populateSynthVoiceSection(container: HTMLElement): void {
        const subGroup = document.createElement('div');
        subGroup.classList.add('sub-group');
        container.appendChild(subGroup);

        this.midiSelect = this.createMidiSelect(subGroup);
        this.createOctaveSelect(subGroup);
        this.interpSamplesSlider = createSlider(subGroup, 'interp-samples', 'Interp Samples', 16, 1024, 64, 1, (val) => {
            if (this.onInterpSamplesChange) this.onInterpSamplesChange(val);
            this.scheduleAutoSave();
        });
    }

    private populateOctaveHarmonicsSection(container: HTMLElement): void {
        const octaveGroup = document.createElement('div');
        octaveGroup.classList.add('sub-group');
        container.appendChild(octaveGroup);
        this.appendSectionLabel(octaveGroup, 'Octave Doubling');

        const octaveUpdate = () => {
            if (this.onOctaveDoublingChange) this.onOctaveDoublingChange(this.octaveDoublingState);
            this.scheduleAutoSave();
        };

        this.octaveLowSlider = createSlider(octaveGroup, 'octave-low', 'Low (octaves below)', 0, 10, 0, 1, (val) => {
            this.octaveDoublingState.lowCount = val;
            octaveUpdate();
        });
        this.octaveHighSlider = createSlider(octaveGroup, 'octave-high', 'High (octaves above)', 0, 10, 0, 1, (val) => {
            this.octaveDoublingState.highCount = val;
            octaveUpdate();
        });
        this.octaveMultSlider = createSlider(octaveGroup, 'octave-mult', 'Decay (per octave)', 0, 1, 0.5, 0.001, (val) => {
            this.octaveDoublingState.multiplier = val;
            octaveUpdate();
        }, undefined, 'linear', 3);

        const harmonicGroup = document.createElement('div');
        harmonicGroup.classList.add('sub-group');
        container.appendChild(harmonicGroup);
        this.appendSectionLabel(harmonicGroup, 'Harmonic Injection');

        const harmInjUpdate = () => {
            if (this.onHarmonicInjectionChange) this.onHarmonicInjectionChange(this.harmonicInjectionState);
            this.scheduleAutoSave();
        };

        this.harmonicCountSlider = createSlider(harmonicGroup, 'harmonic-count', 'Harmonics Count', 0, 32, 0, 1, (val) => {
            this.harmonicInjectionState.count = val;
            harmInjUpdate();
        });

        this.harmonicFalloffSlider = createSlider(harmonicGroup, 'harmonic-falloff', 'Falloff (Exp)', 0, 4.0, 1.0, 0.01, (val) => {
            this.harmonicInjectionState.falloff = val;
            harmInjUpdate();
        }, undefined, 'linear', 2);
    }

    private populateSpectralShapingSection(container: HTMLElement): void {
        const spectralCopyGroup = document.createElement('div');
        spectralCopyGroup.classList.add('sub-group');
        container.appendChild(spectralCopyGroup);
        this.appendSectionLabel(spectralCopyGroup, 'Spectral Copy');

        const copyUpdate = () => {
            if (this.onSpectralCopyChange) this.onSpectralCopyChange(this.spectralCopyState);
            this.scheduleAutoSave();
        };

        this.spectralShiftSlider = createSlider(spectralCopyGroup, 'spectral-shift', 'Shift (Semitones)', -24, 24, 12, 1, (val) => {
            this.spectralCopyState.shift = val;
            copyUpdate();
        });

        this.spectralMixSlider = createSlider(spectralCopyGroup, 'spectral-mix', 'Mix', 0, 1, 0, 0.01, (val) => {
            this.spectralCopyState.mix = val;
            copyUpdate();
        });

        const waveshapeGroup = document.createElement('div');
        waveshapeGroup.classList.add('sub-group');
        container.appendChild(waveshapeGroup);
        this.appendSectionLabel(waveshapeGroup, 'Waveshaping');
        this.appendWaveshapingControls(waveshapeGroup);

        const saturationGroup = document.createElement('div');
        saturationGroup.classList.add('sub-group');
        container.appendChild(saturationGroup);
        this.appendSectionLabel(saturationGroup, 'Saturation');

        createSelect(saturationGroup, 'saturation-mode', 'Mode', [
            { value: '0', label: 'None' },
            { value: '1', label: 'Gentle' },
            { value: '2', label: 'Transistor' },
            { value: '3', label: 'Tube' }
        ], (val) => {
            this.saturationState.mode = parseInt(val, 10);
            if (this.onSaturationChange) this.onSaturationChange(this.saturationState);
            this.scheduleAutoSave();
        });

        this.saturationDriveSlider = createSlider(saturationGroup, 'saturation-drive', 'Drive', 1, 20, 1, 0.1, (val) => {
            this.saturationState.drive = val;
            if (this.onSaturationChange) this.onSaturationChange(this.saturationState);
            this.scheduleAutoSave();
        }, undefined, 'linear', 2);

        this.saturationMixSlider = createSlider(saturationGroup, 'saturation-mix', 'Mix', 0, 1, 0, 0.01, (val) => {
            this.saturationState.mix = val;
            if (this.onSaturationChange) this.onSaturationChange(this.saturationState);
            this.scheduleAutoSave();
        });

        const filterGroup = document.createElement('div');
        filterGroup.classList.add('sub-group');
        container.appendChild(filterGroup);
        this.appendSectionLabel(filterGroup, 'Filter');
        this.appendFilterControls(filterGroup);
    }

    private populateMasterSection(container: HTMLElement): void {
        const subGroup = document.createElement('div');
        subGroup.classList.add('sub-group');
        container.appendChild(subGroup);

        this.bpmSlider = createSlider(subGroup, 'global-bpm', 'Global BPM', 30, 300, this.bpmValue, 1, (val) => {
            this.bpmValue = val;
            if (this.onBPMChange) this.onBPMChange(val);
            this.scheduleAutoSave();
            this.renderModulatorSection();
            this.updateSyncUI();
        }, CONTROL_STYLE, 'linear', 0);

        const compactMock = document.createElement('div');
        compactMock.className = 'mock-list compact';
        container.appendChild(compactMock);

        ['Vol', 'Pan', 'Out'].forEach((labelText) => {
            const item = document.createElement('div');
            item.className = 'mock-list-row compact';

            const label = document.createElement('span');
            label.textContent = labelText;
            item.appendChild(label);

            const badge = document.createElement('span');
            badge.className = 'mock-badge';
            badge.textContent = 'mock';
            item.appendChild(badge);

            compactMock.appendChild(item);
        });
    }

    private appendSectionLabel(container: HTMLElement, text: string): void {
        const label = document.createElement('label');
        label.textContent = text;
        label.className = 'section-subtitle';
        container.appendChild(label);
    }

    private appendWaveshapingControls(container: HTMLElement): void {
        createSelect(container, 'waveshape-curve', 'Curve', [
            { value: '0', label: 'None' },
            { value: '1', label: 'Tanh' },
            { value: '2', label: 'Polynomial' },
            { value: '3', label: 'Sine Fold' },
            { value: '4', label: 'Custom (LUT)' }
        ], (val) => {
            this.waveshapeState.curve = parseInt(val, 10);
            if (this.waveshapeState.curve === 4 && (!this.waveshapeState.customCurve || this.waveshapeState.customCurve.length !== 1024)) {
                this.waveshapeState.customCurve = this.createIdentityWaveshapeCurve(1024);
            }
            if (this.onWaveshapeChange) this.onWaveshapeChange(this.waveshapeState);
            this.scheduleAutoSave();
            updateCustomUI();
        });

        this.waveshapeDriveSlider = createSlider(container, 'waveshape-drive', 'Drive', 1, 20, 1, 0.1, (val) => {
            this.waveshapeState.drive = val;
            if (this.onWaveshapeChange) this.onWaveshapeChange(this.waveshapeState);
            this.scheduleAutoSave();
        }, undefined, 'linear', 2);

        this.waveshapeMixSlider = createSlider(container, 'waveshape-mix', 'Mix', 0, 1, 0, 0.01, (val) => {
            this.waveshapeState.mix = val;
            if (this.onWaveshapeChange) this.onWaveshapeChange(this.waveshapeState);
            this.scheduleAutoSave();
        });

        const customContainer = document.createElement('div');
        customContainer.className = 'control-group';
        container.appendChild(customContainer);
        const customLabel = document.createElement('label');
        customLabel.textContent = 'Custom Curve';
        customContainer.appendChild(customLabel);

        const canvas = document.createElement('canvas');
        canvas.className = 'modulator-preview-canvas';
        canvas.style.height = '96px';
        customContainer.appendChild(canvas);

        const customButtonRow = document.createElement('div');
        customButtonRow.style.display = 'flex';
        customButtonRow.style.gap = '8px';
        customContainer.appendChild(customButtonRow);
        createButton(customButtonRow, 'waveshape-custom-reset', 'Reset', () => {
            this.waveshapeState.customCurve = this.createIdentityWaveshapeCurve(1024);
            if (this.onWaveshapeChange) this.onWaveshapeChange(this.waveshapeState);
            this.scheduleAutoSave();
            drawCurve();
        }, 'reset-button');

        let isDrawing = false;
        let lastIndex: number | null = null;

        const resizeCanvas = () => {
            const rect = canvas.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            canvas.width = Math.max(1, Math.floor(rect.width * dpr));
            canvas.height = Math.max(1, Math.floor(rect.height * dpr));
            drawCurve();
        };

        const drawCurve = () => {
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.strokeStyle = 'rgba(0,255,120,0.20)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, canvas.height * 0.5);
            ctx.lineTo(canvas.width, canvas.height * 0.5);
            ctx.stroke();

            const curve = this.waveshapeState.customCurve;
            if (!curve || curve.length < 2) return;
            ctx.strokeStyle = 'rgba(0,255,120,1)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let i = 0; i < curve.length; i++) {
                const x = (i / (curve.length - 1)) * canvas.width;
                const y = (1 - ((curve[i] + 1) * 0.5)) * canvas.height;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        };

        const setPointFromEvent = (e: PointerEvent) => {
            if (this.waveshapeState.curve !== 4) return;
            if (!this.waveshapeState.customCurve || this.waveshapeState.customCurve.length !== 1024) {
                this.waveshapeState.customCurve = this.createIdentityWaveshapeCurve(1024);
            }
            const curve = this.waveshapeState.customCurve;
            const rect = canvas.getBoundingClientRect();
            const xN = (e.clientX - rect.left) / Math.max(1, rect.width);
            const yN = (e.clientY - rect.top) / Math.max(1, rect.height);
            const idx = Math.max(0, Math.min(curve.length - 1, Math.round(xN * (curve.length - 1))));
            const value = Math.max(-1, Math.min(1, (1 - yN) * 2 - 1));

            if (lastIndex !== null && lastIndex !== idx) {
                const a = Math.min(lastIndex, idx);
                const b = Math.max(lastIndex, idx);
                const va = curve[lastIndex];
                for (let i = a; i <= b; i++) {
                    const t = (i - a) / Math.max(1, b - a);
                    curve[i] = va * (1 - t) + value * t;
                }
            } else {
                curve[idx] = value;
            }

            lastIndex = idx;
            if (this.onWaveshapeChange) this.onWaveshapeChange(this.waveshapeState);
            this.scheduleAutoSave();
            drawCurve();
        };

        canvas.addEventListener('pointerdown', (e) => {
            isDrawing = true;
            lastIndex = null;
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            setPointFromEvent(e);
        });
        canvas.addEventListener('pointermove', (e) => {
            if (!isDrawing) return;
            setPointFromEvent(e);
        });
        canvas.addEventListener('pointerup', () => {
            isDrawing = false;
            lastIndex = null;
        });
        canvas.addEventListener('pointercancel', () => {
            isDrawing = false;
            lastIndex = null;
        });

        const updateCustomUI = () => {
            customContainer.style.display = this.waveshapeState.curve === 4 ? 'block' : 'none';
            resizeCanvas();
        };
        updateCustomUI();
    }

    private appendFilterControls(filterGroup: HTMLElement): void {
        const emitFilterChange = () => {
            if (this.onFilterChange) this.onFilterChange({ ...this.filterState });
            this.scheduleAutoSave();
        };

        this.filterModeSelect = createSelect(filterGroup, 'filter-mode', 'Type', [
            { value: 'none', label: 'No Filter' },
            { value: 'lowpass', label: 'Lowpass' },
            { value: 'bandpass', label: 'Bandpass' },
            { value: 'highpass', label: 'Hipass' }
        ], (val) => {
            this.filterState.mode = val as FilterState['mode'];
            this.updateFilterUIState();
            emitFilterChange();
        });

        this.filterOrderSelect = createSelect(filterGroup, 'filter-order', 'Order', [
            { value: '2', label: '2nd Order' },
            { value: '4', label: '4th Order' }
        ], (val) => {
            this.filterState.order = parseInt(val, 10) as FilterState['order'];
            emitFilterChange();
        });

        const filterModulatorOptions = this.getModulatorOptions(true);

        const cutoffControl = createModulatableSlider(
            filterGroup,
            'filter-cutoff',
            'Cutoff',
            FILTER_CUTOFF_MIN,
            FILTER_CUTOFF_MAX,
            this.filterState.cutoff,
            1,
            filterModulatorOptions,
            (val) => {
                this.filterState.cutoff = val;
                emitFilterChange();
            },
            (source) => {
                this.setModulationRoute('filterCutoff', source);
            },
            CONTROL_STYLE,
            'logarithmic',
            0
        );
        this.filterCutoffSlider = cutoffControl.slider;
        this.filterCutoffSourceSelect = cutoffControl.select;

        const resonanceControl = createModulatableSlider(
            filterGroup,
            'filter-resonance',
            'Resonance',
            FILTER_RESONANCE_MIN,
            FILTER_RESONANCE_MAX,
            this.filterState.resonance,
            0.01,
            filterModulatorOptions,
            (val) => {
                this.filterState.resonance = val;
                emitFilterChange();
            },
            (source) => {
                this.setModulationRoute('filterResonance', source);
            },
            CONTROL_STYLE,
            'linear',
            2
        );
        this.filterResonanceSlider = resonanceControl.slider;
        this.filterResonanceSourceSelect = resonanceControl.select;

        this.updateFilterUIState();
    }

    private updateFilterUIState(): void {
        const filterDisabled = this.filterState.mode === 'none';
        if (this.filterOrderSelect) this.filterOrderSelect.disabled = filterDisabled;
        if (this.filterCutoffSlider) this.filterCutoffSlider.disabled = filterDisabled || this.modRoutingState.filterCutoff !== 'none';
        if (this.filterResonanceSlider) this.filterResonanceSlider.disabled = filterDisabled || this.modRoutingState.filterResonance !== 'none';
        if (this.filterCutoffSourceSelect) this.filterCutoffSourceSelect.disabled = filterDisabled;
        if (this.filterResonanceSourceSelect) this.filterResonanceSourceSelect.disabled = filterDisabled;
    }

    private createIdentityWaveshapeCurve(size: number): number[] {
        const n = Math.max(2, size);
        const curve = new Array<number>(n);
        for (let i = 0; i < n; i++) {
            curve[i] = (i / (n - 1)) * 2 - 1;
        }
        return curve;
    }

    private updateSynthModeUI(mode: SynthMode): void {
        if (!this.synthParamsContainer) return;
        this.synthParamsContainer.innerHTML = '';

        if (mode === SynthMode.WAVETABLE) {
            this.createCarrierSelect(this.synthParamsContainer);
            this.createFeedbackSlider(this.synthParamsContainer);
        }
    }

    private populateModulatorSection(container: HTMLElement): void {
        container.classList.add('mod-slots-card');

        // Add modulator controls header
        const controlsHeader = document.createElement('div');
        controlsHeader.className = 'mod-slots-header';
        controlsHeader.style.display = 'flex';
        controlsHeader.style.justifyContent = 'space-between';
        controlsHeader.style.alignItems = 'center';
        controlsHeader.style.padding = '0 14px 8px';
        controlsHeader.style.gap = '8px';
        container.appendChild(controlsHeader);

        const headerLabel = document.createElement('label');
        headerLabel.textContent = 'Modulators';
        headerLabel.style.flex = '1';
        headerLabel.style.fontWeight = '600';
        controlsHeader.appendChild(headerLabel);

        const addModButton = document.createElement('button');
        addModButton.type = 'button';
        addModButton.className = 'reset-button';
        addModButton.textContent = '+ Add';
        addModButton.addEventListener('click', () => this.addModulator());
        controlsHeader.appendChild(addModButton);

        this.modulatorOverviewContainer = document.createElement('div');
        this.modulatorOverviewContainer.className = 'mod-overview-list';
        container.appendChild(this.modulatorOverviewContainer);

        this.modulatorDetailContainer = document.createElement('div');
        this.modulatorDetailContainer.className = 'mod-detail-list';
        container.appendChild(this.modulatorDetailContainer);

        this.renderModulatorSection();
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

    private getModulatorLabel(index: number): string {
        return this.modulatorStates[index]?.name || `Mod ${index + 1}`;
    }

    private getModulatorOptions(includeNone: boolean = true): { value: string, label: string }[] {
        const options = this.modulatorStates.map((_, index) => ({
            value: `mod${index + 1}`,
            label: this.getModulatorLabel(index)
        }));
        return includeNone ? [{ value: 'none', label: 'None' }, ...options] : options;
    }

    private syncSelectOptions(select: HTMLSelectElement | null, options: { value: string, label: string }[]): void {
        if (!select) return;
        const previousValue = select.value;
        select.innerHTML = '';
        options.forEach((option) => {
            const optEl = document.createElement('option');
            optEl.value = option.value;
            optEl.textContent = option.label;
            select.appendChild(optEl);
        });
        select.value = options.some((option) => option.value === previousValue)
            ? previousValue
            : options[0]?.value || '';
    }

    private sanitizeModRoutingSources(): void {
        const validSources = new Set(this.modulatorStates.map((_, index) => `mod${index + 1}`));
        const firstModulator = this.modulatorStates.length > 0 ? 'mod1' : '';
        const routingTargets: Array<keyof ModRoutingState> = ['pathY', 'scanPhase', 'shapePhase', 'filterCutoff', 'filterResonance'];

        routingTargets.forEach((target) => {
            const source = this.modRoutingState[target];
            if (source === 'none' || validSources.has(source)) return;
            this.modRoutingState[target] = 'none';
            if (this.onModulationRoutingChange) this.onModulationRoutingChange(target, 'none');
        });

        if (!validSources.has(this.modRoutingState.amplitude)) {
            this.modRoutingState.amplitude = firstModulator;
            if (this.onModulationRoutingChange) this.onModulationRoutingChange('amplitude', firstModulator);
        }
    }

    private refreshModulatorSelectLabels(): void {
        this.sanitizeModRoutingSources();
        const optionsWithNone = this.getModulatorOptions(true);
        const optionsWithoutNone = this.getModulatorOptions(false);
        this.syncSelectOptions(this.pathYSourceSelect, optionsWithNone);
        this.syncSelectOptions(this.scanPhaseSourceSelect, optionsWithNone);
        this.syncSelectOptions(this.shapePhaseSourceSelect, optionsWithNone);
        this.syncSelectOptions(this.filterCutoffSourceSelect, optionsWithNone);
        this.syncSelectOptions(this.filterResonanceSourceSelect, optionsWithNone);
        this.syncSelectOptions(this.amplitudeSourceSelect, optionsWithoutNone);
        this.getModMatrixTargets().forEach((target) => {
            const select = this.modMatrixSourceSelects[target.key] || null;
            this.syncSelectOptions(select, target.allowNone ? optionsWithNone : optionsWithoutNone);
        });
        this.updateModRoutingUI();
    }

    private populateOfflineRenderSection(container: HTMLElement): void {
        const subGroup = document.createElement('div');
        subGroup.classList.add('sub-group');
        subGroup.style.display = 'flex';
        subGroup.style.flexDirection = 'column';
        subGroup.style.gap = '8px';
        container.appendChild(subGroup);

        const noteOptions = [];
        for (let n = 0; n <= 108; n++) {
            noteOptions.push({ value: String(n), label: noteToName(n) });
        }

        const baseNoteSelect = createSelect(subGroup, 'render-base-note', 'Base Note', noteOptions, () => { });
        baseNoteSelect.value = '48'; // Default to C3
        const durationControl = createNumberInput(subGroup, 'render-duration', 'Duration (s)', 2.0, 0.1, 10.0, 0.1);

        // Grab the label element to update it dynamically
        const durationGroup = durationControl.closest('.control-group-row');
        if (durationGroup) {
            this.renderDurationLabel = durationGroup.querySelector('label') as HTMLElement;
        }

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

    private renderModulatorSection(): void {
        if (!this.modulatorOverviewContainer || !this.modulatorDetailContainer) return;
        this.modulatorPreviews.forEach((preview) => preview.destroy());
        this.modulatorPreviews = [];
        this.modulatorOverviewContainer.innerHTML = '';
        this.modulatorDetailContainer.innerHTML = '';
        this.modulatorStates.forEach((modulator, index) => {
            this.appendControl(this.modulatorOverviewContainer!, this.createModulatorOverview(index, modulator));
            this.appendControl(this.modulatorDetailContainer!, this.createModulatorUnit(index, modulator));
        });
    }

    private createModulatorOverview(index: number, modulator: ModulatorState): HTMLElement {
        const row = document.createElement('div');
        row.className = 'mod-overview-row';

        const headerRow = document.createElement('div');
        headerRow.style.display = 'flex';
        headerRow.style.justifyContent = 'space-between';
        headerRow.style.alignItems = 'center';
        headerRow.style.gap = '8px';
        row.appendChild(headerRow);

        const name = document.createElement('div');
        name.className = 'mod-overview-name';
        name.appendChild(this.createModulatorNameInput(index, 'mod-overview-name-input'));
        headerRow.appendChild(name);

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'reset-button';
        removeBtn.textContent = '✕';
        removeBtn.title = 'Remove modulator';
        removeBtn.style.padding = '2px 6px';
        removeBtn.style.fontSize = '0.85rem';
        removeBtn.disabled = this.modulatorStates.length <= 1;
        removeBtn.addEventListener('click', () => this.removeModulator(index));
        headerRow.appendChild(removeBtn);

        const slots = document.createElement('div');
        slots.className = 'mod-overview-slots';
        modulator.slots.forEach((slot, slotIndex) => {
            const chip = document.createElement('span');
            chip.className = 'mod-overview-chip';
            chip.textContent = slot.type === 'none' ? `Slot ${slotIndex + 1}` : `Slot ${slotIndex + 1}: ${slot.type}`;
            slots.appendChild(chip);
        });
        row.appendChild(slots);

        return row;
    }

    private createModulatorNameInput(index: number, className: string): HTMLInputElement {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = `modulator-name-input ${className}`;
        input.value = this.getModulatorLabel(index);
        input.title = 'Rename modulator';
        input.setAttribute('aria-label', `Rename ${this.getModulatorLabel(index)}`);

        const commit = () => {
            const fallback = `Mod ${index + 1}`;
            const nextName = input.value.trim() || fallback;
            input.value = nextName;
            if (!this.modulatorStates[index] || this.modulatorStates[index].name === nextName) return;
            this.modulatorStates[index].name = nextName;
            this.modulatorStates[index] = normalizeModulatorState(this.modulatorStates[index]);
            this.refreshModulatorSelectLabels();
            this.emitModulatorChange(index, true);
        };

        input.addEventListener('focus', () => input.select());
        input.addEventListener('blur', commit);
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                input.blur();
            } else if (event.key === 'Escape') {
                input.value = this.getModulatorLabel(index);
                input.blur();
            }
        });

        return input;
    }

    private addModulator(): void {
        const newModulators = createDefaultModulatorStates(1);
        const newModulator = newModulators[0];
        newModulator.name = `Mod ${this.modulatorStates.length + 1}`;
        this.modulatorStates.push(newModulator);
        this.renderModulatorSection();
        this.refreshModulatorSelectLabels();
        this.updateModulationRanges();
        this.emitModulatorChange(this.modulatorStates.length - 1);
    }

    private removeModulator(index: number): void {
        if (this.modulatorStates.length <= 1) return;
        this.modulatorStates.splice(index, 1);
        this.renderModulatorSection();
        this.refreshModulatorSelectLabels();
        this.updateModulationRanges();
        // Emit changes for all remaining modulators since their indices shifted
        this.modulatorStates.forEach((_, i) => this.emitModulatorChange(i));
    }

    private createModulatorUnit(index: number, modulator: ModulatorState): HTMLElement {
        const wrapper = document.createElement('div');
        wrapper.className = 'lfo-unit';

        const headerRow = document.createElement('div');
        headerRow.className = 'control-group';
        headerRow.style.display = 'flex';
        headerRow.style.alignItems = 'center';
        headerRow.style.justifyContent = 'space-between';
        headerRow.style.gap = '8px';
        wrapper.appendChild(headerRow);

        const title = document.createElement('label');
        title.style.flex = '1';
        title.style.minWidth = '0';
        title.appendChild(this.createModulatorNameInput(index, 'mod-unit-name-input'));
        headerRow.appendChild(title);

        const buttonRow = document.createElement('div');
        buttonRow.style.display = 'flex';
        buttonRow.style.flexWrap = 'wrap';
        buttonRow.style.gap = '6px';
        headerRow.appendChild(buttonRow);

        const removeModButton = document.createElement('button');
        removeModButton.type = 'button';
        removeModButton.className = 'reset-button';
        removeModButton.textContent = 'x';
        removeModButton.title = 'Delete modulator';
        removeModButton.disabled = this.modulatorStates.length <= 1;
        removeModButton.addEventListener('click', () => this.removeModulator(index));
        buttonRow.appendChild(removeModButton);

        const addButton = document.createElement('button');
        addButton.type = 'button';
        addButton.className = 'reset-button';
        addButton.textContent = '+ Slot';
        addButton.addEventListener('click', () => {
            this.modulatorStates[index].slots.push({ type: 'none' });
            this.modulatorStates[index].operators.push('+');
            this.modulatorStates[index] = normalizeModulatorState(this.modulatorStates[index]);
            this.emitModulatorChange(index, true);
        });
        buttonRow.appendChild(addButton);

        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'reset-button';
        removeButton.textContent = '- Slot';
        removeButton.disabled = modulator.slots.length <= 1;
        removeButton.addEventListener('click', () => {
            if (this.modulatorStates[index].slots.length <= 1) return;
            this.modulatorStates[index].slots.pop();
            this.modulatorStates[index].operators.pop();
            this.modulatorStates[index] = normalizeModulatorState(this.modulatorStates[index]);
            this.emitModulatorChange(index, true);
        });
        buttonRow.appendChild(removeButton);

        modulator.slots.forEach((slot, slotIndex) => {
            if (slotIndex > 0) {
                const operatorSelect = createSelect(wrapper, `mod-${index}-op-${slotIndex}`, `Op ${slotIndex}`, [
                    { value: '+', label: '+' },
                    { value: '-', label: '-' },
                    { value: '*', label: '*' }
                ], (value) => {
                    this.modulatorStates[index].operators[slotIndex - 1] = value as ModulatorOperator;
                    this.modulatorStates[index] = normalizeModulatorState(this.modulatorStates[index]);
                    this.emitModulatorChange(index);
                });
                operatorSelect.value = modulator.operators[slotIndex - 1] || '+';
            }

            const slotContainer = document.createElement('div');
            slotContainer.className = 'sub-group';
            wrapper.appendChild(slotContainer);

            const typeSelect = createSelect(slotContainer, `mod-${index}-slot-${slotIndex}-type`, `Slot ${slotIndex + 1}`, [
                { value: 'none', label: 'None' },
                { value: 'lfo', label: 'LFO' },
                { value: 'envelope', label: 'Envelope' },
                { value: 'slider', label: 'Slider' }
            ], (value) => {
                this.modulatorStates[index].slots[slotIndex] = this.createSlotState(value as ModulatorSlotType);
                this.modulatorStates[index] = normalizeModulatorState(this.modulatorStates[index]);
                this.emitModulatorChange(index, true);
            });
            typeSelect.value = slot.type;

            if (slot.type === 'lfo') {
                this.createModulatorLFOSlot(slotContainer, index, slotIndex, slot);
            } else if (slot.type === 'envelope') {
                this.createModulatorEnvelopeSlot(slotContainer, index, slotIndex, slot);
            } else if (slot.type === 'slider') {
                this.createModulatorSliderSlot(slotContainer, index, slotIndex, slot);
            }
        });

        const previewWrapper = document.createElement('div');
        previewWrapper.className = 'control-group';
        const previewLabel = document.createElement('label');
        previewLabel.textContent = 'Output';
        previewWrapper.appendChild(previewLabel);

        const previewCanvas = document.createElement('canvas');
        previewCanvas.className = 'modulator-preview-canvas';
        previewWrapper.appendChild(previewCanvas);
        wrapper.appendChild(previewWrapper);

        this.modulatorPreviews[index] = new ModulatorPreviewWebGL(previewCanvas);

        return wrapper;
    }

    private createModulatorLFOSlot(container: HTMLElement, modIndex: number, slotIndex: number, slot: ModulatorSlotState): void {
        const lfo = slot.lfo || defaultLFOState();
        const iconContainer = document.createElement('div');
        iconContainer.className = 'waveform-icon';
        iconContainer.innerHTML = WAVEFORM_ICONS[lfo.waveform] || WAVEFORM_ICONS['sine'];

        const waveSelect = createSelect(container, `mod-${modIndex}-slot-${slotIndex}-wave`, 'Waveform', [
            { value: 'sine', label: 'Sine' },
            { value: 'square', label: 'Square' },
            { value: 'saw', label: 'Saw' },
            { value: 'triangle', label: 'Triangle' }
        ], (value) => {
            const target = this.ensureLFOSlot(modIndex, slotIndex);
            target.waveform = value;
            iconContainer.innerHTML = WAVEFORM_ICONS[value] || WAVEFORM_ICONS['sine'];
            this.emitModulatorChange(modIndex);
        });
        waveSelect.value = lfo.waveform;
        const waveLabelRow = container.querySelector('.label-row:last-of-type') as HTMLElement | null;
        if (waveLabelRow) waveLabelRow.appendChild(iconContainer);

        const syncRow = document.createElement('div');
        syncRow.className = 'control-group';
        syncRow.style.display = 'flex';
        syncRow.style.alignItems = 'center';
        syncRow.style.gap = '8px';
        container.appendChild(syncRow);

        const syncLabel = document.createElement('label');
        syncLabel.textContent = 'Tempo Sync';
        syncRow.appendChild(syncLabel);

        const syncCheck = document.createElement('input');
        syncCheck.type = 'checkbox';
        syncCheck.checked = lfo.isSynced;
        syncRow.appendChild(syncCheck);

        const freqContainer = document.createElement('div');
        container.appendChild(freqContainer);
        const freqSlider = createSlider(freqContainer, `mod-${modIndex}-slot-${slotIndex}-freq`, 'Freq', 0, 5, lfo.frequency, 0.001, (value) => {
            this.ensureLFOSlot(modIndex, slotIndex).frequency = value;
            this.emitModulatorChange(modIndex);
        }, CONTROL_STYLE, 'linear', 3);

        const syncContainer = document.createElement('div');
        container.appendChild(syncContainer);
        const divisionOptions = ['1/1', '1/1T', '1/2', '1/2T', '1/4', '1/4T', '1/8', '1/8T', '1/16', '1/16T'];
        const divisionSlider = createEnumSlider(syncContainer, `mod-${modIndex}-slot-${slotIndex}-div`, 'Div', divisionOptions, lfo.division, (value) => {
            this.ensureLFOSlot(modIndex, slotIndex).division = value;
            this.emitModulatorChange(modIndex);
        }, CONTROL_STYLE, (value) => this.formatDivisionLabel(value));

        const applySyncVisibility = () => {
            freqContainer.style.display = syncCheck.checked ? 'none' : 'block';
            syncContainer.style.display = syncCheck.checked ? 'block' : 'none';
        };

        syncCheck.addEventListener('change', () => {
            this.ensureLFOSlot(modIndex, slotIndex).isSynced = syncCheck.checked;
            applySyncVisibility();
            this.emitModulatorChange(modIndex);
            this.updateSyncUI();
        });
        applySyncVisibility();

        freqSlider.value = String(lfo.frequency);
        divisionSlider.value = lfo.division;

        createSlider(container, `mod-${modIndex}-slot-${slotIndex}-amp`, 'Amp', 0, 1, lfo.amplitude, 0.001, (value) => {
            this.ensureLFOSlot(modIndex, slotIndex).amplitude = value;
            this.emitModulatorChange(modIndex);
        }, CONTROL_STYLE, 'linear', 3);

        createSlider(container, `mod-${modIndex}-slot-${slotIndex}-offset`, 'Offset', -1, 1, lfo.offset, 0.001, (value) => {
            this.ensureLFOSlot(modIndex, slotIndex).offset = value;
            this.emitModulatorChange(modIndex);
        }, CONTROL_STYLE, 'linear', 3);
    }

    private createModulatorEnvelopeSlot(container: HTMLElement, modIndex: number, slotIndex: number, slot: ModulatorSlotState): void {
        const envelope = slot.envelope || defaultEnvelopeState();
        createSlider(container, `mod-${modIndex}-slot-${slotIndex}-attack`, 'Attack', 0, 2, envelope.attack, 0.001, (value) => {
            this.ensureEnvelopeSlot(modIndex, slotIndex).attack = value;
            this.emitModulatorChange(modIndex);
        }, CONTROL_STYLE, 'linear', 3);
        createSlider(container, `mod-${modIndex}-slot-${slotIndex}-decay`, 'Decay', 0, 2, envelope.decay, 0.001, (value) => {
            this.ensureEnvelopeSlot(modIndex, slotIndex).decay = value;
            this.emitModulatorChange(modIndex);
        }, CONTROL_STYLE, 'linear', 3);
        createSlider(container, `mod-${modIndex}-slot-${slotIndex}-sustain`, 'Sustain', 0, 1, envelope.sustain, 0.001, (value) => {
            this.ensureEnvelopeSlot(modIndex, slotIndex).sustain = value;
            this.emitModulatorChange(modIndex);
        }, CONTROL_STYLE, 'linear', 3);
        createSlider(container, `mod-${modIndex}-slot-${slotIndex}-release`, 'Release', 0, 3, envelope.release, 0.001, (value) => {
            this.ensureEnvelopeSlot(modIndex, slotIndex).release = value;
            this.emitModulatorChange(modIndex);
        }, CONTROL_STYLE, 'linear', 3);
    }

    private createModulatorSliderSlot(container: HTMLElement, modIndex: number, slotIndex: number, slot: ModulatorSlotState): void {
        createSlider(container, `mod-${modIndex}-slot-${slotIndex}-value`, 'Value', 0, 1, slot.value ?? 1, 0.001, (value) => {
            this.modulatorStates[modIndex].slots[slotIndex].value = value;
            this.emitModulatorChange(modIndex);
        }, CONTROL_STYLE, 'linear', 3);
    }

    private createSlotState(type: ModulatorSlotType): ModulatorSlotState {
        if (type === 'lfo') {
            return { type, lfo: defaultLFOState() };
        }
        if (type === 'envelope') {
            return { type, envelope: defaultEnvelopeState() };
        }
        if (type === 'slider') {
            return { type, value: 1 };
        }
        return { type: 'none' };
    }

    private ensureLFOSlot(modIndex: number, slotIndex: number) {
        const slot = this.modulatorStates[modIndex].slots[slotIndex];
        if (!slot.lfo) slot.lfo = defaultLFOState();
        return slot.lfo;
    }

    private ensureEnvelopeSlot(modIndex: number, slotIndex: number) {
        const slot = this.modulatorStates[modIndex].slots[slotIndex];
        if (!slot.envelope) slot.envelope = defaultEnvelopeState();
        return slot.envelope;
    }

    private emitModulatorChange(index: number, rerender: boolean = false): void {
        this.modulatorStates[index] = normalizeModulatorState(this.modulatorStates[index]);
        if (this.onModulatorChange) {
            this.onModulatorChange(index, JSON.parse(JSON.stringify(this.modulatorStates[index])));
        }
        this.scheduleAutoSave();
        this.updateModulationRanges();
        this.updateSyncUI();
        if (rerender) this.renderModulatorSection();
    }

    private formatDivisionLabel(value: string): string {
        const isTriplet = value.endsWith('T');
        const cleanDiv = isTriplet ? value.slice(0, -1) : value;
        const parts = cleanDiv.split('/');
        const numerator = parseInt(parts[0], 10);
        const denominator = parseInt(parts[1], 10);
        const durationInBeats = 4 * (numerator / denominator);
        const bps = this.bpmValue / 60;
        let freq = bps / durationInBeats;
        if (isTriplet) freq *= 1.5;
        return `${value} (${freq.toFixed(2)} Hz)`;
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

        const select = createSelect(group, 'carrier', 'Wave carrier', [
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
            const state = this.getFullState();
            this.presetManager.saveCurrentState(state);

            const now = Date.now();
            if (now - this.lastAutoPresetTimestamp >= this.autoPresetIntervalMs) {
                this.lastAutoPresetTimestamp = now;
                this.presetManager.savePreset(this.generateAutoPresetName(state, now), state);
            }
        }, 500);
    }

    private generateAutoPresetName(state: PresetControls, timestamp: number): string {
        const pathPart = `${state.planeType}-Y${state.pathY.toFixed(2)}-S${state.scanPosition.toFixed(2)}`;
        const stamp = new Date(timestamp)
            .toISOString()
            .replace('T', ' ')
            .replace(/\.\d{3}Z$/, '');
        return [state.synthMode, state.spectralData, pathPart, stamp]
            .map((part) => String(part).replace(/[^\w .:+-]+/g, '-').trim())
            .filter(Boolean)
            .join(' / ');
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
            modulators: this.modulatorStates.map(modulator => JSON.parse(JSON.stringify(modulator))),
            modRouting: { ...this.modRoutingState },
            filter: { ...this.filterState },
            envelopes: this.extractLegacyEnvelopeCompatibility(),
            octave: this.octaveValue,
            octaveDoubling: { ...this.octaveDoublingState },
            harmonicInjection: { ...this.harmonicInjectionState },
            spectralCopy: { ...this.spectralCopyState },
            waveshape: JSON.parse(JSON.stringify(this.waveshapeState)),
            saturation: { ...this.saturationState },
            interpSamples: parseFloat(this.interpSamplesSlider.value)
        };
    }

    public setPresetLoadCallback(callback: (controls: PresetControls) => void): void {
        this.onPresetLoad = callback;
    }

    public loadSavedState(): Promise<PresetControls | null> {
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

        this.modulatorStates = resolveModulatorStates(state, this.modulatorStates.length || 4);
        this.modRoutingState = {
            pathY: state.modRouting?.pathY || 'none',
            scanPhase: state.modRouting?.scanPhase || 'none',
            shapePhase: state.modRouting?.shapePhase || 'none',
            amplitude: state.modRouting?.amplitude || 'mod1',
            filterCutoff: state.modRouting?.filterCutoff || 'none',
            filterResonance: state.modRouting?.filterResonance || 'none'
        };
        this.renderModulatorSection();
        this.refreshModulatorSelectLabels();

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

        if (state.harmonicInjection) {
            this.harmonicInjectionState = { ...state.harmonicInjection };
            this.harmonicCountSlider.value = String(state.harmonicInjection.count);
            this.harmonicFalloffSlider.value = String(state.harmonicInjection.falloff);
        }

        if (state.spectralCopy) {
            this.spectralCopyState = { ...state.spectralCopy };
            this.spectralShiftSlider.value = String(state.spectralCopy.shift);
            this.spectralMixSlider.value = String(state.spectralCopy.mix);
        }

        if (state.waveshape) {
            this.waveshapeState = JSON.parse(JSON.stringify(state.waveshape));
        } else {
            this.waveshapeState = { ...defaultWaveshapeState };
        }

        const wsCurveEl = document.getElementById('waveshape-curve') as HTMLSelectElement | null;
        if (wsCurveEl) {
            wsCurveEl.value = String(this.waveshapeState.curve);
            wsCurveEl.dispatchEvent(new Event('change'));
        }
        if (this.waveshapeDriveSlider) this.waveshapeDriveSlider.value = String(this.waveshapeState.drive);
        if (this.waveshapeMixSlider) this.waveshapeMixSlider.value = String(this.waveshapeState.mix);

        if (state.saturation) {
            this.saturationState = { ...state.saturation };
        } else {
            this.saturationState = { ...defaultSaturationState };
        }
        const satModeEl = document.getElementById('saturation-mode') as HTMLSelectElement | null;
        if (satModeEl) {
            satModeEl.value = String(this.saturationState.mode);
            satModeEl.dispatchEvent(new Event('change'));
        }
        if (this.saturationDriveSlider) this.saturationDriveSlider.value = String(this.saturationState.drive);
        if (this.saturationMixSlider) this.saturationMixSlider.value = String(this.saturationState.mix);

        this.filterState = state.filter ? { ...state.filter } : { ...defaultFilterState };
        if (this.filterModeSelect) this.filterModeSelect.value = this.filterState.mode;
        if (this.filterOrderSelect) this.filterOrderSelect.value = String(this.filterState.order);
        if (this.filterCutoffSlider) this.filterCutoffSlider.value = String(this.filterState.cutoff);
        if (this.filterResonanceSlider) this.filterResonanceSlider.value = String(this.filterState.resonance);
        this.updateFilterUIState();

        this.updateAllDisplays();
        this.updateModulationRanges();
        this.updateSyncUI();
    }

    private updateSyncUI(): void {
        const anySynced = this.modulatorStates.some(modulator =>
            modulator.slots.some(slot => slot.type === 'lfo' && slot.lfo?.isSynced)
        );
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
        if (this.amplitudeSourceSelect) {
            this.amplitudeSourceSelect.value = this.modRoutingState.amplitude;
        }
        if (this.filterCutoffSourceSelect) {
            this.filterCutoffSourceSelect.value = this.modRoutingState.filterCutoff;
        }
        if (this.filterResonanceSourceSelect) {
            this.filterResonanceSourceSelect.value = this.modRoutingState.filterResonance;
        }
        this.updateFilterUIState();
        this.updateModMatrixUI();
        this.updateModulationRanges();
    }

    private updateModMatrixUI(): void {
        this.getModMatrixTargets().forEach((target) => {
            const select = this.modMatrixSourceSelects[target.key];
            if (!select) return;
            select.value = this.modRoutingState[target.key];
            const row = select.closest('.mod-matrix-row');
            row?.classList.toggle('is-unassigned', select.value === 'none');
        });
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
                const modIdx = parseInt(source.replace('mod', '')) - 1;
                const modulator = this.modulatorStates[modIdx];
                if (modulator) {
                    const [min, max] = estimateModulatorRange(modulator);
                    inputAny.hasModulation = true;
                    inputAny.modOffset = (min + max) * 0.5;
                    inputAny.modAmplitude = (max - min) * 0.5;
                } else {
                    inputAny.hasModulation = false;
                }
            }
            if (inputAny.updateKnob) inputAny.updateKnob();
        };

        const syncFullRangeMod = (slider: HTMLInputElement, source: string) => {
            if (!slider) return;
            const inputAny = slider as any;
            if (source === 'none') {
                inputAny.hasModulation = false;
            } else {
                const min = typeof inputAny.realMin === 'number' ? inputAny.realMin : parseFloat(slider.min);
                const max = typeof inputAny.realMax === 'number' ? inputAny.realMax : parseFloat(slider.max);
                inputAny.hasModulation = true;
                inputAny.modOffset = (min + max) * 0.5;
                inputAny.modAmplitude = (max - min) * 0.5;
            }
            if (inputAny.updateKnob) inputAny.updateKnob();
        };

        syncMod(this.pathYSlider, this.modRoutingState.pathY);
        syncMod(this.scanPositionSlider, this.modRoutingState.scanPhase);
        syncFullRangeMod(this.filterCutoffSlider, this.modRoutingState.filterCutoff);
        syncFullRangeMod(this.filterResonanceSlider, this.modRoutingState.filterResonance);
    }

    private extractLegacyEnvelopeCompatibility() {
        const envelopeSlot = this.modulatorStates
            .flatMap(modulator => modulator.slots)
            .find(slot => slot.type === 'envelope' && slot.envelope);
        return [envelopeSlot?.envelope || defaultEnvelopeState()];
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

    public setImageUploadCallback(callback: (file: File) => void): void {
        this.onImageUpload = callback;
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

    public setModulatorChangeCallback(callback: (index: number, state: ModulatorState) => void): void {
        this.onModulatorChange = callback;
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
        createSlider(this.dynamicParamContainer, 'dynamic-param', label, min, max, value, step, onChange);
        this.dynamicParamContainer.style.display = 'block';
    }

    public hideDynamicParam(): void {
        if (this.dynamicParamContainer) {
            this.dynamicParamContainer.style.display = 'none';
            this.dynamicParamContainer.innerHTML = '';
        }
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

    public selectSpectralDataOption(name: string): void {
        if (!this.spectralDataSelect) return;
        this.spectralDataSelect.value = name;
        if (this.onSpectralDataChange) this.onSpectralDataChange(name);
    }

    public updatePathY(val: number): void {
        const display = document.getElementById('path-y-value');
        if (display) display.textContent = val.toFixed(3);
    }

    public updateScanPosition(val: number): void {
        const display = document.getElementById('scan-pos-value');
        if (display) display.textContent = val.toFixed(3);
    }

    public updateModulatorPreviewCurves(curves: Float32Array[]): void {
        curves.forEach((curve, index) => {
            const preview = this.modulatorPreviews[index];
            if (preview) preview.setSamples(curve);
        });
    }
}
