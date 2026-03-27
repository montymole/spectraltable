#pragma once
#include "dsp/ADSR.h"
#include "dsp/LFO.h"
#include "dsp/SpectralVolume.h"
#include "dsp/SynthEngine.h"
#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_dsp/juce_dsp.h>
#include <juce_gui_extra/juce_gui_extra.h>
#include <memory>

// All parameter IDs – referenced from both processor and editor
namespace ParamID {
inline constexpr const char *SYNTH_MODE = "synthMode";
inline constexpr const char *PATH_X = "pathX";
inline constexpr const char *PATH_Y = "pathY";
inline constexpr const char *PATH_Z = "pathZ";
inline constexpr const char *SCAN_POS = "scanPos";
inline constexpr const char *SHAPE_PHASE = "shapePhase";
inline constexpr const char *PLANE_TYPE = "planeType";
inline constexpr const char *ROT_X = "rotX";
inline constexpr const char *ROT_Y = "rotY";
inline constexpr const char *ROT_Z = "rotZ";
inline constexpr const char *DENSITY_X = "densityX";
inline constexpr const char *DENSITY_Y = "densityY";
inline constexpr const char *DENSITY_Z = "densityZ";
inline constexpr const char *FREQ_MUL = "freqMul";
inline constexpr const char *WT_FREQ = "wtFreq";
inline constexpr const char *CARRIER = "carrier";
inline constexpr const char *FEEDBACK = "feedback";
inline constexpr const char *ATTACK = "attack";
inline constexpr const char *DECAY = "decay";
inline constexpr const char *SUSTAIN = "sustain";
inline constexpr const char *RELEASE = "release";
inline constexpr const char *MASTER_VOL = "masterVol";
inline constexpr const char *OCT_LOW = "octLow";
inline constexpr const char *OCT_HIGH = "octHigh";
inline constexpr const char *OCT_MULT = "octMult";
inline constexpr const char *HARM_COUNT = "harmCount";
inline constexpr const char *HARM_FALLOFF = "harmFalloff";
inline constexpr const char *COPY_SHIFT = "copyShift";
inline constexpr const char *COPY_MIX = "copyMix";
inline constexpr const char *INTERP_SAMPLES = "interpSamples";
inline constexpr const char *LFO1_RATE = "lfo1Rate";
inline constexpr const char *LFO1_AMP = "lfo1Amp";
inline constexpr const char *LFO1_TARGET = "lfo1Target";
inline constexpr const char *LFO2_RATE = "lfo2Rate";
inline constexpr const char *LFO2_AMP = "lfo2Amp";
inline constexpr const char *LFO2_TARGET = "lfo2Target";
inline constexpr const char *GENERATOR = "generator";
inline constexpr const char *BPM = "bpm";
inline constexpr const char *SHAPE_MODE = "shapeMode";
inline constexpr const char *SHAPE_AMOUNT = "shapeAmount";

// Generator Params
inline constexpr const char *GEN_SCALE = "genScale";
inline constexpr const char *GEN_CREAL = "genCReal";
inline constexpr const char *GEN_CIMAG = "genCImag";
inline constexpr const char *GEN_POWER = "genPower";
inline constexpr const char *GEN_ITER = "genIter";
inline constexpr const char *GEN_HOLE = "genHole";
inline constexpr const char *GEN_FREQ = "genFreq";
inline constexpr const char *GEN_COMP = "genComp";
inline constexpr const char *GEN_CONTRAST = "genContrast";
inline constexpr const char *GEN_DENSITY = "genDensity";
inline constexpr const char *GEN_BIRTH = "genBirth";
inline constexpr const char *GEN_SURVIVE = "genSurvive";
inline constexpr const char *GEN_SPEED = "genSpeed";
} // namespace ParamID

class PluginProcessor : public juce::AudioProcessor {
public:
  PluginProcessor();
  ~PluginProcessor() override = default;

  // AudioProcessor overrides
  void prepareToPlay(double sampleRate, int samplesPerBlock) override;
  void releaseResources() override {}
  void processBlock(juce::AudioBuffer<float> &, juce::MidiBuffer &) override;

  juce::AudioProcessorEditor *createEditor() override;
  bool hasEditor() const override { return true; }

  const juce::String getName() const override { return "Spectra Table"; }
  bool acceptsMidi() const override { return true; }
  bool producesMidi() const override { return false; }
  bool isMidiEffect() const override { return false; }
  double getTailLengthSeconds() const override { return 2.0; }

  int getNumPrograms() override { return 1; }
  int getCurrentProgram() override { return 0; }
  void setCurrentProgram(int) override {}
  const juce::String getProgramName(int) override { return "Default"; }
  void changeProgramName(int, const juce::String &) override {}

  void getStateInformation(juce::MemoryBlock &dest) override;
  void setStateInformation(const void *data, int sizeInBytes) override;

  bool isBusesLayoutSupported(const BusesLayout &layouts) const override {
    return layouts.getMainOutputChannelSet() == juce::AudioChannelSet::stereo();
  }

  // APVTS
  juce::AudioProcessorValueTreeState apvts;
  static juce::AudioProcessorValueTreeState::ParameterLayout
  createParameterLayout();

  // Spectral volume — public so editor can trigger regeneration
  SpectralVolume volume{VolumeResolution{64, 2, 128}};

  void importWavFiles(const juce::Array<juce::File>& files);
  std::atomic<float> loadProgress_{0.0f};

private:
  // Current active synth backend
  std::unique_ptr<SynthBase> synth_;
  int currentMode_ = 0;

  // MIDI state
  int activeNote_ = -1;
  bool noteOn_ = false;

  // Envelope
  ADSR adsr_;

  // LFOs
  LFO lfo1_, lfo2_;

  // ADSR gain scratch buffer
  std::vector<float> adsrBuf_;

  void rebuildSynth(int mode);
  void applyLFOs(double sampleRate, int numSamples);
  void updateSpectralData();
  void regenerateVolume();

  int lastGenerator_ = -1;
  int lastResX_ = -1;
  int lastResY_ = -1;
  int lastResZ_ = -1;

  // Per-generator param snapshots for change detection
  float lastGenScale_ = -1.0f, lastGenCReal_ = -1.0f, lastGenCImag_ = -1.0f;
  float lastGenPower_ = -1.0f, lastGenIter_ = -1.0f, lastGenHole_ = -1.0f;
  float lastGenFreq_ = -1.0f, lastGenComp_ = -1.0f, lastGenContrast_ = -1.0f;
  float lastGenDensity_ = -1.0f, lastGenBirth_ = -1.0f, lastGenSurvive_ = -1.0f;

  // Animation: accumulated seconds since last tick (Plasma / GoL)
  float animAccum_ = 0.0f;
  float genTime_ = 0.0f;
  void tickAnimatedGenerators(double sampleRate, int numSamples);

  JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(PluginProcessor)
};
