#include "ADSR.h"
#include <cmath>

void ADSR::triggerAttack() {
  stage_ = Stage::ATTACK;
  // Start from current gain to avoid clicks when re-triggering
}

void ADSR::triggerRelease() {
  if (stage_ == Stage::IDLE)
    return;
  stage_ = Stage::RELEASE;
}

float ADSR::advance() {
  double dt = 1.0 / sampleRate_;

  switch (stage_) {
  case Stage::IDLE:
    gain_ = 0.0f;
    break;

  case Stage::ATTACK: {
    float inc = (attack_ > 0.0f) ? (float)(dt / attack_) : 1.0f;
    gain_ += inc;
    if (gain_ >= 1.0f) {
      gain_ = 1.0f;
      stage_ = Stage::DECAY;
    }
    break;
  }

  case Stage::DECAY: {
    float inc = (decay_ > 0.0f) ? (float)(dt / decay_) : 1.0f;
    gain_ -= inc * (1.0f - sustain_);
    if (gain_ <= sustain_) {
      gain_ = sustain_;
      stage_ = Stage::SUSTAIN;
    }
    break;
  }

  case Stage::SUSTAIN:
    gain_ = sustain_;
    break;

  case Stage::RELEASE: {
    float inc = (release_ > 0.0f) ? (float)(dt / release_) * gain_ : gain_;
    gain_ -= inc;
    if (gain_ <= 0.0f) {
      gain_ = 0.0f;
      stage_ = Stage::IDLE;
    }
    break;
  }
  }

  return gain_;
}
