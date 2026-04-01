#pragma once
#include "PluginProcessor.h"
#include "ui/SpectralCubePanel.h"
#include "ui/PianoKeyboard.h"
#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_gui_basics/juce_gui_basics.h>

class VisualizerPanel : public juce::Component {
public:
  VisualizerPanel(const juce::String &name) : name_(name) {}

  void paint(juce::Graphics &g) override {
    g.fillAll(juce::Colour(0xff121212)); // dark background
    g.setColour(juce::Colour(0xff333333));
    g.drawRect(getLocalBounds(), 2);

    g.setColour(juce::Colours::white);
    g.setFont(18.0f);
    g.drawText(name_, getLocalBounds(), juce::Justification::centred, false);
  }

private:
  juce::String name_;
};

class PluginEditor : public juce::AudioProcessorEditor {
public:
  PluginEditor(PluginProcessor &);
  ~PluginEditor() override;

  void paint(juce::Graphics &) override;
  void resized() override;

public:
  // Method to handle MIDI events from piano keyboard
  void handlePianoMidiEvent(const juce::MidiMessage &message);

private:
  juce::AudioProcessorValueTreeState &apvts_;
  PluginProcessor &processor_;

  SpectralCubePanel spectralCube;
  VisualizerPanel spectrogram{"Spectrogram (2D)"};
  VisualizerPanel scope{"Scope (Audio)"};

  // Basic controls panel (custom UI skeleton)
  juce::Viewport controlsViewport;
  juce::Component controlsContent;

  juce::Label synthModeLabel;
  juce::ComboBox synthModeBox;
  std::unique_ptr<juce::AudioProcessorValueTreeState::ComboBoxAttachment>
      synthModeAttachment;

  juce::Label pathYLabel;
  juce::Slider pathYSlider;
  std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment>
      pathYAttachment;

  juce::Label scanPosLabel;
  juce::Slider scanPosSlider;
  std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment>
      scanPosAttachment;

  juce::Label shapePhaseLabel;
  juce::Slider shapePhaseSlider;
  std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment>
      shapePhaseAttachment;

  juce::Label planeTypeLabel;
  juce::ComboBox planeTypeBox;
  std::unique_ptr<juce::AudioProcessorValueTreeState::ComboBoxAttachment>
      planeTypeAttachment;

  juce::Label dataSourceLabel;
  juce::ComboBox dataSourceBox;
  std::unique_ptr<juce::AudioProcessorValueTreeState::ComboBoxAttachment>
      dataSourceAttachment;

  juce::Label pathXLabel;
  juce::Slider pathXSlider;
  std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment>
      pathXAttachment;

  juce::Label freqMulLabel;
  juce::Slider freqMulSlider;
  std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment>
      freqMulAttachment;

  juce::Label wtFreqLabel;
  juce::Slider wtFreqSlider;
  std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment>
      wtFreqAttachment;

  juce::Label carrierLabel;
  juce::ComboBox carrierBox;
  std::unique_ptr<juce::AudioProcessorValueTreeState::ComboBoxAttachment>
      carrierAttachment;

  juce::Label feedbackLabel;
  juce::Slider feedbackSlider;
  std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment>
      feedbackAttachment;

  juce::Label attackLabel;
  juce::Slider attackSlider;
  std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment>
      attackAttachment;

  juce::Label decayLabel;
  juce::Slider decaySlider;
  std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment>
      decayAttachment;

  juce::Label sustainLabel;
  juce::Slider sustainSlider;
  std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment>
      sustainAttachment;

  juce::Label releaseLabel;
  juce::Slider releaseSlider;
  std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment>
      releaseAttachment;

  juce::Label masterVolLabel;
  juce::Slider masterVolSlider;
  std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment>
      masterVolAttachment;

  juce::Label pathZLabel;
  juce::Slider pathZSlider;
  std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment>
      pathZAttachment;

  juce::Label rotXLabel;
  juce::Slider rotXSlider;
  std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment>
      rotXAttachment;

  juce::Label rotYLabel;
  juce::Slider rotYSlider;
  std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment>
      rotYAttachment;

  juce::Label rotZLabel;
  juce::Slider rotZSlider;
  std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment>
      rotZAttachment;

  juce::Label densityXLabel;
  juce::Slider densityXSlider;
  std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment>
      densityXAttachment;

  juce::Label densityYLabel;
  juce::Slider densityYSlider;
  std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment>
      densityYAttachment;

  juce::Label densityZLabel;
  juce::Slider densityZSlider;
  std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment>
      densityZAttachment;

  juce::Label octLowLabel;
  juce::Slider octLowSlider;
  std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment>
      octLowAttachment;

  juce::Label octHighLabel;
  juce::Slider octHighSlider;
  std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment>
      octHighAttachment;

  juce::Label octMultLabel;
  juce::Slider octMultSlider;
  std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment>
      octMultAttachment;

  juce::Label harmCountLabel;
  juce::Slider harmCountSlider;
  std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment>
      harmCountAttachment;

  juce::Label harmFalloffLabel;
  juce::Slider harmFalloffSlider;
  std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment>
      harmFalloffAttachment;

  juce::Label copyShiftLabel;
  juce::Slider copyShiftSlider;
  std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment>
      copyShiftAttachment;

  juce::Label copyMixLabel;
  juce::Slider copyMixSlider;
  std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment>
      copyMixAttachment;

  juce::Label shapeModeLabel;
  juce::ComboBox shapeModeBox;
  std::unique_ptr<juce::AudioProcessorValueTreeState::ComboBoxAttachment>
      shapeModeAttachment;

  juce::Label shapeAmountLabel;
  juce::Slider shapeAmountSlider;
  std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment>
      shapeAmountAttachment;

  juce::Label interpSamplesLabel;
  juce::Slider interpSamplesSlider;
  std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment>
      interpSamplesAttachment;

  juce::Label lfo1RateLabel;
  juce::Slider lfo1RateSlider;
  std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment>
      lfo1RateAttachment;

  juce::Label lfo1AmpLabel;
  juce::Slider lfo1AmpSlider;
  std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment>
      lfo1AmpAttachment;

  juce::Label lfo1TargetLabel;
  juce::ComboBox lfo1TargetBox;
  std::unique_ptr<juce::AudioProcessorValueTreeState::ComboBoxAttachment>
      lfo1TargetAttachment;

  juce::Label lfo2RateLabel;
  juce::Slider lfo2RateSlider;
  std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment>
      lfo2RateAttachment;

  juce::Label lfo2AmpLabel;
  juce::Slider lfo2AmpSlider;
  std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment>
      lfo2AmpAttachment;

  juce::Label lfo2TargetLabel;
  juce::ComboBox lfo2TargetBox;
  std::unique_ptr<juce::AudioProcessorValueTreeState::ComboBoxAttachment>
      lfo2TargetAttachment;

  juce::Label bpmLabel;
  juce::Slider bpmSlider;
  std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment>
      bpmAttachment;

  juce::Label vizLabel;
  juce::ToggleButton wireToggle;
  juce::ToggleButton pointsToggle;
  juce::ToggleButton lineToggle;
  juce::ToggleButton planeToggle;
  juce::TextButton resetButton{"Reset to Defaults"};
  juce::TextButton importButton{"Import WAV..."};
  std::unique_ptr<juce::FileChooser> fileChooser;

  // Piano Keyboard
  PianoKeyboard pianoKeyboard;

  // ---- Dynamic generator parameter controls ----
  // Section header
  juce::Label genParamLabel;

  // Julia (gen=0): scale, cReal, cImag
  juce::Label genScaleLabel;
  juce::Slider genScaleSlider;
  std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment> genScaleAttachment;
  juce::Label genCRealLabel;
  juce::Slider genCRealSlider;
  std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment> genCRealAttachment;
  juce::Label genCImagLabel;
  juce::Slider genCImagSlider;
  std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment> genCImagAttachment;

  // Mandelbulb (gen=1): power, iter (share scale above)
  juce::Label genPowerLabel;
  juce::Slider genPowerSlider;
  std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment> genPowerAttachment;
  juce::Label genIterLabel;
  juce::Slider genIterSlider;
  std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment> genIterAttachment;

  // Menger (gen=2): hole (share scale+iter above)
  juce::Label genHoleLabel;
  juce::Slider genHoleSlider;
  std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment> genHoleAttachment;

  // Plasma (gen=3): freq, comp, contrast
  juce::Label genFreqLabel;
  juce::Slider genFreqSlider;
  std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment> genFreqAttachment;
  juce::Label genCompLabel;
  juce::Slider genCompSlider;
  std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment> genCompAttachment;
  juce::Label genContrastLabel;
  juce::Slider genContrastSlider;
  std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment> genContrastAttachment;

  // GoL (gen=4): density, birth, survive
  juce::Label genDensityLabel;
  juce::Slider genDensitySlider;
  std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment> genDensityAttachment;
  juce::Label genBirthLabel;
  juce::Slider genBirthSlider;
  std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment> genBirthAttachment;
  juce::Label genSurviveLabel;
  juce::Slider genSurviveSlider;
  std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment> genSurviveAttachment;

  // Animated (gen=3 + gen=4): speed
  juce::Label genSpeedLabel;
  juce::Slider genSpeedSlider;
  std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment> genSpeedAttachment;

  void initControls();
  void updateGenParamVisibility(int gen);
  void styleLabel(juce::Label &label, const juce::String &text);
  void styleSlider(juce::Slider &slider);
  void styleCombo(juce::ComboBox &box);

  JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(PluginEditor)
};
