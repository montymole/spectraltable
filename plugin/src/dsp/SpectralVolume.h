#pragma once
#include <vector>
#include <cstdint>

// 3D spectral volume stored as a flat float array.
// Each voxel: [mag, phase, pan, custom] — 4 floats.
// Axes: X=frequency bins, Y=morph, Z=time slices.
//
// This is a CPU-side port of the JS SpectralVolume; no GPU involvement here.
// All procedural generators are arithmetic-only, safe to call from any thread.

struct VolumeResolution { int x, y, z; };

struct JuliaParams     { float scale = 1.0f, cReal = -0.4f, cImag = 0.6f; };
struct MandelbulbParams{ float power = 8.0f, scale = 1.2f, iterations = 12.0f; };
struct MengerParams    { float iterations = 4.0f, scale = 1.0f; };
struct PlasmaParams    { float frequency = 3.0f, complexity = 4.0f, contrast = 2.0f; };
struct GameOfLifeParams{ float density = 0.3f; int birthMin = 5, surviveMin = 4; };

class SpectralVolume
{
public:
    SpectralVolume(VolumeResolution res);

    // Load raw RGBA data (must be res.x * res.y * res.z * 4 floats)
    void setData(const float* data, int numFloats);

    // Trilinear sample at normalised coords [0,1]^3.
    // Returns [mag, phase, pan, custom].
    void sample(float x, float y, float z, float out[4]) const;

    // Procedural generators — fill the volume in-place.
    void generate3DJulia     (const JuliaParams&      p = {});
    void generateMandelbulb  (const MandelbulbParams& p = {});
    void generateMengerSponge(const MengerParams&     p = {});
    void generateSinePlasma  (float timeOffset = 0.0f, const PlasmaParams& p = {});
    void stepSinePlasma();

    // 3D Game of Life
    void initGameOfLife (const GameOfLifeParams& p = {});
    void stepGameOfLife ();

    void clearData();

    VolumeResolution getResolution() const { return res_; }

    // Direct read access for the reading path sampler
    const float* data() const { return data_.data(); }

private:
    VolumeResolution res_;
    std::vector<float> data_;   // res.x * res.y * res.z * 4 floats

    // GoL double buffers
    std::vector<uint8_t> golState_, golBuf_;
    GameOfLifeParams golParams_;
    void golToSpectral();

    // Plasma animation state
    float plasmaTime_ = 0.0f;
    PlasmaParams plasmaParams_;

    int totalVoxels() const { return res_.x * res_.y * res_.z; }
    int voxelIndex(int ix, int iy, int iz) const
        { return (iz * res_.y * res_.x + iy * res_.x + ix) * 4; }
};
