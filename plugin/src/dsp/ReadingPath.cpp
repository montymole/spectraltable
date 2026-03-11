#include "ReadingPath.h"
#include <cassert>
#include <cmath>

Vertex3 ReadingPath::calcVertex(float u, float v, PlaneType type, float phase) {
  float x = u, y = 0.0f, z = v;

  switch (type) {
  case PlaneType::FLAT:
    y = 0.0f;
    break;

  case PlaneType::SINCOS:
    y = 0.3f * std::sin((u + phase) * 3.14159f * 2) *
        std::cos((v + phase) * 3.14159f * 2);
    break;

  case PlaneType::WAVE:
    y = 0.2f * std::sin((u + v + phase) * 3.14159f * 3);
    break;

  case PlaneType::RIPPLE: {
    float dist = std::sqrt(u * u + v * v);
    y = 0.25f * std::sin((dist - phase) * 3.14159f * 4) / (1 + dist * 2);
    break;
  }

  case PlaneType::TUBE: {
    float tubeRadius = 0.5f + phase * 0.2f;
    float angle = v * 3.14159f;
    y = std::cos(angle) * tubeRadius;
    z = std::sin(angle) * tubeRadius;
    x = u;
    break;
  }

  case PlaneType::BELL: {
    float sigma = 0.2f;
    float bellMag = 0.5f + phase * 0.5f;
    y = bellMag * std::exp(-u * u / sigma);
    x = u;
    z = v;
    break;
  }

  case PlaneType::SPIRAL: {
    float t = v + 1.0f; // 0 to 2
    float turns = 2.0f + phase * 2.0f;
    x = t * 0.5f * std::cos(t * turns * 3.14159f);
    y = t * 0.5f * std::sin(t * turns * 3.14159f);
    z = u * 0.5f;
    break;
  }

  case PlaneType::SPRING: {
    float springTurns = 2.0f;
    float heightScale = 1.0f + phase;
    float st = v * 3.14159f * springTurns;
    float sr = 0.5f + u * 0.2f;
    x = std::cos(st) * sr;
    z = std::sin(st) * sr;
    y = v * heightScale;
    break;
  }
  }

  return {x, y, z};
}

void ReadingPath::generateReadingLine(PlaneType type, int resX, float scanPos,
                                      float phase, float *out) {
  assert(out != nullptr);
  // Clamp scanPos to [-1, 1]
  if (scanPos < -1.0f)
    scanPos = -1.0f;
  if (scanPos > 1.0f)
    scanPos = 1.0f;

  for (int i = 0; i < resX; i++) {
    float u = (float)i / (resX - 1) * 2.0f - 1.0f;
    Vertex3 v = calcVertex(u, scanPos, type, phase);
    out[i * 3 + 0] = v.x;
    out[i * 3 + 1] = v.y;
    out[i * 3 + 2] = v.z;
  }
}
