#!/usr/bin/env bash
set -euo pipefail

# SpectralTable VST Plugin Build & Run Script
# Builds the plugin and optionally launches it in a host

echo "=========================================="
echo "SpectralTable VST Plugin Build Script"
echo "=========================================="

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="${ROOT_DIR}/build"
CMAKE_BIN=""
XCODEBUILD_BIN=""
TARGET_NAME="SpectralTable_VST3"
HOST_TARGET_NAME="AudioPluginHost"
MACOS_BUILD_MODE="${MACOS_BUILD_MODE:-xcode}"
BUILD_HOST="OFF"
USER_VST3_DIR="${HOME}/Library/Audio/Plug-Ins/VST3"
LAUNCH_GRAPH=""
HOST_PLUGIN_BUNDLE=""
PRODUCT_NAME="Spectra Table"
PLUGIN_BUILD_VERSION=""
PLUGIN_NAME=""
PLUGIN_CATEGORY=""
PLUGIN_MANUFACTURER=""
PLUGIN_VERSION=""
PLUGIN_UNIQUE_ID=""
PLUGIN_DEPRECATED_UID=""
PLUGIN_IS_INSTRUMENT="1"
PLUGIN_NUM_INPUTS="0"
PLUGIN_NUM_OUTPUTS="2"
PLUGIN_FILE_TIME_HEX="0"
PLUGIN_INFO_UPDATE_TIME_HEX="0"

# Detect platform and set appropriate build configuration
PLATFORM="unknown"
BUILD_TYPE="Release"

print_usage() {
  echo "Usage: ./run_vst.sh [--xcode|--cmake]"
  echo ""
  echo "macOS build modes:"
  echo "  --xcode   Build with CMake's Xcode generator and xcodebuild (default)"
  echo "  --cmake   Build with CMake's default generator instead of Xcode"
  echo ""
  echo "Environment override:"
  echo "  MACOS_BUILD_MODE=xcode|cmake ./run_vst.sh"
}

xml_escape() {
  local value="$1"
  value="${value//&/&amp;}"
  value="${value//</&lt;}"
  value="${value//>/&gt;}"
  value="${value//\"/&quot;}"
  value="${value//\'/&apos;}"
  printf '%s' "${value}"
}

find_next_macos_plugin_version() {
  local max_version=0
  local search_root
  local candidate
  local bundle_name
  local version

  for search_root in "${USER_VST3_DIR}" "${ROOT_DIR}/build" "${ROOT_DIR}/build-xcode" "${ROOT_DIR}/build-cmake"; do
    [ -d "${search_root}" ] || continue

    while IFS= read -r candidate; do
      bundle_name="$(basename "${candidate}" .vst3)"
      if [[ "${bundle_name}" =~ ^Spectra\ Table-v([0-9]+)$ ]]; then
        version="${BASH_REMATCH[1]}"
        if (( version > max_version )); then
          max_version="${version}"
        fi
      fi
    done < <(find "${search_root}" -maxdepth 8 -type d -name 'Spectra Table-v*.vst3' 2>/dev/null || true)
  done

  printf '%s' "$((max_version + 1))"
}

get_bundle_executable_name() {
  local bundle_path="$1"
  local executable_name=""

  if command -v plutil &> /dev/null && [ -f "${bundle_path}/Contents/Info.plist" ]; then
    executable_name="$(plutil -extract CFBundleExecutable raw -o - "${bundle_path}/Contents/Info.plist" 2>/dev/null || true)"
  fi

  if [ -z "${executable_name}" ]; then
    executable_name="$(basename "${bundle_path}" .vst3)"
  fi

  printf '%s' "${executable_name}"
}

load_vst3_metadata() {
  local plugin_path="$1"
  local moduleinfo_path="${plugin_path}/Contents/Resources/moduleinfo.json"
  local metadata_line=""
  local plugin_file_time_ms=0
  local plugin_info_time_ms=0

  if [ ! -f "${moduleinfo_path}" ]; then
    moduleinfo_path="${plugin_path}/Contents/moduleinfo.json"
  fi

  if [ ! -f "${moduleinfo_path}" ]; then
    echo "Error: moduleinfo.json not found in ${plugin_path}"
    exit 1
  fi

  while IFS= read -r metadata_line; do
    case "${metadata_line}" in
      PLUGIN_NAME=*) PLUGIN_NAME="${metadata_line#PLUGIN_NAME=}" ;;
      PLUGIN_CATEGORY=*) PLUGIN_CATEGORY="${metadata_line#PLUGIN_CATEGORY=}" ;;
      PLUGIN_MANUFACTURER=*) PLUGIN_MANUFACTURER="${metadata_line#PLUGIN_MANUFACTURER=}" ;;
      PLUGIN_VERSION=*) PLUGIN_VERSION="${metadata_line#PLUGIN_VERSION=}" ;;
      PLUGIN_UNIQUE_ID=*) PLUGIN_UNIQUE_ID="${metadata_line#PLUGIN_UNIQUE_ID=}" ;;
      PLUGIN_DEPRECATED_UID=*) PLUGIN_DEPRECATED_UID="${metadata_line#PLUGIN_DEPRECATED_UID=}" ;;
      PLUGIN_IS_INSTRUMENT=*) PLUGIN_IS_INSTRUMENT="${metadata_line#PLUGIN_IS_INSTRUMENT=}" ;;
    esac
  done < <(
    MODULEINFO_PATH="${moduleinfo_path}" perl -MJSON::PP -0777 -e '
      use strict;
      use warnings;

      my $path = $ENV{MODULEINFO_PATH} // die "Missing MODULEINFO_PATH\n";
      open my $fh, "<", $path or die "Unable to open $path: $!\n";
      local $/;
      my $json = <$fh>;
      close $fh;

      $json =~ s/,\s*([}\]])/$1/gms;
      my $data = JSON::PP->new->decode($json);
      my $factory_info = $data->{"Factory Info"} // {};
      my $vendor = $factory_info->{"Vendor"} // "";
      my @classes = @{ $data->{"Classes"} // [] };
      my ($audio_class) = grep { (($_->{"Category"} // "") eq "Audio Module Class") } @classes;

      die "Unable to find Audio Module Class in moduleinfo.json\n" unless $audio_class;

      my $cid = uc($audio_class->{"CID"} // "");
      die "Invalid Audio Module Class CID in moduleinfo.json\n" unless $cid =~ /\A[0-9A-F]{32}\z/;

      my @bytes = map { hex($_) } ($cid =~ /../g);
      my @words = map { hex($_) } ($cid =~ /([0-9A-F]{8})/g);
      my $deprecated_uid = 0;
      my $unique_id = 0;

      for my $byte (@bytes) {
          $deprecated_uid = (($deprecated_uid * 31) + $byte) & 0xffffffff;
      }

      for my $word (@words) {
          $unique_id = (($unique_id * 31) + $word) & 0xffffffff;
      }

      my @sub_categories = @{ $audio_class->{"Sub Categories"} // [] };
      my $category = join("|", @sub_categories);
      my $name = $audio_class->{"Name"} // $data->{"Name"} // "";
      my $class_vendor = $audio_class->{"Vendor"} // "";
      $class_vendor = $vendor if $class_vendor eq "";
      my $version = $audio_class->{"Version"} // $data->{"Version"} // "";
      my $is_instrument = scalar(grep { $_ eq "Instrument" } @sub_categories) ? 1 : 0;

      print "PLUGIN_NAME=$name\n";
      print "PLUGIN_CATEGORY=$category\n";
      print "PLUGIN_MANUFACTURER=$class_vendor\n";
      print "PLUGIN_VERSION=$version\n";
      printf "PLUGIN_UNIQUE_ID=%08x\n", $unique_id;
      printf "PLUGIN_DEPRECATED_UID=%08x\n", $deprecated_uid;
      print "PLUGIN_IS_INSTRUMENT=$is_instrument\n";
    '
  )

  plugin_file_time_ms="$(( $(stat -f '%m' "${plugin_path}" 2>/dev/null || echo 0) * 1000 ))"
  plugin_info_time_ms="$(( $(date +%s) * 1000 ))"
  printf -v PLUGIN_FILE_TIME_HEX '%x' "${plugin_file_time_ms}"
  printf -v PLUGIN_INFO_UPDATE_TIME_HEX '%x' "${plugin_info_time_ms}"

  if [ -z "${PLUGIN_NAME}" ] || [ -z "${PLUGIN_UNIQUE_ID}" ] || [ -z "${PLUGIN_DEPRECATED_UID}" ]; then
    echo "Error: Failed to derive VST3 plugin metadata from ${moduleinfo_path}"
    exit 1
  fi
}

create_audio_plugin_host_graph() {
  local graph_file="$1"
  local plugin_path="$2"

  cat > "${graph_file}" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<FILTERGRAPH>
  <FILTER uid="1" x="0.150000" y="0.200000" useARA="0">
    <PLUGIN name="MIDI Input" format="Internal" category="Effect" manufacturer="JUCE" version="1.0" file="MIDI Input" uniqueId="0" isInstrument="0" fileTime="0" infoUpdateTime="0" numInputs="0" numOutputs="0" isShell="0" hasARAExtension="0" uid="0"/>
    <STATE></STATE>
    <LAYOUT>
      <INPUTS></INPUTS>
      <OUTPUTS></OUTPUTS>
    </LAYOUT>
  </FILTER>
  <FILTER uid="2" x="0.600000" y="0.500000" useARA="0" uiLastX_normal="180" uiLastY_normal="120" uiopen_normal="1">
    <PLUGIN name="$(xml_escape "${PLUGIN_NAME}")" descriptiveName="$(xml_escape "${PLUGIN_NAME}")" format="VST3" category="$(xml_escape "${PLUGIN_CATEGORY}")" manufacturer="$(xml_escape "${PLUGIN_MANUFACTURER}")" version="${PLUGIN_VERSION}" file="$(xml_escape "${plugin_path}")" uniqueId="${PLUGIN_UNIQUE_ID}" isInstrument="${PLUGIN_IS_INSTRUMENT}" fileTime="${PLUGIN_FILE_TIME_HEX}" infoUpdateTime="${PLUGIN_INFO_UPDATE_TIME_HEX}" numInputs="${PLUGIN_NUM_INPUTS}" numOutputs="${PLUGIN_NUM_OUTPUTS}" isShell="0" hasARAExtension="0" uid="${PLUGIN_DEPRECATED_UID}"/>
    <STATE></STATE>
    <LAYOUT>
      <INPUTS></INPUTS>
      <OUTPUTS>
        <BUS index="0" layout="L R"/>
      </OUTPUTS>
    </LAYOUT>
  </FILTER>
  <FILTER uid="3" x="0.850000" y="0.800000" useARA="0">
    <PLUGIN name="Audio Output" format="Internal" category="Effect" manufacturer="JUCE" version="1.0" file="Audio Output" uniqueId="0" isInstrument="0" fileTime="0" infoUpdateTime="0" numInputs="2" numOutputs="0" isShell="0" hasARAExtension="0" uid="0"/>
    <STATE></STATE>
    <LAYOUT>
      <INPUTS>
        <BUS index="0" layout="L R"/>
      </INPUTS>
      <OUTPUTS></OUTPUTS>
    </LAYOUT>
  </FILTER>
  <CONNECTION srcFilter="1" srcChannel="4096" dstFilter="2" dstChannel="4096"/>
  <CONNECTION srcFilter="2" srcChannel="0" dstFilter="3" dstChannel="0"/>
  <CONNECTION srcFilter="2" srcChannel="1" dstFilter="3" dstChannel="1"/>
</FILTERGRAPH>
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --xcode)
      MACOS_BUILD_MODE="xcode"
      ;;
    --cmake)
      MACOS_BUILD_MODE="cmake"
      ;;
    --help|-h)
      print_usage
      exit 0
      ;;
    *)
      echo "Error: Unknown option '$1'"
      print_usage
      exit 1
      ;;
  esac
  shift
done

if [ "$(uname)" == "Darwin" ]; then
  PLATFORM="macOS"
  export PATH="/opt/homebrew/bin:/usr/local/bin:/opt/local/bin:${PATH}"
  echo "Detected macOS"
  BUILD_HOST="ON"
  PLUGIN_BUILD_VERSION="$(find_next_macos_plugin_version)"
  PRODUCT_NAME="Spectra Table-v${PLUGIN_BUILD_VERSION}"
  if [ "${MACOS_BUILD_MODE}" = "xcode" ]; then
    BUILD_DIR="${ROOT_DIR}/build-xcode"
  elif [ "${MACOS_BUILD_MODE}" = "cmake" ]; then
    BUILD_DIR="${ROOT_DIR}/build-cmake"
  else
    echo "Error: Unsupported MACOS_BUILD_MODE '${MACOS_BUILD_MODE}'"
    print_usage
    exit 1
  fi
elif [ "$(expr substr $(uname -s) 1 5)" == "Linux" ]; then
  PLATFORM="Linux"
  echo "Detected Linux"
else
  echo "Error: Unsupported platform. This script supports macOS and Linux."
  exit 1
fi

# Check for CMake
if command -v cmake &> /dev/null; then
  CMAKE_BIN="$(command -v cmake)"
elif [ -x "/opt/homebrew/bin/cmake" ]; then
  CMAKE_BIN="/opt/homebrew/bin/cmake"
elif [ -x "/usr/local/bin/cmake" ]; then
  CMAKE_BIN="/usr/local/bin/cmake"
elif [ -x "/opt/local/bin/cmake" ]; then
  CMAKE_BIN="/opt/local/bin/cmake"
else
  echo "Error: CMake not found. Please install CMake first."
  echo "Download from: https://cmake.org/download/"
  exit 1
fi

if [ "${PLATFORM}" == "macOS" ]; then
  echo "macOS build mode: ${MACOS_BUILD_MODE}"

  if [ "${MACOS_BUILD_MODE}" = "xcode" ]; then
    if command -v xcodebuild &> /dev/null; then
      XCODEBUILD_BIN="$(command -v xcodebuild)"
    elif xcrun --find xcodebuild &> /dev/null; then
      XCODEBUILD_BIN="$(xcrun --find xcodebuild)"
    else
      echo "Error: xcodebuild not found. Install Xcode Command Line Tools first."
      exit 1
    fi
    echo "Using xcodebuild: ${XCODEBUILD_BIN}"
  else
    echo "Using CMake's default generator on macOS"
  fi
fi

echo "Using CMake: ${CMAKE_BIN}"
echo "CMake version: $("${CMAKE_BIN}" --version | head -n 1)"
echo "Build host support: ${BUILD_HOST}"
echo "Plugin product name: ${PRODUCT_NAME}"

# Configure the project every run so stale or partial build trees recover cleanly.
echo "Configuring project with CMake..."
if [ -d "${BUILD_DIR}" ] && [ ! -f "${BUILD_DIR}/CMakeCache.txt" ]; then
  echo "Existing build directory is missing CMakeCache.txt; reconfiguring it."
elif [ -d "${BUILD_DIR}" ]; then
  echo "Refreshing existing build directory: ${BUILD_DIR}"
fi

if [ "${PLATFORM}" == "macOS" ] && [ "${MACOS_BUILD_MODE}" = "xcode" ]; then
  "${CMAKE_BIN}" -S "${ROOT_DIR}" -B "${BUILD_DIR}" \
    -G Xcode \
    -DBUILD_TESTS=OFF \
    -DBUILD_HOST="${BUILD_HOST}" \
    -DSPECTRALTABLE_PRODUCT_NAME="${PRODUCT_NAME}"
else
  "${CMAKE_BIN}" -S "${ROOT_DIR}" -B "${BUILD_DIR}" \
    -DCMAKE_BUILD_TYPE="${BUILD_TYPE}" \
    -DBUILD_TESTS=OFF \
    -DBUILD_HOST="${BUILD_HOST}" \
    -DSPECTRALTABLE_PRODUCT_NAME="${PRODUCT_NAME}"
fi

echo "Building ${TARGET_NAME} (${BUILD_TYPE} configuration)..."
if [ "${PLATFORM}" == "macOS" ] && [ "${MACOS_BUILD_MODE}" = "xcode" ]; then
  PROJECT_FILE="${BUILD_DIR}/SpectralTable.xcodeproj"
  if [ ! -d "${PROJECT_FILE}" ]; then
    echo "Error: Xcode project not found at ${PROJECT_FILE}"
    exit 1
  fi

  "${XCODEBUILD_BIN}" \
    -project "${PROJECT_FILE}" \
    -target "${TARGET_NAME}" \
    -configuration "${BUILD_TYPE}" \
    -parallelizeTargets \
    build
else
  "${CMAKE_BIN}" --build "${BUILD_DIR}" --config "${BUILD_TYPE}" --target "${TARGET_NAME}"
fi

# Find the VST3 bundle - try multiple possible locations
VST3_BUNDLE=""
POSSIBLE_LOCATIONS=(
  "${BUILD_DIR}/SpectralTable_artefacts/VST3/${PRODUCT_NAME}.vst3"
  "${BUILD_DIR}/SpectralTable_artefacts/VST3/SpectralTable.vst3"
  "${BUILD_DIR}/SpectralTable_artefacts/VST3/Spectra Table.vst3"
  "${BUILD_DIR}/SpectralTable_artefacts/${BUILD_TYPE}/VST3/${PRODUCT_NAME}.vst3"
  "${BUILD_DIR}/SpectralTable_artefacts/${BUILD_TYPE}/VST3/SpectralTable.vst3"
  "${BUILD_DIR}/SpectralTable_artefacts/${BUILD_TYPE}/VST3/Spectra Table.vst3"
  "${BUILD_DIR}/${BUILD_TYPE}/SpectralTable_artefacts/VST3/${PRODUCT_NAME}.vst3"
  "${BUILD_DIR}/${BUILD_TYPE}/SpectralTable_artefacts/VST3/SpectralTable.vst3"
  "${BUILD_DIR}/${BUILD_TYPE}/SpectralTable_artefacts/VST3/Spectra Table.vst3"
  "${BUILD_DIR}/VST3/${PRODUCT_NAME}.vst3"
  "${BUILD_DIR}/VST3/SpectralTable.vst3"
  "${BUILD_DIR}/VST3/Spectra Table.vst3"
  "${BUILD_DIR}/${PRODUCT_NAME}.vst3"
  "${BUILD_DIR}/SpectralTable.vst3"
)

for location in "${POSSIBLE_LOCATIONS[@]}"; do
  if [ -d "${location}" ]; then
    VST3_BUNDLE="${location}"
    break
  fi
done

if [ -z "${VST3_BUNDLE}" ]; then
  VST3_BUNDLE="$(find "${BUILD_DIR}" -maxdepth 8 -type d \( -name "${PRODUCT_NAME}.vst3" -o -name 'Spectra Table-v*.vst3' -o -name 'Spectra Table.vst3' -o -name 'SpectralTable.vst3' \) | sort | tail -n 1 || true)"
fi

if [ -z "${VST3_BUNDLE}" ]; then
  echo "Error: VST3 bundle not found in any expected location."
  echo "Searched locations:"
  for location in "${POSSIBLE_LOCATIONS[@]}"; do
    echo "  - ${location}"
  done
  echo ""
  echo "Please check your CMake build output for the actual bundle path."
  exit 1
fi

HOST_PLUGIN_BUNDLE="${VST3_BUNDLE}"

if [ "${PLATFORM}" == "macOS" ]; then
  INSTALLED_VST3_BUNDLE="${USER_VST3_DIR}/$(basename "${VST3_BUNDLE}")"
  INSTALLED_PLUGIN_NAME="$(get_bundle_executable_name "${VST3_BUNDLE}")"
  INSTALLED_PLUGIN_EXECUTABLE="${INSTALLED_VST3_BUNDLE}/Contents/MacOS/${INSTALLED_PLUGIN_NAME}"
  TEMP_INSTALLED_VST3_BUNDLE="${USER_VST3_DIR}/.$(basename "${VST3_BUNDLE}").tmp"
  echo "Updating installed VST3: ${INSTALLED_VST3_BUNDLE}"
  mkdir -p "${USER_VST3_DIR}"
  rm -rf "${TEMP_INSTALLED_VST3_BUNDLE}"
  if command -v ditto &> /dev/null; then
    ditto "${VST3_BUNDLE}" "${TEMP_INSTALLED_VST3_BUNDLE}"
  else
    cp -R "${VST3_BUNDLE}" "${TEMP_INSTALLED_VST3_BUNDLE}"
  fi

  if [ -d "${INSTALLED_VST3_BUNDLE}" ]; then
    rm -rf "${INSTALLED_VST3_BUNDLE}"
  fi
  mv "${TEMP_INSTALLED_VST3_BUNDLE}" "${INSTALLED_VST3_BUNDLE}"

  if [ -x "${INSTALLED_PLUGIN_EXECUTABLE}" ]; then
    VST3_BUNDLE="${INSTALLED_VST3_BUNDLE}"
    HOST_PLUGIN_BUNDLE="${INSTALLED_VST3_BUNDLE}"
  else
    echo "Warning: Installed bundle is missing executable; using build output for host launch."
  fi
fi

load_vst3_metadata "${HOST_PLUGIN_BUNDLE}"

echo "✓ Built VST3 successfully: ${VST3_BUNDLE}"

# Optional: launch a plugin host if provided
if [ -n "${HOST_APP:-}" ]; then
  echo "Launching plugin host: ${HOST_APP}"
  if [ "${PLATFORM}" == "macOS" ]; then
    open -a "${HOST_APP}" "${VST3_BUNDLE}"
  else
    echo "Plugin host path: ${VST3_BUNDLE}"
    echo "Please manually open this path in your plugin host."
  fi
  exit 0
fi

# Try to find JUCE AudioPluginHost in common locations
DEFAULT_HOST=""
if [ "${PLATFORM}" == "macOS" ]; then
  HOST_LOCATIONS=(
    "${BUILD_DIR}/build/AudioPluginHost/AudioPluginHost_artefacts/AudioPluginHost.app"
    "${BUILD_DIR}/build/AudioPluginHost_artefacts/Release/AudioPluginHost.app"
    "${BUILD_DIR}/build/AudioPluginHost_artefacts/AudioPluginHost.app"
    "${BUILD_DIR}/AudioPluginHost_artefacts/Release/AudioPluginHost.app"
    "${BUILD_DIR}/AudioPluginHost_artefacts/AudioPluginHost.app"
    "${BUILD_DIR}/Release/AudioPluginHost.app"
    "/Applications/AudioPluginHost.app"
    "/Applications/JUCE/AudioPluginHost.app"
    "/Applications/JUCE/AudioPluginHost/JUCE AudioPluginHost.app"
    "/Users/Shared/JUCE/AudioPluginHost_artefacts/AudioPluginHost.app"
    "/Users/${USER}/JUCE/build/extras/AudioPluginHost/AudioPluginHost_artefacts/AudioPluginHost.app"
  )
  
  for host_path in "${HOST_LOCATIONS[@]}"; do
    if [ -d "${host_path}" ]; then
      DEFAULT_HOST="${host_path}"
      break
    fi
  done

  if [ -z "${DEFAULT_HOST}" ] && [ "${BUILD_HOST}" = "ON" ]; then
    echo "Building JUCE AudioPluginHost..."
    if [ "${MACOS_BUILD_MODE}" = "xcode" ]; then
      "${XCODEBUILD_BIN}" \
        -project "${BUILD_DIR}/SpectralTable.xcodeproj" \
        -target "${HOST_TARGET_NAME}" \
        -configuration "${BUILD_TYPE}" \
        -parallelizeTargets \
        build
    else
      "${CMAKE_BIN}" --build "${BUILD_DIR}" --config "${BUILD_TYPE}" --target "${HOST_TARGET_NAME}"
    fi

    for host_path in "${HOST_LOCATIONS[@]}"; do
      if [ -d "${host_path}" ]; then
        DEFAULT_HOST="${host_path}"
        break
      fi
    done

    if [ -z "${DEFAULT_HOST}" ]; then
      DEFAULT_HOST="$(find "${BUILD_DIR}" -maxdepth 8 -type d \( -name "AudioPluginHost.app" -o -name "JUCE AudioPluginHost.app" \) | head -n 1 || true)"
    fi
  fi
fi

if [ -n "${DEFAULT_HOST}" ]; then
  echo "Found JUCE AudioPluginHost: ${DEFAULT_HOST}"
  echo "Launching plugin in host..."
  if [ -n "${PLUGIN_BUILD_VERSION}" ]; then
    LAUNCH_GRAPH="${BUILD_DIR}/SpectralTable-launch-v${PLUGIN_BUILD_VERSION}.filtergraph"
  else
    LAUNCH_GRAPH="${BUILD_DIR}/SpectralTable-launch.filtergraph"
  fi
  create_audio_plugin_host_graph "${LAUNCH_GRAPH}" "${HOST_PLUGIN_BUNDLE}"
  if [ "${PLATFORM}" == "macOS" ]; then
    open -na "${DEFAULT_HOST}" --args "${LAUNCH_GRAPH}" >/tmp/spectraltable-audiopluginhost.log 2>&1
  else
    HOST_EXECUTABLE="$(find "${DEFAULT_HOST}/Contents/MacOS" -maxdepth 1 -type f | head -n 1 || true)"
    if [ -z "${HOST_EXECUTABLE}" ]; then
      echo "Error: Could not find AudioPluginHost executable inside ${DEFAULT_HOST}"
      exit 1
    fi
    "${HOST_EXECUTABLE}" "${LAUNCH_GRAPH}" >/tmp/spectraltable-audiopluginhost.log 2>&1 &
  fi
else
  echo "=========================================="
  echo "Build completed successfully!"
  echo "=========================================="
  echo ""
  echo "VST3 plugin location: ${VST3_BUNDLE}"
  echo ""
  echo "To test the plugin:"
  if [ "${PLATFORM}" == "macOS" ]; then
    echo "1. Set HOST_APP environment variable to your plugin host:"
    echo "   HOST_APP=\"/Applications/YourHost.app\" ./run_vst.sh"
    echo "   Optional build modes: ./run_vst.sh --xcode or ./run_vst.sh --cmake"
    echo ""
    echo "2. Or manually copy the plugin to:"
    echo "   ~/Library/Audio/Plug-Ins/VST3/"
    echo "   Then rescan plugins in your DAW"
  else
    echo "1. Copy the plugin to your VST3 directory"
    echo "2. Rescan plugins in your DAW"
  fi
  echo ""
  echo "Common plugin hosts:"
  echo "- JUCE AudioPluginHost (recommended for testing)"
  echo "- REAPER"
  echo "- Ableton Live"
  echo "- Bitwig Studio"
  echo "- Logic Pro (macOS only)"
fi
