import {
    defaultSequencerState,
    Sequencer303Step,
    SequencerEngineMode,
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
    return Math.max(0, Math.min(127, Math.round(note)));
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
    private index = -1;

    public setSteps(steps: Sequencer303Step[]): void {
        this.steps = steps.map((step) => ({ ...step }));
        if (this.index >= this.steps.length) this.index = -1;
    }

    public reset(): void {
        this.index = -1;
    }

    public nextStep(): { step: Sequencer303Step, stepIndex: number } | null {
        if (this.steps.length === 0) return null;
        this.index = (this.index + 1) % this.steps.length;
        return { step: this.steps[this.index], stepIndex: this.index };
    }
}

export class SequencerClock {
    private state = cloneState(defaultSequencerState);
    private arpeggiator = new Arpeggiator();
    private sequencer = new Sequencer303();
    private sendNote: NoteSender;
    private onStep?: StepListener;
    private accumulator = 0;
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
        this.state = cloneState({
            ...this.state,
            ...next,
            steps: next.steps ? next.steps.map((step) => ({ ...step })) : this.state.steps,
            arpeggiator: next.arpeggiator ? { ...this.state.arpeggiator, ...next.arpeggiator } : this.state.arpeggiator
        });
        this.arpeggiator.setState(this.state.arpeggiator);
        this.sequencer.setSteps(this.state.steps);
        if (!this.state.isPlaying) this.stopActiveNote();
    }

    public setBpm(bpm: number): void {
        this.state.bpm = bpm;
    }

    public setMode(mode: SequencerEngineMode): void {
        if (this.state.mode === mode) return;
        this.stopActiveNote();
        this.accumulator = 0;
        this.state.mode = mode;
    }

    public play(): void {
        this.state.isPlaying = true;
        this.accumulator = 0;
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
        return stepDurationSeconds(this.state.bpm, '1/16');
    }

    private triggerNext(interval: number): void {
        if (this.state.mode === 'arpeggiator') {
            const note = this.arpeggiator.nextNote();
            if (!note) return;
            this.startNote(note.note, note.velocity, interval * this.arpeggiator.getGate());
            this.onStep?.('arpeggiator', note.stepIndex);
            return;
        }

        const next = this.sequencer.nextStep();
        if (!next) return;
        const { step, stepIndex } = next;
        this.onStep?.('sequencer', stepIndex);
        if (step.rest) {
            this.stopActiveNote();
            return;
        }

        const duration = stepDurationSeconds(this.state.bpm, step.length) * this.state.gate;
        const velocity = Math.max(1, Math.min(127, Math.round(step.velocity * (step.accent ? 1.12 : 1))));
        if (!step.tie) this.stopActiveNote();
        this.startNote(step.note, velocity, duration);
    }

    private startNote(note: number, velocity: number, duration: number): void {
        if (this.currentNote !== null && this.currentNote !== note) this.stopActiveNote();
        if (this.currentNote === note) this.sendNote(note, 0, false);
        this.currentNote = clampMidi(note);
        this.currentNoteElapsed = 0;
        this.currentNoteDuration = Math.max(0.01, duration);
        this.sendNote(this.currentNote, velocity, true);
    }

    private stopActiveNote(): void {
        if (this.currentNote === null) return;
        this.sendNote(this.currentNote, 0, false);
        this.currentNote = null;
        this.currentNoteElapsed = 0;
    }
}
