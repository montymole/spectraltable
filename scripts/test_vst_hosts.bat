@echo off
setlocal enabledelayedexpansion

:: SpectralTable VST Host Testing Script
:: Tests the plugin in various DAWs on Windows

echo ============================================
echo SpectralTable VST Host Testing Script
 echo ============================================

:: Configuration
set PLUGIN_NAME=SpectralTable.vst3
set PLUGIN_DIR=package\%PLUGIN_NAME%
set VST3_DIRS="C:\Program Files\Common Files\VST3" "C:\Program Files\Steinberg\VST3"

:: Check if plugin exists
if not exist %PLUGIN_DIR% (
    echo Error: Plugin not found at %PLUGIN_DIR%
    echo Please build the plugin first using build_windows.bat
    exit /b 1
)

:: Install plugin to common VST3 locations
echo.
echo Installing plugin to VST3 directories...
for %%d in (%VST3_DIRS%) do (
    if exist %%d (
        echo Copying to %%d...
        xcopy /Y /S %PLUGIN_DIR% %%d\%PLUGIN_NAME%\ >nul
        echo ✓ Installed to %%d
    ) else (
        echo ✗ Directory not found: %%d
    )
)

:: Test in different DAWs
echo.
echo ============================================
echo DAW Testing Instructions
 echo ============================================

echo The plugin has been installed to common VST3 locations.
 echo Now you can test it in the following DAWs:

echo.
echo 1. REAPER:
echo    - Launch REAPER
echo    - Create a new track (Ctrl+T)
echo    - Click FX button on the track
echo    - Search for "Spectra Table"
echo    - Add the plugin and test functionality

echo.
echo 2. FL Studio:
echo    - Launch FL Studio
echo    - Open the Channel Rack
echo    - Click the + button and select "More plugins"
echo    - Search for "Spectra Table"
echo    - Add to a channel and test

echo.
echo 3. Cubase:
echo    - Launch Cubase
echo    - Create a new instrument track
echo    - Click the plugin slot and search for "Spectra Table"
echo    - Load the plugin and test

echo.
echo 4. Ableton Live:
echo    - Launch Ableton Live
echo    - Create a new MIDI track
echo    - Drag the plugin from the browser to the device slot
echo    - Or use the browser to search for "Spectra Table"

echo.
echo 5. Bitwig Studio:
echo    - Launch Bitwig Studio
echo    - Add a new instrument track
echo    - Click the + button and search for "Spectra Table"
echo    - Load and test the plugin

echo.
echo ============================================
echo Test Checklist
 echo ============================================

echo For each DAW, please test:
1. Plugin loads without crashes
2. Audio output is produced
3. MIDI notes trigger sound
4. UI controls are responsive
5. Visualization works (OpenGL cube)
6. Parameter changes affect sound
7. Presets can be saved/loaded (if implemented)
8. No audio glitches or dropouts

:: Create a test report template
echo.
echo ============================================
echo Test Report Template
 echo ============================================

set REPORT_FILE=test_report_%date:~10,4%-%date:~4,2%-%date:~7,2%.txt
echo Test Report - SpectralTable VST Plugin > %REPORT_FILE%
echo Generated: %date% %time% >> %REPORT_FILE%
echo. >> %REPORT_FILE%
echo DAW Tests: >> %REPORT_FILE%
echo ========== >> %REPORT_FILE%
echo. >> %REPORT_FILE%

for %%d in (REAPER "FL Studio" Cubase "Ableton Live" "Bitwig Studio") do (
    echo %%d: [ ] Not tested >> %REPORT_FILE%
)

echo. >> %REPORT_FILE%
echo Issues Found: >> %REPORT_FILE%
echo -------------- >> %REPORT_FILE%
echo. >> %REPORT_FILE%

echo. >> %REPORT_FILE%
echo Notes: >> %REPORT_FILE%
echo ----- >> %REPORT_FILE%

echo. 
echo A test report template has been created: %REPORT_FILE%
echo Please fill in your test results and any issues encountered.

echo.
echo ============================================
echo Testing Complete
 echo ============================================

endlocal