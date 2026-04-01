@echo off
setlocal enabledelayedexpansion

:: SpectralTable OpenGL Capability Test
:: Checks OpenGL capabilities on Windows systems

echo ============================================
echo SpectralTable OpenGL Capability Test
 echo ============================================

:: Check for OpenGL information using dxdiag
echo.
echo Gathering system information...
dxdiag /t dxdiag_output.txt /whql:off

:: Parse dxdiag output for relevant information
echo.
echo System Information:
echo =================
findstr /C:"System Model" dxdiag_output.txt
findstr /C:"Processor" dxdiag_output.txt
findstr /C:"Memory" dxdiag_output.txt

echo.
echo Display Devices:
echo ==============
findstr /C:"Card name" dxdiag_output.txt
findstr /C:"Manufacturer" dxdiag_output.txt
findstr /C:"Display Memory" dxdiag_output.txt
findstr /C:"Driver Version" dxdiag_output.txt

:: Check OpenGL version using glxinfo equivalent for Windows
echo.
echo OpenGL Information:
echo ================
where wglinfo >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo Found wglinfo - gathering detailed OpenGL information...
    wglinfo > opengl_info.txt
    type opengl_info.txt
) else (
    echo wglinfo not found - installing OpenGL Extensions Viewer...
    echo Note: For detailed OpenGL information, please install:
    echo - OpenGL Extensions Viewer from https://realtech-vr.com/admin/glview
    echo - GPU Caps Viewer from https://www.ozone3d.net/gpu_caps_viewer/
)

:: Basic OpenGL capability check
echo.
echo Basic OpenGL Test:
echo ================
set OPENGL_DLLS=opengl32.dll glu32.dll
for %%d in (%OPENGL_DLLS%) do (
    where %%d >nul 2>&1
    if !ERRORLEVEL! equ 0 (
        echo ✓ %%d found
    ) else (
        echo ✗ %%d not found
        set OPENGL_ISSUE=1
    )
)

if defined OPENGL_ISSUE (
    echo.
    echo Warning: OpenGL libraries may not be properly installed
) else (
    echo.
    echo ✓ Basic OpenGL libraries are available
)

:: Check for common GPU manufacturers
echo.
echo GPU Manufacturer Check:
echo ======================
set GPU_MANUFACTURERS=NVIDIA AMD Intel
for %%m in (%GPU_MANUFACTURERS%) do (
    wmic path win32_VideoController get name | findstr /i "%%m" >nul
    if !ERRORLEVEL! equ 0 (
        echo ✓ %%m GPU detected
        set GPU_FOUND=1
    )
)

if not defined GPU_FOUND (
    echo ? GPU manufacturer not identified
)

:: Clean up
if exist dxdiag_output.txt del dxdiag_output.txt
if exist opengl_info.txt del opengl_info.txt

echo.
echo ============================================
echo OpenGL Test Summary
 echo ============================================

echo.
echo For best results with SpectralTable:
1. Ensure you have up-to-date GPU drivers
2. Use a dedicated GPU (NVIDIA/AMD) for best performance
3. Integrated Intel graphics may have limited OpenGL support
4. Minimum OpenGL 3.3+ recommended
5. 4GB+ VRAM recommended for complex visualizations

echo.
echo If you experience OpenGL issues:
- Update your GPU drivers
- Try reducing visualization complexity
- Check for GPU-specific settings in your DAW
- Consider using a simpler visualization mode

endlocal