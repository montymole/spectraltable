#include "SpectralSynth.h"
#include <cassert>
#include <cmath>
#include <cstring>

static constexpr float PI = 3.14159265f;
static constexpr float PI2 = 2.0f * PI;
static constexpr float MIN_FREQ = 20.0f;
static constexpr float MAX_FREQ = 20000.0f;
static constexpr float NYQUIST_LIMIT = 0.45f;

// Cosine rolloff above 45% Nyquist
float SpectralSynth::computeRolloff(float normalizedFreq) const {
  if (normalizedFreq <= NYQUIST_LIMIT)
    return 1.0f;
  if (normalizedFreq >= 1.0f)
    return 0.0f;
  float t = (normalizedFreq - NYQUIST_LIMIT) / (1.0f - NYQUIST_LIMIT);
  return 0.5f * (1.0f + std::cos(t * PI));
}

void SpectralSynth::ensureBuffers(int numBins) {
  if ((int)phaseAccum_.size() == numBins)
    return;

  phaseAccum_.assign((size_t)numBins, 0.0f);
  curPhaseOffset_.assign((size_t)numBins, 0.0f);
  prevPhaseOffset_.assign((size_t)numBins, 0.0f);
  targetPhaseOffset_.assign((size_t)numBins, 0.0f);
  harmonicPhases_.assign((size_t)numBins * 20, 0.0f);
  harmonicPhasesInj_.assign((size_t)numBins * 32, 0.0f);
  copyPhases_.assign((size_t)numBins, 0.0f);
}

void SpectralSynth::prepare(double sampleRate, int maxBlockSize) {
  sampleRate_ = sampleRate;
  blockL_.resize((size_t)maxBlockSize, 0.0f);
  blockR_.resize((size_t)maxBlockSize, 0.0f);
}

void SpectralSynth::pushSpectralData(const SpectralData &d,
                                     const SynthParams &p) {
  params_ = p;
  int numBins = d.numBins();
  ensureBuffers(numBins);

  if (p.interpSamples == 0) {
    cur_ = d;
    for (int b = 0; b < numBins; b++)
      curPhaseOffset_[(size_t)b] = d.data[(size_t)b * 4 + 1];
    interpT_ = 1.0f;
    return;
  }

  prev_ = cur_;
  for (int b = 0; b < (int)prevPhaseOffset_.size(); b++)
    prevPhaseOffset_[(size_t)b] = curPhaseOffset_[(size_t)b];

  target_ = d;
  for (int b = 0; b < numBins; b++)
    targetPhaseOffset_[(size_t)b] = d.data[(size_t)b * 4 + 1];

  interpStep_ = p.interpSamples > 0 ? 1.0f / (p.interpSamples + 1) : 1.0f;
  interpT_ = 0.0f;
}

void SpectralSynth::process(float *outL, float *outR, const float *adsrGain,
                            int numSamples) {
  if (!outL || !outR || numSamples <= 0)
    return;

  const int numBins = (int)phaseAccum_.size();
  if (numBins == 0) {
    memset(outL, 0, (size_t)numSamples * 4);
    memset(outR, 0, (size_t)numSamples * 4);
    return;
  }

  if (cur_.data.size() < (size_t)numBins * 4) {
    memset(outL, 0, (size_t)numSamples * sizeof(float));
    memset(outR, 0, (size_t)numSamples * sizeof(float));
    return;
  }

  const float nyquist = (float)sampleRate_ * 0.5f;
  const float PI2_SR = PI2 / (float)sampleRate_;

  // Crossfade interpolation (block-level)
  if (interpT_ < 1.0f) {
    interpT_ = std::min(1.0f, interpT_ + interpStep_ * numSamples);
    float t = interpT_, invT = 1.0f - t;
    int prevBins = cur_.numBins(); // before swap, same as target
    for (size_t j = 0; j < cur_.data.size() && j < target_.data.size();
         j++)
      cur_.data[j] = prev_.data[j] * invT + target_.data[j] * t;
    (void)prevBins;
    for (int b = 0; b < numBins; b++)
      curPhaseOffset_[(size_t)b] =
          prevPhaseOffset_[(size_t)b] * invT + targetPhaseOffset_[(size_t)b] * t;
  }

  // Clear block
  for (int i = 0; i < numSamples; i++) {
    blockL_[(size_t)i] = 0.0f;
    blockR_[(size_t)i] = 0.0f;
  }

  const OctaveDoublingParams &oct = params_.octave;
  const HarmonicInjectionParams &harm = params_.harmonic;
  const SpectralCopyParams &cp = params_.copy;
  const float freqMul = params_.frequencyMultiplier;

  for (int bin = 0; bin < numBins; bin++) {
    const float mag = cur_.data[(size_t)bin * 4 + 0];
    if (mag < 0.001f)
      continue;

    const float phaseOffset = curPhaseOffset_[(size_t)bin];
    const float pan = cur_.data[(size_t)bin * 4 + 2];

    // Logarithmic bin → frequency
    const float normalizedBin = (float)bin / (numBins > 1 ? (numBins - 1) : 1);
    const float ratio = MAX_FREQ / MIN_FREQ;
    const float baseFreq = MIN_FREQ * std::pow(ratio, normalizedBin);
    const float freq = baseFreq * freqMul;

    const float normalizedFreq = freq / nyquist;
    if (normalizedFreq >= 1.0f)
      continue;

    const float rolloff = computeRolloff(normalizedFreq);
    if (rolloff < 0.001f)
      continue;

    // dB → linear
    const float dB = mag * 60.0f - 60.0f;
    const float linearMag = std::pow(10.0f, dB / 20.0f) * rolloff;

    // Pan split
    const float p_ = (pan - 0.5f) * 2.0f;
    const float glL = std::min(1.0f, 1.0f - p_) * linearMag;
    const float glR = std::min(1.0f, 1.0f + p_) * linearMag;

    const float phaseInc = freq * PI2_SR;
    const float offsetRad = phaseOffset * PI2;

    // Base oscillator
    float phase = phaseAccum_[(size_t)bin];
    for (int i = 0; i < numSamples; i++) {
      float s = std::sin(phase + offsetRad);
      blockL_[(size_t)i] += s * glL;
      blockR_[(size_t)i] += s * glR;
      phase += phaseInc;
    }
    phaseAccum_[(size_t)bin] = std::fmod(phase, PI2);

    // Octave doubling – low
    if (oct.lowCount > 0) {
      float harmGain = oct.multiplier;
      for (int h = 1; h <= oct.lowCount; h++) {
        float hFreq = freq / (float)(1 << h);
        if (hFreq < 20.0f)
          break;
        float hPhaseInc = hFreq * PI2_SR;
        int idx = bin * 20 + (h - 1);
        float hPhase = harmonicPhases_[(size_t)idx];
        for (int i = 0; i < numSamples; i++) {
          float s = std::sin(hPhase + offsetRad);
          blockL_[(size_t)i] += s * glL * harmGain;
          blockR_[(size_t)i] += s * glR * harmGain;
          hPhase += hPhaseInc;
        }
        harmonicPhases_[(size_t)idx] = std::fmod(hPhase, PI2);
        harmGain *= oct.multiplier;
      }
    }

    // Octave doubling – high
    if (oct.highCount > 0) {
      float harmGain = oct.multiplier;
      for (int h = 1; h <= oct.highCount; h++) {
        float hFreq = freq * (float)(1 << h);
        if (hFreq >= nyquist)
          break;
        float hPhaseInc = hFreq * PI2_SR;
        int idx = bin * 20 + 10 + (h - 1);
        float hPhase = harmonicPhases_[(size_t)idx];
        for (int i = 0; i < numSamples; i++) {
          float s = std::sin(hPhase + offsetRad);
          blockL_[(size_t)i] += s * glL * harmGain;
          blockR_[(size_t)i] += s * glR * harmGain;
          hPhase += hPhaseInc;
        }
        harmonicPhases_[(size_t)idx] = std::fmod(hPhase, PI2);
        harmGain *= oct.multiplier;
      }
    }

    // Harmonic injection (integer harmonics)
    for (int h = 2; h <= harm.count + 1; h++) {
      float hFreq = freq * h;
      if (hFreq >= nyquist)
        break;
      float injGain = std::pow((float)h, -harm.falloff);
      float hPhaseInc = hFreq * PI2_SR;
      int idx = bin * 32 + (h - 2);
      float hPhase = harmonicPhasesInj_[(size_t)idx];
      for (int i = 0; i < numSamples; i++) {
        float s = std::sin(hPhase + offsetRad);
        blockL_[(size_t)i] += s * glL * injGain;
        blockR_[(size_t)i] += s * glR * injGain;
        hPhase += hPhaseInc;
      }
      harmonicPhasesInj_[(size_t)idx] = std::fmod(hPhase, PI2);
    }

    // Spectral copy
    if (cp.mix > 0.001f) {
      float shiftScale = std::pow(2.0f, (float)cp.shiftSemitones / 12.0f);
      float cFreq = freq * shiftScale;
      if (cFreq < nyquist) {
        float cPhaseInc = cFreq * PI2_SR;
        float cPhase = copyPhases_[(size_t)bin];
        for (int i = 0; i < numSamples; i++) {
          float s = std::sin(cPhase + offsetRad);
          blockL_[(size_t)i] += s * glL * cp.mix;
          blockR_[(size_t)i] += s * glR * cp.mix;
          cPhase += cPhaseInc;
        }
        copyPhases_[(size_t)bin] = std::fmod(cPhase, PI2);
      }
    }
  }

  // Output with ADSR and master scale
  const float scale = 0.1f;
  for (int i = 0; i < numSamples; i++) {
    float env = adsrGain ? adsrGain[(size_t)i] : 1.0f;
    outL[(size_t)i] = blockL_[(size_t)i] * scale * env;
    outR[(size_t)i] = blockR_[(size_t)i] * scale * env;
  }
}
