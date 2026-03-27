@echo off
setlocal

:: SpectralTable Windows Build Script
:: Builds the VST plugin for Windows using CMake

echo ============================================
echo SpectralTable Windows Build Script
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
    -DBUILD_TESTS=ON \
    -DBUILD_HOST=OFF

if %ERRORLEVEL% neq 0 (
    echo Error: CMake configuration failed
    exit /b 1
)

:: Build the project
echo.
echo Building project...
cmake --build %BUILD_DIR% --config %BUILD_TYPE% --parallel 4

if %ERRORLEVEL% neq 0 (
    echo Error: Build failed
    exit /b 1
)

:: Run tests
echo.
echo Running tests...
cd %BUILD_DIR%
ctest -C %BUILD_TYPE% --output-on-failure
cd ..

if %ERRORLEVEL% neq 0 (
    echo Warning: Some tests failed
)

:: Package the VST3
echo.
echo Packaging VST3 plugin...
mkdir package 2>nul
cmake --install %BUILD_DIR% --config %BUILD_TYPE% --prefix package

if not exist package\SpectralTable.vst3 (
    echo Error: VST3 plugin not found in package directory
    exit /b 1
)

echo.
echo ============================================
echo Build Completed Successfully!
 echo ============================================

echo Plugin location: package\SpectralTable.vst3

echo.
echo To use the plugin:
1. Copy the SpectralTable.vst3 folder to your VST3 plugins directory
2. Rescan plugins in your DAW
3. Look for "Spectra Table" in your plugin list

echo Common VST3 locations:
- C:\Program Files\Common Files\VST3
- C:\Program Files\Steinberg\VST3
- Your DAW's custom VST3 folder

endlocal