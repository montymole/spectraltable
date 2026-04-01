#include "SpectralVolume.h"
#include <cassert>
#include <cmath>
#include <cstring>
#include <random>

SpectralVolume::SpectralVolume(VolumeResolution res) : res_(res) {
  data_.assign((size_t)totalVoxels() * 4, 0.0f);
}

void SpectralVolume::setData(const float *src, int numFloats) {
  assert(numFloats == totalVoxels() * 4);
  data_.assign(src, src + numFloats);
  version_++;
}

void SpectralVolume::sample(float x, float y, float z, float out[4]) const {
  // Clamp to [0,1]
  x = x < 0.0f ? 0.0f : (x > 1.0f ? 1.0f : x);
  y = y < 0.0f ? 0.0f : (y > 1.0f ? 1.0f : y);
  z = z < 0.0f ? 0.0f : (z > 1.0f ? 1.0f : z);

  const int W = res_.x, H = res_.y, D = res_.z;

  float gx = x * (W - 1);
  float gy = y * (H - 1);
  float gz = z * (D - 1);

  int x0 = (int)gx, x1 = x0 + 1 < W ? x0 + 1 : x0;
  int y0 = (int)gy, y1 = y0 + 1 < H ? y0 + 1 : y0;
  int z0 = (int)gz, z1 = z0 + 1 < D ? z0 + 1 : z0;

  float fx = gx - x0, fy = gy - y0, fz = gz - z0;

  for (int i = 0; i < 4; i++) {
    float v000 = data_[(size_t)voxelIndex(x0, y0, z0) + i];
    float v100 = data_[(size_t)voxelIndex(x1, y0, z0) + i];
    float v010 = data_[(size_t)voxelIndex(x0, y1, z0) + i];
    float v110 = data_[(size_t)voxelIndex(x1, y1, z0) + i];
    float v001 = data_[(size_t)voxelIndex(x0, y0, z1) + i];
    float v101 = data_[(size_t)voxelIndex(x1, y0, z1) + i];
    float v011 = data_[(size_t)voxelIndex(x0, y1, z1) + i];
    float v111 = data_[(size_t)voxelIndex(x1, y1, z1) + i];

    float c00 = v000 * (1 - fx) + v100 * fx;
    float c10 = v010 * (1 - fx) + v110 * fx;
    float c01 = v001 * (1 - fx) + v101 * fx;
    float c11 = v011 * (1 - fx) + v111 * fx;

    float c0 = c00 * (1 - fy) + c10 * fy;
    float c1 = c01 * (1 - fy) + c11 * fy;

    out[i] = c0 * (1 - fz) + c1 * fz;
  }
}

void SpectralVolume::clearData() {
  data_.assign((size_t)totalVoxels() * 4, 0.0f);
  version_++;
}

// ── Procedural generators ──────────────────────────────────────────────────

void SpectralVolume::generate3DJulia(const JuliaParams &p) {
  const int W = res_.x, H = res_.y, D = res_.z;
  const float scale = p.scale;
  const float cx = p.cReal, cy = p.cImag, cz = 0.0f;
  const int maxIter = 16;
  const float pw = 8.0f;

  int idx = 0;
  for (int iz = 0; iz < D; iz++)
    for (int iy = 0; iy < H; iy++)
      for (int ix = 0; ix < W; ix++) {
        float px = ((float)ix / (W - 1) * 2 - 1) * scale;
        float py = ((float)iy / (H - 1) * 2 - 1) * scale;
        float pz = ((float)iz / (D - 1) * 2 - 1) * scale;

        float zx = px, zy = py, zz = pz, r = 0.0f;
        int iter = 0;
        for (; iter < maxIter; iter++) {
          r = std::sqrt(zx * zx + zy * zy + zz * zz);
          if (r > 2.0f)
            break;
          float theta = std::acos(zz / (r + 1e-5f));
          float phi = std::atan2(zy, zx);
          float zr = std::pow(r, pw);
          float nt = theta * pw, np = phi * pw;
          zx = zr * std::sin(nt) * std::cos(np) + cx;
          zy = zr * std::sin(nt) * std::sin(np) + cy;
          zz = zr * std::cos(nt) + cz;
        }

        float mag = 0.0f;
        if (iter == maxIter)
          mag = std::max(0.2f, std::min(1.0f, 0.8f - r * 0.3f));
        else if (iter > 3)
          mag = ((float)iter - std::log2(std::log2(r + 1.0f))) / maxIter * 0.6f;

        float freqBoost = 1.0f + (1.0f - (float)ix / W) * 0.4f;
        mag = std::min(1.0f, mag * freqBoost);

        data_[idx++] = mag;
        data_[idx++] = std::fmod((float)iter / maxIter + px * 0.1f, 1.0f);
        data_[idx++] = (py / scale + 1) * 0.5f;
        data_[idx++] = (pz / scale + 1) * 0.5f;
      }
  version_++;
}

void SpectralVolume::generateMandelbulb(const MandelbulbParams &p) {
  const int W = res_.x, H = res_.y, D = res_.z;
  const float pw = p.power, scale = p.scale;
  const int maxIter = (int)p.iterations;

  int idx = 0;
  for (int iz = 0; iz < D; iz++)
    for (int iy = 0; iy < H; iy++)
      for (int ix = 0; ix < W; ix++) {
        float px = ((float)ix / (W - 1) * 2 - 1) * scale;
        float py = ((float)iy / (H - 1) * 2 - 1) * scale;
        float pz = ((float)iz / (D - 1) * 2 - 1) * scale;

        float zx = 0, zy = 0, zz = 0, r = 0.0f;
        int iter = 0;
        for (; iter < maxIter; iter++) {
          r = std::sqrt(zx * zx + zy * zy + zz * zz);
          if (r > 2.0f)
            break;
          float theta = std::acos(zz / (r + 1e-5f));
          float phi = std::atan2(zy, zx);
          float zr = std::pow(r, pw);
          float nt = theta * pw, np = phi * pw;
          zx = zr * std::sin(nt) * std::cos(np) + px;
          zy = zr * std::sin(nt) * std::sin(np) + py;
          zz = zr * std::cos(nt) + pz;
        }

        float mag = 0.0f;
        if (iter == maxIter)
          mag = std::max(0.3f, std::min(1.0f, 0.9f - r * 0.2f));
        else if (iter > 2)
          mag = (float)iter / maxIter * 0.5f;

        float freqBoost = 1.0f + (1.0f - (float)ix / W) * 0.4f;
        mag = std::min(1.0f, mag * freqBoost);

        data_[idx++] = mag;
        data_[idx++] = (float)iter / maxIter;
        data_[idx++] = (py / scale + 1) * 0.5f;
        data_[idx++] = (pz / scale + 1) * 0.5f;
      }
  version_++;
}

void SpectralVolume::generateMengerSponge(const MengerParams &p) {
  const int W = res_.x, H = res_.y, D = res_.z;
  const float scale = p.scale;
  const int maxIter = (int)p.iterations;

  auto inSponge = [&](float px, float py, float pz) -> bool {
    float ux = (px / scale + 1) * 0.5f;
    float uy = (py / scale + 1) * 0.5f;
    float uz = (pz / scale + 1) * 0.5f;
    for (int i = 0; i < maxIter; i++) {
      ux *= 3;
      uy *= 3;
      uz *= 3;
      int gx = (int)ux % 3, gy = (int)uy % 3, gz = (int)uz % 3;
      int mid = (gx == 1 ? 1 : 0) + (gy == 1 ? 1 : 0) + (gz == 1 ? 1 : 0);
      if (mid >= 2)
        return false;
      ux = std::fmod(ux, 1.0f);
      uy = std::fmod(uy, 1.0f);
      uz = std::fmod(uz, 1.0f);
    }
    return true;
  };

  int idx = 0;
  for (int iz = 0; iz < D; iz++)
    for (int iy = 0; iy < H; iy++)
      for (int ix = 0; ix < W; ix++) {
        float px = ((float)ix / (W - 1) * 2 - 1) * scale;
        float py = ((float)iy / (H - 1) * 2 - 1) * scale;
        float pz = ((float)iz / (D - 1) * 2 - 1) * scale;

        bool solid = inSponge(px, py, pz);
        float mag = solid ? 0.8f : 0.0f;
        if (solid) {
          float detail =
              std::sin(px * 10) * std::sin(py * 10) * std::sin(pz * 10);
          mag += detail * 0.1f;
        }
        float freqBoost = 1.0f + (1.0f - (float)ix / W) * 0.3f;
        mag = std::max(0.0f, std::min(1.0f, mag * freqBoost));

        data_[idx++] = mag;
        data_[idx++] = std::fmod((px + py + pz) / scale + 3.0f, 6.0f) / 6.0f;
        data_[idx++] = (py / scale + 1) * 0.5f;
        data_[idx++] = (pz / scale + 1) * 0.5f;
      }
  version_++;
}

void SpectralVolume::generateSinePlasma(float timeOffset,
                                        const PlasmaParams &p) {
  plasmaParams_ = p;
  const int W = res_.x, H = res_.y, D = res_.z;
  const float freq = p.frequency;
  const int layers = (int)p.complexity;

  int idx = 0;
  for (int iz = 0; iz < D; iz++)
    for (int iy = 0; iy < H; iy++)
      for (int ix = 0; ix < W; ix++) {
        float nx = (float)ix / W * 2 - 1;
        float ny = (float)iy / H * 2 - 1;
        float nz = (float)iz / D * 2 - 1;

        float v = std::sin(nx * freq + timeOffset) +
                  std::sin(ny * freq * 0.8f + timeOffset * 0.8f) +
                  std::sin(nz * freq * 0.6f + timeOffset * 1.2f);

        if (layers > 1)
          v += std::sin((nx + ny + nz) * freq * 0.7f + timeOffset * 0.5f);
        if (layers > 2) {
          float dist = std::sqrt(nx * nx + ny * ny + nz * nz);
          v += std::sin(dist * freq * 2 - timeOffset * 1.5f);
        }
        if (layers > 3) {
          float angle = std::atan2(ny, nx);
          v += std::sin(angle * 3.0f + nz * freq + timeOffset);
        }

        float maxV = 3.0f + std::min(layers - 1, 3);
        float mag = (v + maxV) / (maxV * 2);
        mag = (std::sin(mag * 10 * p.contrast) + 1.0f) * 0.5f;
        mag = std::pow(mag, p.contrast);
        float freqBoost = 1.0f + (1.0f - (float)ix / W) * 0.5f;
        mag = std::max(0.0f, std::min(0.95f, mag * freqBoost));

        data_[idx++] = mag;
        data_[idx++] = std::fmod(mag + timeOffset * 0.2f, 1.0f);
        data_[idx++] = (std::sin(nx * 3.14159f + timeOffset) + 1.0f) * 0.5f;
        data_[idx++] = (std::cos(ny * 3.14159f + timeOffset) + 1.0f) * 0.5f;
      }
}

void SpectralVolume::stepSinePlasma() {
  plasmaTime_ += 0.02f;
  generateSinePlasma(plasmaTime_, plasmaParams_);
  version_++;
}

// ── Game of Life ───────────────────────────────────────────────────────────

void SpectralVolume::initGameOfLife(const GameOfLifeParams &p) {
  golParams_ = p;
  int n = totalVoxels();
  golState_.resize(n);
  golBuf_.resize(n);

  std::mt19937 rng(42);
  std::uniform_real_distribution<float> dist(0.0f, 1.0f);
  for (int i = 0; i < n; i++)
    golState_[i] = (dist(rng) < p.density) ? 1 : 0;

  golToSpectral();
  version_++;
}

void SpectralVolume::stepGameOfLife() {
  if (golState_.empty())
    return;

  const int W = res_.x, H = res_.y, D = res_.z;

  auto getIdx = [&](int ix, int iy, int iz) -> int {
    ix = ((ix % W) + W) % W;
    iy = ((iy % H) + H) % H;
    iz = ((iz % D) + D) % D;
    return iz * H * W + iy * W + ix;
  };

  for (int iz = 0; iz < D; iz++)
    for (int iy = 0; iy < H; iy++)
      for (int ix = 0; ix < W; ix++) {
        int idx = getIdx(ix, iy, iz);
        int neighbors = 0;
        for (int dz = -1; dz <= 1; dz++)
          for (int dy = -1; dy <= 1; dy++)
            for (int dx = -1; dx <= 1; dx++) {
              if (dx == 0 && dy == 0 && dz == 0)
                continue;
              neighbors += golState_[getIdx(ix + dx, iy + dy, iz + dz)];
            }
        bool alive = golState_[(size_t)idx] == 1;
        if (alive)
          golBuf_[(size_t)idx] = (neighbors >= golParams_.surviveMin &&
                                  neighbors <= golParams_.surviveMin + 1)
                                     ? 1
                                     : 0;
        else
          golBuf_[(size_t)idx] = (neighbors == golParams_.birthMin) ? 1 : 0;
      }
  std::swap(golState_, golBuf_);
  golToSpectral();
  version_++;
}

void SpectralVolume::golToSpectral() {
  const int W = res_.x, H = res_.y, D = res_.z;
  int idx = 0;
  for (int iz = 0; iz < D; iz++)
    for (int iy = 0; iy < H; iy++)
      for (int ix = 0; ix < W; ix++) {
        bool alive = golState_[(size_t)iz * (size_t)H * (size_t)W + (size_t)iy * (size_t)W + (size_t)ix] == 1;
        float mag = alive ? 0.8f : 0.0f;
        if (alive) {
          float freqBoost = 1.0f + (1.0f - (float)ix / W) * 0.4f;
          mag = std::min(1.0f, mag * freqBoost);
        }
        float ny = (float)iy / H * 2 - 1;
        float nz = (float)iz / D * 2 - 1;
        data_[(size_t)idx++] = mag;
        data_[(size_t)idx++] = ((float)ix / W + (float)iy / H + (float)iz / D) / 3.0f;
        data_[(size_t)idx++] = (ny + 1) * 0.5f;
        data_[(size_t)idx++] = (nz + 1) * 0.5f;
      }
}
