
export class PianoKeyboard {
    private container: HTMLElement;
    private keys: Map<number, HTMLElement> = new Map();
    private activeNotes: Set<number> = new Set();

    // Callbacks
    private onNoteChange: ((note: number, velocity: number) => void) | null = null;

    // Range: Defaults to 3 Octaves
    private numOctaves = 3;
    private baseOctave = 3; // Starts at C3
    private startNote = 36;
    private endNote = 72;

    constructor(containerId: string) {
        const el = document.getElementById(containerId);
        if (!el) throw new Error(`Container ${containerId} not found`);
        this.container = el;

        this.updateRange(); // Calculates start/end and creates keys

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
            // const octave = Math.floor(note / 12); // Unused
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
