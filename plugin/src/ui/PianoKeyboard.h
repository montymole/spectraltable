#pragma once
#include <juce_gui_basics/juce_gui_basics.h>
#include <juce_audio_basics/juce_audio_basics.h>

class PluginProcessor;

class PianoKeyboard : public juce::Component {
public:
    PianoKeyboard() : PianoKeyboard(5, 60) {}
    
    PianoKeyboard(int numOctaves, int startNote = 60);
    
    void paint(juce::Graphics &g) override;
    void resized() override;
    void mouseDown(const juce::MouseEvent &event) override;
    void mouseDrag(const juce::MouseEvent &event) override;
    void mouseUp(const juce::MouseEvent &event) override;
    void mouseExit(const juce::MouseEvent &event) override;
    
    // Set the MIDI output target (processor reference)
    void setMidiOutput(PluginProcessor &processor);
    
    // Set visual style
    void setKeyWidth(int width);
    void setBlackKeyHeightRatio(float ratio);
    void setColourScheme(juce::Colour whiteKeyColour, juce::Colour blackKeyColour,
                        juce::Colour whiteKeyDownColour, juce::Colour blackKeyDownColour,
                        juce::Colour textColour);
    
    // Get/set number of octaves
    int getNumOctaves() const { return numOctaves_; }
    void setNumOctaves(int numOctaves);
    
    // Get/set starting note (MIDI note number)
    int getStartNote() const { return startNote_; }
    void setStartNote(int startNote);
    
private:
    int numOctaves_ = 5;
    int startNote_ = 60; // C4 by default
    int keyWidth_ = 24;
    float blackKeyHeightRatio_ = 0.6f;
    
    juce::Colour whiteKeyColour_ = juce::Colours::white;
    juce::Colour blackKeyColour_ = juce::Colour(0xff2a2a2a);
    juce::Colour whiteKeyDownColour_ = juce::Colour(0xffa0a0ff);
    juce::Colour blackKeyDownColour_ = juce::Colour(0xff4040c0);
    juce::Colour textColour_ = juce::Colours::black;
    
    PluginProcessor *processor_ = nullptr;
    int currentlyPressedNote_ = -1;
    
    struct KeyPosition {
        juce::Rectangle<int> bounds;
        int midiNote;
        bool isBlack;
    };
    
    juce::OwnedArray<KeyPosition> keys_;
    
    void rebuildKeys();
    void sendNoteOn(int midiNote, float velocity);
    void sendNoteOff(int midiNote);
    
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(PianoKeyboard)
};
