#!/bin/sh
set -e
if test "$CONFIGURATION" = "Debug"; then :
  cd /Users/jlof/spectraltable/plugin/build-xcode/_deps/juce-build
  /opt/homebrew/bin/cmake -E echo_append
  /opt/homebrew/bin/cmake -E touch /Users/jlof/spectraltable/plugin/build-xcode/_deps/juce-subbuild/juce-populate-prefix/src/juce-populate-stamp/$CONFIGURATION$EFFECTIVE_PLATFORM_NAME/juce-populate-configure
fi

