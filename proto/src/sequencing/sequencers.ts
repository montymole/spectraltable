import {
    defaultSequencerState,
    Sequencer303Step,
    SequencerEngineMode,
    SequencerSlideMode,
    SequencerState
} from '../types';

type NoteSender = (note: number, velocity: number, isNoteOn: boolean) => void;
type StepListener = (mode: SequencerEngineMode, stepIndex: number) => void;

const DIVISION_TO_BEATS: Record<string, number> = {
    '1/4': 1,
    '1/8': 0.5,
    '1/16': 0.25,
    '1/32': 0.125
};

function cloneState(state: SequencerState): SequencerState {
    return {
        ...state,
        steps: state.steps.map((step) => ({ ...step })),
        arpeggiator: { ...state.arpeggiator }
    };
}

function stepDurationSeconds(bpm: number, division: string): number {
    return (60 / Math.max(1, bpm)) * (DIVISION_TO_BEATS[division] ?? 0.25);
}

function clampMidi(note: number): number {
    return Number.isFinite(note) ? Math.max(0, Math.min(127, Math.round(note))) : 60;
}

function clampCount(value: unknown, max: number): number {
    const rounded = Math.round(Number(value));
    return Number.isFinite(rounded) ? Math.max(1, Math.min(Math.max(1, max), rounded)) : Math.max(1, max);
}

function normalizeStep(step: Partial<Sequencer303Step> | Record<string, unknown>): Sequencer303Step {
    const raw = step as Record<string, unknown>;
    const legacyLength = raw.length;
    const legacyVelocity = raw.velocity;
    let slide: SequencerSlideMode = 'off';
    if (raw.slide === 'up' || raw.slide === 'down') slide = raw.slide;
    else if (raw.slide === true) slide = 'up';

    return {
        note: clampMidi(Number(raw.note ?? 60)),
        accent: Boolean(raw.accent),
        slide,
        tie: Boolean(raw.tie),
        rest: Boolean(raw.rest),
        length: Math.max(0.1, Math.min(1, legacyLength === '1/8' ? 1 : Number(legacyLength ?? 0.8))),
        velocity: Math.max(0, Math.min(1, Number(legacyVelocity ?? 0.8) > 1 ? Number(legacyVelocity) / 127 : Number(legacyVelocity ?? 0.8)))
    };
}

export class Arpeggiator {
    private state = cloneState(defaultSequencerState).arpeggiator;
    private heldNotes = new Map<number, number>();
    private latchedNotes = new Map<number, number>();
    private stepIndex = -1;
    private direction: 1 | -1 = 1;

    public setState(state: SequencerState['arpeggiator']): void {
        this.state = { ...state };
    }

    public handleInput(note: number, velocity: number, isNoteOn: boolean): void {
        if (isNoteOn) {
            this.heldNotes.set(note, velocity);
            if (this.state.hold) this.latchedNotes.set(note, velocity);
        } else {
            this.heldNotes.delete(note);
            if (!this.state.hold) this.latchedNotes.delete(note);
        }
    }

    public clear(): void {
        this.heldNotes.clear();
        this.latchedNotes.clear();
        this.stepIndex = -1;
        this.direction = 1;
    }

    public nextNote(): { note: number, velocity: number, stepIndex: number } | null {
        const source = this.state.hold ? this.latchedNotes : this.heldNotes;
        if (source.size === 0) return null;

        const ordered = Array.from(source.entries())
            .sort(([a], [b]) => a - b)
            .flatMap(([note, velocity]) => {
                const notes: Array<[number, number]> = [];
                for (let octave = 0; octave < Math.max(1, this.state.octaveRange); octave++) {
                    notes.push([clampMidi(note + octave * 12), velocity]);
                }
                return notes;
            });

        if (ordered.length === 0) return null;

        if (this.state.mode === 'random') {
            this.stepIndex = Math.floor(Math.random() * ordered.length);
        } else if (this.state.mode === 'down') {
            this.stepIndex = this.stepIndex <= 0 ? ordered.length - 1 : this.stepIndex - 1;
        } else if (this.state.mode === 'updown') {
            if (ordered.length === 1) {
                this.stepIndex = 0;
            } else {
                this.stepIndex += this.direction;
                if (this.stepIndex >= ordered.length) {
                    this.direction = -1;
                    this.stepIndex = ordered.length - 2;
                } else if (this.stepIndex < 0) {
                    this.direction = 1;
                    this.stepIndex = 1;
                }
            }
        } else {
            this.stepIndex = (this.stepIndex + 1) % ordered.length;
        }

        const [note, inputVelocity] = ordered[this.stepIndex];
        return {
            note,
            velocity: Math.max(1, Math.min(127, Math.round(inputVelocity * (this.state.velocity / 127)))),
            stepIndex: this.stepIndex
        };
    }

    public getRateSeconds(bpm: number): number {
        return stepDurationSeconds(bpm, this.state.rate);
    }

    public getGate(): number {
        return this.state.gate;
    }
}

export class Sequencer303 {
    private steps: Sequencer303Step[] = cloneState(defaultSequencerState).steps;
    private activeStepCount = defaultSequencerState.activeStepCount;
    private index = -1;

    public setSteps(steps: Sequencer303Step[]): void {
        this.steps = steps.map((step) => normalizeStep(step));
        if (this.index >= this.getActiveLength()) this.index = -1;
    }

    public setActiveStepCount(count: number): void {
        this.activeStepCount = clampCount(count, this.steps.length);
        if (this.index >= this.getActiveLength()) this.index = -1;
    }

    public reset(): void {
        this.index = -1;
    }

    public nextStep(): { step: Sequencer303Step, stepIndex: number } | null {
        const activeLength = this.getActiveLength();
        if (activeLength === 0) return null;
        this.index = (this.index + 1) % activeLength;
        return { step: this.steps[this.index], stepIndex: this.index };
    }

    private getActiveLength(): number {
        return this.steps.length === 0 ? 0 : clampCount(this.activeStepCount, this.steps.length);
    }
}

export class SequencerClock {
    private state = cloneState(defaultSequencerState);
    private arpeggiator = new Arpeggiator();
    private sequencer = new Sequencer303();
    private sendNote: NoteSender;
    private onStep?: StepListener;
    private accumulator = 0;
    private stepCounter = 0;
    private currentNote: number | null = null;
    private currentNoteElapsed = 0;
    private currentNoteDuration = 0;

    constructor(sendNote: NoteSender) {
        this.sendNote = sendNote;
        this.arpeggiator.setState(this.state.arpeggiator);
        this.sequencer.setSteps(this.state.steps);
    }

    public setStepListener(listener: StepListener): void {
        this.onStep = listener;
    }

    public getState(): SequencerState {
        return cloneState(this.state);
    }

    public setState(next: Partial<SequencerState>): void {
        const wasPlaying = this.state.isPlaying;
        const previousMode = this.state.mode;
        this.state = cloneState({
            ...this.state,
            ...next,
            steps: next.steps ? next.steps.map((step) => normalizeStep(step)) : this.state.steps,
            arpeggiator: next.arpeggiator ? { ...this.state.arpeggiator, ...next.arpeggiator } : this.state.arpeggiator
        });
        this.arpeggiator.setState(this.state.arpeggiator);
        this.sequencer.setSteps(this.state.steps);
        this.sequencer.setActiveStepCount(this.state.activeStepCount);
        if (previousMode !== this.state.mode) {
            this.stopActiveNote();
            this.accumulator = this.state.isPlaying ? this.getCurrentInterval() : 0;
            this.stepCounter = 0;
        }
        if (!this.state.isPlaying) this.stopActiveNote();
        if (!wasPlaying && this.state.isPlaying) this.accumulator = this.getCurrentInterval();
    }

    public setBpm(bpm: number): void {
        this.state.bpm = bpm;
    }

    public setMode(mode: SequencerEngineMode): void {
        if (this.state.mode === mode) return;
        this.stopActiveNote();
        this.accumulator = 0;
        this.stepCounter = 0;
        this.state.mode = mode;
    }

    public play(): void {
        this.state.isPlaying = true;
        this.accumulator = this.getCurrentInterval();
    }

    public stop(): void {
        this.state.isPlaying = false;
        this.accumulator = 0;
        this.currentNoteElapsed = 0;
        this.stopActiveNote();
    }

    public toggle(): void {
        if (this.state.isPlaying) this.stop();
        else this.play();
    }

    public reset(): void {
        this.stopActiveNote();
        this.accumulator = 0;
        this.stepCounter = 0;
        this.currentNoteElapsed = 0;
        this.sequencer.reset();
        this.onStep?.(this.state.mode, -1);
    }

    public handleUserNote(note: number, velocity: number, isNoteOn: boolean): boolean {
        if (this.state.mode !== 'arpeggiator') return false;
        this.arpeggiator.handleInput(note, velocity, isNoteOn);
        return this.state.isPlaying;
    }

    public update(deltaTime: number): void {
        if (!this.state.isPlaying) return;

        if (this.currentNote !== null) {
            this.currentNoteElapsed += deltaTime;
            if (this.currentNoteElapsed >= this.currentNoteDuration) {
                this.stopActiveNote();
            }
        }

        const interval = this.getCurrentInterval();
        this.accumulator += Math.max(0, Math.min(deltaTime, 0.1));
        while (this.accumulator >= interval) {
            this.accumulator -= interval;
            this.triggerNext(interval);
        }
    }

    private getCurrentInterval(): number {
        if (this.state.mode === 'arpeggiator') return this.arpeggiator.getRateSeconds(this.state.bpm);
        const base = stepDurationSeconds(this.state.bpm, '1/16');
        const swing = Math.max(0.5, Math.min(0.75, this.state.swing));
        return this.stepCounter % 2 === 0 ? base * (swing * 2) : base * ((1 - swing) * 2);
    }

    private triggerNext(interval: number): void {
        if (this.state.mode === 'arpeggiator') {
            const note = this.arpeggiator.nextNote();
            if (!note) return;
            this.startNote(this.applyOutputTranspose(note.note), note.velocity, interval * this.arpeggiator.getGate());
            this.onStep?.('arpeggiator', note.stepIndex);
            this.stepCounter += 1;
            return;
        }

        const next = this.sequencer.nextStep();
        if (!next) return;
        const { step, stepIndex } = next;
        this.onStep?.('sequencer', stepIndex);
        this.stepCounter += 1;
        if (step.rest) {
            this.stopActiveNote();
            return;
        }

        const duration = interval * Math.max(0.1, Math.min(1, step.length)) * this.state.gate;
        const velocity = Math.max(1, Math.min(127, Math.round(127 * step.velocity * (step.accent ? 1.12 : 1))));
        const note = this.applyOutputTranspose(step.note);
        if (!step.tie) this.stopActiveNote();
        this.startNote(note, velocity, duration, !step.tie);
    }

    private startNote(note: number, velocity: number, duration: number, retrigger = true): void {
        const hadActiveNote = this.currentNote !== null;
        const previousNote = this.currentNote;
        if (this.currentNote !== null && this.currentNote !== note) this.stopActiveNote();
        if (this.currentNote === note && retrigger) this.sendNote(note, 0, false);
        this.currentNote = clampMidi(note);
        this.currentNoteElapsed = 0;
        this.currentNoteDuration = Math.max(0.01, duration);
        if (retrigger || !hadActiveNote || previousNote !== this.currentNote) this.sendNote(this.currentNote, velocity, true);
    }

    private stopActiveNote(): void {
        if (this.currentNote === null) return;
        this.sendNote(this.currentNote, 0, false);
        this.currentNote = null;
        this.currentNoteElapsed = 0;
    }

    private applyOutputTranspose(note: number): number {
        return clampMidi(note + this.state.transpose + this.state.octaveOffset * 12);
    }
}
