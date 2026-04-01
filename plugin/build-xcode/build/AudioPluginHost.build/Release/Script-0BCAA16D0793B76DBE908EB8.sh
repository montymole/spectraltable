#!/bin/sh
set -e
if test "$CONFIGURATION" = "Debug"; then :
  cd /Users/jlof/spectraltable/plugin/build-xcode/build/AudioPluginHost
  /Users/jlof/spectraltable/plugin/build-xcode/_deps/juce-build/tools/extras/Build/juceaide/juceaide_artefacts/Debug/juceaide pkginfo App /Users/jlof/spectraltable/plugin/build-xcode/build/AudioPluginHost/AudioPluginHost_artefacts/JuceLibraryCode/AudioPluginHost/PkgInfo
fi
if test "$CONFIGURATION" = "Release"; then :
  cd /Users/jlof/spectraltable/plugin/build-xcode/build/AudioPluginHost
  /Users/jlof/spectraltable/plugin/build-xcode/_deps/juce-build/tools/extras/Build/juceaide/juceaide_artefacts/Debug/juceaide pkginfo App /Users/jlof/spectraltable/plugin/build-xcode/build/AudioPluginHost/AudioPluginHost_artefacts/JuceLibraryCode/AudioPluginHost/PkgInfo
fi
if test "$CONFIGURATION" = "MinSizeRel"; then :
  cd /Users/jlof/spectraltable/plugin/build-xcode/build/AudioPluginHost
  /Users/jlof/spectraltable/plugin/build-xcode/_deps/juce-build/tools/extras/Build/juceaide/juceaide_artefacts/Debug/juceaide pkginfo App /Users/jlof/spectraltable/plugin/build-xcode/build/AudioPluginHost/AudioPluginHost_artefacts/JuceLibraryCode/AudioPluginHost/PkgInfo
fi
if test "$CONFIGURATION" = "RelWithDebInfo"; then :
  cd /Users/jlof/spectraltable/plugin/build-xcode/build/AudioPluginHost
  /Users/jlof/spectraltable/plugin/build-xcode/_deps/juce-build/tools/extras/Build/juceaide/juceaide_artefacts/Debug/juceaide pkginfo App /Users/jlof/spectraltable/plugin/build-xcode/build/AudioPluginHost/AudioPluginHost_artefacts/JuceLibraryCode/AudioPluginHost/PkgInfo
fi

