#include "LFO.h"
#include <algorithm>
#include <cmath>

float LFO::syncedFrequency() const {
  // Parse division string: "1/4", "1/8", "1/4T", etc.
  bool triplet = !division.empty() && division.back() == 'T';
  std::string clean =
      triplet ? division.substr(0, division.size() - 1) : division;

  float num = 1.0f, den = 4.0f;
  size_t slash = clean.find('/');
  if (slash != std::string::npos) {
    num = std::stof(clean.substr(0, slash));
    den = std::stof(clean.substr(slash + 1));
  }

  float bps = bpm / 60.0f;
  float durationInBeats = 4.0f * (num / den); // "1/4" = 1 beat
  float freq = bps / durationInBeats;
  if (triplet)
    freq *= 1.5f;
  return freq;
}

float LFO::waveValue() const {
  switch (waveform) {
  case LFOWaveform::SINE:
    return std::sin(phase_ * 2.0f * 3.14159265f);
  case LFOWaveform::SQUARE:
    return phase_ < 0.5f ? 1.0f : -1.0f;
  case LFOWaveform::SAW:
    return 1.0f - 2.0f * phase_;
  case LFOWaveform::TRIANGLE:
    return phase_ < 0.5f ? (4.0f * phase_ - 1.0f) : (3.0f - 4.0f * phase_);
  }
  return 0.0f;
}

float LFO::advance(float deltaSeconds) {
  float currentFreq = synced ? syncedFrequency() : frequency;
  phase_ += currentFreq * deltaSeconds;
  if (phase_ >= 1.0f)
    phase_ -= std::floor(phase_);

  float out = waveValue() * amplitude + offset;
  return std::max(-1.0f, std::min(1.0f, out));
}
