#include "SpectralAnalyzer.h"
#include <cmath>
#include <algorithm>

SpectralAnalyzer::SpectralAnalyzer() {
    formatManager.registerBasicFormats();
}

bool SpectralAnalyzer::analyzeFiles(const juce::Array<juce::File>& files,
                                  VolumeResolution res,
                                  float* volumeData,
                                  std::function<void(float)> onProgress) {
    if (files.isEmpty() || !volumeData) return false;

    // Zero out the buffer first
    std::memset(volumeData, 0, (size_t)res.x * res.y * res.z * 4 * sizeof(float));

    int numFiles = files.size();
    for (int i = 0; i < numFiles; ++i) {
        float progressOffset = (float)i / numFiles;
        float progressScale = 1.0f / numFiles;

        // Calculate Y index based on file position
        float yPos = (numFiles == 1) ? 0.0f : -1.0f + ((float)i / (numFiles - 1)) * 2.0f;
        int yIndex = juce::roundToInt((yPos + 1.0f) * 0.5f * (res.y - 1));
        yIndex = juce::jlimit(0, res.y - 1, yIndex);

        processFileToYSlice(files[i], yIndex, res, volumeData, onProgress, progressOffset, progressScale);
    }

    if (onProgress) onProgress(1.0f);
    return true;
}

void SpectralAnalyzer::processFileToYSlice(const juce::File& file,
                                         int yIndex,
                                         VolumeResolution res,
                                         float* volumeData,
                                         std::function<void(float)> onProgress,
                                         float progressOffset,
                                         float progressScale) {
    std::unique_ptr<juce::AudioFormatReader> reader(formatManager.createReaderFor(file));
    if (!reader) return;

    double sampleRate = reader->sampleRate;
    juce::int64 totalSamples = reader->lengthInSamples;
    
    // Mix to mono
    juce::AudioBuffer<float> buffer(1, (int)totalSamples);
    reader->read(&buffer, 0, (int)totalSamples, 0, true, false);
    const float* channelData = buffer.getReadPointer(0);

    const int fftOrder = 11; // 2048
    const int fftSize = 1 << fftOrder;
    juce::dsp::FFT fft(fftOrder);
    juce::dsp::WindowingFunction<float> window(fftSize, juce::dsp::WindowingFunction<float>::hann);

    float samplesPerSlice = (float)totalSamples / (float)res.z;
    
    // Buffer for FFT: performFrequencyOnlyForwardTransform needs 2*fftSize
    std::vector<float> fftBuffer((size_t)fftSize * 2, 0.0f);

    const float minFreq = 20.0f;
    const float maxFreq = 20000.0f;
    const float freqRatio = maxFreq / minFreq;

    for (int iz = 0; iz < res.z; ++iz) {
        int startSample = juce::roundToInt(iz * samplesPerSlice);
        
        std::fill(fftBuffer.begin(), fftBuffer.end(), 0.0f);
        for (int k = 0; k < fftSize; ++k) {
            if (startSample + k < totalSamples)
                fftBuffer[(size_t)k] = channelData[startSample + k];
        }

        window.multiplyWithWindowingTable(fftBuffer.data(), fftSize);
        fft.performFrequencyOnlyForwardTransform(fftBuffer.data());

        // Now fftBuffer[0...fftSize/2] contains magnitudes
        for (int ix = 0; ix < res.x; ++ix) {
            float normalizedBin = (float)ix / (res.x > 1 ? (res.x - 1) : 1);
            float targetFreq = minFreq * std::pow(freqRatio, normalizedBin);
            
            float binIndex = targetFreq * fftSize / (float)sampleRate;
            int b0 = (int)binIndex;
            int b1 = std::min(b0 + 1, fftSize / 2);
            float frac = binIndex - b0;

            float mag0 = fftBuffer[(size_t)juce::jlimit(0, fftSize / 2, b0)];
            float mag1 = fftBuffer[(size_t)juce::jlimit(0, fftSize / 2, b1)];
            float magnitude = mag0 * (1.0f - frac) + mag1 * frac;

            // Map magnitude to 0..1 scale (dB based)
            float val = 0.0f;
            if (magnitude > 0.000001f) {
                float db = 20.0f * std::log10(magnitude);
                // Range -60dB to 0dB -> 0 to 1
                val = (db + 60.0f) / 60.0f;
                val = std::clamp(val, 0.0f, 1.0f);
            }

            // Write to the volume
            int idx = (iz * res.y * res.x + yIndex * res.x + ix) * 4;
            volumeData[idx] = val;              // Mag
            volumeData[idx + 1] = (float)ix / res.x; // Phase (repurposed for visual)
            volumeData[idx + 2] = (float)ix / res.x; // Pan
            volumeData[idx + 3] = (float)iz / res.z; // Custom
        }

        if (onProgress && (iz % 10 == 0)) {
            float sliceProgress = (float)iz / res.z;
            onProgress(progressOffset + sliceProgress * progressScale);
        }
    }
}
