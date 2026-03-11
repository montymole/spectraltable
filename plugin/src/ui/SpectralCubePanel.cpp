#include "SpectralCubePanel.h"
#include <juce_opengl/juce_opengl.h>

using namespace juce::gl;

static const char *kWireVertex = R"(
#version 150
in vec3 position;
uniform mat4 uMVP;
void main() { gl_Position = uMVP * vec4(position, 1.0); }
)";

static const char *kWireFrag = R"(
#version 150
out vec4 fragColor;
uniform vec3 uColor;
void main() { fragColor = vec4(uColor, 1.0); }
)";

static const char *kPointVertex = R"(
#version 150
in vec3 position;
in vec4 data;
uniform mat4 uMVP;
out vec4 vColor;
void main() {
  gl_Position = uMVP * vec4(position, 1.0);
  gl_PointSize = 3.0;
  vColor = data;
}
)";

static const char *kPointFrag = R"(
#version 150
in vec4 vColor;
out vec4 fragColor;
void main() {
  float d = length(gl_PointCoord - vec2(0.5));
  if (d > 0.5) discard;
  fragColor = vec4(vColor.rgb, 1.0);
}
)";

SpectralCubePanel::SpectralCubePanel(PluginProcessor &processor)
    : processor_(processor) {
  openGLContext.setRenderer(this);
  openGLContext.setContinuousRepainting(true);
  openGLContext.attachTo(*this);
}

SpectralCubePanel::~SpectralCubePanel() {
  openGLContext.detach();
}

void SpectralCubePanel::paint(juce::Graphics &g) {
  g.fillAll(juce::Colour(0xff121212));
}

void SpectralCubePanel::resized() { openGLContext.triggerRepaint(); }

void SpectralCubePanel::mouseDown(const juce::MouseEvent &event) {
  lastMousePos = event.getPosition();
}

void SpectralCubePanel::mouseDrag(const juce::MouseEvent &event) {
  auto delta = event.getPosition() - lastMousePos;
  rotationY += delta.x * 0.01f;
  rotationX += delta.y * 0.01f;
  lastMousePos = event.getPosition();
}

void SpectralCubePanel::mouseWheelMove(const juce::MouseEvent &,
                                      const juce::MouseWheelDetails &wheel) {
  zoom = juce::jlimit(1.5f, 10.0f, zoom - wheel.deltaY * 2.0f);
}

void SpectralCubePanel::newOpenGLContextCreated() {
  createPrograms();
  createGeometry();
}

void SpectralCubePanel::openGLContextClosing() {
  wireframeProgram.reset();
  pointProgram.reset();

  if (wireframeVAO != 0)
    openGLContext.extensions.glDeleteVertexArrays(1, &wireframeVAO);
  if (wireframeVBO != 0)
    openGLContext.extensions.glDeleteBuffers(1, &wireframeVBO);
  if (wireframeIBO != 0)
    openGLContext.extensions.glDeleteBuffers(1, &wireframeIBO);
  if (pointVAO != 0)
    openGLContext.extensions.glDeleteVertexArrays(1, &pointVAO);
  if (pointVBO != 0)
    openGLContext.extensions.glDeleteBuffers(1, &pointVBO);
}

void SpectralCubePanel::renderOpenGL() {
  juce::OpenGLHelpers::clear(juce::Colour(0xff101010));
  glEnable(GL_DEPTH_TEST);

  auto proj = getProjectionMatrix();
  auto view = getViewMatrix();
  auto model = juce::Matrix3D<float>::rotation(
      {rotationX, rotationY, 0.0f});
  auto mvp = proj * view * model;

  // Wireframe cube
  if (wireframeProgram) {
    wireframeProgram->use();
    if (wireMvpUniform)
      wireMvpUniform->setMatrix4(mvp.mat, 1, false);
    if (wireColorUniform)
      wireColorUniform->set(0.2f, 0.8f, 1.0f);

    openGLContext.extensions.glBindVertexArray(wireframeVAO);
    glDrawElements(GL_LINES, 24, GL_UNSIGNED_INT, nullptr);
    openGLContext.extensions.glBindVertexArray(0);
  }

  // Point cloud
  if (pointProgram) {
    // Build point buffer from volume (subsampled)
    const auto res = processor_.volume.getResolution();
    const int stride = 4;
    const float *data = processor_.volume.data();

    std::vector<float> points;
    points.reserve((size_t)res.x * res.y);

    const int stepX = juce::jmax(1, res.x / 64);
    const int stepY = juce::jmax(1, res.y / 8);
    const int stepZ = juce::jmax(1, res.z / 64);

    for (int z = 0; z < res.z; z += stepZ) {
      for (int y = 0; y < res.y; y += stepY) {
        for (int x = 0; x < res.x; x += stepX) {
          const int idx = (z * res.y * res.x + y * res.x + x) * stride;
          const float mag = data[idx + 0];
          const float phase = data[idx + 1];
          const float pan = data[idx + 2];
          if (mag < 0.02f)
            continue;

          float nx = (float)x / (float)(res.x - 1) * 2.0f - 1.0f;
          float ny = (float)y / (float)(res.y - 1) * 2.0f - 1.0f;
          float nz = (float)z / (float)(res.z - 1) * 2.0f - 1.0f;

          points.push_back(nx);
          points.push_back(ny);
          points.push_back(nz);

          points.push_back(mag);
          points.push_back(phase);
          points.push_back(pan);
          points.push_back(1.0f);
        }
      }
    }

    pointCount = (int)(points.size() / 7);

    openGLContext.extensions.glBindVertexArray(pointVAO);
    glBindBuffer(GL_ARRAY_BUFFER, pointVBO);
    glBufferData(GL_ARRAY_BUFFER, (GLsizeiptr)(points.size() * sizeof(float)),
                 points.data(), GL_DYNAMIC_DRAW);

    pointProgram->use();
    if (pointMvpUniform)
      pointMvpUniform->setMatrix4(mvp.mat, 1, false);

    glDrawArrays(GL_POINTS, 0, pointCount);
    openGLContext.extensions.glBindVertexArray(0);
  }
}

juce::Matrix3D<float> SpectralCubePanel::getProjectionMatrix() const {
  const float w = (float)juce::jmax(1, getWidth());
  const float h = (float)juce::jmax(1, getHeight());
  const float aspect = w / h;
  const float nearDist = 0.1f;
  const float farDist = 100.0f;
  const float fov = 45.0f * (float)juce::MathConstants<float>::pi / 180.0f;
  const float top = std::tan(fov * 0.5f) * nearDist;
  const float right = top * aspect;
  return juce::Matrix3D<float>::fromFrustum(-right, right, -top, top, nearDist,
                                            farDist);
}

juce::Matrix3D<float> SpectralCubePanel::getViewMatrix() const {
  return juce::Matrix3D<float>::fromTranslation({0.0f, 0.0f, -zoom});
}

void SpectralCubePanel::createPrograms() {
  wireframeProgram = std::make_unique<juce::OpenGLShaderProgram>(openGLContext);
  wireframeProgram->addVertexShader(kWireVertex);
  wireframeProgram->addFragmentShader(kWireFrag);
  wireframeProgram->link();
  wirePosAttrib = std::make_unique<juce::OpenGLShaderProgram::Attribute>(
      *wireframeProgram, "position");
  wireMvpUniform = std::make_unique<juce::OpenGLShaderProgram::Uniform>(
      *wireframeProgram, "uMVP");
  wireColorUniform = std::make_unique<juce::OpenGLShaderProgram::Uniform>(
      *wireframeProgram, "uColor");

  pointProgram = std::make_unique<juce::OpenGLShaderProgram>(openGLContext);
  pointProgram->addVertexShader(kPointVertex);
  pointProgram->addFragmentShader(kPointFrag);
  pointProgram->link();
  pointPosAttrib = std::make_unique<juce::OpenGLShaderProgram::Attribute>(
      *pointProgram, "position");
  pointDataAttrib = std::make_unique<juce::OpenGLShaderProgram::Attribute>(
      *pointProgram, "data");
  pointMvpUniform = std::make_unique<juce::OpenGLShaderProgram::Uniform>(
      *pointProgram, "uMVP");
}

void SpectralCubePanel::createGeometry() {
  const float cubeVerts[] = {
      -1, -1, -1, 1,  -1, -1, 1,  1,  -1, -1, 1,  -1,
      -1, -1, 1,  1,  -1, 1,  1,  1,  1,  -1, 1,  1};
  const unsigned int indices[] = {0, 1, 1, 2, 2, 3, 3, 0,
                                  4, 5, 5, 6, 6, 7, 7, 4,
                                  0, 4, 1, 5, 2, 6, 3, 7};

  openGLContext.extensions.glGenVertexArrays(1, &wireframeVAO);
  openGLContext.extensions.glBindVertexArray(wireframeVAO);

  openGLContext.extensions.glGenBuffers(1, &wireframeVBO);
  glBindBuffer(GL_ARRAY_BUFFER, wireframeVBO);
  glBufferData(GL_ARRAY_BUFFER, sizeof(cubeVerts), cubeVerts, GL_STATIC_DRAW);

  openGLContext.extensions.glGenBuffers(1, &wireframeIBO);
  glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, wireframeIBO);
  glBufferData(GL_ELEMENT_ARRAY_BUFFER, sizeof(indices), indices,
               GL_STATIC_DRAW);

  if (wirePosAttrib) {
    glEnableVertexAttribArray((GLuint)wirePosAttrib->attributeID);
    glVertexAttribPointer((GLuint)wirePosAttrib->attributeID, 3, GL_FLOAT,
                          GL_FALSE, 0, nullptr);
  }

  openGLContext.extensions.glBindVertexArray(0);

  openGLContext.extensions.glGenVertexArrays(1, &pointVAO);
  openGLContext.extensions.glBindVertexArray(pointVAO);
  openGLContext.extensions.glGenBuffers(1, &pointVBO);
  glBindBuffer(GL_ARRAY_BUFFER, pointVBO);

  if (pointPosAttrib) {
    glEnableVertexAttribArray((GLuint)pointPosAttrib->attributeID);
    glVertexAttribPointer((GLuint)pointPosAttrib->attributeID, 3, GL_FLOAT,
                          GL_FALSE, 7 * sizeof(float), (void *)0);
  }
  if (pointDataAttrib) {
    glEnableVertexAttribArray((GLuint)pointDataAttrib->attributeID);
    glVertexAttribPointer((GLuint)pointDataAttrib->attributeID, 4, GL_FLOAT,
                          GL_FALSE, 7 * sizeof(float),
                          (void *)(3 * sizeof(float)));
  }

  openGLContext.extensions.glBindVertexArray(0);
}
