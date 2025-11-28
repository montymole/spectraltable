import './style.css';

// Entry point for Spectra Table Synthesis
console.log('Spectra Table Synthesis - Initializing...');

// Verify WebGL2 support
const canvas = document.getElementById('gl-canvas') as HTMLCanvasElement;
if (!canvas) {
    throw new Error('Canvas element not found');
}

const gl = canvas.getContext('webgl2');
if (!gl) {
    const msg = 'WebGL2 not supported - this browser cannot run Spectra Table';
    console.error(msg);
    alert(msg);
    throw new Error(msg);
}

console.log('✓ WebGL2 context created');
console.log('✓ Vendor:', gl.getParameter(gl.VENDOR));
console.log('✓ Renderer:', gl.getParameter(gl.RENDERER));

// Clear canvas to test rendering
gl.clearColor(0.1, 0.1, 0.15, 1.0);
gl.clear(gl.COLOR_BUFFER_BIT);

console.log('✓ Initial render complete');
