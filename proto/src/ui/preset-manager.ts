import { PresetData, PresetControls, STORAGE_KEY_STATE, STORAGE_KEY_PRESETS } from '../types';

const DB_NAME = 'spectraltable_presets_db';
const DB_VERSION = 1;
const PRESET_STORE = 'presets';
const STATE_STORE = 'state';
const CURRENT_STATE_ID = 'current';

export class PresetManager {
    private db: IDBDatabase | null = null;
    private presets: PresetData[] = [];
    private currentState: PresetControls | null = null;
    private onPresetsChange: (() => void) | null = null;
    private readyPromise: Promise<void>;

    constructor() {
        this.readyPromise = this.init();
    }

    public ready(): Promise<void> {
        return this.readyPromise;
    }

    private async init(): Promise<void> {
        try {
            this.db = await this.openDatabase();
            await this.migrateLocalStorage();
            await this.loadFromIndexedDB();
            this.emitPresetsChange();
        } catch (e) {
            console.warn('Failed to initialize preset storage:', e);
            this.loadLocalStorageFallback();
        }
    }

    private openDatabase(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(PRESET_STORE)) {
                    db.createObjectStore(PRESET_STORE, { keyPath: 'name' });
                }
                if (!db.objectStoreNames.contains(STATE_STORE)) {
                    db.createObjectStore(STATE_STORE, { keyPath: 'id' });
                }
            };

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    private async migrateLocalStorage(): Promise<void> {
        if (!this.db) return;

        const existingPresets = await this.getAllPresetsFromDB();
        if (existingPresets.length === 0) {
            const storedPresets = localStorage.getItem(STORAGE_KEY_PRESETS);
            if (storedPresets) {
                const parsed = JSON.parse(storedPresets) as PresetData[];
                await Promise.all(parsed.map((preset) => this.putPresetInDB(preset)));
            }
        }

        const existingState = await this.getCurrentStateFromDB();
        if (!existingState) {
            const storedState = localStorage.getItem(STORAGE_KEY_STATE);
            if (storedState) {
                await this.putCurrentStateInDB(JSON.parse(storedState) as PresetControls);
            }
        }
    }

    private async loadFromIndexedDB(): Promise<void> {
        this.presets = (await this.getAllPresetsFromDB())
            .filter((preset) => this.isPresetControls(preset.controls));
        const state = await this.getCurrentStateFromDB();
        this.currentState = state && this.isPresetControls(state) ? state : null;
        this.sortPresets();
    }

    private loadLocalStorageFallback(): void {
        try {
            const storedPresets = localStorage.getItem(STORAGE_KEY_PRESETS);
            const presets = storedPresets ? JSON.parse(storedPresets) as PresetData[] : [];
            this.presets = presets.filter((preset) => this.isPresetControls(preset.controls));
            const storedState = localStorage.getItem(STORAGE_KEY_STATE);
            const state = storedState ? JSON.parse(storedState) as PresetControls : null;
            this.currentState = state && this.isPresetControls(state) ? state : null;
            this.sortPresets();
            this.emitPresetsChange();
        } catch (e) {
            console.warn('Failed to load fallback presets:', e);
            this.presets = [];
            this.currentState = null;
        }
    }

    private transaction(storeName: string, mode: IDBTransactionMode): IDBObjectStore {
        if (!this.db) throw new Error('Preset database is not ready');
        return this.db.transaction(storeName, mode).objectStore(storeName);
    }

    private requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    private getAllPresetsFromDB(): Promise<PresetData[]> {
        return this.requestToPromise(this.transaction(PRESET_STORE, 'readonly').getAll() as IDBRequest<PresetData[]>);
    }

    private getCurrentStateFromDB(): Promise<PresetControls | null> {
        return this.requestToPromise(this.transaction(STATE_STORE, 'readonly').get(CURRENT_STATE_ID))
            .then((record) => {
                const typedRecord = record as { id: string, controls: PresetControls } | undefined;
                return typedRecord?.controls || null;
            });
    }

    private putPresetInDB(preset: PresetData): Promise<IDBValidKey> {
        return this.requestToPromise(this.transaction(PRESET_STORE, 'readwrite').put(preset));
    }

    private deletePresetFromDB(name: string): Promise<undefined> {
        return this.requestToPromise(this.transaction(PRESET_STORE, 'readwrite').delete(name));
    }

    private putCurrentStateInDB(controls: PresetControls): Promise<IDBValidKey> {
        return this.requestToPromise(this.transaction(STATE_STORE, 'readwrite').put({
            id: CURRENT_STATE_ID,
            controls
        }));
    }

    private sortPresets(): void {
        this.presets.sort((a, b) => b.timestamp - a.timestamp);
    }

    private isPresetControls(value: unknown): value is PresetControls {
        const controls = value as Partial<PresetControls> | null;
        return Boolean(
            controls &&
            typeof controls.pathY === 'number' &&
            typeof controls.scanPosition === 'number' &&
            typeof controls.planeType === 'string' &&
            controls.planeType.trim().length > 0 &&
            typeof controls.synthMode === 'string' &&
            controls.synthMode.trim().length > 0 &&
            typeof controls.spectralData === 'string' &&
            controls.spectralData.trim().length > 0 &&
            controls.modRouting &&
            typeof controls.modRouting.pathY === 'string'
        );
    }

    private emitPresetsChange(): void {
        if (this.onPresetsChange) this.onPresetsChange();
    }

    public getPresets(): PresetData[] {
        return [...this.presets];
    }

    public async savePreset(name: string, controls: PresetControls): Promise<void> {
        await this.readyPromise;
        if (!this.isPresetControls(controls)) return;

        const preset: PresetData = {
            name,
            timestamp: Date.now(),
            controls
        };

        const existingIdx = this.presets.findIndex(p => p.name === name);
        if (existingIdx >= 0) {
            this.presets[existingIdx] = preset;
        } else {
            this.presets.push(preset);
        }
        this.sortPresets();

        try {
            await this.putPresetInDB(preset);
        } catch (e) {
            console.warn('Failed to save preset to IndexedDB:', e);
            localStorage.setItem(STORAGE_KEY_PRESETS, JSON.stringify(this.presets));
        }

        this.emitPresetsChange();
        console.log(`✓ Preset saved: ${name}`);
    }

    public async deletePreset(name: string): Promise<boolean> {
        await this.readyPromise;

        const idx = this.presets.findIndex(p => p.name === name);
        if (idx < 0) return false;

        this.presets.splice(idx, 1);

        try {
            await this.deletePresetFromDB(name);
        } catch (e) {
            console.warn('Failed to delete preset from IndexedDB:', e);
            localStorage.setItem(STORAGE_KEY_PRESETS, JSON.stringify(this.presets));
        }

        this.emitPresetsChange();
        console.log(`✓ Preset deleted: ${name}`);
        return true;
    }

    public getPreset(name: string): PresetData | undefined {
        return this.presets.find(p => p.name === name);
    }

    public async saveCurrentState(controls: PresetControls): Promise<void> {
        await this.readyPromise;
        if (!this.isPresetControls(controls)) return;
        this.currentState = controls;

        try {
            await this.putCurrentStateInDB(controls);
        } catch (e) {
            console.warn('Failed to save state to IndexedDB:', e);
            localStorage.setItem(STORAGE_KEY_STATE, JSON.stringify(controls));
        }
    }

    public async loadCurrentState(): Promise<PresetControls | null> {
        await this.readyPromise;
        return this.currentState;
    }

    public setPresetsChangeCallback(callback: () => void): void {
        this.onPresetsChange = callback;
    }
}
