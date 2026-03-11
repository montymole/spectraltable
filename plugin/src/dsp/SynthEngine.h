#pragma once
#include <cstdint>
#include <vector>

// Shared spectral data buffers used by all synth modes.
// SpectralData is a flat float array: [mag, phase, pan, custom] per bin.
// numBins() == data.size() / 4.

struct SpectralData {
  std::vector<float> data; // mag, phase, pan, custom per bin
  int numBins() const { return (int)data.size() / 4; }
};

// ── Per-mode synth parameters ─────────────────────────────────────────────

struct OctaveDoublingParams {
  int lowCount = 0;
  int highCount = 0;
  float multiplier = 0.5f;
};

struct HarmonicInjectionParams {
  int count = 0;
  float falloff = 1.0f;
};

struct SpectralCopyParams {
  int shiftSemitones = 12;
  float mix = 0.0f;
};

// ── Common engine state shared across modes ───────────────────────────────

struct SynthParams {
  // Spectral / ChirpSpectral / WhiteNoise
  float frequencyMultiplier =
      1.0f; // pitch shift as ratio (e.g. 2.0 = one octave up)

  // Wavetable
  float wavetableFrequency = 220.0f;
  int carrierType = 0; // 0=sine,1=saw,2=square,3=tri
  float feedback = 0.0f;

  // Shared
  OctaveDoublingParams octave;
  HarmonicInjectionParams harmonic;
  SpectralCopyParams copy;
  int interpSamples = 64; // crossfade samples between spectral updates
};

// ── Base class for all synth modes ───────────────────────────────────────

class SynthBase {
public:
  virtual ~SynthBase() = default;

  virtual void prepare(double sampleRate, int maxBlockSize) = 0;

  // Push new spectral data (called from audio thread, lock-free).
  // Data is copied into an internal double-buffer and crossfaded.
  virtual void pushSpectralData(const SpectralData &d,
                                const SynthParams &p) = 0;

  // Generate audio into out[0..numSamples-1] (stereo: L, R interleaved).
  // adsr_gain is the per-sample envelope gain array (numSamples floats).
  virtual void process(float *outL, float *outR, const float *adsrGain,
                       int numSamples) = 0;
};
