#pragma once
#include "SynthEngine.h"
#include <vector>

// Subtractive synthesis: white noise → per-bin SVF band-pass filter bank.
// Each bin in the spectral data defines a centre frequency and bandwidth.
// The sum of the band outputs is subtracted from the raw noise.
// Port of whitenoise.worklet.ts.
//
// SVF (State Variable Filter) per bin:
//   f = 2 * sin(π * freq / sampleRate)  (approximation for low freq)
//   q = 1 / Q
//   low  += f * band
//   high  = in - low - q * band
//   band  = f * high + band
// Band signal is the relevant pass.

class NoiseSynth : public SynthBase {
public:
  void prepare(double sampleRate, int maxBlockSize) override;
  void pushSpectralData(const SpectralData &d, const SynthParams &p) override;
  void process(float *outL, float *outR, const float *adsrGain,
               int numSamples) override;

private:
  double sampleRate_ = 44100.0;
  SynthParams params_;

  SpectralData cur_, prev_, target_;
  float interpT_ = 1.0f;
  float interpStep_ = 0.0f;

  // Per-bin SVF state
  std::vector<float> lowState_;
  std::vector<float> bandState_;

  void ensureBuffers(int numBins);

  // Simple xorshift PRNG for white noise (faster than rand())
  uint32_t rng_ = 0xDEADBEEF;
  float nextNoise();
};
