
import { AudioEngine } from '../audio/audio-engine';

export class EnvelopeEditor {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private engine: AudioEngine;

    private width = 0;
    private height = 0;

    // View settings
    private maxTime = 2.0; // Seconds visible on X axis
    private padding = 20;

    // Interaction state
    private isDragging = false;
    private activeNode = -1; // 0=AttackPeak, 1=DecayEnd/SustainStart, 2=ReleaseEnd

    // Visual Sustain Duration
    private sustainVisualDuration = 0.5;

    constructor(containerOrId: string | HTMLCanvasElement, engine: AudioEngine) {
        let el: HTMLCanvasElement | null = null;
        if (typeof containerOrId === 'string') {
            el = document.getElementById(containerOrId) as HTMLCanvasElement;
        } else {
            el = containerOrId;
        }

        if (!el) throw new Error(`Canvas not found`);
        this.canvas = el;
        this.ctx = this.canvas.getContext('2d')!;
        this.engine = engine;

        this.resize();
        window.addEventListener('resize', () => this.resize());

        // Interaction
        this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
        window.addEventListener('mousemove', this.onMouseMove.bind(this));
        window.addEventListener('mouseup', this.onMouseUp.bind(this));

        // Start animation loop for playhead
        this.animate();
    }

    private resize(): void {
        this.canvas.width = this.canvas.clientWidth;
        this.canvas.height = this.canvas.clientHeight;
        this.width = this.canvas.width;
        this.height = this.canvas.height;
        this.draw();
    }

    private animate(): void {
        this.draw();
        requestAnimationFrame(() => this.animate());
    }

    private draw(): void {
        const { width, height, ctx } = this;
        const state = this.engine.getEnvelopeState();

        // Clear
        ctx.fillStyle = '#08080c';
        ctx.fillRect(0, 0, width, height);

        // Draw Grid
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 1;
        ctx.beginPath();
        // Time grid (every 0.5s)
        for (let t = 0; t <= this.maxTime; t += 0.5) {
            const x = this.timeToX(t);
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
        }
        // Level grid (0, 0.5, 1.0)
        for (let l = 0; l <= 1.0; l += 0.5) {
            const y = this.valToY(l);
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
        }
        ctx.stroke();

        // Calculate Nodes
        const aTime = state.attack;
        const dTime = state.decay;
        const sLevel = state.sustain;
        const rTime = state.release;

        // Visual Layout:
        // P0 (0,0)
        // P1 (A_time, 1.0) -> Attack Peak
        // P2 (A+D_time, S_level) -> Decay End / Sustain Start
        // P3 (A+D+S_vis, S_level) -> Sustain End (Visual only)
        // P4 (A+D+S_vis+R, 0) -> Release End

        const p0 = { x: 0, y: 0 };
        const p1 = { x: aTime, y: 1.0 };
        const p2 = { x: aTime + dTime, y: sLevel };
        const p3 = { x: aTime + dTime + this.sustainVisualDuration, y: sLevel };
        const p4 = { x: aTime + dTime + this.sustainVisualDuration + rTime, y: 0 };

        // Draw Envelope Line
        ctx.strokeStyle = '#00ff88'; // Neon Green
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.timeToX(p0.x), this.valToY(p0.y));
        ctx.lineTo(this.timeToX(p1.x), this.valToY(p1.y));
        ctx.lineTo(this.timeToX(p2.x), this.valToY(p2.y));
        ctx.lineTo(this.timeToX(p3.x), this.valToY(p3.y));
        ctx.lineTo(this.timeToX(p4.x), this.valToY(p4.y));
        ctx.stroke();

        // Draw Interactive Nodes
        this.drawNode(p1.x, p1.y, this.activeNode === 0); // Attack
        this.drawNode(p2.x, p2.y, this.activeNode === 1); // Decay/Sustain
        this.drawNode(p4.x, p4.y, this.activeNode === 2); // Release

        // Labels
        ctx.fillStyle = '#666';
        ctx.font = '10px Inter';
        ctx.fillText('A', this.timeToX(p1.x), this.valToY(p1.y) - 10);
        ctx.fillText('D', this.timeToX(p2.x), this.valToY(p2.y) - 10);
        ctx.fillText('R', this.timeToX(p4.x), this.valToY(p4.y) - 10);

        // Draw Playhead
        if (state.isNoteOn) {
            const timeSinceNote = state.currentTime - state.lastNoteTime;

            // Logic to trace the actual envelope value visual position
            // If Attack phase (t < A)
            // If Decay phase (t < A+D)
            // If Sustain phase (t >= A+D) -> Clamp to visual sustain region? 
            // Better: Draw vertical line at current time

            let playHeadX = 0;
            if (timeSinceNote < aTime + dTime) {
                // In A or D phase
                playHeadX = timeSinceNote;
            } else {
                // In Sustain phase. We clamp it visually within the sustain block
                // OR loop it? Usually standard ADSR just holds.
                // We'll calculate offset into sustain
                const sustainTime = timeSinceNote - (aTime + dTime);
                // Clamp visual position to P2 -> P3 range?
                // Or let it run? If it runs past P3, it looks like release?
                // Let's loop it in the visual sustain block for feedback?
                // Or just clamp at P3?
                // Just clamp it to end of visual sustain for clarity
                const maxSustainX = aTime + dTime + this.sustainVisualDuration;
                playHeadX = Math.min(aTime + dTime + sustainTime, maxSustainX);
            }

            const x = this.timeToX(playHeadX);
            ctx.strokeStyle = '#0088ff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        } else {
            // Note released. We are in Release phase.
            // Problem: We need to know when Release started to draw accurate position.
            // But state only gives us params and noteOn status.
            // We can't easily visualize the release ramp playhead linearly without storing releaseStartTime.
            // But main goal is configuration. Playhead during hold is most useful.
        }
    }

    private drawNode(t: number, v: number, active: boolean): void {
        const x = this.timeToX(t);
        const y = this.valToY(v);

        this.ctx.beginPath();
        this.ctx.arc(x, y, 6, 0, Math.PI * 2);
        this.ctx.fillStyle = active ? '#fff' : '#00ff88';
        this.ctx.fill();
        this.ctx.stroke();
    }

    private timeToX(t: number): number {
        return this.padding + (t / this.maxTime) * (this.width - 2 * this.padding);
    }

    private xToTime(x: number): number {
        return ((x - this.padding) / (this.width - 2 * this.padding)) * this.maxTime;
    }

    private valToY(v: number): number {
        // v is 0..1 (or more). Canvas Y is inverted (0 at top)
        // Map 0 -> height - padding
        // Map 1 -> padding
        const usableHeight = this.height - 2 * this.padding;
        return this.height - this.padding - (v * usableHeight);
    }

    private yToVal(y: number): number {
        const usableHeight = this.height - 2 * this.padding;
        const relativeY = this.height - this.padding - y;
        return relativeY / usableHeight;
    }

    // Interaction Handlers
    private onMouseDown(e: MouseEvent): void {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Hit test nodes
        // P1 (Attack)
        const state = this.engine.getEnvelopeState();
        const p1 = { t: state.attack, v: 1.0 };
        const p2 = { t: state.attack + state.decay, v: state.sustain };
        const p4 = { t: state.attack + state.decay + this.sustainVisualDuration + state.release, v: 0 };

        const nodes = [p1, p2, p4];

        for (let i = 0; i < nodes.length; i++) {
            const nx = this.timeToX(nodes[i].t);
            const ny = this.valToY(nodes[i].v);
            const dist = Math.sqrt((x - nx) ** 2 + (y - ny) ** 2);

            if (dist < 10) {
                this.isDragging = true;
                this.activeNode = i;
                return; // Interaction started
            }
        }
    }

    private onMouseMove(e: MouseEvent): void {
        if (!this.isDragging) return;

        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const time = Math.max(0, this.xToTime(x));
        const val = Math.max(0, Math.min(1.0, this.yToVal(y)));

        // Update AudioEngine params based on node
        // Node 0: Attack (v=1 fixed, t=attack)
        // Node 1: Decay (v=sustain, t=attack+decay)
        // Node 2: Release (v=0 fixed, t=attack+decay+sustainVis+release)

        // We need current values to calc deltas
        const state = this.engine.getEnvelopeState();

        if (this.activeNode === 0) {
            // Dragging Attack
            this.engine.attack = time; // Simple mapping
            // Note: If Attack > Decay End, weird? 
            // Actually Node 1 is absolute time. So Attack is just Time.
        } else if (this.activeNode === 1) {
            // Dragging Decay/Sustain
            this.engine.sustain = val;

            // X position determines Decay Time.
            // X = Attack + Decay. So Decay = X - Attack.
            const newDecay = time - state.attack;
            this.engine.decay = Math.max(0, newDecay);
        } else if (this.activeNode === 2) {
            // Dragging Release
            // X = Attack + Decay + SusVis + Release
            const startOfRelease = state.attack + state.decay + this.sustainVisualDuration;
            const newRelease = time - startOfRelease;
            this.engine.release = Math.max(0.01, newRelease);
        }
    }

    private onMouseUp(): void {
        this.isDragging = false;
        this.activeNode = -1;
    }
}
