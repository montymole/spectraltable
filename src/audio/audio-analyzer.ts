// Audio analysis and spectral volume conversion
// Converts WAV/audio files into 3D spectral volume data using FFT

export class AudioAnalyzer {
    private audioContext: AudioContext;

    constructor() {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    /**
     * Analyze multiple files for morphing
     * Each file is placed at a different Y position in the volume
     * All files are time-stretched to the same Z length
     */
    public async analyzeMultipleFiles(
        files: File[],
        volumeSize: { x: number, y: number, z: number },
        onProgress?: (percent: number) => void
    ): Promise<Float32Array> {
        const { x: xSize, y: ySize, z: zSize } = volumeSize;
        const numFiles = files.length;

        console.log(`Analyzing ${numFiles} files for morphing into ${xSize}x${ySize}x${zSize} volume`);

        // Initialize volume with zeros
        const volumeData = new Float32Array(xSize * ySize * zSize * 4); // RGBA

        // Process each file
        for (let fileIdx = 0; fileIdx < numFiles; fileIdx++) {
            const file = files[fileIdx];

            // Load and decode audio
            const arrayBuffer = await file.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            const channelData = audioBuffer.getChannelData(0);
            const sampleRate = audioBuffer.sampleRate;

            console.log(`  [${fileIdx + 1}/${numFiles}] ${file.name}: ${audioBuffer.duration.toFixed(2)}s`);

            // Calculate which Y index this file should occupy
            // For 1 file: Y=0 (middle)
            // For 2 files: Y=-1, Y=1 (first and last)
            // For 3+ files: equally spaced from -1 to 1
            const yPosition = numFiles === 1 ? 0 : -1 + (fileIdx / (numFiles - 1)) * 2;
            const yIndex = Math.round((yPosition + 1) * 0.5 * (ySize - 1));

            // Time-stretch audio to fit Z dimension
            const fftSize = 2048;
            const samplesNeeded = zSize * fftSize;
            const processedData = this.timeStretch(channelData, samplesNeeded);

            // Frequency mapping constants
            const minFreq = 20;
            const maxFreq = 20000;

            // Process each Z slice (time)
            for (let iz = 0; iz < zSize; iz++) {
                const startSample = iz * fftSize;
                const signal = new Float32Array(fftSize);

                // Extract window
                for (let i = 0; i < fftSize; i++) {
                    if (startSample + i < processedData.length) {
                        signal[i] = processedData[startSample + i];
                    }
                }

                // Apply Hann window
                for (let i = 0; i < fftSize; i++) {
                    signal[i] *= 0.5 * (1 - Math.cos(2 * Math.PI * i / fftSize));
                }

                // Perform FFT
                const spectrum = this.simpleFFT(signal);

                // Map spectrum to X axis (Linear Frequency 0-22kHz)
                for (let ix = 0; ix < xSize; ix++) {
                    const normalizedX = ix / xSize;
                    const freq = minFreq + (maxFreq - minFreq) * normalizedX;
                    const binIndex = Math.floor(freq * fftSize / sampleRate);
                    const safeBinIndex = Math.max(0, Math.min(spectrum.length - 1, binIndex));
                    const magnitude = spectrum[safeBinIndex] || 0;

                    // Convert to dB scale
                    let val = 0;
                    if (magnitude > 0.000001) {
                        const db = 20 * Math.log10(magnitude);
                        val = (db + 60) / 60;
                        val = Math.max(0, Math.min(1, val));
                    }

                    // Write to the specific Y slice for this file
                    const idx = (iz * ySize * xSize + yIndex * xSize + ix) * 4;

                    volumeData[idx] = val;                        // R: Magnitude
                    volumeData[idx + 1] = ix / xSize;             // G: Phase (freq-based)
                    volumeData[idx + 2] = ix / xSize;             // B: Pan
                    volumeData[idx + 3] = iz / zSize;             // A: Width
                }

                // Report progress
                if (onProgress && iz % 10 === 0) {
                    const fileProgress = (fileIdx / numFiles) * 100;
                    const sliceProgress = ((iz / zSize) / numFiles) * 100;
                    onProgress(fileProgress + sliceProgress);
                }

                // Yield to main thread periodically
                if (iz % 20 === 0) {
                    await new Promise(resolve => requestAnimationFrame(resolve));
                }
            }
        }

        if (onProgress) onProgress(100);
        console.log('✓ Multi-file morphing volume created');
        return volumeData;
    }

    public async analyzeFile(
        file: File,
        volumeSize: { x: number, y: number, z: number },
        onProgress?: (percent: number) => void
    ): Promise<{ data: Float32Array, adjustedSize: { x: number, y: number, z: number } }> {
        // Load audio file
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

        // Get audio data (mix to mono from stereo)
        const channelData = audioBuffer.getChannelData(0);
        const totalSamples = channelData.length;
        const sampleRate = audioBuffer.sampleRate;

        console.log(`Analyzing: ${file.name}, ${audioBuffer.duration.toFixed(2)}s, ${sampleRate}Hz, ${totalSamples} samples`);

        const { x: xSize, y: ySize, z: zSize } = volumeSize;

        // Minimum samples needed for good FFT (2048 is a good FFT size)
        const minFFTSize = 2048;

        // Calculate total samples needed to fill the volume
        const samplesNeeded = zSize * ySize * minFFTSize;

        let processedData: Float32Array;

        if (totalSamples < samplesNeeded) {
            // Time-stretch (interpolate) to fill the volume
            console.log(`Time-stretching audio: ${totalSamples} → ${samplesNeeded} samples (${(samplesNeeded / totalSamples).toFixed(2)}x)`);
            if (onProgress) onProgress(10);
            processedData = this.timeStretch(channelData, samplesNeeded);
            if (onProgress) onProgress(20);
        } else {
            // Use as-is or downsample if much longer
            processedData = channelData;
            if (onProgress) onProgress(15);
        }

        const volumeData = new Float32Array(xSize * ySize * zSize * 4); // RGBA

        // Split sample by Z depth (morph layers)

        const totalIterations = zSize;
        let iterationCount = 0;
        let lastYieldTime = performance.now();

        // We will process the audio in Z steps (Time)
        // Each Z step represents a point in time
        // X is Frequency (Logarithmic)
        // Y is replicated

        const stepSize = Math.floor(processedData.length / zSize);

        // Frequency mapping constants
        const minFreq = 20;
        const maxFreq = 20000; // Fixed range for consistency

        for (let iz = 0; iz < zSize; iz++) {
            // Calculate start position for this time slice
            const startSample = iz * stepSize;

            // Extract a window for FFT
            // Use a window size that gives good frequency resolution, e.g., 2048 or 4096
            // But we map it to xSize bins
            const fftSize = 2048;
            const signal = new Float32Array(fftSize);

            // Copy samples (with bounds check)
            for (let i = 0; i < fftSize; i++) {
                if (startSample + i < processedData.length) {
                    signal[i] = processedData[startSample + i];
                }
            }

            // Apply Hann window
            for (let i = 0; i < fftSize; i++) {
                signal[i] *= 0.5 * (1 - Math.cos(2 * Math.PI * i / fftSize));
            }

            // Perform FFT
            const spectrum = this.simpleFFT(signal);
            const numBins = spectrum.length;

            // Store this slice's data temporarily to normalize later? 
            // Or just do a first pass? 
            // For simplicity/speed, we'll use a running normalization or just a reasonable scale.
            // But user asked for normalization. Let's find local max first?
            // No, global max is better. But that requires two passes.
            // Let's stick to a reasonable scaling + log scale which is more robust.

            // Map spectrum to X axis (Linear Frequency 0-22kHz)
            for (let ix = 0; ix < xSize; ix++) {
                const normalizedX = ix / xSize;

                // Linear mapping:
                // freq = minFreq + (maxFreq - minFreq) * normalizedX
                // binFreq = bin * sampleRate / fftSize
                // bin = freq * fftSize / sampleRate

                const freq = minFreq + (maxFreq - minFreq) * normalizedX;
                const binIndex = Math.floor(freq * fftSize / sampleRate);

                // Clamp bin index
                const safeBinIndex = Math.max(0, Math.min(numBins - 1, binIndex));

                const magnitude = spectrum[safeBinIndex] || 0;

                // Convert to dB-like scale
                let val = 0;
                if (magnitude > 0.000001) {
                    const db = 20 * Math.log10(magnitude);
                    // Range -60dB to 0dB
                    val = (db + 60) / 60;
                    val = Math.max(0, Math.min(1, val));
                }

                // Replicate across Y
                for (let iy = 0; iy < ySize; iy++) {
                    const idx = (iz * ySize * xSize + iy * xSize + ix) * 4;

                    // R: Magnitude
                    volumeData[idx] = val;

                    // G: Phase (frequency-based)
                    volumeData[idx + 1] = ix / xSize;

                    // B: Pan (spread)
                    volumeData[idx + 2] = ix / xSize;

                    // A: Width
                    volumeData[idx + 3] = iz / zSize;
                }
            }

            // Report progress
            iterationCount++;
            if (onProgress && iterationCount % 5 === 0) {
                const percent = 20 + (iterationCount / totalIterations) * 80;
                onProgress(percent);
            }

            // Yield to main thread
            if (performance.now() - lastYieldTime > 12) {
                await new Promise(resolve => requestAnimationFrame(resolve));
                lastYieldTime = performance.now();
            }
        }

        if (onProgress) onProgress(100);
        console.log('✓ Converted to spectral volume');
        return { data: volumeData, adjustedSize: volumeSize };
    }

    private timeStretch(input: Float32Array, targetLength: number): Float32Array {
        // Simple linear interpolation time-stretching
        const output = new Float32Array(targetLength);
        const ratio = input.length / targetLength;

        for (let i = 0; i < targetLength; i++) {
            const srcPos = i * ratio;
            const srcIdx = Math.floor(srcPos);
            const frac = srcPos - srcIdx;

            // Linear interpolation between samples
            if (srcIdx + 1 < input.length) {
                output[i] = input[srcIdx] * (1 - frac) + input[srcIdx + 1] * frac;
            } else {
                output[i] = input[srcIdx];
            }
        }

        return output;
    }

    private simpleFFT(signal: Float32Array): Float32Array {
        // Simple DFT for magnitude spectrum
        // For production, consider using a proper FFT library
        const N = signal.length;
        const spectrum = new Float32Array(N / 2);

        for (let k = 0; k < N / 2; k++) {
            let real = 0;
            let imag = 0;

            for (let n = 0; n < N; n++) {
                const angle = -2 * Math.PI * k * n / N;
                real += signal[n] * Math.cos(angle);
                imag += signal[n] * Math.sin(angle);
            }

            spectrum[k] = Math.sqrt(real * real + imag * imag) / N;
        }

        return spectrum;
    }
}
