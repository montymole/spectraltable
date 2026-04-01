#include "WavetableSynth.h"
#include <cassert>
#include <cmath>
#include <cstring>

void WavetableSynth::ensureBuffers(int size) {
  if ((int)envelope_.size() >= size)
    return;
  envelope_.assign(size, 0.0f);
  prevEnvelope_.assign(size, 0.0f);
  targetEnvelope_.assign(size, 0.0f);
}

void WavetableSynth::prepare(double sampleRate, int /*maxBlockSize*/) {
  sampleRate_ = sampleRate;
  harmonicPhases_.assign(20, 0.0f);
  harmonicEnvPhases_.assign(20, 0.0f);
  harmonicPhasesInj_.assign(32, 0.0f);
  harmonicEnvPhasesInj_.assign(32, 0.0f);
}

void WavetableSynth::pushSpectralData(const SpectralData &d,
                                      const SynthParams &p) {
  params_ = p;
  int numPoints = d.numBins();
  envelopeSize_ = numPoints;
  ensureBuffers(numPoints);

  // Normalise magnitudes: wavetable uses raw magnitude as amplitude
  float maxMag = 0.0f;
  for (int i = 0; i < numPoints; i++) {
    float m = d.data[i * 4];
    if (m > maxMag)
      maxMag = m;
  }
  float scale = (maxMag > 0.001f) ? 1.0f / maxMag : 1.0f;

  if (p.interpSamples == 0) {
    for (int i = 0; i < numPoints; i++)
      envelope_[i] = d.data[i * 4] * scale;
    interpT_ = 1.0f;
    return;
  }

  prevEnvelope_ = envelope_;
  for (int i = 0; i < numPoints; i++)
    targetEnvelope_[i] = d.data[i * 4] * scale;
  interpStep_ = 1.0f / (p.interpSamples + 1);
  interpT_ = 0.0f;
}

float WavetableSynth::carrier(float phase) const {
  switch (params_.carrierType) {
  case 0:
    return std::sin(phase * 2.0f * 3.14159265f);
  case 1:
    return 1.0f - 2.0f * phase; // saw falling
  case 2:
    return phase < 0.5f ? 1.0f : -1.0f; // square
  case 3:
    return phase < 0.5f ? 4.0f * phase - 1.0f // triangle
                        : 3.0f - 4.0f * phase;
  default:
    return std::sin(phase * 2.0f * 3.14159265f);
  }
}

float WavetableSynth::envelopeSample(float envPhase) const {
  if (envelopeSize_ < 2)
    return 0.0f;
  float pos = envPhase * envelopeSize_;
  int i0 = (int)pos % envelopeSize_;
  int i1 = (i0 + 1) % envelopeSize_;
  float frac = pos - (int)pos;
  return envelope_[i0] * (1.0f - frac) + envelope_[i1] * frac;
}

void WavetableSynth::process(float *outL, float *outR, const float *adsrGain,
                             int numSamples) {
  if (envelopeSize_ < 2) {
    memset(outL, 0, numSamples * sizeof(float));
    memset(outR, 0, numSamples * sizeof(float));
    return;
  }

  // Crossfade interpolation (block level)
  if (interpT_ < 1.0f) {
    interpT_ = std::min(1.0f, interpT_ + interpStep_ * numSamples);
    float t = interpT_, invT = 1.0f - t;
    for (int i = 0; i < envelopeSize_; i++)
      envelope_[i] = prevEnvelope_[i] * invT + targetEnvelope_[i] * t;
  }

  const float freq = params_.wavetableFrequency;
  const float carrierPhaseInc = (float)(freq / sampleRate_);
  const float envPhaseInc = carrierPhaseInc;
  const float nyquist = (float)sampleRate_ * 0.5f;
  const OctaveDoublingParams &oct = params_.octave;
  const HarmonicInjectionParams &harm = params_.harmonic;

  for (int i = 0; i < numSamples; i++) {
    float amplitude = envelopeSample(envPhase_);

    float c = carrier(carrierPhase_);
    if (params_.feedback > 0.0f)
      c = c * (1.0f - params_.feedback * 0.5f) +
          lastSample_ * params_.feedback * 0.5f;

    float total = c * amplitude;

    // Octave low
    for (int h = 1; h <= oct.lowCount; h++) {
      float hFreq = freq / (float)(1 << h);
      if (hFreq < 20.0f)
        break;
      float hGain = std::pow(oct.multiplier, (float)h);
      float hPhaseInc = (float)(hFreq / sampleRate_);
      int idx = h - 1;
      float hAmp = [&]() {
        float pos = harmonicEnvPhases_[idx] * envelopeSize_;
        int i0 = (int)pos % envelopeSize_;
        int i1 = (i0 + 1) % envelopeSize_;
        float frac = pos - (int)pos;
        return envelope_[i0] * (1 - frac) + envelope_[i1] * frac;
      }();
      total += carrier(harmonicPhases_[idx]) * hAmp * hGain;
      harmonicPhases_[idx] = std::fmod(harmonicPhases_[idx] + hPhaseInc, 1.0f);
      harmonicEnvPhases_[idx] =
          std::fmod(harmonicEnvPhases_[idx] + hPhaseInc, 1.0f);
    }

    // Octave high
    for (int h = 1; h <= oct.highCount; h++) {
      float hFreq = freq * (float)(1 << h);
      if (hFreq >= nyquist)
        break;
      float hGain = std::pow(oct.multiplier, (float)h);
      float hPhaseInc = (float)(hFreq / sampleRate_);
      int idx = 10 + (h - 1);
      float hAmp = [&]() {
        float pos = harmonicEnvPhases_[idx] * envelopeSize_;
        int i0 = (int)pos % envelopeSize_;
        int i1 = (i0 + 1) % envelopeSize_;
        float frac = pos - (int)pos;
        return envelope_[i0] * (1 - frac) + envelope_[i1] * frac;
      }();
      total += carrier(harmonicPhases_[idx]) * hAmp * hGain;
      harmonicPhases_[idx] = std::fmod(harmonicPhases_[idx] + hPhaseInc, 1.0f);
      harmonicEnvPhases_[idx] =
          std::fmod(harmonicEnvPhases_[idx] + hPhaseInc, 1.0f);
    }

    // Harmonic injection
    for (int h = 2; h <= harm.count + 1; h++) {
      float hFreq = freq * h;
      if (hFreq >= nyquist)
        break;
      float hGain = std::pow((float)h, -harm.falloff);
      float hPhaseInc = (float)(hFreq / sampleRate_);
      int idx = h - 2;
      if (idx >= (int)harmonicPhasesInj_.size())
        break;
      float hAmp = [&]() {
        float pos = harmonicEnvPhasesInj_[idx] * envelopeSize_;
        int i0 = (int)pos % envelopeSize_;
        int i1 = (i0 + 1) % envelopeSize_;
        float frac = pos - (int)pos;
        return envelope_[i0] * (1 - frac) + envelope_[i1] * frac;
      }();
      total += carrier(harmonicPhasesInj_[idx]) * hAmp * hGain;
      harmonicPhasesInj_[idx] =
          std::fmod(harmonicPhasesInj_[idx] + hPhaseInc, 1.0f);
      harmonicEnvPhasesInj_[idx] =
          std::fmod(harmonicEnvPhasesInj_[idx] + hPhaseInc, 1.0f);
    }

    lastSample_ = total;

    float env = adsrGain ? adsrGain[i] : 1.0f;
    outL[i] = total * 0.5f * env;
    outR[i] = total * 0.5f * env;

    carrierPhase_ = std::fmod(carrierPhase_ + carrierPhaseInc, 1.0f);
    envPhase_ = std::fmod(envPhase_ + envPhaseInc, 1.0f);
  }
}
