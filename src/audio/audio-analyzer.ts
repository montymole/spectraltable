// Audio analysis and spectral volume conversion
// Converts WAV/audio files into 3D spectral volume data using FFT

export class AudioAnalyzer {
    private audioContext: AudioContext;

    constructor() {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    public async analyzeFile(
        file: File,
        volumeSize: { x: number, y: number, z: number }
    ): Promise<{ data: Float32Array, adjustedSize: { x: number, y: number, z: number } }> {
        // Load audio file
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

        // Get audio data (mix to mono from stereo)
        const channelData = audioBuffer.getChannelData(0);
        const totalSamples = channelData.length;
        const sampleRate = audioBuffer.sampleRate;

        console.log(`Analyzing: ${file.name}, ${audioBuffer.duration.toFixed(2)}s, ${sampleRate}Hz, ${totalSamples} samples`);

        // Minimum samples needed for good FFT (2048 is a good FFT size)
        const minFFTSize = 2048;
        const minSamplesPerSegment = minFFTSize;

        // Calculate maximum Z density based on sample length
        // We need: totalSamples / z / y >= minSamplesPerSegment
        // So: z <= totalSamples / (y * minSamplesPerSegment)
        const maxZ = Math.floor(totalSamples / (volumeSize.y * minSamplesPerSegment));

        let adjustedSize = { ...volumeSize };

        if (maxZ < volumeSize.z) {
            console.warn(`Sample too short for Z=${volumeSize.z}. Adjusting to Z=${maxZ}`);
            adjustedSize.z = Math.max(1, maxZ); // At least 1
        }

        const { x: xSize, y: ySize, z: zSize } = adjustedSize;
        const volumeData = new Float32Array(xSize * ySize * zSize * 4); // RGBA

        // Split sample by Z depth (morph layers)
        const samplesPerZ = Math.floor(totalSamples / zSize);

        for (let iz = 0; iz < zSize; iz++) {
            // Starting from Z = -1, going towards +1
            const zStart = iz * samplesPerZ;
            const zEnd = Math.min(zStart + samplesPerZ, totalSamples);
            const zSegment = channelData.slice(zStart, zEnd);

            // Split this Z segment by Y (time slices within this morph layer)
            const samplesPerY = Math.floor(zSegment.length / ySize);

            for (let iy = 0; iy < ySize; iy++) {
                // Starting from Y = -1, going to +1
                const yStart = iy * samplesPerY;
                const yEnd = Math.min(yStart + samplesPerY, zSegment.length);
                const ySegment = zSegment.slice(yStart, yEnd);

                // Perform FFT on this segment to get frequency spectrum for X axis
                const fftSize = Math.min(2048, Math.pow(2, Math.floor(Math.log2(ySegment.length))));

                // Pad or truncate to FFT size
                const signal = new Float32Array(fftSize);
                for (let i = 0; i < Math.min(fftSize, ySegment.length); i++) {
                    signal[i] = ySegment[i];
                }

                // Apply Hann window
                for (let i = 0; i < fftSize; i++) {
                    signal[i] *= 0.5 * (1 - Math.cos(2 * Math.PI * i / fftSize));
                }

                // Perform FFT
                const spectrum = this.simpleFFT(signal);
                const numBins = spectrum.length; // fftSize / 2

                // Map spectrum to X axis (-1 to 1 means 0 to xSize)
                for (let ix = 0; ix < xSize; ix++) {
                    // Map ix to frequency bin
                    const binIndex = Math.floor((ix / xSize) * numBins);
                    const magnitude = spectrum[binIndex] || 0;

                    // Calculate volume index: [ix, iy, iz]
                    // Volume layout: x + y*xSize + z*xSize*ySize
                    const idx = (iz * ySize * xSize + iy * xSize + ix) * 4;

                    // R: Magnitude
                    volumeData[idx] = Math.min(1.0, magnitude * 20); // Scale up for visibility

                    // G: Phase (frequency-based for now, would need complex FFT for real phase)
                    volumeData[idx + 1] = ix / xSize;

                    // B: Pan (spread across stereo field based on frequency)
                    volumeData[idx + 2] = ix / xSize;

                    // A: Width (based on Z layer)
                    volumeData[idx + 3] = iz / zSize;
                }
            }
        }

        console.log('✓ Converted to spectral volume');
        return { data: volumeData, adjustedSize };
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
