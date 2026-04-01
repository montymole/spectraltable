#include "NoiseSynth.h"
#include <cassert>
#include <cmath>
#include <cstring>

float NoiseSynth::nextNoise() {
  // Xorshift32 → [-1, 1]
  rng_ ^= rng_ << 13;
  rng_ ^= rng_ >> 17;
  rng_ ^= rng_ << 5;
  return (float)(int32_t)rng_ / (float)0x80000000;
}

void NoiseSynth::ensureBuffers(int numBins) {
  if ((int)lowState_.size() == numBins)
    return;
  lowState_.assign(numBins, 0.0f);
  bandState_.assign(numBins, 0.0f);
}

void NoiseSynth::prepare(double sampleRate, int /*maxBlockSize*/) {
  sampleRate_ = sampleRate;
}

void NoiseSynth::pushSpectralData(const SpectralData &d, const SynthParams &p) {
  params_ = p;
  int numBins = d.numBins();
  ensureBuffers(numBins);

  if (p.interpSamples == 0) {
    cur_ = d;
    interpT_ = 1.0f;
    return;
  }

  prev_ = cur_;
  target_ = d;
  interpStep_ = 1.0f / (p.interpSamples + 1);
  interpT_ = 0.0f;
}

void NoiseSynth::process(float *outL, float *outR, const float *adsrGain,
                         int numSamples) {
  const int numBins = cur_.numBins();
  if (numBins == 0) {
    memset(outL, 0, numSamples * sizeof(float));
    memset(outR, 0, numSamples * sizeof(float));
    return;
  }

  // Crossfade (block level)
  if (interpT_ < 1.0f) {
    interpT_ = std::min(1.0f, interpT_ + interpStep_ * numSamples);
    float t = interpT_, invT = 1.0f - t;
    for (int j = 0; j < (int)cur_.data.size(); j++)
      cur_.data[j] = prev_.data[j] * invT + target_.data[j] * t;
  }

  const float minFreq = 20.0f;
  const float maxFreq = 20000.0f;
  const float freqRange = maxFreq - minFreq;
  const float binWidth = freqRange / numBins;
  const float freqMul = params_.frequencyMultiplier;
  const float sr = (float)sampleRate_;

  for (int i = 0; i < numSamples; i++) {
    float noise = nextNoise();
    float sumBand = 0.0f;

    for (int bin = 0; bin < numBins; bin++) {
      const float suppression = cur_.data[bin * 4 + 0];
      if (suppression < 0.001f)
        continue;

      const float qVal = cur_.data[bin * 4 + 1];
      const float baseFreq = minFreq + freqRange * ((float)bin / numBins);
      const float freq = baseFreq * freqMul;

      if (freq >= sr * 0.45f)
        continue;

      const float widthInBins = qVal * 10.0f + 0.1f;
      const float BW = binWidth * widthInBins;
      const float Q = std::max(0.5f, freq / BW);

      const float f = 2.0f * std::sin(3.14159265f * freq / sr);
      const float q = 1.0f / Q;

      lowState_[bin] += f * bandState_[bin];
      float high = noise - lowState_[bin] - q * bandState_[bin];
      float band = f * high + bandState_[bin];
      bandState_[bin] = band;

      sumBand += band * suppression;
    }

    float sample = noise - sumBand;
    float env = adsrGain ? adsrGain[i] : 1.0f;
    outL[i] = sample * 0.01f * env;
    outR[i] = sample * 0.01f * env;
  }
}
