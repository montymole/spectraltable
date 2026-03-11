
export class PianoKeyboard {
    private container: HTMLElement;
    private keys: Map<number, HTMLElement> = new Map();
    private activeNotes: Set<number> = new Set();

    // Callbacks
    private onNoteChange: ((note: number, velocity: number) => void) | null = null;

    // Range: Defaults to 5 Octaves
    private numOctaves = 5;
    private baseOctave = 3; // Starts at C3
    private startNote = 36;
    private endNote = 72;

    // Keyboard mapping: key -> [octaveOffset, noteInOctave]
    // Tracker style: lower row = octave 0, upper row = octave 1
    private static readonly KEY_MAP: Record<string, [number, number]> = {
        // Lower octave (Z row) - octave offset 0
        'z': [0, 0],   // C
        's': [0, 1],   // C#
        'x': [0, 2],   // D
        'd': [0, 3],   // D#
        'c': [0, 4],   // E
        'v': [0, 5],   // F
        'g': [0, 6],   // F#
        'b': [0, 7],   // G
        'h': [0, 8],   // G#
        'n': [0, 9],   // A
        'j': [0, 10],  // A#
        'm': [0, 11],  // B

        // Upper octave (Q row) - octave offset 1
        'q': [1, 0],   // C
        '2': [1, 1],   // C#
        'w': [1, 2],   // D
        '3': [1, 3],   // D#
        'e': [1, 4],   // E
        'r': [1, 5],   // F
        '5': [1, 6],   // F#
        't': [1, 7],   // G
        '6': [1, 8],   // G#
        'y': [1, 9],   // A
        '7': [1, 10],  // A#
        'u': [1, 11],  // B
    };

    // Reverse lookup: noteInOctave -> key (for hints)
    // [lowerOctaveKey, upperOctaveKey]
    private static readonly NOTE_TO_KEYS: Record<number, [string, string]> = {
        0: ['z', 'q'],   // C
        1: ['s', '2'],   // C#
        2: ['x', 'w'],   // D
        3: ['d', '3'],   // D#
        4: ['c', 'e'],   // E
        5: ['v', 'r'],   // F
        6: ['g', '5'],   // F#
        7: ['b', 't'],   // G
        8: ['h', '6'],   // G#
        9: ['n', 'y'],   // A
        10: ['j', '7'],   // A#
        11: ['m', 'u'],   // B
    };

    // Track which keys are currently held (for key repeat handling)
    private heldKeys: Set<string> = new Set();

    constructor(containerId: string) {
        const el = document.getElementById(containerId);
        if (!el) throw new Error(`Container ${containerId} not found`);
        this.container = el;

        this.updateRange(); // Calculates start/end and creates keys
        this.setupKeyboardListeners();

        // Prevent drag selection
        this.container.addEventListener('selectstart', e => e.preventDefault());
    }

    public setBaseOctave(octave: number) {
        this.baseOctave = octave;
        this.updateRange();
    }

    private updateRange() {
        this.startNote = this.baseOctave * 12;
        this.endNote = this.startNote + (this.numOctaves * 12);
        this.createKeys();
    }

    private setupKeyboardListeners() {
        window.addEventListener('keydown', (e) => {
            // Ignore if typing in an input field
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }

            const key = e.key.toLowerCase();

            // Ignore key repeat
            if (this.heldKeys.has(key)) return;

            const mapping = PianoKeyboard.KEY_MAP[key];
            if (mapping) {
                e.preventDefault();
                this.heldKeys.add(key);
                const [octaveOffset, noteInOctave] = mapping;
                const note = (this.baseOctave + octaveOffset) * 12 + noteInOctave;
                this.triggerNoteOn(note);
            }
        });

        window.addEventListener('keyup', (e) => {
            const key = e.key.toLowerCase();

            if (this.heldKeys.has(key)) {
                this.heldKeys.delete(key);
                const mapping = PianoKeyboard.KEY_MAP[key];
                if (mapping) {
                    const [octaveOffset, noteInOctave] = mapping;
                    const note = (this.baseOctave + octaveOffset) * 12 + noteInOctave;
                    this.triggerNoteOff(note);
                }
            }
        });

        // Release all keys when window loses focus
        window.addEventListener('blur', () => {
            for (const key of this.heldKeys) {
                const mapping = PianoKeyboard.KEY_MAP[key];
                if (mapping) {
                    const [octaveOffset, noteInOctave] = mapping;
                    const note = (this.baseOctave + octaveOffset) * 12 + noteInOctave;
                    this.triggerNoteOff(note);
                }
            }
            this.heldKeys.clear();
        });
    }

    private createKeys() {
        this.container.innerHTML = '';
        this.keys.clear();

        const whiteKeys = [0, 2, 4, 5, 7, 9, 11]; // Indices in octave

        // Count white keys for width calculation
        let numWhiteKeys = 0;
        for (let i = this.startNote; i <= this.endNote; i++) {
            if (whiteKeys.includes(i % 12)) {
                numWhiteKeys++;
            }
        }

        const whiteKeyWidth = 100 / numWhiteKeys;
        let whiteKeyIndex = 0;

        for (let note = this.startNote; note <= this.endNote; note++) {
            const noteOctave = Math.floor(note / 12);
            const noteInOctave = note % 12;
            const isWhite = whiteKeys.includes(noteInOctave);

            const key = document.createElement('div');
            this.keys.set(note, key);

            key.dataset.note = String(note);

            if (isWhite) {
                key.className = 'piano-key white';
                key.style.width = `${whiteKeyWidth}%`;
                key.style.left = `${whiteKeyIndex * whiteKeyWidth}%`;
                whiteKeyIndex++;
            } else {
                key.className = 'piano-key black';
                key.style.width = `${whiteKeyWidth * 0.7}%`;
                key.style.left = `${(whiteKeyIndex - 1) * whiteKeyWidth + (whiteKeyWidth * 0.65)}%`;
                key.style.zIndex = '2';
            }

            // Add keyboard hint label
            const hint = this.getKeyHint(noteOctave, noteInOctave);
            if (hint) {
                const hintEl = document.createElement('span');
                hintEl.className = 'key-hint';
                hintEl.textContent = hint;
                key.appendChild(hintEl);
            }

            // Mouse events
            key.addEventListener('mousedown', (e) => {
                if (e.buttons === 1) {
                    this.triggerNoteOn(note);
                    const upHandler = () => {
                        this.triggerNoteOff(note);
                        window.removeEventListener('mouseup', upHandler);
                    };
                    window.addEventListener('mouseup', upHandler);
                }
            });

            key.addEventListener('mouseenter', (e) => {
                if (e.buttons === 1) {
                    this.triggerNoteOn(note);
                    key.addEventListener('mouseleave', () => {
                        this.triggerNoteOff(note);
                    }, { once: true });
                }
            });

            this.container.appendChild(key);
        }
    }

    private getKeyHint(noteOctave: number, noteInOctave: number): string | null {
        // Check if this note falls within keyboard-mapped range
        const keyPair = PianoKeyboard.NOTE_TO_KEYS[noteInOctave];
        if (!keyPair) return null;

        // Lower octave (baseOctave) uses first key, upper (+1) uses second
        if (noteOctave === this.baseOctave) {
            return keyPair[0];
        } else if (noteOctave === this.baseOctave + 1) {
            return keyPair[1];
        }
        return null;
    }

    private triggerNoteOn(note: number) {
        if (this.activeNotes.has(note)) return;
        this.activeNotes.add(note);
        this.setVisualizeState(note, true);
        if (this.onNoteChange) this.onNoteChange(note, 127);
    }

    private triggerNoteOff(note: number) {
        if (!this.activeNotes.has(note)) return;
        this.activeNotes.delete(note);
        this.setVisualizeState(note, false);
        if (this.onNoteChange) this.onNoteChange(note, 0);
    }

    public setVisualizeState(note: number, on: boolean) {
        const key = this.keys.get(note);
        if (!key) return; // Out of range

        if (on) {
            key.classList.add('active');
        } else {
            key.classList.remove('active');
        }
    }

    public setNoteChangeCallback(callback: (note: number, velocity: number) => void) {
        this.onNoteChange = callback;
    }
}
