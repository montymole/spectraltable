export const WAVEFORM_ICONS: Record<string, string> = {
    sine: '<svg viewBox="0 0 24 20"><path d="M 2 10 Q 7 0 12 10 T 22 10" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    saw: '<svg viewBox="0 0 24 20"><path d="M 2 18 L 18 2 L 18 18" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    square: '<svg viewBox="0 0 24 20"><path d="M 2 18 L 2 2 L 12 2 L 12 18 L 22 18 L 22 2" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    triangle: '<svg viewBox="0 0 24 20"><path d="M 2 18 L 12 2 L 22 18" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    none: '<svg viewBox="0 0 24 20"></svg>'
};

/**
 * Creates a section card with a title.
 * Returns the card element which acts as the container for controls.
 */
export function createSection(parent: HTMLElement, title: string): HTMLElement {
    const card = document.createElement('div');
    card.className = 'control-card';

    const header = document.createElement('div');
    header.className = 'control-section-title';
    header.textContent = title;

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
    onInput?: (val: number) => void
): HTMLInputElement {
    const group = document.createElement('div');
    group.className = 'control-group';

    const labelEl = document.createElement('label');
    labelEl.htmlFor = id;
    labelEl.textContent = label;

    const valueDisplay = document.createElement('span');
    valueDisplay.className = 'value-display';
    valueDisplay.id = `${id}-value`;
    valueDisplay.textContent = step >= 1 ? String(Math.round(value)) : value.toFixed(2);

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
        if (onInput) onInput(val);
    });

    const labelRow = document.createElement('div');
    labelRow.className = 'label-row';
    labelRow.appendChild(labelEl);
    labelRow.appendChild(valueDisplay);

    group.appendChild(labelRow);
    group.appendChild(slider);
    parent.appendChild(group);

    return slider;
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
    onSourceChange: (source: string) => void
): { slider: HTMLInputElement, select: HTMLSelectElement } {
    const group = document.createElement('div');
    group.className = 'control-group';

    const labelEl = document.createElement('label');
    labelEl.htmlFor = id;
    labelEl.textContent = label;

    const sourceSelect = document.createElement('select');
    sourceSelect.className = 'source-select';
    sourceSelect.style.marginLeft = 'auto';
    sourceSelect.style.fontSize = '0.7rem';
    sourceSelect.style.padding = '2px';

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
    valueDisplay.textContent = step >= 1 ? String(Math.round(value)) : value.toFixed(2);

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
        onSliderInput(val);
    });

    sourceSelect.addEventListener('change', () => {
        onSourceChange(sourceSelect.value);
        slider.disabled = sourceSelect.value !== 'none';
        group.style.opacity = sourceSelect.value !== 'none' ? '0.8' : '1.0';
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
