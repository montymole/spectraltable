
export class MidiHandler {
    private midiAccess: any = null;
    private activeInput: any = null;
    private activeNotes: Map<number, number> = new Map(); // Note -> Velocity

    // Callbacks
    private onNoteChangeCallback: ((note: number | null) => void) | null = null;
    private onConnectionChangeCallback: ((isConnected: boolean) => void) | null = null;
    private onRawNoteCallback: ((note: number, velocity: number) => void) | null = null;  // For visualization

    constructor() {
        this.initialize();
    }

    private async initialize() {
        try {
            if ((navigator as any).requestMIDIAccess) {
                this.midiAccess = await (navigator as any).requestMIDIAccess();

                // Get first available input
                const inputs = this.midiAccess.inputs.values();
                for (let input of inputs) {
                    this.setInput(input);
                    break; // Just grab the first one for now
                }

                this.midiAccess.onstatechange = (e: any) => {
                    console.log('MIDI State Change:', e.port.name, e.port.state, e.port.connection);
                    if (e.port.type === 'input') {
                        if (e.port.state === 'connected' && !this.activeInput) {
                            this.setInput(e.port);
                        } else if (e.port.state === 'disconnected' && this.activeInput && this.activeInput.id === e.port.id) {
                            this.activeInput = null;
                            if (this.onConnectionChangeCallback) {
                                this.onConnectionChangeCallback(false);
                            }
                        }
                    }
                };
            } else {
                console.warn('Web MIDI API not supported in this browser.');
            }
        } catch (err) {
            console.error('MIDI Access Failed:', err);
        }
    }

    private setInput(input: any) {
        this.activeInput = input;
        console.log(`MIDI Input Selected: ${input.name}`);

        input.onmidimessage = (message: any) => {
            this.handleMessage(message);
        };

        if (this.onConnectionChangeCallback) {
            this.onConnectionChangeCallback(true);
        }
    }

    private handleMessage(message: any) {
        const [status, data1, data2] = message.data;
        const command = status & 0xF0;
        // const channel = status & 0x0F;
        const note = data1;
        const velocity = data2;

        // Note On
        if (command === 0x90 && velocity > 0) {
            this.activeNotes.set(note, velocity);
            this.triggerHighestNote();
            if (this.onRawNoteCallback) this.onRawNoteCallback(note, velocity);
        }
        // Note Off (or Note On with vel 0)
        else if (command === 0x80 || (command === 0x90 && velocity === 0)) {
            this.activeNotes.delete(note);
            this.triggerHighestNote();
            if (this.onRawNoteCallback) this.onRawNoteCallback(note, 0);
        }
    }

    private triggerHighestNote() {
        if (!this.onNoteChangeCallback) return;

        if (this.activeNotes.size === 0) {
            this.onNoteChangeCallback(null);
            return;
        }

        // Monophonic: Last note priority or Highest note?
        // Let's implement Highest Note Priority for standard synth feel
        let highestNote = -1;
        for (let note of this.activeNotes.keys()) {
            if (note > highestNote) highestNote = note;
        }

        if (highestNote !== -1) {
            this.onNoteChangeCallback(highestNote);
        }
    }

    public setNoteChangeCallback(callback: (note: number | null) => void) {
        this.onNoteChangeCallback = callback;
    }

    public setRawNoteCallback(callback: (note: number, velocity: number) => void) {
        this.onRawNoteCallback = callback;
    }

    public setConnectionChangeCallback(callback: (isConnected: boolean) => void) {
        this.onConnectionChangeCallback = callback;
    }

    public getInputs(): { id: string, name: string }[] {
        if (!this.midiAccess) return [];
        const inputs: { id: string, name: string }[] = [];
        this.midiAccess.inputs.forEach((input: any) => {
            inputs.push({ id: input.id, name: input.name });
        });
        return inputs;
    }

    public selectInput(id: string) {
        if (!this.midiAccess) return;
        const input = this.midiAccess.inputs.get(id);
        if (input) {
            this.setInput(input);
        }
    }

    public simulateNoteOn(note: number, velocity: number) {
        this.activeNotes.set(note, velocity);
        this.triggerHighestNote();
        // Allow visualization update if needed (e.g. if driven by computer keyboard later)
        if (this.onRawNoteCallback) this.onRawNoteCallback(note, velocity);
    }

    public simulateNoteOff(note: number) {
        this.activeNotes.delete(note);
        this.triggerHighestNote();
        if (this.onRawNoteCallback) this.onRawNoteCallback(note, 0);
    }
}
