#include "PianoKeyboard.h"
#include "../PluginProcessor.h"

PianoKeyboard::PianoKeyboard(int numOctaves, int startNote)
    : numOctaves_(numOctaves), startNote_(startNote) {
    rebuildKeys();
    setOpaque(true);
    setMouseCursor(juce::MouseCursor::PointingHandCursor);
}

void PianoKeyboard::rebuildKeys() {
    keys_.clear();

    const int whiteKeysPerOctave = 7; // C, D, E, F, G, A, B
    static constexpr bool blackKeyAfterWhite[] = {true, true, false, true, true, true, false};
    static constexpr int whiteKeySteps[] = {2, 2, 1, 2, 2, 2, 1};

    int currentNote = startNote_;

    for (int octave = 0; octave < numOctaves_; ++octave) {
        for (int whiteKey = 0; whiteKey < whiteKeysPerOctave; ++whiteKey) {
            auto *whiteKeyPos = new KeyPosition();
            whiteKeyPos->midiNote = currentNote;
            whiteKeyPos->isBlack = false;
            keys_.add(whiteKeyPos);

            if (blackKeyAfterWhite[whiteKey]) {
                auto *blackKeyPos = new KeyPosition();
                blackKeyPos->midiNote = currentNote + 1;
                blackKeyPos->isBlack = true;
                keys_.add(blackKeyPos);
            }

            currentNote += whiteKeySteps[whiteKey];
        }
    }
}

int PianoKeyboard::getTotalWhiteKeys() const {
    return juce::jmax(1, numOctaves_ * 7);
}

void PianoKeyboard::updateKeyBounds() {
    auto bounds = getLocalBounds().reduced(4, 4);

    if (bounds.isEmpty()) {
        for (auto* key : keys_) {
            key->bounds = {};
        }
        return;
    }

    const float whiteKeyWidth = static_cast<float>(bounds.getWidth()) / static_cast<float>(getTotalWhiteKeys());
    juce::Array<juce::Rectangle<int>> whiteKeyBounds;
    whiteKeyBounds.ensureStorageAllocated(getTotalWhiteKeys());

    int whiteKeyIndex = 0;
    for (auto* key : keys_) {
        if (key->isBlack) {
            continue;
        }

        const int x0 = bounds.getX() + juce::roundToInt(whiteKeyIndex * whiteKeyWidth);
        const int x1 = bounds.getX() + juce::roundToInt((whiteKeyIndex + 1) * whiteKeyWidth);
        const int width = juce::jmax(1, x1 - x0);

        key->bounds = juce::Rectangle<int>(x0, bounds.getY(), width, bounds.getHeight());
        whiteKeyBounds.add(key->bounds);
        ++whiteKeyIndex;
    }

    const int blackKeyHeight = static_cast<int>(bounds.getHeight() * blackKeyHeightRatio_);
    const int blackKeyWidth = juce::jmax(8, juce::roundToInt(whiteKeyWidth * 0.62f));

    whiteKeyIndex = 0;
    for (auto* key : keys_) {
        if (!key->isBlack) {
            ++whiteKeyIndex;
            continue;
        }

        if (whiteKeyIndex <= 0 || whiteKeyIndex >= whiteKeyBounds.size()) {
            key->bounds = {};
            continue;
        }

        const auto& leftWhite = whiteKeyBounds.getReference(whiteKeyIndex - 1);
        const auto& rightWhite = whiteKeyBounds.getReference(whiteKeyIndex);
        const int keyCenter = leftWhite.getRight();
        const int keyX = keyCenter - (blackKeyWidth / 2);

        key->bounds = juce::Rectangle<int>(keyX, bounds.getY(), blackKeyWidth, blackKeyHeight);
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
    updateKeyBounds();

    g.fillAll(juce::Colour(0xff101214));
    g.setColour(juce::Colour(0xff2c3136));
    g.drawRect(bounds);

    for (int i = 0; i < keys_.size(); ++i) {
        auto *key = keys_[i];

        if (key->isBlack) {
            continue;
        }

        juce::Colour keyColour = (key->midiNote == currentlyPressedNote_)
            ? whiteKeyDownColour_ : whiteKeyColour_;

        g.setColour(keyColour);
        g.fillRect(key->bounds);

        g.setColour(juce::Colours::black);
        g.drawRect(key->bounds);

        if (key->midiNote % 12 == 0) {
            juce::String noteName =
                juce::MidiMessage::getMidiNoteName(key->midiNote, true, true, 3);
            g.setColour(textColour_);
            g.setFont(juce::Font(10.0f));
            g.drawText(noteName, key->bounds.reduced(2), juce::Justification::bottomLeft);
        }
    }

    for (int i = 0; i < keys_.size(); ++i) {
        auto *key = keys_[i];

        if (!key->isBlack) {
            continue;
        }

        juce::Colour keyColour = (key->midiNote == currentlyPressedNote_)
            ? blackKeyDownColour_ : blackKeyColour_;

        g.setColour(keyColour);
        g.fillRect(key->bounds);
        g.setColour(juce::Colour(0xff101010));
        g.drawRect(key->bounds);
    }
}

void PianoKeyboard::resized() {
    updateKeyBounds();
    repaint();
}

void PianoKeyboard::mouseDown(const juce::MouseEvent &event) {
    if (processor_ == nullptr) return;

    KeyPosition* pressedKey = nullptr;
    for (int i = keys_.size(); --i >= 0;) {
        auto* key = keys_[i];
        if (key->bounds.contains(event.getPosition())) {
            pressedKey = key;
            break;
        }
    }

    if (pressedKey != nullptr) {
        auto* key = pressedKey;
        currentlyPressedNote_ = key->midiNote;
        sendNoteOn(key->midiNote, 1.0f);
        this->repaint();
    }
}

void PianoKeyboard::mouseDrag(const juce::MouseEvent &event) {
    if (processor_ == nullptr) return;

    KeyPosition* hoveredKey = nullptr;
    for (int i = keys_.size(); --i >= 0;) {
        auto* key = keys_[i];
        if (key->bounds.contains(event.getPosition())) {
            hoveredKey = key;
            break;
        }
    }

    if (hoveredKey != nullptr) {
        auto* key = hoveredKey;
        if (key->midiNote != currentlyPressedNote_) {
            if (currentlyPressedNote_ != -1) {
                sendNoteOff(currentlyPressedNote_);
            }
            currentlyPressedNote_ = key->midiNote;
            sendNoteOn(key->midiNote, 1.0f);
            this->repaint();
        }
    } else if (currentlyPressedNote_ != -1) {
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
