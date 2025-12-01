// Shader source code for rendering

// ====== Wireframe Cube Shaders ======

export const wireframeVertexShader = `#version 300 es
precision highp float;

in vec3 aPosition;
uniform mat4 uModelViewProjection;

void main() {
  gl_Position = uModelViewProjection * vec4(aPosition, 1.0);
}
`;

export const wireframeFragmentShader = `#version 300 es
precision highp float;

uniform vec3 uColor;
out vec4 fragColor;

void main() {
  fragColor = vec4(uColor, 1.0);
}
`;

// ====== Point Cloud Shaders (for spectral volume visualization) ======

export const pointVertexShader = `#version 300 es
precision highp float;
precision highp sampler3D;

in vec3 aPosition;
uniform mat4 uModelViewProjection;
uniform float uPointSize;
uniform sampler3D uVolume;

out vec4 vColor;

void main() {
  gl_Position = uModelViewProjection * vec4(aPosition, 1.0);
  
  // Sample volume data
  vec3 texCoord = (aPosition + 1.0) * 0.5;
  vec4 data = texture(uVolume, texCoord);
  
  // R = Magnitude, G = Phase
  float magnitude = data.r;
  float phase = data.g;
  
  // Size based on magnitude (if magnitude > 0)
  // Base size + magnitude influence
  float size = uPointSize;
  if (magnitude > 0.01) {
      size = uPointSize * (1.0 + magnitude * 2.0);
  }
  
  gl_PointSize = size;
  
  // Pass color to fragment shader
  // R channel = Magnitude (Red)
  // G channel = Phase (Green)
  // Mix them for visualization
  vColor = vec4(magnitude, phase, 0.2, magnitude); 
}
`;

export const pointFragmentShader = `#version 300 es
precision highp float;

in vec4 vColor;
uniform float uAlpha;
out vec4 fragColor;

void main() {
  // Make points circular (not square)
  vec2 coord = gl_PointCoord - vec2(0.5);
  if (length(coord) > 0.5) discard;
  
  // Use color from vertex shader, modulate alpha
  // If magnitude is low, make it very transparent
  float alpha = uAlpha;
  if (vColor.r > 0.01) {
      alpha = uAlpha + vColor.r * 0.5; // More opacity for higher magnitude
  }
  
  fragColor = vec4(vColor.rgb, alpha);
}
`;

// ====== Plane Shaders (for reading path visualization) ======

export const planeVertexShader = `#version 300 es
precision highp float;
precision highp sampler3D;

in vec3 aPosition;
uniform mat4 uModelViewProjection;
uniform mat4 uModelMatrix; // To transform position to world space for sampling
uniform sampler3D uVolume;

out vec4 vColor;

void main() {
  gl_Position = uModelViewProjection * vec4(aPosition, 1.0);
  
  // Transform position to world space (which matches volume space [-1, 1])
  // Note: The plane is transformed by uModelMatrix (rotation/translation)
  // We need to sample the volume at this transformed position.
  // However, uModelViewProjection includes View and Projection.
  // We need a separate uModelMatrix to get world coordinates.
  // BUT, wait. The plane vertices are local to the plane.
  // The plane moves through the volume.
  // So we need to apply the plane's transformation to get volume coordinates.
  
  vec4 worldPos = uModelMatrix * vec4(aPosition, 1.0);
  vec3 texCoord = (worldPos.xyz + 1.0) * 0.5;
  
  // Sample volume
  // Use trilinear filtering (hardware or manual if needed, but hardware linear is usually fine)
  vec4 data = texture(uVolume, texCoord);
  
  // Visualize data
  // R = Magnitude -> Red/Intensity
  // G = Phase -> Green/Variation
  float mag = data.r;
  float phase = data.g;
  
  // Base color (teal) mixed with data
  vec3 baseColor = vec3(0.0, 1.0, 0.5);
  vec3 activeColor = vec3(1.0, 0.2, 0.2); // Reddish for high magnitude
  
  // Mix based on magnitude
  vec3 finalColor = mix(baseColor, activeColor, mag);
  
  // Add phase influence to green channel
  finalColor.g += phase * 0.3;
  
  vColor = vec4(finalColor, 1.0);
}
`;

export const planeFragmentShader = `#version 300 es
precision highp float;

in vec4 vColor;
uniform float uAlpha;
out vec4 fragColor;

void main() {
  fragColor = vec4(vColor.rgb, uAlpha);
}
`;
