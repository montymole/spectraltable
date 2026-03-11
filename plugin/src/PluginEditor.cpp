#include "PluginEditor.h"
#include "PluginProcessor.h"

PluginEditor::PluginEditor(PluginProcessor &p)
    : juce::AudioProcessorEditor(&p), audioProcessor(p), genericEditor(p) {

  (void)audioProcessor; // silence unused warning until custom params are hooked
                        // up

  addAndMakeVisible(spectralCube);
  addAndMakeVisible(spectrogram);
  addAndMakeVisible(scope);
  addAndMakeVisible(genericEditor);

  setSize(900, 600);
  setResizable(true, true);
}

PluginEditor::~PluginEditor() {}

void PluginEditor::paint(juce::Graphics &g) {
  g.fillAll(juce::Colour(0xff181818)); // Main background
}

void PluginEditor::resized() {
  auto bounds = getLocalBounds();

  // Example split: 50% left for visuals, 50% right for controls
  auto leftPanel = bounds.removeFromLeft(bounds.getWidth() / 2);

  // Right panel is the GenericEditor for now
  genericEditor.setBounds(bounds);

  // Split left panel into 3 equal height rows
  int th = leftPanel.getHeight() / 3;
  spectralCube.setBounds(leftPanel.removeFromTop(th).reduced(4));
  spectrogram.setBounds(leftPanel.removeFromTop(th).reduced(4));
  scope.setBounds(leftPanel.reduced(4));
}
