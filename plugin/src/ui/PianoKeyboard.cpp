#include "PianoKeyboard.h"
#include "../PluginProcessor.h"

PianoKeyboard::PianoKeyboard(int numOctaves, int startNote)
    : numOctaves_(numOctaves), startNote_(startNote) {
    rebuildKeys();
    setMouseCursor(juce::MouseCursor::PointingHandCursor);
}

void PianoKeyboard::rebuildKeys() {
    keys_.clear();
    
    // Calculate total number of keys (white + black)
    const int whiteKeysPerOctave = 7; // C, D, E, F, G, A, B
    const int totalWhiteKeys = numOctaves_ * whiteKeysPerOctave;
    
    // Black keys pattern per octave (between white keys)
    const bool blackKeyPattern[] = {false, true, false, true, false, true, false, true, false, true, false};
    
    int currentNote = startNote_;
    int keyIndex = 0;
    
    // Create all keys
    for (int octave = 0; octave < numOctaves_; ++octave) {
        for (int whiteKey = 0; whiteKey < whiteKeysPerOctave; ++whiteKey) {
            // Add white key
            auto *whiteKeyPos = new KeyPosition();
            whiteKeyPos->midiNote = currentNote;
            whiteKeyPos->isBlack = false;
            keys_.add(whiteKeyPos);
            currentNote++;
            keyIndex++;
            
            // Add black key if needed (according to pattern)
            if (blackKeyPattern[whiteKey + 1]) {
                auto *blackKeyPos = new KeyPosition();
                blackKeyPos->midiNote = currentNote;
                blackKeyPos->isBlack = true;
                keys_.add(blackKeyPos);
                currentNote++;
                keyIndex++;
            }
        }
    }
}

void PianoKeyboard::setNumOctaves(int numOctaves) {
    if (numOctaves < 1 || numOctaves > 10) return;
    numOctaves_ = numOctaves;
    rebuildKeys();
    repaint();
}

void PianoKeyboard::setStartNote(int startNote) {
    if (startNote < 0 || startNote > 127) return;
    startNote_ = startNote;
    rebuildKeys();
    repaint();
}

void PianoKeyboard::setKeyWidth(int width) {
    if (width < 10 || width > 50) return;
    keyWidth_ = width;
    resized();
}

void PianoKeyboard::setBlackKeyHeightRatio(float ratio) {
    if (ratio < 0.4f || ratio > 0.8f) return;
    blackKeyHeightRatio_ = ratio;
    repaint();
}

void PianoKeyboard::setColourScheme(juce::Colour whiteKeyColour, juce::Colour blackKeyColour,
                                   juce::Colour whiteKeyDownColour, juce::Colour blackKeyDownColour,
                                   juce::Colour textColour) {
    whiteKeyColour_ = whiteKeyColour;
    blackKeyColour_ = blackKeyColour;
    whiteKeyDownColour_ = whiteKeyDownColour;
    blackKeyDownColour_ = blackKeyDownColour;
    textColour_ = textColour;
    repaint();
}

void PianoKeyboard::setMidiOutput(PluginProcessor &processor) {
    processor_ = &processor;
}

void PianoKeyboard::paint(juce::Graphics &g) {
    auto bounds = getLocalBounds();
    
    // Calculate key positions
    int whiteKeyIndex = 0;
    int blackKeyIndex = 0;
    
    for (int i = 0; i < keys_.size(); ++i) {
        auto *key = keys_[i];
        
        if (key->isBlack) {
            // Black key positioning
            int whiteKeyX = whiteKeyIndex * keyWidth_;
            int blackKeyX = whiteKeyX + keyWidth_ - (keyWidth_ / 3);
            int blackKeyWidth = keyWidth_ * 2 / 3;
            int blackKeyHeight = static_cast<int>(bounds.getHeight() * blackKeyHeightRatio_);
            
            key->bounds = juce::Rectangle<int>(blackKeyX, 0, blackKeyWidth, blackKeyHeight);
            blackKeyIndex++;
        } else {
            // White key positioning
            int whiteKeyX = whiteKeyIndex * keyWidth_;
            key->bounds = juce::Rectangle<int>(whiteKeyX, 0, keyWidth_, bounds.getHeight());
            whiteKeyIndex++;
        }
    }
    
    // Draw keys
    for (int i = 0; i < keys_.size(); ++i) {
        auto *key = keys_[i];
        
        if (key->isBlack) {
            // Draw black key
            juce::Colour keyColour = (key->midiNote == currentlyPressedNote_)
                ? blackKeyDownColour_ : blackKeyColour_;
            
            g.setColour(keyColour);
            g.fillRect(key->bounds);
            
            // Draw note name on black keys
            const int midiNote = key->midiNote;
            const juce::String noteName =
                juce::MidiMessage::getMidiNoteName(midiNote, true, true, 3);
            g.setColour(textColour_);
            g.setFont(juce::Font(10.0f, juce::Font::bold));
            g.drawText(noteName, key->bounds, juce::Justification::centred);
        } else {
            // Draw white key
            juce::Colour keyColour = (key->midiNote == currentlyPressedNote_)
                ? whiteKeyDownColour_ : whiteKeyColour_;
            
            g.setColour(keyColour);
            g.fillRect(key->bounds);
            
            // Draw outline for white keys
            g.setColour(juce::Colours::black);
            g.drawRect(key->bounds);
            
            // Draw note name on white keys (only for C notes to reduce clutter)
            const int midiNote = key->midiNote;
            if (midiNote % 12 == 0) { // C notes
                juce::String noteName =
                    juce::MidiMessage::getMidiNoteName(midiNote, true, true, 3);
                g.setColour(textColour_);
                g.setFont(juce::Font(10.0f));
                g.drawText(noteName, key->bounds, juce::Justification::bottomRight);
            }
        }
    }
}

void PianoKeyboard::resized() {
    // Resizing is handled in paint() to ensure proper layout
    this->repaint();
}

void PianoKeyboard::mouseDown(const juce::MouseEvent &event) {
    if (processor_ == nullptr) return;
    
    for (int i = 0; i < keys_.size(); ++i) {
        auto *key = keys_[i];
        if (key->bounds.contains(event.getPosition())) {
            // Note pressed
            currentlyPressedNote_ = key->midiNote;
            sendNoteOn(key->midiNote, 1.0f);
            this->repaint();
            break;
        }
    }
}

void PianoKeyboard::mouseDrag(const juce::MouseEvent &event) {
    if (processor_ == nullptr) return;
    
    // Check if we're still over a key
    bool overAnyKey = false;
    for (int i = 0; i < keys_.size(); ++i) {
        auto *key = keys_[i];
        if (key->bounds.contains(event.getPosition())) {
            overAnyKey = true;
            // If it's a different key, send note off for previous and on for new
            if (key->midiNote != currentlyPressedNote_) {
                if (currentlyPressedNote_ != -1) {
                    sendNoteOff(currentlyPressedNote_);
                }
                currentlyPressedNote_ = key->midiNote;
                sendNoteOn(key->midiNote, 1.0f);
            }
            break;
        }
    }
    
    // If not over any key, release the current note
    if (!overAnyKey && currentlyPressedNote_ != -1) {
        sendNoteOff(currentlyPressedNote_);
        currentlyPressedNote_ = -1;
        this->repaint();
    }
}

void PianoKeyboard::mouseUp(const juce::MouseEvent &event) {
    if (currentlyPressedNote_ != -1) {
        sendNoteOff(currentlyPressedNote_);
        currentlyPressedNote_ = -1;
        this->repaint();
    }
}

void PianoKeyboard::mouseExit(const juce::MouseEvent &event) {
    if (currentlyPressedNote_ != -1) {
        sendNoteOff(currentlyPressedNote_);
        currentlyPressedNote_ = -1;
        this->repaint();
    }
}

void PianoKeyboard::sendNoteOn(int midiNote, float velocity) {
    if (!processor_) return;
    
    // Create a MIDI message and add it to the processor's incoming MIDI
    // This is a simplified approach - in production, you'd want proper thread safety
    velocity = juce::jlimit(0.0f, 1.0f, velocity);
    juce::MidiMessage noteOn = juce::MidiMessage::noteOn(1, midiNote, velocity);
    
    // Use a message to safely pass the MIDI event to the audio thread
    processor_->addMidiEventToQueue(noteOn);
}

void PianoKeyboard::sendNoteOff(int midiNote) {
    if (!processor_) return;
    
    juce::MidiMessage noteOff = juce::MidiMessage::noteOff(1, midiNote);
    processor_->addMidiEventToQueue(noteOff);
}
