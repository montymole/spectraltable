@echo off
setlocal enabledelayedexpansion

:: SpectralTable VST Plugin - Windows Test Script
:: Tests basic functionality of the plugin on Windows

echo ============================================
echo SpectralTable VST Plugin - Windows Tests
 echo ============================================

:: Configuration
set BUILD_DIR=build
set BUILD_TYPE=Release
set PLUGIN_DIR=package\SpectralTable.vst3

:: Test 1: Check build directory
echo.
echo Test 1: Checking build directory...
if exist %BUILD_DIR% (
    echo ✓ Build directory found
) else (
    echo ✗ Build directory not found
    echo Please run build_windows.bat first
    exit /b 1
)

:: Test 2: Check plugin directory
echo.
echo Test 2: Checking plugin directory...
if exist %PLUGIN_DIR% (
    echo ✓ Plugin directory found
) else (
    echo ✗ Plugin directory not found
    echo Please run build_windows.bat first
    exit /b 1
)

:: Test 3: Verify plugin file structure
echo.
echo Test 3: Verifying plugin file structure...
if exist %PLUGIN_DIR%\Contents (
    if exist %PLUGIN_DIR%\Contents\x86_64-win (
        if exist %PLUGIN_DIR%\Contents\x86_64-win\SpectralTable.vst3 (
            echo ✓ Plugin file structure is correct
        ) else (
            echo ✗ Plugin DLL not found
            exit /b 1
        )
    ) else (
        echo ✗ Architecture directory not found
        exit /b 1
    )
) else (
    echo ✗ Contents directory not found
    exit /b 1
)

:: Test 4: Check for required DLLs
echo.
echo Test 4: Checking for required DLLs...
set REQUIRED_DLLS=opengl32.dll user32.dll gdi32.dll
set MISSING_DLLS=0
for %%d in (%REQUIRED_DLLS%) do (
    where %%d >nul 2>&1
    if !ERRORLEVEL! equ 0 (
        echo ✓ %%d found
    ) else (
        echo ✗ %%d not found
        set MISSING_DLLS=1
    )
)

if %MISSING_DLLS% equ 1 (
    echo Warning: Some required DLLs may be missing
)

:: Test 5: Check OpenGL capabilities
echo.
echo Test 5: Checking OpenGL capabilities...
wmic path win32_VideoController get name, adapterRAM /format:list | findstr /v "^$"

:: Test 6: Verify plugin can be loaded (basic check)
echo.
echo Test 6: Basic plugin verification...
if exist %PLUGIN_DIR%\Contents\x86_64-win\SpectralTable.vst3 (
    echo ✓ Plugin DLL exists
    
    :: Check file size (should be reasonable for a plugin)
    for %%F in (%PLUGIN_DIR%\Contents\x86_64-win\SpectralTable.vst3) do set FILE_SIZE=%%~zF
    
    if %FILE_SIZE% gtr 100000 (
        echo ✓ Plugin file size looks reasonable (%FILE_SIZE% bytes)
    ) else (
        echo ? Plugin file size seems small (%FILE_SIZE% bytes)
    )
) else (
    echo ✗ Plugin DLL not found
)

echo.
echo ============================================
echo Windows Tests Summary
 echo ============================================

echo.
echo Test Results:
echo - Build directory: ✓ Found
echo - Plugin directory: ✓ Found
echo - File structure: ✓ Correct
echo - Required DLLs: !MISSING_DLLS!Missing! (if any)
echo - OpenGL capabilities: ✓ Checked

echo.
echo For complete testing:
1. Install the plugin using install_windows.bat
2. Load it in your DAW
3. Test audio output and MIDI functionality
4. Verify visualization works
5. Test all controls and parameters

echo.
echo Common DAWs for testing:
- REAPER (most compatible)
- FL Studio
- Cubase
- Ableton Live
- Bitwig Studio

endlocal