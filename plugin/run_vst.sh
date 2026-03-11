#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="${ROOT_DIR}/build"

# Configure & build
if [ ! -d "${BUILD_DIR}" ]; then
  cmake -S "${ROOT_DIR}" -B "${BUILD_DIR}"
fi

cmake --build "${BUILD_DIR}" --target SpectralTable_VST3

# Default VST3 bundle path (from build output)
VST3_BUNDLE="${BUILD_DIR}/SpectralTable_artefacts/VST3/Spectra Table.vst3"

if [ ! -d "${VST3_BUNDLE}" ]; then
  echo "VST3 bundle not found at: ${VST3_BUNDLE}"
  echo "Check your CMake build output for the actual bundle path."
  exit 1
fi

echo "Built VST3: ${VST3_BUNDLE}"

# Optional: launch a plugin host if provided.
# Example usage:
#   HOST_APP="/Applications/PluginHost.app" ./run_vst.sh
# or
#   HOST_APP="Plugin Host" ./run_vst.sh

if [ -n "${HOST_APP:-}" ]; then
  open -a "${HOST_APP}" "${VST3_BUNDLE}"
  exit 0
fi

# Try to find JUCE AudioPluginHost in common locations.
DEFAULT_HOST=""
if [ -d "/Applications/AudioPluginHost.app" ]; then
  DEFAULT_HOST="/Applications/AudioPluginHost.app"
elif [ -d "/Applications/JUCE/AudioPluginHost.app" ]; then
  DEFAULT_HOST="/Applications/JUCE/AudioPluginHost.app"
elif [ -d "/Applications/JUCE/AudioPluginHost/JUCE AudioPluginHost.app" ]; then
  DEFAULT_HOST="/Applications/JUCE/AudioPluginHost/JUCE AudioPluginHost.app"
elif [ -d "/Users/jlof/jussin/JUCE/build/extras/AudioPluginHost/AudioPluginHost_artefacts/AudioPluginHost.app" ]; then
  DEFAULT_HOST="/Users/jlof/jussin/JUCE/build/extras/AudioPluginHost/AudioPluginHost_artefacts/AudioPluginHost.app"
fi

if [ -n "${DEFAULT_HOST}" ]; then
  echo "Launching JUCE AudioPluginHost: ${DEFAULT_HOST}"
  open -a "${DEFAULT_HOST}" "${VST3_BUNDLE}"
else
  echo "HOST_APP not set and JUCE AudioPluginHost not found in common locations."
  echo "Set HOST_APP to your plugin host app name or full path to auto-launch."
fi
