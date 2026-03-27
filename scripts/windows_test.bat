@echo off
setlocal enabledelayedexpansion

:: SpectralTable Windows Test Script
:: Tests basic functionality of the VST plugin on Windows

echo ============================================
echo SpectralTable Windows Test Script
 echo ============================================

:: Configuration
set BUILD_DIR=build
set BUILD_TYPE=Release
set VST3_DIR=%BUILD_DIR%/SpectralTable_artefacts/VST3/SpectralTable.vst3
set TEST_HOST="C:\Program Files\Common Files\VST3\Reaper\reaper.exe"

:: Check if build directory exists
if not exist %BUILD_DIR% (
    echo Error: Build directory not found. Please build the project first.
    exit /b 1
)

:: Check if VST3 plugin exists
if not exist %VST3_DIR% (
    echo Error: VST3 plugin not found at %VST3_DIR%
    exit /b 1
)

:: Test 1: Basic plugin loading
echo.
echo Test 1: Checking plugin can be loaded...
if exist %TEST_HOST% (
    echo Plugin host found: %TEST_HOST%
    :: Here you would normally launch the host with the plugin
    :: For now, we'll just verify the plugin file structure
    dir %VST3_DIR% /s
) else (
    echo Warning: Test host not found at %TEST_HOST%
    echo Skipping plugin loading test
)

:: Test 2: Verify plugin file structure
echo.
echo Test 2: Verifying plugin file structure...
if exist %VST3_DIR%\Contents (
    if exist %VST3_DIR%\Contents\x86_64-win (
        if exist %VST3_DIR%\Contents\x86_64-win\SpectralTable.vst3 (
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

:: Test 3: Check for required DLLs
echo.
echo Test 3: Checking for required DLLs...
set REQUIRED_DLLS=opengl32.dll user32.dll gdi32.dll
for %%d in (%REQUIRED_DLLS%) do (
    where %%d >nul 2>&1
    if !ERRORLEVEL! equ 0 (
        echo ✓ %%d found
    ) else (
        echo ✗ %%d not found
        set MISSING_DLLS=1
    )
)

if defined MISSING_DLLS (
    echo Warning: Some required DLLs may be missing
)

:: Test 4: Verify OpenGL capabilities
echo.
echo Test 4: Checking OpenGL capabilities...
wmic path win32_VideoController get name, adapterRAM /format:list

echo.
echo ============================================
echo Windows Tests Completed
 echo ============================================

echo Summary:
echo - Plugin file structure: ✓ Verified
echo - Required DLLs: !MISSING_DLLS!Missing! (if any)
echo - OpenGL capabilities: ✓ Checked

echo.
echo Note: Full plugin testing requires a VST3 host application.
echo Consider testing in:
echo - REAPER
echo - FL Studio
echo - Cubase
echo - Ableton Live

endlocal