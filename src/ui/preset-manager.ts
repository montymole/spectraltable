import { PresetData, PresetControls, STORAGE_KEY_STATE, STORAGE_KEY_PRESETS } from '../types';

export class PresetManager {
    private presets: PresetData[] = [];
    private onPresetsChange: (() => void) | null = null;

    constructor() {
        this.loadPresets();
    }

    private loadPresets(): void {
        try {
            const stored = localStorage.getItem(STORAGE_KEY_PRESETS);
            if (stored) {
                this.presets = JSON.parse(stored);
            }
        } catch (e) {
            console.warn('Failed to load presets:', e);
            this.presets = [];
        }
    }

    private savePresets(): void {
        try {
            localStorage.setItem(STORAGE_KEY_PRESETS, JSON.stringify(this.presets));
            if (this.onPresetsChange) this.onPresetsChange();
        } catch (e) {
            console.warn('Failed to save presets:', e);
        }
    }

    public getPresets(): PresetData[] {
        return [...this.presets];
    }

    public savePreset(name: string, controls: PresetControls): void {
        const preset: PresetData = {
            name,
            timestamp: Date.now(),
            controls
        };

        // Check if preset with same name exists
        const existingIdx = this.presets.findIndex(p => p.name === name);
        if (existingIdx >= 0) {
            this.presets[existingIdx] = preset;
        } else {
            this.presets.push(preset);
        }

        this.savePresets();
        console.log(`✓ Preset saved: ${name}`);
    }

    public deletePreset(name: string): boolean {
        const idx = this.presets.findIndex(p => p.name === name);
        if (idx >= 0) {
            this.presets.splice(idx, 1);
            this.savePresets();
            console.log(`✓ Preset deleted: ${name}`);
            return true;
        }
        return false;
    }

    public getPreset(name: string): PresetData | undefined {
        return this.presets.find(p => p.name === name);
    }

    // Auto-save current state (not a named preset, just last session state)
    public saveCurrentState(controls: PresetControls): void {
        try {
            localStorage.setItem(STORAGE_KEY_STATE, JSON.stringify(controls));
        } catch (e) {
            console.warn('Failed to save state:', e);
        }
    }

    public loadCurrentState(): PresetControls | null {
        try {
            const stored = localStorage.getItem(STORAGE_KEY_STATE);
            if (stored) {
                return JSON.parse(stored);
            }
        } catch (e) {
            console.warn('Failed to load state:', e);
        }
        return null;
    }

    public setPresetsChangeCallback(callback: () => void): void {
        this.onPresetsChange = callback;
    }
}

