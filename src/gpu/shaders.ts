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

in vec3 aPosition;
uniform mat4 uModelViewProjection;
uniform float uPointSize;

void main() {
  gl_Position = uModelViewProjection * vec4(aPosition, 1.0);
  gl_PointSize = uPointSize;
}
`;

export const pointFragmentShader = `#version 300 es
precision highp float;

uniform vec3 uColor;
uniform float uAlpha;
out vec4 fragColor;

void main() {
  // Make points circular (not square)
  vec2 coord = gl_PointCoord - vec2(0.5);
  if (length(coord) > 0.5) discard;
  
  fragColor = vec4(uColor, uAlpha);
}
`;
