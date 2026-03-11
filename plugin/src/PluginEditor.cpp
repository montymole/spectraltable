#include "PluginEditor.h"
#include "PluginProcessor.h"

PluginEditor::PluginEditor(PluginProcessor &p)
    : juce::AudioProcessorEditor(&p), apvts_(p.apvts), spectralCube(p) {
  addAndMakeVisible(spectralCube);
  addAndMakeVisible(spectrogram);
  addAndMakeVisible(scope);
  addAndMakeVisible(controlsViewport);

  controlsViewport.setViewedComponent(&controlsContent, false);
  controlsViewport.setScrollBarsShown(true, false);

  initControls();

  setSize(1100, 700);
  setResizable(true, true);
}

PluginEditor::~PluginEditor() {}

void PluginEditor::paint(juce::Graphics &g) {
  g.fillAll(juce::Colour(0xff181818)); // Main background
}

void PluginEditor::resized() {
  auto bounds = getLocalBounds();

  // 55% left for visuals, 45% right for controls
  auto leftPanel = bounds.removeFromLeft((int)(bounds.getWidth() * 0.55f));

  auto controlArea = bounds.reduced(10);
  controlsViewport.setBounds(controlArea);

  const int labelWidth = 130;
  const int rowGap = 6;
  int y = 0;
  const int contentWidth = controlArea.getWidth();

  auto row = [&](juce::Label &label, juce::Component &comp, int height) {
    label.setBounds(0, y, labelWidth, height);
    comp.setBounds(labelWidth + 10, y, contentWidth - labelWidth - 10, height);
    y += height + rowGap;
  };

  auto rowNoLabel = [&](juce::Component &comp, int height) {
    comp.setBounds(labelWidth + 10, y, contentWidth - labelWidth - 10, height);
    y += height + rowGap;
  };

  row(synthModeLabel, synthModeBox, 28);
  row(dataSourceLabel, dataSourceBox, 28);
  row(densityXLabel, densityXSlider, 90);
  row(densityYLabel, densityYSlider, 90);
  row(densityZLabel, densityZSlider, 90);
  row(planeTypeLabel, planeTypeBox, 28);
  row(pathXLabel, pathXSlider, 90);
  row(pathYLabel, pathYSlider, 90);
  row(pathZLabel, pathZSlider, 90);
  row(rotXLabel, rotXSlider, 90);
  row(rotYLabel, rotYSlider, 90);
  row(rotZLabel, rotZSlider, 90);
  row(scanPosLabel, scanPosSlider, 90);
  row(shapePhaseLabel, shapePhaseSlider, 90);
  row(shapeModeLabel, shapeModeBox, 28);
  row(shapeAmountLabel, shapeAmountSlider, 90);
  row(interpSamplesLabel, interpSamplesSlider, 90);
  row(freqMulLabel, freqMulSlider, 90);
  row(wtFreqLabel, wtFreqSlider, 90);
  row(carrierLabel, carrierBox, 28);
  row(feedbackLabel, feedbackSlider, 90);
  row(octLowLabel, octLowSlider, 90);
  row(octHighLabel, octHighSlider, 90);
  row(octMultLabel, octMultSlider, 90);
  row(harmCountLabel, harmCountSlider, 90);
  row(harmFalloffLabel, harmFalloffSlider, 90);
  row(copyShiftLabel, copyShiftSlider, 90);
  row(copyMixLabel, copyMixSlider, 90);
  row(lfo1RateLabel, lfo1RateSlider, 90);
  row(lfo1AmpLabel, lfo1AmpSlider, 90);
  row(lfo1TargetLabel, lfo1TargetBox, 28);
  row(lfo2RateLabel, lfo2RateSlider, 90);
  row(lfo2AmpLabel, lfo2AmpSlider, 90);
  row(lfo2TargetLabel, lfo2TargetBox, 28);
  row(bpmLabel, bpmSlider, 90);
  row(vizLabel, wireToggle, 28);
  rowNoLabel(pointsToggle, 28);
  rowNoLabel(lineToggle, 28);
  row(attackLabel, attackSlider, 90);
  row(decayLabel, decaySlider, 90);
  row(sustainLabel, sustainSlider, 90);
  row(releaseLabel, releaseSlider, 90);
  row(masterVolLabel, masterVolSlider, 90);

  controlsContent.setSize(contentWidth, y);

  // Split left panel into 3 equal height rows
  int th = leftPanel.getHeight() / 3;
  spectralCube.setBounds(leftPanel.removeFromTop(th).reduced(4));
  spectrogram.setBounds(leftPanel.removeFromTop(th).reduced(4));
  scope.setBounds(leftPanel.reduced(4));
}

void PluginEditor::initControls() {
  auto addLabeled = [&](juce::Label &label, juce::Component &comp) {
    controlsContent.addAndMakeVisible(label);
    controlsContent.addAndMakeVisible(comp);
  };

  styleLabel(synthModeLabel, "Synth Mode");
  synthModeBox.addItem("Spectral", 1);
  synthModeBox.addItem("Wavetable", 2);
  synthModeBox.addItem("Chirp Spectral", 3);
  synthModeBox.addItem("Noise", 4);
  styleCombo(synthModeBox);
  synthModeAttachment = std::make_unique<juce::AudioProcessorValueTreeState::ComboBoxAttachment>(
      apvts_, ParamID::SYNTH_MODE, synthModeBox);
  addLabeled(synthModeLabel, synthModeBox);

  styleLabel(dataSourceLabel, "Data Source");
  dataSourceBox.addItem("3D Julia", 1);
  dataSourceBox.addItem("Mandelbulb", 2);
  dataSourceBox.addItem("Menger Sponge", 3);
  dataSourceBox.addItem("Sine Plasma", 4);
  dataSourceBox.addItem("Game of Life", 5);
  dataSourceBox.addItem("Empty", 6);
  styleCombo(dataSourceBox);
  dataSourceAttachment =
      std::make_unique<juce::AudioProcessorValueTreeState::ComboBoxAttachment>(
          apvts_, ParamID::GENERATOR, dataSourceBox);
  addLabeled(dataSourceLabel, dataSourceBox);

  styleLabel(pathXLabel, "Path X");
  styleSlider(pathXSlider);
  pathXAttachment = std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment>(
      apvts_, ParamID::PATH_X, pathXSlider);
  addLabeled(pathXLabel, pathXSlider);

  styleLabel(pathYLabel, "Path Y");
  styleSlider(pathYSlider);
  pathYAttachment = std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment>(
      apvts_, ParamID::PATH_Y, pathYSlider);
  addLabeled(pathYLabel, pathYSlider);

  styleLabel(pathZLabel, "Path Z");
  styleSlider(pathZSlider);
  pathZAttachment = std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment>(
      apvts_, ParamID::PATH_Z, pathZSlider);
  addLabeled(pathZLabel, pathZSlider);

  styleLabel(scanPosLabel, "Scan Phase");
  styleSlider(scanPosSlider);
  scanPosAttachment = std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment>(
      apvts_, ParamID::SCAN_POS, scanPosSlider);
  addLabeled(scanPosLabel, scanPosSlider);

  styleLabel(shapePhaseLabel, "Shape Phase");
  styleSlider(shapePhaseSlider);
  shapePhaseAttachment =
      std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment>(
          apvts_, ParamID::SHAPE_PHASE, shapePhaseSlider);
  addLabeled(shapePhaseLabel, shapePhaseSlider);

  styleLabel(rotXLabel, "Rot X");
  styleSlider(rotXSlider);
  rotXAttachment =
      std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment>(
          apvts_, ParamID::ROT_X, rotXSlider);
  addLabeled(rotXLabel, rotXSlider);

  styleLabel(rotYLabel, "Rot Y");
  styleSlider(rotYSlider);
  rotYAttachment =
      std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment>(
          apvts_, ParamID::ROT_Y, rotYSlider);
  addLabeled(rotYLabel, rotYSlider);

  styleLabel(rotZLabel, "Rot Z");
  styleSlider(rotZSlider);
  rotZAttachment =
      std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment>(
          apvts_, ParamID::ROT_Z, rotZSlider);
  addLabeled(rotZLabel, rotZSlider);

  styleLabel(densityXLabel, "Density X");
  styleSlider(densityXSlider);
  densityXAttachment =
      std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment>(
          apvts_, ParamID::DENSITY_X, densityXSlider);
  addLabeled(densityXLabel, densityXSlider);

  styleLabel(densityYLabel, "Density Y");
  styleSlider(densityYSlider);
  densityYAttachment =
      std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment>(
          apvts_, ParamID::DENSITY_Y, densityYSlider);
  addLabeled(densityYLabel, densityYSlider);

  styleLabel(densityZLabel, "Density Z");
  styleSlider(densityZSlider);
  densityZAttachment =
      std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment>(
          apvts_, ParamID::DENSITY_Z, densityZSlider);
  addLabeled(densityZLabel, densityZSlider);

  styleLabel(shapeModeLabel, "Shape Mode");
  shapeModeBox.addItem("None", 1);
  shapeModeBox.addItem("Compression", 2);
  shapeModeBox.addItem("Soft Clip", 3);
  styleCombo(shapeModeBox);
  shapeModeAttachment =
      std::make_unique<juce::AudioProcessorValueTreeState::ComboBoxAttachment>(
          apvts_, ParamID::SHAPE_MODE, shapeModeBox);
  addLabeled(shapeModeLabel, shapeModeBox);

  styleLabel(shapeAmountLabel, "Shape Amount");
  styleSlider(shapeAmountSlider);
  shapeAmountAttachment =
      std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment>(
          apvts_, ParamID::SHAPE_AMOUNT, shapeAmountSlider);
  addLabeled(shapeAmountLabel, shapeAmountSlider);

  styleLabel(interpSamplesLabel, "Interp Samples");
  styleSlider(interpSamplesSlider);
  interpSamplesAttachment =
      std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment>(
          apvts_, ParamID::INTERP_SAMPLES, interpSamplesSlider);
  addLabeled(interpSamplesLabel, interpSamplesSlider);

  styleLabel(planeTypeLabel, "Plane Type");
  planeTypeBox.addItem("Flat", 1);
  planeTypeBox.addItem("SinCos", 2);
  planeTypeBox.addItem("Wave", 3);
  planeTypeBox.addItem("Ripple", 4);
  planeTypeBox.addItem("Tube", 5);
  planeTypeBox.addItem("Bell", 6);
  planeTypeBox.addItem("Spiral", 7);
  planeTypeBox.addItem("Spring", 8);
  styleCombo(planeTypeBox);
  planeTypeAttachment =
      std::make_unique<juce::AudioProcessorValueTreeState::ComboBoxAttachment>(
          apvts_, ParamID::PLANE_TYPE, planeTypeBox);
  addLabeled(planeTypeLabel, planeTypeBox);

  styleLabel(freqMulLabel, "Freq Mult");
  styleSlider(freqMulSlider);
  freqMulAttachment =
      std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment>(
          apvts_, ParamID::FREQ_MUL, freqMulSlider);
  addLabeled(freqMulLabel, freqMulSlider);

  styleLabel(wtFreqLabel, "WT Freq");
  styleSlider(wtFreqSlider);
  wtFreqAttachment =
      std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment>(
          apvts_, ParamID::WT_FREQ, wtFreqSlider);
  addLabeled(wtFreqLabel, wtFreqSlider);

  styleLabel(carrierLabel, "Carrier");
  carrierBox.addItem("Sine", 1);
  carrierBox.addItem("Saw", 2);
  carrierBox.addItem("Square", 3);
  carrierBox.addItem("Triangle", 4);
  styleCombo(carrierBox);
  carrierAttachment =
      std::make_unique<juce::AudioProcessorValueTreeState::ComboBoxAttachment>(
          apvts_, ParamID::CARRIER, carrierBox);
  addLabeled(carrierLabel, carrierBox);

  styleLabel(feedbackLabel, "Feedback");
  styleSlider(feedbackSlider);
  feedbackAttachment =
      std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment>(
          apvts_, ParamID::FEEDBACK, feedbackSlider);
  addLabeled(feedbackLabel, feedbackSlider);

  styleLabel(octLowLabel, "Oct Low");
  styleSlider(octLowSlider);
  octLowAttachment =
      std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment>(
          apvts_, ParamID::OCT_LOW, octLowSlider);
  addLabeled(octLowLabel, octLowSlider);

  styleLabel(octHighLabel, "Oct High");
  styleSlider(octHighSlider);
  octHighAttachment =
      std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment>(
          apvts_, ParamID::OCT_HIGH, octHighSlider);
  addLabeled(octHighLabel, octHighSlider);

  styleLabel(octMultLabel, "Oct Mult");
  styleSlider(octMultSlider);
  octMultAttachment =
      std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment>(
          apvts_, ParamID::OCT_MULT, octMultSlider);
  addLabeled(octMultLabel, octMultSlider);

  styleLabel(harmCountLabel, "Harm Count");
  styleSlider(harmCountSlider);
  harmCountAttachment =
      std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment>(
          apvts_, ParamID::HARM_COUNT, harmCountSlider);
  addLabeled(harmCountLabel, harmCountSlider);

  styleLabel(harmFalloffLabel, "Harm Falloff");
  styleSlider(harmFalloffSlider);
  harmFalloffAttachment =
      std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment>(
          apvts_, ParamID::HARM_FALLOFF, harmFalloffSlider);
  addLabeled(harmFalloffLabel, harmFalloffSlider);

  styleLabel(copyShiftLabel, "Copy Shift");
  styleSlider(copyShiftSlider);
  copyShiftAttachment =
      std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment>(
          apvts_, ParamID::COPY_SHIFT, copyShiftSlider);
  addLabeled(copyShiftLabel, copyShiftSlider);

  styleLabel(copyMixLabel, "Copy Mix");
  styleSlider(copyMixSlider);
  copyMixAttachment =
      std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment>(
          apvts_, ParamID::COPY_MIX, copyMixSlider);
  addLabeled(copyMixLabel, copyMixSlider);

  styleLabel(lfo1RateLabel, "LFO1 Rate");
  styleSlider(lfo1RateSlider);
  lfo1RateAttachment =
      std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment>(
          apvts_, ParamID::LFO1_RATE, lfo1RateSlider);
  addLabeled(lfo1RateLabel, lfo1RateSlider);

  styleLabel(lfo1AmpLabel, "LFO1 Amp");
  styleSlider(lfo1AmpSlider);
  lfo1AmpAttachment =
      std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment>(
          apvts_, ParamID::LFO1_AMP, lfo1AmpSlider);
  addLabeled(lfo1AmpLabel, lfo1AmpSlider);

  styleLabel(lfo1TargetLabel, "LFO1 Target");
  lfo1TargetBox.addItem("None", 1);
  lfo1TargetBox.addItem("Path Y", 2);
  lfo1TargetBox.addItem("Scan Phase", 3);
  lfo1TargetBox.addItem("Shape Phase", 4);
  styleCombo(lfo1TargetBox);
  lfo1TargetAttachment =
      std::make_unique<juce::AudioProcessorValueTreeState::ComboBoxAttachment>(
          apvts_, ParamID::LFO1_TARGET, lfo1TargetBox);
  addLabeled(lfo1TargetLabel, lfo1TargetBox);

  styleLabel(lfo2RateLabel, "LFO2 Rate");
  styleSlider(lfo2RateSlider);
  lfo2RateAttachment =
      std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment>(
          apvts_, ParamID::LFO2_RATE, lfo2RateSlider);
  addLabeled(lfo2RateLabel, lfo2RateSlider);

  styleLabel(lfo2AmpLabel, "LFO2 Amp");
  styleSlider(lfo2AmpSlider);
  lfo2AmpAttachment =
      std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment>(
          apvts_, ParamID::LFO2_AMP, lfo2AmpSlider);
  addLabeled(lfo2AmpLabel, lfo2AmpSlider);

  styleLabel(lfo2TargetLabel, "LFO2 Target");
  lfo2TargetBox.addItem("None", 1);
  lfo2TargetBox.addItem("Path Y", 2);
  lfo2TargetBox.addItem("Scan Phase", 3);
  lfo2TargetBox.addItem("Shape Phase", 4);
  styleCombo(lfo2TargetBox);
  lfo2TargetAttachment =
      std::make_unique<juce::AudioProcessorValueTreeState::ComboBoxAttachment>(
          apvts_, ParamID::LFO2_TARGET, lfo2TargetBox);
  addLabeled(lfo2TargetLabel, lfo2TargetBox);

  styleLabel(bpmLabel, "BPM");
  styleSlider(bpmSlider);
  bpmAttachment =
      std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment>(
          apvts_, ParamID::BPM, bpmSlider);
  addLabeled(bpmLabel, bpmSlider);

  styleLabel(vizLabel, "Visuals");
  wireToggle.setButtonText("Wireframe");
  pointsToggle.setButtonText("Point Cloud");
  lineToggle.setButtonText("Reading Line");
  wireToggle.setToggleState(true, juce::dontSendNotification);
  pointsToggle.setToggleState(false, juce::dontSendNotification);
  lineToggle.setToggleState(false, juce::dontSendNotification);
  controlsContent.addAndMakeVisible(vizLabel);
  controlsContent.addAndMakeVisible(wireToggle);
  controlsContent.addAndMakeVisible(pointsToggle);
  controlsContent.addAndMakeVisible(lineToggle);

  wireToggle.onClick = [this]() {
    spectralCube.setShowWireframe(wireToggle.getToggleState());
  };
  pointsToggle.onClick = [this]() {
    spectralCube.setShowPoints(pointsToggle.getToggleState());
  };
  lineToggle.onClick = [this]() {
    spectralCube.setShowLine(lineToggle.getToggleState());
  };

  styleLabel(attackLabel, "Attack");
  styleSlider(attackSlider);
  attackAttachment =
      std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment>(
          apvts_, ParamID::ATTACK, attackSlider);
  addLabeled(attackLabel, attackSlider);

  styleLabel(decayLabel, "Decay");
  styleSlider(decaySlider);
  decayAttachment =
      std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment>(
          apvts_, ParamID::DECAY, decaySlider);
  addLabeled(decayLabel, decaySlider);

  styleLabel(sustainLabel, "Sustain");
  styleSlider(sustainSlider);
  sustainAttachment =
      std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment>(
          apvts_, ParamID::SUSTAIN, sustainSlider);
  addLabeled(sustainLabel, sustainSlider);

  styleLabel(releaseLabel, "Release");
  styleSlider(releaseSlider);
  releaseAttachment =
      std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment>(
          apvts_, ParamID::RELEASE, releaseSlider);
  addLabeled(releaseLabel, releaseSlider);

  styleLabel(masterVolLabel, "Master Vol");
  styleSlider(masterVolSlider);
  masterVolAttachment =
      std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment>(
          apvts_, ParamID::MASTER_VOL, masterVolSlider);
  addLabeled(masterVolLabel, masterVolSlider);
}

void PluginEditor::styleLabel(juce::Label &label, const juce::String &text) {
  label.setText(text, juce::dontSendNotification);
  label.setColour(juce::Label::textColourId, juce::Colours::white);
  label.setJustificationType(juce::Justification::centredLeft);
}

void PluginEditor::styleSlider(juce::Slider &slider) {
  slider.setSliderStyle(juce::Slider::RotaryHorizontalVerticalDrag);
  slider.setTextBoxStyle(juce::Slider::TextBoxBelow, false, 60, 18);
  slider.setColour(juce::Slider::rotarySliderFillColourId,
                   juce::Colour(0xff5ddcff));
  slider.setColour(juce::Slider::rotarySliderOutlineColourId,
                   juce::Colour(0xff2a2a2a));
  slider.setColour(juce::Slider::textBoxTextColourId, juce::Colours::white);
  slider.setColour(juce::Slider::textBoxBackgroundColourId,
                   juce::Colour(0xff1e1e1e));
}

void PluginEditor::styleCombo(juce::ComboBox &box) {
  box.setColour(juce::ComboBox::backgroundColourId, juce::Colour(0xff1e1e1e));
  box.setColour(juce::ComboBox::textColourId, juce::Colours::white);
  box.setColour(juce::ComboBox::outlineColourId, juce::Colour(0xff2a2a2a));
}
