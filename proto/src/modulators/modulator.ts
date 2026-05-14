import {
    EnvelopeState,
    LFOState,
    ModulatorOperator,
    ModulatorSlotState,
    ModulatorState,
    PresetControls
} from '../types';
import { EnvelopeModulator } from './envelope';
import { LFO } from './lfo';
import type { LFOWaveform } from './lfo';

function cloneLFOState(state: LFOState): LFOState {
    return { ...state };
}

function cloneEnvelopeState(state: EnvelopeState): EnvelopeState {
    return { ...state };
}

export function cloneModulatorState(state: ModulatorState): ModulatorState {
    return normalizeModulatorState({
        name: state.name,
        slots: state.slots.map((slot) => ({
            type: slot.type,
            value: slot.value,
            lfo: slot.lfo ? cloneLFOState(slot.lfo) : undefined,
            envelope: slot.envelope ? cloneEnvelopeState(slot.envelope) : undefined
        })),
        operators: [...state.operators],
        nameEdited: state.nameEdited
    });
}

export function defaultLFOState(): LFOState {
    return {
        waveform: 'sine',
        frequency: 0.5,
        amplitude: 1,
        offset: 0,
        isSynced: false,
        division: '1/4'
    };
}

export function defaultEnvelopeState(): EnvelopeState {
    return {
        attack: 0.1,
        decay: 0.2,
        sustain: 0.5,
        release: 0.5
    };
}

export function createDefaultModulatorStates(count: number = 4): ModulatorState[] {
    const defaults: ModulatorState[] = [
        {
            name: 'Amp env',
            slots: [
                { type: 'envelope', envelope: defaultEnvelopeState() },
                { type: 'slider', value: 1 }
            ],
            operators: ['*'],
            nameEdited: false
        },
        {
            name: 'Filter env',
            slots: [
                { type: 'envelope', envelope: { attack: 0.08, decay: 0.35, sustain: 0.35, release: 0.45 } }
            ],
            operators: [],
            nameEdited: false
        },
        {
            name: 'Pos Y',
            slots: [
                { type: 'lfo', lfo: { ...defaultLFOState(), waveform: 'sine', frequency: 0.05, amplitude: 1, offset: 0 } }
            ],
            operators: [],
            nameEdited: false
        },
        {
            name: 'Phase',
            slots: [
                { type: 'lfo', lfo: { ...defaultLFOState(), waveform: 'sine', frequency: 0.08, amplitude: 1, offset: 0 } }
            ],
            operators: [],
            nameEdited: false
        }
    ];

    const states: ModulatorState[] = [];
    for (let i = 0; i < count; i++) {
        states.push(normalizeModulatorState(defaults[i] || {
            name: `Mod ${i + 1}`,
            slots: [{ type: 'lfo', lfo: defaultLFOState() }],
            operators: [],
            nameEdited: false
        }));
    }

    return states;
}

function migrateLegacyModulators(controls: Partial<PresetControls>, count: number): ModulatorState[] {
    const states = createDefaultModulatorStates(count);

    if (controls.envelopes?.[0]) {
        states[0].slots[0] = {
            type: 'envelope',
            envelope: cloneEnvelopeState(controls.envelopes[0])
        };
        states[0].slots[1] = {
            type: 'slider',
            value: 1
        };
        states[0].operators[0] = '*';
    }

    if (controls.lfos) {
        controls.lfos.slice(0, Math.max(0, count - 1)).forEach((lfo, index) => {
            states[index + 1].slots[0] = {
                type: 'lfo',
                lfo: cloneLFOState(lfo)
            };
            states[index + 1].slots[1] = { type: 'none' };
        });
    }

    return states;
}

export function resolveModulatorStates(controls: Partial<PresetControls> | undefined, count: number = 4): ModulatorState[] {
    if (controls?.modulators && controls.modulators.length > 0) {
        return controls.modulators.slice(0, count).map(cloneModulatorState);
    }
    return migrateLegacyModulators(controls || {}, count);
}

export function normalizeModulatorState(state: ModulatorState): ModulatorState {
    const slots = state.slots.length > 0 ? state.slots.map((slot) => ({
        type: slot.type,
        value: slot.value,
        lfo: slot.lfo ? cloneLFOState(slot.lfo) : undefined,
        envelope: slot.envelope ? cloneEnvelopeState(slot.envelope) : undefined
    })) : [{ type: 'none' as const }];

    const requiredOperators = Math.max(0, slots.length - 1);
    const operators: ModulatorOperator[] = [];

    for (let i = 0; i < requiredOperators; i++) {
        operators.push(state.operators[i] || '+');
    }

    return {
        name: state.name,
        slots,
        operators,
        nameEdited: state.nameEdited
    };
}

function intervalAdd(a: [number, number], b: [number, number]): [number, number] {
    return [a[0] + b[0], a[1] + b[1]];
}

function intervalSubtract(a: [number, number], b: [number, number]): [number, number] {
    return [a[0] - b[1], a[1] - b[0]];
}

function intervalMultiply(a: [number, number], b: [number, number]): [number, number] {
    const values = [a[0] * b[0], a[0] * b[1], a[1] * b[0], a[1] * b[1]];
    return [Math.min(...values), Math.max(...values)];
}

export function estimateSlotRange(slot: ModulatorSlotState): [number, number] {
    switch (slot.type) {
        case 'lfo': {
            const lfo = slot.lfo || defaultLFOState();
            return [lfo.offset - lfo.amplitude, lfo.offset + lfo.amplitude];
        }
        case 'envelope':
            return [0, 1];
        case 'slider':
            return [slot.value ?? 0, slot.value ?? 0];
        case 'none':
        default:
            return [0, 0];
    }
}

export function estimateModulatorRange(state: ModulatorState): [number, number] {
    const activeSlots = state.slots
        .map((slot, index) => ({ slot, index }))
        .filter(({ slot }) => slot.type !== 'none');

    if (activeSlots.length === 0) return [0, 0];

    let range = estimateSlotRange(activeSlots[0].slot);
    for (let i = 1; i < activeSlots.length; i++) {
        const { slot, index } = activeSlots[i];
        const rhs = estimateSlotRange(slot);
        const operator = state.operators[Math.max(0, index - 1)] || '+';
        if (operator === '-') {
            range = intervalSubtract(range, rhs);
        } else if (operator === '*') {
            range = intervalMultiply(range, rhs);
        } else {
            range = intervalAdd(range, rhs);
        }
    }

    return range;
}

export class Modulator {
    private state: ModulatorState;
    private lfos: Map<number, LFO> = new Map();
    private envelopes: Map<number, EnvelopeModulator> = new Map();

    constructor(state: ModulatorState) {
        this.state = cloneModulatorState(state);
        this.syncRuntimes();
    }

    public setState(state: ModulatorState): void {
        this.state = cloneModulatorState(state);
        this.syncRuntimes();
    }

    public getState(): ModulatorState {
        return cloneModulatorState(this.state);
    }

    public clone(): Modulator {
        const clone = new Modulator(this.state);
        clone.lfos = new Map();
        this.lfos.forEach((lfo, index) => {
            clone.lfos.set(index, lfo.clone());
        });
        clone.envelopes = new Map();
        this.envelopes.forEach((envelope, index) => {
            clone.envelopes.set(index, envelope.clone());
        });
        return clone;
    }

    public setBPM(bpm: number): void {
        this.lfos.forEach((lfo) => lfo.setBPM(bpm));
    }

    public noteOn(): void {
        this.envelopes.forEach((envelope) => envelope.noteOn());
    }

    public noteOff(): void {
        this.envelopes.forEach((envelope) => envelope.noteOff());
    }

    public update(deltaTime: number): number {
        const activeSlots = this.state.slots
            .map((slot, index) => ({ slot, index }))
            .filter(({ slot }) => slot.type !== 'none');

        if (activeSlots.length === 0) return 0;

        let value = this.getSlotValue(activeSlots[0].slot, activeSlots[0].index, deltaTime);
        for (let i = 1; i < activeSlots.length; i++) {
            const { slot, index } = activeSlots[i];
            const rhs = this.getSlotValue(slot, index, deltaTime);
            const operator = this.state.operators[Math.max(0, index - 1)] || '+';
            value = applyOperator(value, rhs, operator);
        }
        return value;
    }

    public getOutputRange(): [number, number] {
        return estimateModulatorRange(this.state);
    }

    public getMaxReleaseTime(): number {
        return this.state.slots.reduce((max, slot) => {
            if (slot.type !== 'envelope' || !slot.envelope) return max;
            return Math.max(max, slot.envelope.release);
        }, 0);
    }

    public samplePreview(duration: number, sampleCount: number): Float32Array {
        const preview = this.clone();
        const count = Math.max(2, Math.floor(sampleCount));
        const samples = new Float32Array(count);
        const step = Math.max(0, duration) / Math.max(count - 1, 1);

        samples[0] = preview.update(0);
        for (let i = 1; i < count; i++) {
            samples[i] = preview.update(step);
        }

        return samples;
    }

    private syncRuntimes(): void {
        this.state.slots.forEach((slot, index) => {
            if (slot.type === 'lfo') {
                const runtime = this.lfos.get(index) || new LFO();
                const source = slot.lfo || defaultLFOState();
                runtime.setWaveform(source.waveform as LFOWaveform);
                runtime.setFrequency(source.frequency);
                runtime.setAmplitude(source.amplitude);
                runtime.setOffset(source.offset);
                runtime.setSync(source.isSynced);
                runtime.setDivision(source.division);
                this.lfos.set(index, runtime);
            } else {
                this.lfos.delete(index);
            }

            if (slot.type === 'envelope') {
                const runtime = this.envelopes.get(index) || new EnvelopeModulator(slot.envelope || defaultEnvelopeState());
                runtime.setState(slot.envelope || defaultEnvelopeState());
                this.envelopes.set(index, runtime);
            } else {
                this.envelopes.delete(index);
            }
        });
    }

    private getSlotValue(slot: ModulatorSlotState, index: number, deltaTime: number): number {
        if (slot.type === 'lfo') {
            const runtime = this.lfos.get(index);
            return runtime ? runtime.update(deltaTime) : 0;
        }
        if (slot.type === 'envelope') {
            const runtime = this.envelopes.get(index);
            return runtime ? runtime.update(deltaTime) : 0;
        }
        if (slot.type === 'slider') {
            return slot.value ?? 0;
        }
        return 0;
    }
}

function applyOperator(lhs: number, rhs: number, operator: ModulatorOperator): number {
    switch (operator) {
        case '-':
            return lhs - rhs;
        case '*':
            return lhs * rhs;
        case '+':
        default:
            return lhs + rhs;
    }
}
