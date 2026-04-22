import { EnvelopeState } from '../types';

type EnvelopeStage = 'idle' | 'attack' | 'decay' | 'sustain' | 'release';

export class EnvelopeModulator {
    private state: EnvelopeState;
    private stage: EnvelopeStage = 'idle';
    private value = 0;

    constructor(state: EnvelopeState) {
        this.state = { ...state };
    }

    public setState(state: EnvelopeState): void {
        this.state = { ...state };
    }

    public getState(): EnvelopeState {
        return { ...this.state };
    }

    public noteOn(): void {
        this.stage = this.state.attack <= 0 ? 'decay' : 'attack';
        if (this.state.attack <= 0) {
            this.value = 1;
        }
    }

    public noteOff(): void {
        if (this.stage === 'idle') return;
        this.stage = this.state.release <= 0 ? 'idle' : 'release';
        if (this.state.release <= 0) {
            this.value = 0;
        }
    }

    public update(deltaTime: number): number {
        const dt = Math.max(0, deltaTime);

        switch (this.stage) {
            case 'idle':
                this.value = 0;
                break;
            case 'attack':
                if (this.state.attack <= 0) {
                    this.value = 1;
                    this.stage = 'decay';
                    break;
                }
                this.value += dt / this.state.attack;
                if (this.value >= 1) {
                    this.value = 1;
                    this.stage = 'decay';
                }
                break;
            case 'decay': {
                if (this.state.decay <= 0) {
                    this.value = this.state.sustain;
                    this.stage = 'sustain';
                    break;
                }
                const decayRange = 1 - this.state.sustain;
                this.value -= (dt / this.state.decay) * decayRange;
                if (this.value <= this.state.sustain) {
                    this.value = this.state.sustain;
                    this.stage = 'sustain';
                }
                break;
            }
            case 'sustain':
                this.value = this.state.sustain;
                break;
            case 'release':
                if (this.state.release <= 0) {
                    this.value = 0;
                    this.stage = 'idle';
                    break;
                }
                this.value -= dt / this.state.release;
                if (this.value <= 0) {
                    this.value = 0;
                    this.stage = 'idle';
                }
                break;
        }

        return Math.max(0, Math.min(1, this.value));
    }

    public clone(): EnvelopeModulator {
        const clone = new EnvelopeModulator(this.state);
        clone.stage = this.stage;
        clone.value = this.value;
        return clone;
    }
}
