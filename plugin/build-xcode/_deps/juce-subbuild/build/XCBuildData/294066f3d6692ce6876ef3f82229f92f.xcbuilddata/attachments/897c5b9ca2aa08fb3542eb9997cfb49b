#!/bin/sh
set -e
if test "$CONFIGURATION" = "Debug"; then :
  cd /Users/jlof/spectraltable/plugin/build-xcode/_deps/juce-subbuild
  /opt/homebrew/bin/cmake -E make_directory /Users/jlof/spectraltable/plugin/build-xcode/_deps/juce-subbuild/CMakeFiles/$CONFIGURATION$EFFECTIVE_PLATFORM_NAME
  /opt/homebrew/bin/cmake -E touch /Users/jlof/spectraltable/plugin/build-xcode/_deps/juce-subbuild/CMakeFiles/$CONFIGURATION$EFFECTIVE_PLATFORM_NAME/juce-populate-complete
  /opt/homebrew/bin/cmake -E touch /Users/jlof/spectraltable/plugin/build-xcode/_deps/juce-subbuild/juce-populate-prefix/src/juce-populate-stamp/$CONFIGURATION$EFFECTIVE_PLATFORM_NAME/juce-populate-done
fi

