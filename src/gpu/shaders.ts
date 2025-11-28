// Shader source code for wireframe cube rendering

export const vertexShaderSource = `#version 300 es
precision highp float;

in vec3 aPosition;
uniform mat4 uModelViewProjection;

void main() {
  gl_Position = uModelViewProjection * vec4(aPosition, 1.0);
}
`;

export const fragmentShaderSource = `#version 300 es
precision highp float;

uniform vec3 uColor;
out vec4 fragColor;

void main() {
  fragColor = vec4(uColor, 1.0);
}
`;
