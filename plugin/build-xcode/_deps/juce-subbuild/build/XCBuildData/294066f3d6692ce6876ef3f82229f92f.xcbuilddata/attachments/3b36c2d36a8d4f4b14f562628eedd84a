#!/bin/sh
set -e
if test "$CONFIGURATION" = "Debug"; then :
  cd /Users/jlof/spectraltable/plugin/build-xcode/_deps
  /opt/homebrew/bin/cmake -DCMAKE_MESSAGE_LOG_LEVEL=VERBOSE -P /Users/jlof/spectraltable/plugin/build-xcode/_deps/juce-subbuild/juce-populate-prefix/tmp/juce-populate-gitclone.cmake
  /opt/homebrew/bin/cmake -E touch /Users/jlof/spectraltable/plugin/build-xcode/_deps/juce-subbuild/juce-populate-prefix/src/juce-populate-stamp/$CONFIGURATION$EFFECTIVE_PLATFORM_NAME/juce-populate-download
fi

