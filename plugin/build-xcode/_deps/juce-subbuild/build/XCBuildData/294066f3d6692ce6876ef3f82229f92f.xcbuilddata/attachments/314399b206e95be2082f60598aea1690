#!/bin/sh
set -e
if test "$CONFIGURATION" = "Debug"; then :
  cd /Users/jlof/spectraltable/plugin/build-xcode/_deps/juce-src
  /opt/homebrew/bin/cmake -Dcan_fetch=YES -DCMAKE_MESSAGE_LOG_LEVEL=VERBOSE -P /Users/jlof/spectraltable/plugin/build-xcode/_deps/juce-subbuild/juce-populate-prefix/tmp/juce-populate-gitupdate.cmake
fi

