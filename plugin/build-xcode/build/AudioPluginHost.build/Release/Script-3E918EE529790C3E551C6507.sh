#!/bin/sh
set -e
if test "$CONFIGURATION" = "Debug"; then :
  cd /Users/jlof/spectraltable/plugin/build-xcode/build/AudioPluginHost
  /opt/homebrew/bin/cmake -E copy /Users/jlof/spectraltable/plugin/build-xcode/build/AudioPluginHost/AudioPluginHost_artefacts/JuceLibraryCode/AudioPluginHost/PkgInfo /Users/jlof/spectraltable/plugin/build-xcode/build/AudioPluginHost/AudioPluginHost_artefacts/Debug/AudioPluginHost.app/Contents
fi
if test "$CONFIGURATION" = "Release"; then :
  cd /Users/jlof/spectraltable/plugin/build-xcode/build/AudioPluginHost
  /opt/homebrew/bin/cmake -E copy /Users/jlof/spectraltable/plugin/build-xcode/build/AudioPluginHost/AudioPluginHost_artefacts/JuceLibraryCode/AudioPluginHost/PkgInfo /Users/jlof/spectraltable/plugin/build-xcode/build/AudioPluginHost/AudioPluginHost_artefacts/Release/AudioPluginHost.app/Contents
fi
if test "$CONFIGURATION" = "MinSizeRel"; then :
  cd /Users/jlof/spectraltable/plugin/build-xcode/build/AudioPluginHost
  /opt/homebrew/bin/cmake -E copy /Users/jlof/spectraltable/plugin/build-xcode/build/AudioPluginHost/AudioPluginHost_artefacts/JuceLibraryCode/AudioPluginHost/PkgInfo /Users/jlof/spectraltable/plugin/build-xcode/build/AudioPluginHost/AudioPluginHost_artefacts/MinSizeRel/AudioPluginHost.app/Contents
fi
if test "$CONFIGURATION" = "RelWithDebInfo"; then :
  cd /Users/jlof/spectraltable/plugin/build-xcode/build/AudioPluginHost
  /opt/homebrew/bin/cmake -E copy /Users/jlof/spectraltable/plugin/build-xcode/build/AudioPluginHost/AudioPluginHost_artefacts/JuceLibraryCode/AudioPluginHost/PkgInfo /Users/jlof/spectraltable/plugin/build-xcode/build/AudioPluginHost/AudioPluginHost_artefacts/RelWithDebInfo/AudioPluginHost.app/Contents
fi

