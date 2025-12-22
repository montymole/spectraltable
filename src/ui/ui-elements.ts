export const WAVEFORM_ICONS: Record<string, string> = {
    sine: '<svg viewBox="0 0 24 20"><path d="M 2 10 Q 7 0 12 10 T 22 10" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    saw: '<svg viewBox="0 0 24 20"><path d="M 2 18 L 18 2 L 18 18" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    square: '<svg viewBox="0 0 24 20"><path d="M 2 18 L 2 2 L 12 2 L 12 18 L 22 18 L 22 2" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    triangle: '<svg viewBox="0 0 24 20"><path d="M 2 18 L 12 2 L 22 18" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    none: '<svg viewBox="0 0 24 20"></svg>'
};

export const SECTION_ICONS: Record<string, string> = {
    'Wave/Spectral Volume': `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M 32 10 L 58 24 L 58 52 L 32 64 L 6 52 L 6 24 Z" />
        <path d="M 32 10 L 32 38 L 58 24" />
        <path d="M 32 38 L 6 24" />
        <path d="M 32 38 L 32 64" />
    </svg>`,
    'Audio Synthesis': `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M 5 32 Q 15 10 25 32 T 45 32" />
        <path d="M 45 32 L 45 15 L 60 32 L 45 49 L 45 32" />
        <circle cx="15" cy="32" r="2" fill="currentColor" />
    </svg>`,
    'Reading Path': `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M 10 50 L 50 50 M 10 50 L 10 10 M 10 50 L 40 30" stroke-opacity="0.3" />
        <path d="M 8 40 C 20 40, 30 10, 55 15" stroke-width="2" />
        <circle cx="55" cy="15" r="3" fill="currentColor" />
    </svg>`,
    'LFOs': `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="32" cy="32" r="28" stroke-dasharray="4 4" stroke-opacity="0.3" />
        <path d="M 12 32 C 12 10, 32 10, 32 32 C 32 54, 52 54, 52 32" />
        <path d="M 50 32 L 54 32" />
    </svg>`,
    'Visualization': `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="8" y="40" width="8" height="16" />
        <rect x="20" y="25" width="8" height="31" />
        <rect x="32" y="35" width="8" height="21" />
        <rect x="44" y="15" width="8" height="41" />
        <path d="M 5 56 L 59 56" />
    </svg>`
};

/**
 * Toggle between 'slider' and 'knob' UI modes.
 */
export const CONTROL_STYLE: 'slider' | 'knob' = 'knob';

/**
 * Creates a section card with a title.
 * Returns the card element which acts as the container for controls.
 */
export function createSection(parent: HTMLElement, title: string, mode: 'slider' | 'knob' = CONTROL_STYLE): HTMLElement {
    const card = document.createElement('div');
    card.className = 'control-card';
    if (mode === 'knob') card.classList.add('knob-layout');
    const header = document.createElement('div');
    header.className = 'control-section-title';
    header.textContent = title;

    // Add background icon
    if (SECTION_ICONS[title]) {
        const iconContainer = document.createElement('div');
        iconContainer.className = 'section-icon';
        iconContainer.innerHTML = SECTION_ICONS[title];
        card.appendChild(iconContainer);
    }

    card.appendChild(header);
    parent.appendChild(card);
    return card;
}

/**
 * Standard slider factory.
 */
export function createSlider(
    parent: HTMLElement,
    id: string,
    label: string,
    min: number,
    max: number,
    value: number,
    step: number,
    onInput?: (val: number) => void,
    mode: 'slider' | 'knob' = CONTROL_STYLE,
    scale: 'linear' | 'logarithmic' = 'linear',
    precision: number = 2
): HTMLInputElement {
    const group = document.createElement('div');
    group.className = 'control-group';
    if (mode === 'knob') group.classList.add('knob-centered');
    const labelEl = document.createElement('label');
    labelEl.htmlFor = id;
    labelEl.textContent = label;
    const valueDisplay = document.createElement('span');
    valueDisplay.className = 'value-display';
    valueDisplay.id = `${id}-value`;
    const updateDisplay = (val: number) => {
        valueDisplay.textContent = val.toFixed(precision);
    };
    updateDisplay(value);
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.id = id;

    const isLog = scale === 'logarithmic' && min > 0 && max > 0;
    (slider as any).isLogarithmic = isLog;
    (slider as any).precision = precision;

    if (isLog) {
        slider.min = String(Math.log10(min));
        slider.max = String(Math.log10(max));
        slider.step = 'any';
        slider.value = String(Math.log10(value));
    } else {
        slider.min = String(min);
        slider.max = String(max);
        slider.step = String(step);
        slider.value = String(value);
    }

    slider.className = 'slider';

    const getActualValue = () => {
        const v = parseFloat(slider.value);
        return isLog ? Math.pow(10, v) : v;
    };

    slider.addEventListener('input', () => {
        const val = getActualValue();
        updateDisplay(val);
        if (onInput) onInput(val);
    });

    // Wrap value property to handle actual values transparently
    const originalValueDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    Object.defineProperty(slider, 'value', {
        get: function () {
            const v = originalValueDescriptor!.get!.call(this);
            return isLog ? String(Math.pow(10, parseFloat(v))) : v;
        },
        set: function (v) {
            const num = parseFloat(v);
            const valToSet = isLog ? String(Math.log10(num)) : String(num);
            originalValueDescriptor!.set!.call(this, valToSet);
            updateDisplay(num);
            if ((this as any).updateKnob) (this as any).updateKnob();
        },
        configurable: true
    });

    if (mode === 'knob') {
        slider.style.display = 'none';
        group.appendChild(labelEl);
        group.appendChild(createKnobElement(slider));
        group.appendChild(valueDisplay);
    } else {
        const labelRow = document.createElement('div');
        labelRow.className = 'label-row';
        labelRow.appendChild(labelEl);
        labelRow.appendChild(valueDisplay);
        group.appendChild(labelRow);
        group.appendChild(slider);
    }
    parent.appendChild(group);
    return slider;
}

/**
 * Creates a visual knob that controls a hidden input.
 */
function createKnobElement(input: HTMLInputElement): HTMLElement {
    const container = document.createElement('div');
    container.className = 'knob-container';
    if (input.disabled) container.classList.add('disabled');

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 48 48');
    svg.setAttribute('class', 'knob-svg');

    // Track arc
    const track = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    track.setAttribute('class', 'knob-track');
    track.setAttribute('d', describeArc(24, 24, 18, 225, 495));
    svg.appendChild(track);

    // Value arc
    const valueArc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    valueArc.setAttribute('class', 'knob-value');
    svg.appendChild(valueArc);

    // Modulation range arc
    const modArc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    modArc.setAttribute('class', 'knob-mod-range');
    svg.appendChild(modArc);

    // Center circle
    const center = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    center.setAttribute('class', 'knob-center');
    center.setAttribute('cx', '24');
    center.setAttribute('cy', '24');
    center.setAttribute('r', '14');
    svg.appendChild(center);

    // Pointer
    const pointer = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    pointer.setAttribute('class', 'knob-pointer');
    pointer.setAttribute('r', '2');
    svg.appendChild(pointer);

    container.appendChild(svg);

    const updateKnob = () => {
        // Now that we wrapped slider.value, it returns the ACTUAL value.
        // But for internal knob calculations, we might want the normalized percent.
        // We can get the raw internal value by reading from the prototype if needed,
        // or just calculate from the actual value.

        const val = parseFloat(input.value);
        const min = (input as any).isLogarithmic ? Math.pow(10, parseFloat(input.min)) : parseFloat(input.min);
        const max = (input as any).isLogarithmic ? Math.pow(10, parseFloat(input.max)) : parseFloat(input.max);
        const isLog = (input as any).isLogarithmic;

        let percent: number;
        if (isLog && min > 0 && max > 0) {
            percent = (Math.log10(val) - Math.log10(min)) / (Math.log10(max) - Math.log10(min));
        } else {
            percent = (val - min) / (max - min);
        }
        percent = Math.max(0, Math.min(1, percent));

        // Update value arc
        const endAngle = 225 + percent * 270;
        valueArc.setAttribute('d', describeArc(24, 24, 18, 225, endAngle));

        // Update modulation range arc
        const inputAny = input as any;
        if (inputAny.hasModulation) {
            const offset = typeof inputAny.modOffset === 'number' ? inputAny.modOffset : 0;
            const amp = typeof inputAny.modAmplitude === 'number' ? inputAny.modAmplitude : 0;

            const startVal = offset - amp;
            const endVal = offset + amp;

            let startP: number, endP: number;
            if (isLog && min > 0 && max > 0) {
                const logMin = Math.log10(min);
                const logRange = Math.log10(max) - logMin;
                startP = (Math.log10(Math.max(min, startVal)) - logMin) / logRange;
                endP = (Math.log10(Math.max(min, endVal)) - logMin) / logRange;
            } else {
                startP = (startVal - min) / (max - min);
                endP = (endVal - min) / (max - min);
            }

            const sAngle = 225 + Math.max(0, Math.min(1, startP)) * 270;
            const eAngle = 225 + Math.max(0, Math.min(1, endP)) * 270;

            if (Math.abs(eAngle - sAngle) > 0.1) {
                modArc.setAttribute('d', describeArc(24, 24, 21.5, sAngle, eAngle));
                modArc.style.display = 'block';
            } else {
                modArc.style.display = 'none';
            }
        } else {
            modArc.style.display = 'none';
        }

        // Update pointer
        const rad = (endAngle - 90) * (Math.PI / 180);
        const px = 24 + 10 * Math.cos(rad);
        const py = 24 + 10 * Math.sin(rad);
        pointer.setAttribute('cx', String(px));
        pointer.setAttribute('cy', String(py));

        if (input.disabled) container.classList.add('disabled');
        else container.classList.remove('disabled');
    };

    // Interaction
    let isDragging = false;
    let startY = 0;
    let startVal = 0;

    container.addEventListener('mousedown', (e) => {
        if (input.disabled) return;
        isDragging = true;
        startY = e.clientY;
        startVal = parseFloat(input.value);
        document.body.style.cursor = 'ns-resize';

        const onMouseMove = (moveEvent: MouseEvent) => {
            if (!isDragging) return;
            const deltaY = startY - moveEvent.clientY;

            // Interaction is always normalized 0-1
            const deltaP = deltaY / 200;

            const min = (input as any).isLogarithmic ? Math.pow(10, parseFloat(input.min)) : parseFloat(input.min);
            const max = (input as any).isLogarithmic ? Math.pow(10, parseFloat(input.max)) : parseFloat(input.max);
            const isLog = (input as any).isLogarithmic;
            const step = parseFloat(input.step) || 0.001;

            let newVal: number;
            if (isLog) {
                const logMin = Math.log10(min);
                const logMax = Math.log10(max);
                const logRange = logMax - logMin;
                const startP = (Math.log10(startVal) - logMin) / logRange;
                const newP = Math.max(0, Math.min(1, startP + deltaP));
                newVal = Math.pow(10, logMin + newP * logRange);
            } else {
                const range = max - min;
                newVal = startVal + deltaY * (range / 200);
            }

            // Snap to step (only if not 'any')
            if (input.step !== 'any') {
                newVal = Math.round(newVal / step) * step;
            }
            newVal = Math.max(min, Math.min(max, newVal));

            input.value = String(newVal); // This calls our wrapped setter
            input.dispatchEvent(new Event('input'));
        };

        const onMouseUp = () => {
            isDragging = false;
            document.body.style.cursor = '';
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    });

    // Observer to update knob when input value changes programmatically
    const observer = new MutationObserver(() => updateKnob());
    observer.observe(input, { attributes: true, attributeFilter: ['value', 'disabled'] });

    // Also poll/check for value changes if MutationObserver doesn't catch .value assignment
    // (In many cases, setting .value doesn't trigger MutationObserver)
    const originalValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (originalValueSetter) {
        Object.defineProperty(input, 'value', {
            set: function (v) {
                originalValueSetter.call(this, v);
                updateKnob();
            },
            get: Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.get,
            configurable: true
        });
    }

    (input as any).updateKnob = updateKnob;
    updateKnob();
    return container;
}

function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
    const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
    return {
        x: centerX + (radius * Math.cos(angleInRadians)),
        y: centerY + (radius * Math.sin(angleInRadians))
    };
}

function describeArc(x: number, y: number, radius: number, startAngle: number, endAngle: number) {
    const start = polarToCartesian(x, y, radius, endAngle);
    const end = polarToCartesian(x, y, radius, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
    const d = [
        "M", start.x, start.y,
        "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y
    ].join(" ");
    return d;
}

/**
 * Standard select factory.
 */
export function createSelect(
    parent: HTMLElement,
    id: string,
    label: string,
    options: string[] | { value: string, label: string }[],
    onChange?: (val: string) => void
): HTMLSelectElement {
    const group = document.createElement('div');
    group.className = 'control-group';

    const labelEl = document.createElement('label');
    labelEl.htmlFor = id;
    labelEl.textContent = label;

    const select = document.createElement('select');
    select.id = id;

    options.forEach(opt => {
        const optEl = document.createElement('option');
        if (typeof opt === 'string') {
            optEl.value = opt;
            optEl.textContent = opt;
        } else {
            optEl.value = opt.value;
            optEl.textContent = opt.label;
        }
        select.appendChild(optEl);
    });

    if (onChange) {
        select.addEventListener('change', () => onChange(select.value));
    }

    const labelRow = document.createElement('div');
    labelRow.className = 'label-row';
    labelRow.appendChild(labelEl);

    group.appendChild(labelRow);
    group.appendChild(select);
    parent.appendChild(group);

    return select;
}

/**
 * Button factory.
 */
export function createButton(
    parent: HTMLElement,
    id: string,
    text: string,
    onClick: () => void,
    className: string = 'reset-button'
): HTMLButtonElement {
    const group = document.createElement('div');
    group.className = 'control-group';

    const button = document.createElement('button');
    button.id = id;
    button.textContent = text;
    button.className = className;

    button.addEventListener('click', onClick);

    group.appendChild(button);
    parent.appendChild(group);
    return button;
}

/**
 * Creates a slider with a modulation source selector (LFOs).
 */
export function createModulatableSlider(
    parent: HTMLElement,
    id: string,
    label: string,
    min: number,
    max: number,
    value: number,
    step: number,
    lfoLabels: { value: string, label: string }[],
    onSliderInput: (val: number) => void,
    onSourceChange: (source: string) => void,
    mode: 'slider' | 'knob' = CONTROL_STYLE,
    scale: 'linear' | 'logarithmic' = 'linear',
    precision: number = 2
): { slider: HTMLInputElement, select: HTMLSelectElement } {
    const group = document.createElement('div');
    group.className = 'control-group';
    if (mode === 'knob') group.classList.add('knob-centered');
    const labelEl = document.createElement('label');
    labelEl.htmlFor = id;
    labelEl.textContent = label;
    const sourceSelect = document.createElement('select');
    sourceSelect.style.marginLeft = mode === 'knob' ? '0' : 'auto';
    lfoLabels.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value
        option.textContent = opt.label
        if (opt.value === 'none') option.selected = true;
        sourceSelect.appendChild(option);
    });
    const valueDisplay = document.createElement('span');
    valueDisplay.className = 'value-display';
    valueDisplay.id = `${id}-value`;
    const updateDisplay = (val: number) => {
        valueDisplay.textContent = val.toFixed(precision);
    };
    updateDisplay(value);
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.id = id;

    const isLog = scale === 'logarithmic' && min > 0 && max > 0;
    (slider as any).isLogarithmic = isLog;
    (slider as any).precision = precision;

    if (isLog) {
        slider.min = String(Math.log10(min));
        slider.max = String(Math.log10(max));
        slider.step = 'any';
        slider.value = String(Math.log10(value));
    } else {
        slider.min = String(min);
        slider.max = String(max);
        slider.step = String(step);
        slider.value = String(value);
    }

    slider.className = 'slider';

    const getActualValue = () => {
        const v = parseFloat(slider.value);
        return isLog ? Math.pow(10, v) : v;
    };

    // Wrap value property to handle actual values transparently
    const originalValueDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    Object.defineProperty(slider, 'value', {
        get: function () {
            const v = originalValueDescriptor!.get!.call(this);
            const num = parseFloat(v);
            return isLog ? String(Math.pow(10, num)) : v;
        },
        set: function (v) {
            const num = parseFloat(v);
            const valToSet = isLog ? String(Math.log10(num)) : String(num);
            originalValueDescriptor!.set!.call(this, valToSet);
            updateDisplay(num);
            if ((this as any).updateKnob) (this as any).updateKnob();
        },
        configurable: true
    });

    slider.addEventListener('input', () => {
        const val = getActualValue();
        updateDisplay(val);
        onSliderInput(val);
    });
    sourceSelect.addEventListener('change', () => {
        onSourceChange(sourceSelect.value);
        slider.disabled = sourceSelect.value !== 'none';
        group.style.opacity = sourceSelect.value !== 'none' ? '0.8' : '1.0';
    });
    if (mode === 'knob') {
        slider.style.display = 'none';
        group.appendChild(labelEl);
        group.appendChild(sourceSelect);
        group.appendChild(createKnobElement(slider));
        group.appendChild(valueDisplay);
    } else {
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
    }
    parent.appendChild(group);
    return { slider, select: sourceSelect };
}

/**
 * File input factory.
 */
export function createFileInput(
    parent: HTMLElement,
    id: string,
    label: string,
    accept: string,
    multiple: boolean = false,
    onChange?: (files: FileList | null) => void
): HTMLInputElement {
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

    if (onChange) {
        input.addEventListener('change', () => onChange(input.files));
    }

    const labelRow = document.createElement('div');
    labelRow.className = 'label-row';
    labelRow.appendChild(labelEl);

    group.appendChild(labelRow);
    group.appendChild(input);
    parent.appendChild(group);

    return input;
}

/**
 * Number input factory for simple numeric fields.
 */
export function createNumberInput(
    parent: HTMLElement,
    id: string,
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onChange?: (val: number) => void
): HTMLInputElement {
    const group = document.createElement('div');
    group.className = 'control-group-row';
    group.style.display = 'flex';
    group.style.alignItems = 'center';
    group.style.gap = '8px';
    group.style.marginBottom = '8px';

    const labelEl = document.createElement('label');
    labelEl.htmlFor = id;
    labelEl.textContent = label;
    labelEl.style.fontSize = '12px';
    labelEl.style.whiteSpace = 'nowrap';
    labelEl.style.marginBottom = '0';

    const input = document.createElement('input');
    input.type = 'number';
    input.id = id;
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.style.width = '60px';
    input.style.background = 'var(--bg-input)';
    input.style.border = '1px solid var(--border-subtle)';
    input.style.color = 'var(--text-main)';
    input.style.padding = '2px 4px';
    input.style.borderRadius = '4px';

    if (onChange) {
        input.addEventListener('change', () => onChange(parseFloat(input.value)));
    }

    group.appendChild(labelEl);
    group.appendChild(input);
    parent.appendChild(group);

    return input;
}

/**
 * Converts a MIDI note number to a human-readable name (e.g., 60 -> "C4").
 */
export function noteToName(note: number): string {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(note / 12) - 1;
    const name = names[note % 12];
    return `${name}${octave}`;
}

export interface ProgressUI {
    container: HTMLElement;
    fill: HTMLElement;
    text: HTMLElement;
    show: () => void;
    hide: () => void;
    update: (percent: number) => void;
}

/**
 * Creates a progress indicator with a spinner and bar.
 */
export function createProgressUI(parent: HTMLElement): ProgressUI {
    const container = document.createElement('div');
    container.className = 'progress-container';

    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    container.appendChild(spinner);

    const bar = document.createElement('div');
    bar.className = 'progress-bar';
    const fill = document.createElement('div');
    fill.className = 'progress-fill';
    bar.appendChild(fill);
    container.appendChild(bar);

    const text = document.createElement('div');
    text.className = 'progress-text';
    text.textContent = '0%';
    container.appendChild(text);

    parent.appendChild(container);

    return {
        container,
        fill,
        text,
        show: () => { container.style.display = 'flex'; },
        hide: () => { container.style.display = 'none'; },
        update: (percent: number) => {
            const p = Math.max(0, Math.min(100, percent));
            fill.style.width = `${p}%`;
            text.textContent = `${Math.round(p)}%`;
        }
    };
}
