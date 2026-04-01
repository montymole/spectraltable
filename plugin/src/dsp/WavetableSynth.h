#pragma once
#include "SynthEngine.h"
#include <vector>

// AM synthesis: carrier waveform (sine/saw/square/tri) amplitude-modulated
// by the reading line magnitude envelope.
// Port of wavetable.worklet.ts.
//
// The envelope array is the normalised magnitude values from the reading line.
// Carrier phase and envelope phase increment at the same rate
// (wavetableFrequency). Feedback mixes the previous output back into the
// carrier input.

class WavetableSynth : public SynthBase {
public:
  void prepare(double sampleRate, int maxBlockSize) override;
  void pushSpectralData(const SpectralData &d, const SynthParams &p) override;
  void process(float *outL, float *outR, const float *adsrGain,
               int numSamples) override;

private:
  double sampleRate_ = 44100.0;
  SynthParams params_;

  std::vector<float> envelope_;
  std::vector<float> prevEnvelope_;
  std::vector<float> targetEnvelope_;
  int envelopeSize_ = 0;

  float interpT_ = 1.0f;
  float interpStep_ = 0.0f;

  float carrierPhase_ = 0.0f;
  float envPhase_ = 0.0f;
  float lastSample_ = 0.0f;

  // Octave harmonic phases [20], harmonic-injection phases [32]
  std::vector<float> harmonicPhases_;
  std::vector<float> harmonicEnvPhases_;
  std::vector<float> harmonicPhasesInj_;
  std::vector<float> harmonicEnvPhasesInj_;

  void ensureBuffers(int size);
  float carrier(float phase) const;
  float envelopeSample(float envPhase) const;
};
