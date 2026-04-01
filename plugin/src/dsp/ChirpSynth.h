#pragma once
#include "SpectralSynth.h"
#include "SynthEngine.h"

// ChirpSpectral: identical to SpectralSynth but uses logarithmic
// bin-to-frequency mapping instead of linear.  Bins map: freq = 20 *
// (20000/20)^(bin/numBins). Port of chirp-spectral.worklet.ts.
//
// Reuses SpectralSynth with a subclass override on the frequency mapping only.

class ChirpSynth : public SpectralSynth {
public:
  // Override frequency mapping to log scale
  void prepare(double sampleRate, int maxBlockSize) override;
  void process(float *outL, float *outR, const float *adsrGain,
               int numSamples) override;

  // Use logarithmic freq mapping
  static float binToFreq(int bin, int numBins);
};
