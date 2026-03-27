@echo off
setlocal enabledelayedexpansion

:: SpectralTable VST Plugin - Windows Installation Script
:: Installs the plugin to common VST3 locations

echo ============================================
echo SpectralTable VST Plugin - Windows Installation
 echo ============================================

:: Configuration
set PLUGIN_NAME=SpectralTable.vst3
set SOURCE_DIR=package\%PLUGIN_NAME%
set VST3_DIRS="C:\Program Files\Common Files\VST3" "C:\Program Files\Steinberg\VST3"

:: Check for administrator privileges
net session >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo Warning: This script may require administrator privileges for some locations
    echo Some installations may fail if you don't have admin rights
)

:: Check if plugin exists
if not exist %SOURCE_DIR% (
    echo Error: Plugin not found at %SOURCE_DIR%
    echo Please build the plugin first using build_windows.bat
    exit /b 1
)

echo Found plugin at: %SOURCE_DIR%

:: Install to VST3 directories
echo.
echo Installing plugin to VST3 directories...

for %%d in (%VST3_DIRS%) do (
    echo.
    echo Installing to: %%d
    
    :: Check if directory exists, create if not
    if not exist %%d (
        echo Directory not found, creating...
        mkdir %%d
        if errorlevel 1 (
            echo Error: Failed to create directory %%d
            echo You may need administrator privileges
            set FAILED=1
            goto :continue
        )
    )
    
    :: Copy plugin
    echo Copying files...
    xcopy /Y /S %SOURCE_DIR% %%d\%PLUGIN_NAME%\ >nul
    
    if errorlevel 1 (
        echo Error: Failed to copy files to %%d
        echo You may need administrator privileges
        set FAILED=1
    ) else (
        echo ✓ Successfully installed to %%d
    )
    
    :continue
)

if defined FAILED (
    echo.
    echo Some installations failed. You can:
    echo 1. Run this script as Administrator
    echo 2. Manually copy the plugin to your preferred location
    echo 3. Install to a user-writable directory
)

echo.
echo ============================================
echo Installation Complete
 echo ============================================

echo The plugin has been installed to the following locations:
for %%d in (%VST3_DIRS%) do (
    if exist %%d\%PLUGIN_NAME% (
        echo - %%d\%PLUGIN_NAME%
    )
)

echo.
echo Next steps:
1. Launch your DAW
2. Rescan VST plugins (if not automatic)
3. Search for "Spectra Table" in your plugin list
4. Add the plugin to a track and test

echo.
echo Common DAWs:
- REAPER: Options > Preferences > Plugins > Rescan
- FL Studio: Options > Manage plugins > Refresh
- Cubase: Studio > VST Plug-in Manager > Update
- Ableton Live: Preferences > Plugins > Rescan

echo.
echo Troubleshooting:
- If the plugin doesn't appear, check the DAW's plugin blacklist
- Ensure you're looking in the VST3 category (not VST2)
- Try restarting your DAW
- Check for error messages in the DAW's plugin log

endlocal