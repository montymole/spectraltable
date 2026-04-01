#pragma once
#include <cmath>

// Reading plane types — mirrors JS PlaneType enum
enum class PlaneType { FLAT, SINCOS, WAVE, RIPPLE, TUBE, BELL, SPIRAL, SPRING };

// A single (x,y,z) vertex
struct Vertex3 {
  float x, y, z;
};

class ReadingPath {
public:
  // Calculate the raw 3D vertex for a given UV position on a plane.
  // u, v in [-1, 1].  phase is shape-phase parameter.
  static Vertex3 calcVertex(float u, float v, PlaneType type, float phase);

  // Extract a reading line: resX points across u[-1,1] at fixed v (scanPos).
  // Writes resX * 3 floats (x,y,z triples) into 'out' (must be pre-allocated).
  static void generateReadingLine(PlaneType type, int resX, float scanPos,
                                  float phase,
                                  float *out); // out[resX * 3]
};
