#pragma once

// Simple ADSR envelope.
// Call setSampleRate() first. Then triggerAttack/triggerRelease from the audio
// thread. advance() returns the current gain and steps one sample.

class ADSR {
public:
  void setSampleRate(double sr) { sampleRate_ = sr; }

  void setParams(float attack, float decay, float sustain, float release) {
    attack_ = attack;
    decay_ = decay;
    sustain_ = sustain;
    release_ = release;
  }

  void triggerAttack();
  void triggerRelease();

  // Returns gain [0,1] for the current sample and advances state.
  float advance();

  bool isActive() const { return stage_ != Stage::IDLE; }

private:
  enum class Stage { IDLE, ATTACK, DECAY, SUSTAIN, RELEASE };

  double sampleRate_ = 44100.0;
  float attack_ = 0.1f;
  float decay_ = 0.2f;
  float sustain_ = 0.5f;
  float release_ = 0.5f;

  Stage stage_ = Stage::IDLE;
  float gain_ = 0.0f; // current envelope amplitude
};
