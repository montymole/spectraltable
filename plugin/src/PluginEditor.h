#pragma once
#include "PluginProcessor.h"
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

private:
  PluginProcessor &audioProcessor;

  VisualizerPanel spectralCube{"Spectral Cube (3D)"};
  VisualizerPanel spectrogram{"Spectrogram (2D)"};
  VisualizerPanel scope{"Scope (Audio)"};

  juce::GenericAudioProcessorEditor genericEditor;

  JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(PluginEditor)
};
