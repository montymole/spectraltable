# SpectralTable VST Plugin - Windows Guide

## Windows Build Instructions

### Automatic Setup (Recommended)

Our build script automatically sets up the development environment for you!

**Requirements:**
- Windows 10 or 11 (64-bit)
- Internet connection (for downloading dependencies)
- Administrator privileges (for installing software)

**What the script does:**
1. Checks for required tools (CMake, Visual Studio, Git)
2. Automatically installs missing dependencies using Chocolatey
3. Configures the project with CMake
4. Builds the VST plugin
5. Packages the plugin for installation

### One-Click Build

Simply run:
```powershell
plugin\build_windows.bat
```

The script will guide you through any missing dependencies and install them automatically.

### Manual Setup (Advanced)

If you prefer to set up the environment manually:

**Prerequisites:**

1. **Visual Studio 2022** with:
   - Desktop development with C++ workload
   - Windows 10/11 SDK
   - C++ CMake tools for Windows

2. **CMake 3.22+**
   - Download from: https://cmake.org/download/
   - Add to PATH during installation

3. **Git**
   - Download from: https://git-scm.com/download/win
   - Ensure git is in your PATH

4. **Chocolatey** (optional, for automatic dependency management)
   - Install from: https://chocolatey.org/install

### Building with Chocolatey

If you already have Chocolatey installed, you can use it for manual setup:

```powershell
# Install dependencies
choco install cmake --installargs 'ADD_CMAKE_TO_PATH=System' -y
choco install visualstudio2022buildtools -y --package-parameters "--add Microsoft.VisualStudio.Workload.VCTools"
choco install git -y

# Clone the repository (including submodules)
git clone --recursive https://github.com/your-repo/spectraltable.git
cd spectraltable

# Configure and build
cmake -B build \
    -G "Visual Studio 17 2022" \
    -A x64 \
    -DCMAKE_BUILD_TYPE=Release \
    -DBUILD_TESTS=ON \
    -DBUILD_HOST=OFF

cmake --build build --config Release --parallel 4
```

**Note:** The automatic build script (`build_windows.bat`) handles all of this for you!

### Building with Batch Scripts

The plugin directory contains convenient batch scripts:

```powershell
# Build the plugin (automatic setup + build)
plugin\build_windows.bat

# Test the build
plugin\test_windows.bat

# Install to DAW locations
plugin\install_windows.bat
```

**Note:** The scripts in the `plugin/` directory are specifically designed for building the VST plugin and handle automatic environment setup.

### Manual Build Steps

1. **Clone the repository:**
   ```powershell
   git clone --recursive https://github.com/your-repo/spectraltable.git
   cd spectraltable
   ```

2. **Configure with CMake:**
   ```powershell
   cmake -B build \
       -G "Visual Studio 17 2022" \
       -A x64 \
       -DCMAKE_BUILD_TYPE=Release
   ```

3. **Build the project:**
   ```powershell
   cmake --build build --config Release --parallel 4
   ```

4. **Run tests (optional):**
   ```powershell
   cd build
   ctest -C Release --output-on-failure
   cd ..
   ```

5. **Install the plugin:**
   ```powershell
   cmake --install build --config Release --prefix package
   ```

## Installation

### VST3 Plugin Location

After building, the plugin will be located in:
```
package\SpectralTable.vst3\
```

### Installing to Your DAW

Copy the entire `SpectralTable.vst3` folder to one of these common locations:

1. **System-wide VST3 location:**
   ```
   C:\Program Files\Common Files\VST3\SpectralTable.vst3
   ```

2. **Steinberg VST3 location:**
   ```
   C:\Program Files\Steinberg\VST3\SpectralTable.vst3
   ```

3. **DAW-specific locations:**
   - REAPER: Configure in Preferences > Plugins > VST
   - FL Studio: Options > Manage plugins
   - Cubase: Studio > VST Plug-in Manager
   - Ableton Live: Preferences > Plugins

### Using the Installation Script

Run the VST host testing script to automatically install to common locations:
```powershell
scripts\test_vst_hosts.bat
```

## Windows-Specific Notes

### OpenGL Requirements

- **Minimum OpenGL version:** 3.3+
- **Recommended:** OpenGL 4.1+
- **GPU Requirements:**
  - NVIDIA: GeForce 400 series or newer
  - AMD: Radeon HD 5000 series or newer
  - Intel: HD Graphics 4000 or newer (limited support)

### Troubleshooting OpenGL Issues

If you experience OpenGL rendering problems:

1. **Update your GPU drivers**
   - NVIDIA: https://www.nvidia.com/Download/index.aspx
   - AMD: https://www.amd.com/support
   - Intel: https://www.intel.com/content/www/us/en/support/detect.html

2. **Check OpenGL capabilities:**
   ```powershell
   scripts\opengl_test.bat
   ```

3. **Try these solutions:**
   - Disable hardware acceleration in your DAW
   - Update your DAW to the latest version
   - Try a different DAW (REAPER is most compatible)
   - Reduce visualization complexity in plugin settings

### Known Windows Issues

1. **DPI Scaling:**
   - Some DAWs may not handle high-DPI displays well
   - Try disabling DPI scaling for the DAW executable
   - Right-click DAW shortcut > Properties > Compatibility > Disable DPI scaling

2. **Antivirus Interference:**
   - Some antivirus software may block plugin loading
   - Add exceptions for your DAW and VST3 folder

3. **Administrator Permissions:**
   - Installing to Program Files may require admin rights
   - Consider installing to a user-writable location

## Testing in Different DAWs

### REAPER

1. Launch REAPER
2. Create a new track (Ctrl+T)
3. Click the FX button on the track
4. Search for "Spectra Table"
5. Add the plugin and test

### FL Studio

1. Launch FL Studio
2. Open the Channel Rack
3. Click the + button and select "More plugins"
4. Search for "Spectra Table"
5. Add to a channel and test

### Cubase

1. Launch Cubase
2. Create a new instrument track
3. Click the plugin slot and search for "Spectra Table"
4. Load the plugin and test

### Ableton Live

1. Launch Ableton Live
2. Create a new MIDI track
3. Drag the plugin from the browser to the device slot
4. Or use the browser to search for "Spectra Table"

## Windows CI/CD

We use GitHub Actions for continuous integration on Windows. The workflow:

- Builds on Windows Server 2022
- Uses Visual Studio 2022
- Runs tests with CTest
- Packages VST3 plugin
- Uploads artifacts

See `.github/workflows/windows-ci.yml` for details.

## Performance Optimization for Windows

### Audio Performance

- Use ASIO drivers for lowest latency
- Set buffer size to 256 or 512 samples
- Disable other audio applications during use
- Use a dedicated audio interface

### Graphics Performance

- Use a dedicated GPU (NVIDIA/AMD)
- Update GPU drivers regularly
- Close other graphics-intensive applications
- Reduce visualization complexity if needed

## Troubleshooting

### Common Build Issues

**1. CMake configuration fails:**
- Ensure Visual Studio 2022 is installed with C++ workload
- Check that CMake is in your PATH
- Try running the script as Administrator
- Make sure you have enough disk space (10GB+ recommended)

**2. Build fails with compiler errors:**
- Check that you're using Visual Studio 2022 (not an older version)
- Ensure the C++ workload is installed
- Try cleaning the build directory and rebuilding
- Check for sufficient memory (4GB+ recommended)

**3. Missing dependencies:**
- The automatic script should install everything needed
- If using manual setup, double-check all prerequisites
- Ensure Chocolatey is working if using automatic installation

**4. Chocolatey installation fails:**
- You may need to run PowerShell as Administrator
- Check your execution policy: `Get-ExecutionPolicy`
- If restricted, run: `Set-ExecutionPolicy Bypass -Scope Process -Force`
- Ensure you have internet access

### Common Runtime Issues

**1. Plugin doesn't appear in DAW:**
- Ensure you installed to the correct VST3 directory
- Check your DAW's plugin blacklist
- Try rescanning plugins in your DAW
- Verify the plugin files exist in the installation directory

**2. OpenGL rendering issues:**
- Update your GPU drivers
- Try disabling hardware acceleration in your DAW
- Reduce visualization complexity in plugin settings
- Check OpenGL capabilities with `plugin\test_windows.bat`

**3. Audio glitches or dropouts:**
- Increase buffer size in your DAW
- Close other audio applications
- Use ASIO drivers if available
- Check for CPU/GPU overload

### Diagnostic Commands

```powershell
# Check system information
systeminfo

# Check GPU information
wmic path win32_VideoController get name, adapterRAM, driverVersion

# Check CMake version
cmake --version

# Check Visual Studio installation
where msbuild
where cl

# Check environment variables
set PATH
```

### Getting Help

For Windows-specific issues, please provide:
- Windows version (Win+R > winver)
- GPU model and driver version
- DAW name and version
- Exact steps to reproduce the issue
- Any error messages or screenshots
- Output from diagnostic commands above

You can get additional help by running:
```powershell
plugin\test_windows.bat
```

This will check your system configuration and provide detailed information.

## Contributing Windows Improvements

We welcome contributions to improve Windows support:

- OpenGL shader compatibility fixes
- Windows-specific UI improvements
- DPI scaling enhancements
- Performance optimizations
- Better error handling

Please submit pull requests with Windows-specific changes clearly marked.