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
    mode: 'slider' | 'knob' = CONTROL_STYLE
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
        valueDisplay.textContent = step >= 1 ? String(Math.round(val)) : val.toFixed(2);
    };
    updateDisplay(value);
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
        updateDisplay(val);
        if (onInput) onInput(val);
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
        const val = parseFloat(input.value);
        const min = parseFloat(input.min);
        const max = parseFloat(input.max);
        const percent = (val - min) / (max - min);

        // Update value arc
        const endAngle = 225 + percent * 270;
        valueArc.setAttribute('d', describeArc(24, 24, 18, 225, endAngle));

        // Update modulation range arc
        const inputAny = input as any;
        if (inputAny.hasModulation) {
            const offset = typeof inputAny.modOffset === 'number' ? inputAny.modOffset : 0;
            const amp = typeof inputAny.modAmplitude === 'number' ? inputAny.modAmplitude : 0;

            // start = offset - 0.5 * amp, end = offset + 0.5 * amp
            const startVal = offset - amp;
            const endVal = offset + amp;

            const startP = (startVal - min) / (max - min);
            const endP = (endVal - min) / (max - min);

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
            const range = parseFloat(input.max) - parseFloat(input.min);
            const sensitivity = range / 200; // 200px for full range
            let newVal = startVal + deltaY * sensitivity;

            const step = parseFloat(input.step) || 0.01;
            newVal = Math.round(newVal / step) * step;
            newVal = Math.max(parseFloat(input.min), Math.min(parseFloat(input.max), newVal));

            input.value = String(newVal);
            input.dispatchEvent(new Event('input'));
            updateKnob();
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
    mode: 'slider' | 'knob' = CONTROL_STYLE
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
        valueDisplay.textContent = step >= 1 ? String(Math.round(val)) : val.toFixed(2);
    };
    updateDisplay(value);
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
