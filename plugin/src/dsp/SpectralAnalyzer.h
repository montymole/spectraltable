#pragma once
#include <juce_audio_formats/juce_audio_formats.h>
#include <juce_dsp/juce_dsp.h>
#include "SpectralVolume.h"

/**
 * Utility to analyze audio files and convert them into 3D spectral volumes.
 * Supports multi-file morphing along the Y axis.
 */
class SpectralAnalyzer {
public:
    SpectralAnalyzer();
    ~SpectralAnalyzer() = default;

    /**
     * Analyzes multiple files and populates volumeData (RGBA float array).
     * @param files List of audio files to process.
     * @param res Target resolution for the spectral volume.
     * @param volumeData Output buffer (must be res.x * res.y * res.z * 4 floats).
     * @param onProgress Optional callback for progress updates (0.0 to 1.0).
     * @return True if successful.
     */
    bool analyzeFiles(const juce::Array<juce::File>& files,
                      VolumeResolution res,
                      float* volumeData,
                      std::function<void(float)> onProgress = nullptr);

private:
    juce::AudioFormatManager formatManager;

    // Internal FFT processing
    void processFileToYSlice(const juce::File& file,
                             int yIndex,
                             VolumeResolution res,
                             float* volumeData,
                             std::function<void(float)> onProgress,
                             float progressOffset,
                             float progressScale);

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(SpectralAnalyzer)
};
