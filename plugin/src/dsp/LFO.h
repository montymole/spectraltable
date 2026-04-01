#pragma once
#include <cmath>
#include <string>

// LFO with 4 waveforms and optional tempo sync.
// Port of src/modulators/lfo.ts.

enum class LFOWaveform { SINE, SQUARE, SAW, TRIANGLE };

class LFO {
public:
  LFOWaveform waveform = LFOWaveform::SINE;
  float frequency = 0.5f; // Hz
  float amplitude = 1.0f; // 0–1
  float offset = 0.0f;    // -1 to 1

  bool synced = false;
  float bpm = 140.0f;
  // Division string: "1/4", "1/8", "1/4T" etc.
  std::string division = "1/4";

  // Call once per audio buffer with elapsed seconds.
  float advance(float deltaSeconds);

  void reset() { phase_ = 0.0f; }

private:
  float phase_ = 0.0f;

  float syncedFrequency() const;
  float waveValue() const;
};
