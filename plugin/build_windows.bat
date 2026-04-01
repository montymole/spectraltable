echo SpectralTable VST Plugin - Windows Build
 echo ============================================

:: Configuration
set BUILD_DIR=build
set BUILD_TYPE=Release
set GENERATOR="Visual Studio 17 2022"
set ARCHITECTURE=x64

:: Check for CMake
echo Checking for CMake...
where cmake >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo Error: CMake not found. Please install CMake and add it to your PATH.
    echo You can install it from: https://cmake.org/download/
    exit /b 1
)

echo Found CMake: %CMAKE_CMD%
=======
@echo off
setlocal enabledelayedexpansion

:: SpectralTable VST Plugin - Windows Build Script
:: Builds the VST plugin for Windows using CMake
:: Automatically sets up development environment if needed

echo ============================================
echo SpectralTable VST Plugin - Windows Build
 echo ============================================

:: Configuration
set BUILD_DIR=build
set BUILD_TYPE=Release
set GENERATOR="Visual Studio 17 2022"
set ARCHITECTURE=x64
set CHOCOLATEY_INSTALLED=0

:: Check for Chocolatey (package manager)
echo Checking for Chocolatey package manager...
where choco >nul 2>&1
if %ERRORLEVEL% equ 0 (
    set CHOCOLATEY_INSTALLED=1
    echo ✓ Chocolatey found - will use for automatic dependency installation
) else (
    echo ? Chocolatey not found - will attempt manual setup
)

:: Check and install dependencies
echo.
echo Setting up development environment...

:: Check for CMake
call :check_and_install cmake "CMake" "https://cmake.org/download/"

:: Check for Visual Studio 2022
call :check_visual_studio

:: Check for Git (for submodules)
call :check_and_install git "Git" "https://git-scm.com/download/win"

goto :build_start

:check_and_install
set TOOL_NAME=%1
set FRIENDLY_NAME=%2
set DOWNLOAD_URL=%3

where %TOOL_NAME% >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo ✓ %FRIENDLY_NAME% found
    goto :eof
)

echo ? %FRIENDLY_NAME% not found

if %CHOCOLATEY_INSTALLED% equ 1 (
    echo   Installing %FRIENDLY_NAME% via Chocolatey...
    choco install %TOOL_NAME% -y --no-progress
    if !ERRORLEVEL! equ 0 (
        echo ✓ %FRIENDLY_NAME% installed successfully
        goto :eof
    )
)

echo Error: %FRIENDLY_NAME% is required but not installed.
if %CHOCOLATEY_INSTALLED% equ 1 (
    echo Chocolatey installation failed. Please install manually.
) else (
    echo Please install %FRIENDLY_NAME% from: %DOWNLOAD_URL%
)
echo.
echo After installing, restart this script.
exit /b 1

:check_visual_studio
echo Checking for Visual Studio 2022...
where msbuild >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo ✓ Visual Studio build tools found
    goto :eof
)

echo ? Visual Studio 2022 not found
if %CHOCOLATEY_INSTALLED% equ 1 (
    echo   Installing Visual Studio 2022 Build Tools via Chocolatey...
    echo   This may take a while...
    choco install visualstudio2022buildtools -y --no-progress --package-parameters "--add Microsoft.VisualStudio.Workload.VCTools"
    if !ERRORLEVEL! equ 0 (
        echo ✓ Visual Studio 2022 Build Tools installed
        goto :eof
    )
)

echo Error: Visual Studio 2022 is required.
echo Please install Visual Studio 2022 with:
echo - Desktop development with C++ workload
echo - Windows 10/11 SDK
echo - C++ CMake tools for Windows
echo.
echo Download from: https://visualstudio.microsoft.com/downloads/
if %CHOCOLATEY_INSTALLED% equ 1 (
    echo Chocolatey installation failed. Please install manually.
)
echo.
echo After installing, restart this script.
exit /b 1

:build_start
echo.
echo Development environment ready!============================================
echo SpectralTable VST Plugin - Windows Build
 echo ============================================

:: Configuration
set BUILD_DIR=build
set BUILD_TYPE=Release
set GENERATOR="Visual Studio 17 2022"
set ARCHITECTURE=x64

:: Check for CMake
echo Checking for CMake...
where cmake >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo Error: CMake not found. Please install CMake and add it to your PATH.
    echo You can install it from: https://cmake.org/download/
    exit /b 1
)

echo Found CMake: %CMAKE_CMD%

:: Create build directory
if not exist %BUILD_DIR% (
    echo Creating build directory...
    mkdir %BUILD_DIR%
) else (
    echo Using existing build directory
)

:: Configure the project
echo.
echo Configuring project with CMake...
cmake -B %BUILD_DIR% \
    -G %GENERATOR% \
    -A %ARCHITECTURE% \
    -DCMAKE_BUILD_TYPE=%BUILD_TYPE% \
    -DBUILD_TESTS=OFF \
    -DBUILD_HOST=OFF

if !ERRORLEVEL! neq 0 (
    echo Error: CMake configuration failed
    echo.
    echo Common fixes:
    echo 1. Ensure Visual Studio 2022 is installed with C++ workload
    echo 2. Check that CMake is in your PATH
    echo 3. Try running this script as Administrator
    echo 4. Make sure you have enough disk space
    exit /b 1
)

:: Build the project
echo.
echo Building VST plugin...
cmake --build %BUILD_DIR% --config %BUILD_TYPE% --parallel 4

if !ERRORLEVEL! neq 0 (
    echo Error: Build failed
    echo.
    echo Common fixes:
    echo 1. Check CMake configuration for errors
    echo 2. Ensure all dependencies are installed
    echo 3. Try cleaning the build directory and rebuilding
    echo 4. Check for sufficient memory (build requires ~4GB+)
    echo 5. Try building without parallel jobs: remove --parallel 4
    exit /b 1
)

:: Package the VST3
echo.
echo Packaging VST3 plugin...
mkdir package 2>nul
cmake --install %BUILD_DIR% --config %BUILD_TYPE% --prefix package

if not exist package\SpectralTable.vst3 (
    echo Error: VST3 plugin not found in package directory
    echo.
    echo This could indicate:
    echo 1. Build failed but didn't report errors
    echo 2. CMake install target is misconfigured
    echo 3. Plugin files weren't generated
    echo.
    echo Check the build directory for any generated files.
    exit /b 1
)

echo.
echo ============================================
echo Build Completed Successfully!
 echo ============================================

echo Plugin location: package\SpectralTable.vst3

echo.
echo To install the plugin:
1. Copy the SpectralTable.vst3 folder to your VST3 plugins directory
2. Rescan plugins in your DAW
3. Look for "Spectra Table" in your plugin list

echo Common VST3 locations:
- C:\Program Files\Common Files\VST3
- C:\Program Files\Steinberg\VST3
- Your DAW's custom VST3 folder

endlocal