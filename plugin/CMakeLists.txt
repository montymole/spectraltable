cmake_minimum_required(VERSION 3.22)
project(SpectralTable VERSION 0.1.0)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# ── JUCE 8 via FetchContent ──────────────────────────────────────────────────
include(FetchContent)
FetchContent_Declare(JUCE
    GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
    GIT_TAG        8.0.4
    GIT_SHALLOW    TRUE)
FetchContent_MakeAvailable(JUCE)

# ── Plugin target ────────────────────────────────────────────────────────────
juce_add_plugin(SpectralTable
    COMPANY_NAME            "SpectralTable"
    PLUGIN_MANUFACTURER_CODE Spct
    PLUGIN_CODE             Sptb
    FORMATS                 VST3 AU Standalone
    PRODUCT_NAME            "Spectra Table"
    IS_SYNTH                TRUE
    NEEDS_MIDI_INPUT        TRUE
    NEEDS_MIDI_OUTPUT       FALSE
    IS_MIDI_EFFECT          FALSE
    EDITOR_WANTS_KEYBOARD_FOCUS FALSE
    VST3_CATEGORIES         "Instrument|Synth"
    AU_MAIN_TYPE            "kAudioUnitType_MusicDevice")

# ── Sources ──────────────────────────────────────────────────────────────────
target_sources(SpectralTable PRIVATE
    src/PluginProcessor.cpp
    src/PluginEditor.cpp
    src/dsp/SpectralVolume.cpp
    src/dsp/ReadingPath.cpp
    src/dsp/ADSR.cpp
    src/dsp/LFO.cpp
    src/dsp/SynthEngine.cpp
    src/dsp/SpectralSynth.cpp
    src/dsp/WavetableSynth.cpp
    src/dsp/ChirpSynth.cpp
    src/dsp/NoiseSynth.cpp
    src/ui/SpectralCubePanel.cpp)

# ── JUCE modules ─────────────────────────────────────────────────────────────
target_compile_definitions(SpectralTable PUBLIC
    JUCE_WEB_BROWSER=0
    JUCE_USE_CURL=0
    JUCE_VST3_CAN_REPLACE_VST2=0)

target_link_libraries(SpectralTable PRIVATE
    juce::juce_audio_basics
    juce::juce_audio_devices
    juce::juce_audio_formats
    juce::juce_audio_plugin_client
    juce::juce_audio_processors
    juce::juce_audio_utils
    juce::juce_core
    juce::juce_dsp
    juce::juce_events
    juce::juce_graphics
    juce::juce_gui_basics
    juce::juce_gui_extra
    juce::juce_opengl
    juce::juce_recommended_config_flags
    juce::juce_recommended_lto_flags
    juce::juce_recommended_warning_flags)

# ── Tests (optional) ─────────────────────────────────────────────────────────
option(BUILD_TESTS "Build DSP unit tests" OFF)

if(BUILD_TESTS)
    FetchContent_Declare(Catch2
        GIT_REPOSITORY https://github.com/catchorg/Catch2.git
        GIT_TAG        v3.7.1
        GIT_SHALLOW    TRUE)
    FetchContent_MakeAvailable(Catch2)

    add_executable(SpectralTable_Tests
        tests/dsp_tests.cpp
        src/dsp/SpectralVolume.cpp
        src/dsp/ReadingPath.cpp
        src/dsp/ADSR.cpp
        src/dsp/LFO.cpp)

    target_include_directories(SpectralTable_Tests PRIVATE src)
    target_link_libraries(SpectralTable_Tests PRIVATE
        Catch2::Catch2WithMain
        juce::juce_audio_basics
        juce::juce_core
        juce::juce_dsp)

    include(CTest)
    include(Catch)
    catch_discover_tests(SpectralTable_Tests)
endif()
