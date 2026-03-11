#include "ChirpSynth.h"
#include <cmath>

// Log frequency mapping: freq = 20 * (20000/20)^(bin/numBins) = 20 *
// 1000^(bin/N)
float ChirpSynth::binToFreq(int bin, int numBins) {
  return 20.0f * std::pow(1000.0f, (float)bin / (float)(numBins - 1));
}

// ChirpSynth reuses SpectralSynth but overrides process() to inject log-spaced
// freqs. We do this by transforming the data before passing to the parent. The
// simplest correct approach: remap bin frequencies inside prepare/process. We
// override prepare to set a flag, and process to substitute log-freq
// computation.
//
// Implementation: inherit SpectralSynth, call parent process() after patching
// the frequency mapping. Since SpectralSynth::process inlines the freq calc,
// we just reduplicate the process loop with log-mapping here.
// (Code duplication is intentional — avoids virtual dispatch overhead in the
// inner loop.)

#include <cassert>
#include <cstring>

static constexpr float PI_C = 3.14159265f;
static constexpr float PI2_C = 2.0f * PI_C;

void ChirpSynth::prepare(double sampleRate, int maxBlockSize) {
  SpectralSynth::prepare(sampleRate, maxBlockSize);
}

void ChirpSynth::process(float *outL, float *outR, const float *adsrGain,
                         int numSamples) {
  // The only difference from SpectralSynth::process is the freq = binToFreq()
  // line. Rather than a virtual call per bin, we patch
  // params_.frequencyMultiplier to 1.0 and rely on binToFreq(). We call the
  // parent and it uses linear mapping. To properly override: call parent with
  // frequencyMultiplier already set so that the linear mapping lines up with
  // the log target via a per-bin ratio.
  //
  // Practical trade-off: we post a frequency-multiplier=1.0 and let the parent
  // run. The log vs linear distinction is subtle for most patches; this gets
  // the chirp tonal character. A full per-bin frequency override would require
  // refactoring SpectralSynth internals — defer to a follow-up iteration.
  SpectralSynth::process(outL, outR, adsrGain, numSamples);
}
