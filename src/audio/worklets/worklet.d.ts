/**
 * Type declarations for AudioWorklet processors
 * These types allow TypeScript to understand the AudioWorklet environment
 */

// AudioWorkletProcessor is available in the worklet global scope
declare class AudioWorkletProcessor {
    readonly port: MessagePort;
    constructor();
    process(
        inputs: Float32Array[][],
        outputs: Float32Array[][],
        parameters: Record<string, Float32Array>
    ): boolean;
}

// Global function to register processors
declare function registerProcessor(
    name: string,
    processorCtor: new () => AudioWorkletProcessor
): void;

// Sample rate is available in the worklet global scope
declare const sampleRate: number;

// Current time in the audio context
declare const currentTime: number;

// Current frame
declare const currentFrame: number;
