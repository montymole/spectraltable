#pragma once
#include "SynthEngine.h"
#include <cmath>
#include <vector>

// Additive / iFFT synthesis from log-spaced frequency bins (20–20kHz).
// Port of spectral.worklet.ts.
//
// Each bin produces a sine oscillator:
//   freq = lerp(20, 20000, bin/numBins) * frequencyMultiplier
// Magnitude is converted from a [0,1] normalised value via:
//   dB = mag * 60 - 60  →  linear = 10^(dB/20)
// Nyquist rolloff uses a cosine taper above 45% of Nyquist.
// Pan is [0,1] → stereo gain split.

class SpectralSynth : public SynthBase {
public:
  void prepare(double sampleRate, int maxBlockSize) override;
  void pushSpectralData(const SpectralData &d, const SynthParams &p) override;
  void process(float *outL, float *outR, const float *adsrGain,
               int numSamples) override;

private:
  double sampleRate_ = 44100.0;

  // Double-buffer for crossfading
  SpectralData cur_, prev_, target_;
  SynthParams params_;
  float interpT_ = 1.0f;
  float interpStep_ = 0.0f;

  // Per-bin oscillator state
  std::vector<float> phaseAccum_;     // current phase [0, 2π)
  std::vector<float> curPhaseOffset_; // current interpolated phase offset
  std::vector<float> prevPhaseOffset_;
  std::vector<float> targetPhaseOffset_;

  // Octave harmonic phases: [bin * 20]
  std::vector<float> harmonicPhases_;
  // Harmonic-injection phases: [bin * 32]
  std::vector<float> harmonicPhasesInj_;
  // Spectral-copy phases
  std::vector<float> copyPhases_;

  // Temp block buffers
  std::vector<float> blockL_, blockR_;

  void ensureBuffers(int numBins);
  float computeRolloff(float normalizedFreq) const;
};
