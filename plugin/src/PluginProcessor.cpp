#include "PluginProcessor.h"
#include "PluginEditor.h"
#include "dsp/ChirpSynth.h"
#include "dsp/NoiseSynth.h"
#include "dsp/SpectralAnalyzer.h"
#include "dsp/ReadingPath.h"
#include "dsp/SpectralSynth.h"
#include "dsp/WavetableSynth.h"
#include <cmath>

juce::AudioProcessorValueTreeState::ParameterLayout
PluginProcessor::createParameterLayout() {
  std::vector<std::unique_ptr<juce::RangedAudioParameter>> params;

  params.push_back(std::make_unique<juce::AudioParameterInt>(
      juce::ParameterID{ParamID::SYNTH_MODE, 1}, "Synth Mode", 0, 3, 0));
  params.push_back(std::make_unique<juce::AudioParameterFloat>(
      juce::ParameterID{ParamID::PATH_X, 1}, "Path X", 0.0f, 1.0f, 0.5f));
  params.push_back(std::make_unique<juce::AudioParameterFloat>(
      juce::ParameterID{ParamID::PATH_Y, 1}, "Path Y", 0.0f, 1.0f, 0.5f));
  params.push_back(std::make_unique<juce::AudioParameterFloat>(
      juce::ParameterID{ParamID::PATH_Z, 1}, "Path Z", 0.0f, 1.0f, 0.5f));
  params.push_back(std::make_unique<juce::AudioParameterFloat>(
      juce::ParameterID{ParamID::SCAN_POS, 1}, "Scan Pos", -1.0f, 1.0f, 0.0f));
  params.push_back(std::make_unique<juce::AudioParameterFloat>(
      juce::ParameterID{ParamID::SHAPE_PHASE, 1}, "Shape Phase", 0.0f, 1.0f,
      0.0f));
  params.push_back(std::make_unique<juce::AudioParameterInt>(
      juce::ParameterID{ParamID::PLANE_TYPE, 1}, "Plane Type", 0, 7, 0));
  params.push_back(std::make_unique<juce::AudioParameterFloat>(
      juce::ParameterID{ParamID::ROT_X, 1}, "Rot X", -180.0f, 180.0f, 0.0f));
  params.push_back(std::make_unique<juce::AudioParameterFloat>(
      juce::ParameterID{ParamID::ROT_Y, 1}, "Rot Y", -180.0f, 180.0f, 0.0f));
  params.push_back(std::make_unique<juce::AudioParameterFloat>(
      juce::ParameterID{ParamID::ROT_Z, 1}, "Rot Z", -180.0f, 180.0f, 0.0f));
  params.push_back(std::make_unique<juce::AudioParameterInt>(
      juce::ParameterID{ParamID::DENSITY_X, 1}, "Density X", 16, 512, 64));
  params.push_back(std::make_unique<juce::AudioParameterInt>(
      juce::ParameterID{ParamID::DENSITY_Y, 1}, "Density Y", 1, 16, 2));
  params.push_back(std::make_unique<juce::AudioParameterInt>(
      juce::ParameterID{ParamID::DENSITY_Z, 1}, "Density Z", 16, 1024, 128));
  params.push_back(std::make_unique<juce::AudioParameterFloat>(
      juce::ParameterID{ParamID::FREQ_MUL, 1}, "Freq Mul", 0.1f, 10.0f, 1.0f));
  params.push_back(std::make_unique<juce::AudioParameterFloat>(
      juce::ParameterID{ParamID::WT_FREQ, 1}, "WT Freq", 20.0f, 20000.0f,
      440.0f));
  params.push_back(std::make_unique<juce::AudioParameterInt>(
      juce::ParameterID{ParamID::CARRIER, 1}, "Carrier", 0, 3, 0));
  params.push_back(std::make_unique<juce::AudioParameterFloat>(
      juce::ParameterID{ParamID::FEEDBACK, 1}, "Feedback", 0.0f, 1.0f, 0.0f));

  // Envelope
  params.push_back(std::make_unique<juce::AudioParameterFloat>(
      juce::ParameterID{ParamID::ATTACK, 1}, "Attack", 0.01f, 10.0f, 0.1f));
  params.push_back(std::make_unique<juce::AudioParameterFloat>(
      juce::ParameterID{ParamID::DECAY, 1}, "Decay", 0.01f, 10.0f, 0.1f));
  params.push_back(std::make_unique<juce::AudioParameterFloat>(
      juce::ParameterID{ParamID::SUSTAIN, 1}, "Sustain", 0.0f, 1.0f, 0.8f));
  params.push_back(std::make_unique<juce::AudioParameterFloat>(
      juce::ParameterID{ParamID::RELEASE, 1}, "Release", 0.01f, 10.0f, 1.0f));
  params.push_back(std::make_unique<juce::AudioParameterFloat>(
      juce::ParameterID{ParamID::MASTER_VOL, 1}, "Master Vol", 0.0f, 1.0f,
      0.8f));

  // Octave
  params.push_back(std::make_unique<juce::AudioParameterInt>(
      juce::ParameterID{ParamID::OCT_LOW, 1}, "Oct Low", 0, 4, 0));
  params.push_back(std::make_unique<juce::AudioParameterInt>(
      juce::ParameterID{ParamID::OCT_HIGH, 1}, "Oct High", 0, 4, 0));
  params.push_back(std::make_unique<juce::AudioParameterFloat>(
      juce::ParameterID{ParamID::OCT_MULT, 1}, "Oct Mult", 0.0f, 2.0f, 0.5f));

  // Harmonic
  params.push_back(std::make_unique<juce::AudioParameterInt>(
      juce::ParameterID{ParamID::HARM_COUNT, 1}, "Harm Count", 0, 32, 0));
  params.push_back(std::make_unique<juce::AudioParameterFloat>(
      juce::ParameterID{ParamID::HARM_FALLOFF, 1}, "Harm Falloff", 0.1f, 2.0f,
      1.0f));

  // Copy
  params.push_back(std::make_unique<juce::AudioParameterInt>(
      juce::ParameterID{ParamID::COPY_SHIFT, 1}, "Copy Shift", -24, 24, 0));
  params.push_back(std::make_unique<juce::AudioParameterFloat>(
      juce::ParameterID{ParamID::COPY_MIX, 1}, "Copy Mix", 0.0f, 1.0f, 0.0f));

  // Shaping
  params.push_back(std::make_unique<juce::AudioParameterInt>(
      juce::ParameterID{ParamID::SHAPE_MODE, 1}, "Shape Mode", 0, 2, 0));
  params.push_back(std::make_unique<juce::AudioParameterFloat>(
      juce::ParameterID{ParamID::SHAPE_AMOUNT, 1}, "Shape Amount", 0.0f, 1.0f,
      0.0f));

  params.push_back(std::make_unique<juce::AudioParameterInt>(
      juce::ParameterID{ParamID::INTERP_SAMPLES, 1}, "Interp Samples", 1, 1024,
      64));

  // LFO1
  params.push_back(std::make_unique<juce::AudioParameterFloat>(
      juce::ParameterID{ParamID::LFO1_RATE, 1}, "LFO1 Rate", 0.001f, 20.0f,
      1.0f));
  params.push_back(std::make_unique<juce::AudioParameterFloat>(
      juce::ParameterID{ParamID::LFO1_AMP, 1}, "LFO1 Amp", 0.0f, 1.0f, 0.0f));
  params.push_back(std::make_unique<juce::AudioParameterInt>(
      juce::ParameterID{ParamID::LFO1_TARGET, 1}, "LFO1 Target", 0, 3, 0));

  // LFO2
  params.push_back(std::make_unique<juce::AudioParameterFloat>(
      juce::ParameterID{ParamID::LFO2_RATE, 1}, "LFO2 Rate", 0.001f, 20.0f,
      1.0f));
  params.push_back(std::make_unique<juce::AudioParameterFloat>(
      juce::ParameterID{ParamID::LFO2_AMP, 1}, "LFO2 Amp", 0.0f, 1.0f, 0.0f));
  params.push_back(std::make_unique<juce::AudioParameterInt>(
      juce::ParameterID{ParamID::LFO2_TARGET, 1}, "LFO2 Target", 0, 3, 0));

  params.push_back(std::make_unique<juce::AudioParameterInt>(
      juce::ParameterID{ParamID::GENERATOR, 1}, "Generator", 0, 6, 0));
  params.push_back(std::make_unique<juce::AudioParameterFloat>(
      juce::ParameterID{ParamID::BPM, 1}, "BPM", 20.0f, 300.0f, 120.0f));

  // Per-generator params
  // Julia: scale, c.real, c.imag
  params.push_back(std::make_unique<juce::AudioParameterFloat>(
      juce::ParameterID{ParamID::GEN_SCALE, 1}, "Gen Scale", 0.1f, 3.0f, 1.0f));
  params.push_back(std::make_unique<juce::AudioParameterFloat>(
      juce::ParameterID{ParamID::GEN_CREAL, 1}, "Gen C Real", -2.0f, 2.0f, -0.4f));
  params.push_back(std::make_unique<juce::AudioParameterFloat>(
      juce::ParameterID{ParamID::GEN_CIMAG, 1}, "Gen C Imag", -2.0f, 2.0f, 0.6f));
  // Mandelbulb: power, iterations (shared scale above)
  params.push_back(std::make_unique<juce::AudioParameterFloat>(
      juce::ParameterID{ParamID::GEN_POWER, 1}, "Gen Power", 1.0f, 16.0f, 8.0f));
  params.push_back(std::make_unique<juce::AudioParameterFloat>(
      juce::ParameterID{ParamID::GEN_ITER, 1}, "Gen Iterations", 2.0f, 32.0f, 12.0f));
  // Menger: holeSize (shared scale + iter above)
  params.push_back(std::make_unique<juce::AudioParameterFloat>(
      juce::ParameterID{ParamID::GEN_HOLE, 1}, "Gen Hole", 0.05f, 0.6f, 0.33f));
  // Plasma: frequency, complexity, contrast
  params.push_back(std::make_unique<juce::AudioParameterFloat>(
      juce::ParameterID{ParamID::GEN_FREQ, 1}, "Gen Freq", 0.5f, 20.0f, 3.0f));
  params.push_back(std::make_unique<juce::AudioParameterFloat>(
      juce::ParameterID{ParamID::GEN_COMP, 1}, "Gen Complexity", 1.0f, 16.0f, 4.0f));
  params.push_back(std::make_unique<juce::AudioParameterFloat>(
      juce::ParameterID{ParamID::GEN_CONTRAST, 1}, "Gen Contrast", 0.25f, 8.0f, 2.0f));
  // GoL: density, birth threshold, survive threshold
  params.push_back(std::make_unique<juce::AudioParameterFloat>(
      juce::ParameterID{ParamID::GEN_DENSITY, 1}, "Gen Density", 0.05f, 0.8f, 0.3f));
  params.push_back(std::make_unique<juce::AudioParameterFloat>(
      juce::ParameterID{ParamID::GEN_BIRTH, 1}, "Gen Birth Min", 1.0f, 13.0f, 5.0f));
  params.push_back(std::make_unique<juce::AudioParameterFloat>(
      juce::ParameterID{ParamID::GEN_SURVIVE, 1}, "Gen Survive Min", 1.0f, 13.0f, 4.0f));
  // Animation speed (ticks/sec) for Plasma + GoL
  params.push_back(std::make_unique<juce::AudioParameterFloat>(
      juce::ParameterID{ParamID::GEN_SPEED, 1}, "Gen Speed", 0.1f, 30.0f, 4.0f));

  return {params.begin(), params.end()};
}

PluginProcessor::PluginProcessor()
    : juce::AudioProcessor(
          BusesProperties()
              .withInput("Input", juce::AudioChannelSet::stereo(), true)
              .withOutput("Output", juce::AudioChannelSet::stereo(), true)),
      apvts(*this, nullptr, "Parameters", createParameterLayout()) {
  volume.clearData(); // default: clean table
  rebuildSynth(currentMode_);
}

void PluginProcessor::prepareToPlay(double sampleRate, int samplesPerBlock) {
  adsr_.setSampleRate(sampleRate);

  adsrBuf_.resize((size_t)samplesPerBlock);

  if (synth_) {
    synth_->prepare(sampleRate, samplesPerBlock);
  }
}

void PluginProcessor::processBlock(juce::AudioBuffer<float> &buffer,
                                   juce::MidiBuffer &midiMessages) {
  juce::ScopedNoDenormals noDenormals;
  int numSamples = buffer.getNumSamples();

  // Process queued MIDI events from piano keyboard
  {
    const juce::ScopedLock lock(midiQueueLock_);
    if (!midiEventQueue_.isEmpty()) {
      // Merge queued events into the main MIDI buffer
      for (const auto metadata : midiEventQueue_) {
        midiMessages.addEvent(metadata.getMessage(), metadata.samplePosition);
      }
      midiEventQueue_.clear();
    }
  }

  int newMode =
      static_cast<int>(apvts.getRawParameterValue(ParamID::SYNTH_MODE)->load());
  if (newMode != currentMode_) {
    rebuildSynth(newMode);
  }

  const int gen =
      static_cast<int>(apvts.getRawParameterValue(ParamID::GENERATOR)->load());
  const int resX =
      static_cast<int>(apvts.getRawParameterValue(ParamID::DENSITY_X)->load());
  const int resY =
      static_cast<int>(apvts.getRawParameterValue(ParamID::DENSITY_Y)->load());
  const int resZ =
      static_cast<int>(apvts.getRawParameterValue(ParamID::DENSITY_Z)->load());

  // Read per-generator params
  const float genScale    = apvts.getRawParameterValue(ParamID::GEN_SCALE)->load();
  const float genCReal    = apvts.getRawParameterValue(ParamID::GEN_CREAL)->load();
  const float genCImag    = apvts.getRawParameterValue(ParamID::GEN_CIMAG)->load();
  const float genPower    = apvts.getRawParameterValue(ParamID::GEN_POWER)->load();
  const float genIter     = apvts.getRawParameterValue(ParamID::GEN_ITER)->load();
  const float genHole     = apvts.getRawParameterValue(ParamID::GEN_HOLE)->load();
  const float genFreq     = apvts.getRawParameterValue(ParamID::GEN_FREQ)->load();
  const float genComp     = apvts.getRawParameterValue(ParamID::GEN_COMP)->load();
  const float genContrast = apvts.getRawParameterValue(ParamID::GEN_CONTRAST)->load();
  const float genDensity  = apvts.getRawParameterValue(ParamID::GEN_DENSITY)->load();
  const float genBirth    = apvts.getRawParameterValue(ParamID::GEN_BIRTH)->load();
  const float genSurvive  = apvts.getRawParameterValue(ParamID::GEN_SURVIVE)->load();

  const bool genParamsDirty =
      genScale    != lastGenScale_    || genCReal  != lastGenCReal_  ||
      genCImag    != lastGenCImag_    || genPower  != lastGenPower_  ||
      genIter     != lastGenIter_     || genHole   != lastGenHole_   ||
      genFreq     != lastGenFreq_     || genComp   != lastGenComp_   ||
      genContrast != lastGenContrast_ || genDensity != lastGenDensity_ ||
      genBirth    != lastGenBirth_    || genSurvive != lastGenSurvive_;

  lastGenScale_ = genScale; lastGenCReal_ = genCReal;   lastGenCImag_    = genCImag;
  lastGenPower_ = genPower; lastGenIter_  = genIter;    lastGenHole_     = genHole;
  lastGenFreq_  = genFreq;  lastGenComp_  = genComp;    lastGenContrast_ = genContrast;
  lastGenDensity_ = genDensity; lastGenBirth_ = genBirth; lastGenSurvive_ = genSurvive;

  if (gen != lastGenerator_ || resX != lastResX_ || resY != lastResY_ ||
      resZ != lastResZ_ || genParamsDirty) {
    lastGenerator_ = gen;
    lastResX_ = resX;
    lastResY_ = resY;
    lastResZ_ = resZ;
    regenerateVolume();
    animAccum_ = 0.0f;
    genTime_ = 0.0f;
  }

  tickAnimatedGenerators(getSampleRate(), numSamples);
  applyLFOs(getSampleRate(), numSamples);

  float a = apvts.getRawParameterValue(ParamID::ATTACK)->load();
  float d = apvts.getRawParameterValue(ParamID::DECAY)->load();
  float s = apvts.getRawParameterValue(ParamID::SUSTAIN)->load();
  float r = apvts.getRawParameterValue(ParamID::RELEASE)->load();
  adsr_.setParams(a, d, s, r);

  for (const auto meta : midiMessages) {
    auto msg = meta.getMessage();
    if (msg.isNoteOn()) {
      activeNote_ = msg.getNoteNumber();
      noteOn_ = true;
      adsr_.triggerAttack();
    } else if (msg.isNoteOff() && msg.getNoteNumber() == activeNote_) {
      activeNote_ = -1;
      noteOn_ = false;
      adsr_.triggerRelease();
    }
  }

  if (adsrBuf_.size() < (size_t)numSamples) {
    adsrBuf_.resize((size_t)numSamples);
  }
  for (int i = 0; i < numSamples; ++i) {
    adsrBuf_[(size_t)i] = adsr_.advance();
  }

  if (!synth_) {
    buffer.clear();
    return;
  }

  updateSpectralData();

  float mvol = apvts.getRawParameterValue(ParamID::MASTER_VOL)->load();
  for (int i = 0; i < numSamples; ++i) {
    adsrBuf_[(size_t)i] *= mvol;
  }

  auto *outL = buffer.getWritePointer(0);
  auto *outR = (buffer.getNumChannels() > 1) ? buffer.getWritePointer(1) : outL;

  synth_->process(outL, outR, adsrBuf_.data(), numSamples);
}

void PluginProcessor::rebuildSynth(int mode) {
  if (mode == 0)
    synth_ = std::make_unique<SpectralSynth>();
  else if (mode == 1)
    synth_ = std::make_unique<WavetableSynth>();
  else if (mode == 2)
    synth_ = std::make_unique<ChirpSynth>();
  else
    synth_ = std::make_unique<NoiseSynth>();

  currentMode_ = mode;
  if (getSampleRate() > 0) {
    synth_->prepare(getSampleRate(), getBlockSize());
  }
}

void PluginProcessor::applyLFOs(double sampleRate, int numSamples) {
  float r1 = apvts.getRawParameterValue(ParamID::LFO1_RATE)->load();
  float r2 = apvts.getRawParameterValue(ParamID::LFO2_RATE)->load();

  lfo1_.frequency = r1;
  lfo2_.frequency = r2;

  float deltaSeconds = 1.0f / static_cast<float>(sampleRate);
  for (int i = 0; i < numSamples; ++i) {
    lfo1_.advance(deltaSeconds);
    lfo2_.advance(deltaSeconds);
  }
}

void PluginProcessor::importWavFiles(const juce::Array<juce::File>& files) {
  int resX = static_cast<int>(apvts.getRawParameterValue(ParamID::DENSITY_X)->load());
  int resY = static_cast<int>(apvts.getRawParameterValue(ParamID::DENSITY_Y)->load());
  int resZ = static_cast<int>(apvts.getRawParameterValue(ParamID::DENSITY_Z)->load());

  volume = SpectralVolume(VolumeResolution{resX, resY, resZ});
  std::vector<float> newData((size_t)resX * resY * resZ * 4, 0.0f);

  SpectralAnalyzer analyzer;
  analyzer.analyzeFiles(files, volume.getResolution(), newData.data(), [this](float p) {
    loadProgress_.store(p);
  });

  volume.setData(newData.data(), (int)newData.size());

  // Switch generator to 'Imported' (6) so it's not immediately cleared
  apvts.getRawParameterValue(ParamID::GENERATOR)->store(6.0f);
  lastGenerator_ = 6;
}

void PluginProcessor::updateSpectralData() {
  int resX = volume.getResolution().x;
  std::vector<float> path((size_t)resX * 3);

  PlaneType type = static_cast<PlaneType>(static_cast<int>(
      apvts.getRawParameterValue(ParamID::PLANE_TYPE)->load()));
  float scanPos = apvts.getRawParameterValue(ParamID::SCAN_POS)->load();
  float shapePhase = apvts.getRawParameterValue(ParamID::SHAPE_PHASE)->load();
  float pathX = apvts.getRawParameterValue(ParamID::PATH_X)->load();
  float pathY = apvts.getRawParameterValue(ParamID::PATH_Y)->load();
  float pathZ = apvts.getRawParameterValue(ParamID::PATH_Z)->load();
  float rotX = apvts.getRawParameterValue(ParamID::ROT_X)->load();
  float rotY = apvts.getRawParameterValue(ParamID::ROT_Y)->load();
  float rotZ = apvts.getRawParameterValue(ParamID::ROT_Z)->load();

  ReadingPath::generateReadingLine(type, resX, scanPos, shapePhase,
                                   path.data());

  const float rx = rotX * (3.14159265f / 180.0f);
  const float ry = rotY * (3.14159265f / 180.0f);
  const float rz = rotZ * (3.14159265f / 180.0f);
  const float cx = std::cos(rx);
  const float sx = std::sin(rx);
  const float cy = std::cos(ry);
  const float sy = std::sin(ry);
  const float cz = std::cos(rz);
  const float sz = std::sin(rz);

  const float offX = pathX * 2.0f - 1.0f;
  const float offY = pathY * 2.0f - 1.0f;
  const float offZ = pathZ * 2.0f - 1.0f;

  SpectralData sd;
  sd.data.resize((size_t)resX * 4);
  for (size_t i = 0; i < (size_t)resX; ++i) {
    float x = path[i * 3 + 0];
    float y = path[i * 3 + 1];
    float z = path[i * 3 + 2];

    // Rotate around X, then Y, then Z
    float y1 = y * cx - z * sx;
    float z1 = y * sx + z * cx;
    float x2 = x * cy + z1 * sy;
    float z2 = -x * sy + z1 * cy;
    float x3 = x2 * cz - y1 * sz;
    float y3 = x2 * sz + y1 * cz;
    float z3 = z2;

    x = (x3 + offX) * 0.5f + 0.5f;
    y = (y3 + offY) * 0.5f + 0.5f;
    z = (z3 + offZ) * 0.5f + 0.5f;

    x = juce::jlimit(0.0f, 1.0f, x);
    y = juce::jlimit(0.0f, 1.0f, y);
    z = juce::jlimit(0.0f, 1.0f, z);

    volume.sample(x, y, z, &sd.data[i * 4]);
  }

  int shapeMode =
      static_cast<int>(apvts.getRawParameterValue(ParamID::SHAPE_MODE)->load());
  float shapeAmount = apvts.getRawParameterValue(ParamID::SHAPE_AMOUNT)->load();

  if (shapeMode > 0 && shapeAmount > 0.001f) {
    for (size_t i = 0; i < (size_t)resX; ++i) {
      float mag = sd.data[i * 4];
      if (shapeMode == 1) { // Compression
        float comp = (mag < 0.0f ? -1.0f : 1.0f) * std::sqrt(std::abs(mag));
        mag = mag * (1.0f - shapeAmount) + comp * shapeAmount;
      } else if (shapeMode == 2) { // Soft Clip
        float drive = 1.0f + shapeAmount * 10.0f;
        mag = std::tanh(mag * drive) / std::tanh(drive);
      }
      sd.data[i * 4] = mag;
    }
  }

  SynthParams sp;
  sp.frequencyMultiplier =
      apvts.getRawParameterValue(ParamID::FREQ_MUL)->load();
  sp.wavetableFrequency = apvts.getRawParameterValue(ParamID::WT_FREQ)->load();
  sp.carrierType =
      static_cast<int>(apvts.getRawParameterValue(ParamID::CARRIER)->load());
  sp.feedback = apvts.getRawParameterValue(ParamID::FEEDBACK)->load();
  sp.octave.lowCount =
      static_cast<int>(apvts.getRawParameterValue(ParamID::OCT_LOW)->load());
  sp.octave.highCount =
      static_cast<int>(apvts.getRawParameterValue(ParamID::OCT_HIGH)->load());
  sp.octave.multiplier = apvts.getRawParameterValue(ParamID::OCT_MULT)->load();
  sp.harmonic.count =
      static_cast<int>(apvts.getRawParameterValue(ParamID::HARM_COUNT)->load());
  sp.harmonic.falloff =
      apvts.getRawParameterValue(ParamID::HARM_FALLOFF)->load();
  sp.copy.shiftSemitones =
      static_cast<int>(apvts.getRawParameterValue(ParamID::COPY_SHIFT)->load());
  sp.copy.mix = apvts.getRawParameterValue(ParamID::COPY_MIX)->load();
  sp.interpSamples = static_cast<int>(
      apvts.getRawParameterValue(ParamID::INTERP_SAMPLES)->load());

  synth_->pushSpectralData(sd, sp);
}

juce::AudioProcessorEditor *PluginProcessor::createEditor() {
  return new PluginEditor(*this);
}

void PluginProcessor::getStateInformation(juce::MemoryBlock &dest) {
  // Save UI state
  auto state = apvts.copyState();
  std::unique_ptr<juce::XmlElement> xml(state.createXml());
  copyXmlToBinary(*xml, dest);
}

void PluginProcessor::setStateInformation(const void *data, int sizeInBytes) {
  // Restore UI state
  std::unique_ptr<juce::XmlElement> xmlState(
      getXmlFromBinary(data, sizeInBytes));
  if (xmlState.get() != nullptr &&
      xmlState->hasTagName(apvts.state.getType())) {
    apvts.replaceState(juce::ValueTree::fromXml(*xmlState));
  }
}

void PluginProcessor::regenerateVolume() {
  int resX =
      static_cast<int>(apvts.getRawParameterValue(ParamID::DENSITY_X)->load());
  int resY =
      static_cast<int>(apvts.getRawParameterValue(ParamID::DENSITY_Y)->load());
  int resZ =
      static_cast<int>(apvts.getRawParameterValue(ParamID::DENSITY_Z)->load());

  volume = SpectralVolume(VolumeResolution{resX, resY, resZ});

  const int gen =
      static_cast<int>(apvts.getRawParameterValue(ParamID::GENERATOR)->load());

  const float scale    = apvts.getRawParameterValue(ParamID::GEN_SCALE)->load();
  const float cReal    = apvts.getRawParameterValue(ParamID::GEN_CREAL)->load();
  const float cImag    = apvts.getRawParameterValue(ParamID::GEN_CIMAG)->load();
  const float power    = apvts.getRawParameterValue(ParamID::GEN_POWER)->load();
  const float iter     = apvts.getRawParameterValue(ParamID::GEN_ITER)->load();
  const float hole     = apvts.getRawParameterValue(ParamID::GEN_HOLE)->load();
  const float freq     = apvts.getRawParameterValue(ParamID::GEN_FREQ)->load();
  const float comp     = apvts.getRawParameterValue(ParamID::GEN_COMP)->load();
  const float contrast = apvts.getRawParameterValue(ParamID::GEN_CONTRAST)->load();
  const float density  = apvts.getRawParameterValue(ParamID::GEN_DENSITY)->load();
  const float birth    = apvts.getRawParameterValue(ParamID::GEN_BIRTH)->load();
  const float survive  = apvts.getRawParameterValue(ParamID::GEN_SURVIVE)->load();

  switch (gen) {
  case 0:
    volume.generate3DJulia(JuliaParams{scale, cReal, cImag});
    break;
  case 1:
    volume.generateMandelbulb(MandelbulbParams{power, scale, iter});
    break;
  case 2:
    volume.generateMengerSponge(MengerParams{iter, scale, hole});
    break;
  case 3:
    volume.generateSinePlasma(0.0f, PlasmaParams{freq, comp, contrast});
    break;
  case 4:
    volume.initGameOfLife(GameOfLifeParams{
        density,
        static_cast<int>(birth),
        static_cast<int>(survive)});
    break;
  case 5:
  default:
    volume.clearData();
    break;
  case 6: // Imported - do nothing (keep current volume data)
    break;
  }
}

void PluginProcessor::tickAnimatedGenerators(double sampleRate, int numSamples) {
  // Only Sine Plasma (3) and Game of Life (4) animate.
  if (lastGenerator_ != 3 && lastGenerator_ != 4)
    return;

  const float speed = apvts.getRawParameterValue(ParamID::GEN_SPEED)->load();
  // speed = ticks per second; 0 = frozen
  if (speed <= 0.0f)
    return;

  animAccum_ += static_cast<float>(numSamples) / static_cast<float>(sampleRate);
  const float tickPeriod = 1.0f / speed;

  while (animAccum_ >= tickPeriod) {
    animAccum_ -= tickPeriod;
    if (lastGenerator_ == 3) {
      genTime_ += tickPeriod;
      const float freq     = apvts.getRawParameterValue(ParamID::GEN_FREQ)->load();
      const float comp     = apvts.getRawParameterValue(ParamID::GEN_COMP)->load();
      const float contrast = apvts.getRawParameterValue(ParamID::GEN_CONTRAST)->load();
      volume.generateSinePlasma(genTime_, PlasmaParams{freq, comp, contrast});
    } else {
      volume.stepGameOfLife();
    }
  }
}

void PluginProcessor::addMidiEventToQueue(const juce::MidiMessage &message) {
  const juce::ScopedLock lock(midiQueueLock_);
  midiEventQueue_.addEvent(message, 0); // Sample position 0 - will be processed immediately
}

juce::AudioProcessor *JUCE_CALLTYPE createPluginFilter() {
  return new PluginProcessor();
}
