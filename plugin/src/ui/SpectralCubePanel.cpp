#include "SpectralCubePanel.h"
#include <juce_opengl/juce_opengl.h>

using namespace juce::gl;

static const char *kWireVertex = R"(
attribute vec3 position;
uniform mat4 uMVP;
void main() { gl_Position = uMVP * vec4(position, 1.0); }
)";

static const char *kWireFrag = R"(
uniform vec3 uColor;
void main() { gl_FragColor = vec4(uColor, 1.0); }
)";

static const char *kPointVertex = R"(
attribute vec3 position;
attribute vec4 color;
uniform mat4 uMVP;
varying vec4 vColor;
void main() {
  gl_Position = uMVP * vec4(position, 1.0);
  gl_PointSize = 3.0;
  vColor = color;
}
)";

static const char *kPointFrag = R"(
varying vec4 vColor;
void main() {
  gl_FragColor = vec4(vColor.rgb, 1.0);
}
)";

static const char *kTestVertex = R"(
attribute vec3 position;
attribute vec4 color;
varying vec4 vColor;
void main() {
  vColor = color;
  gl_Position = vec4(position, 1.0);
}
)";

static const char *kTestFrag = R"(
varying vec4 vColor;
void main() { gl_FragColor = vColor; }
)";

SpectralCubePanel::SpectralCubePanel(PluginProcessor &processor)
    : processor_(processor) {
  setOpaque(true);
  openGLContext.setRenderer(this);
  openGLContext.setComponentPaintingEnabled(true);
  openGLContext.setContinuousRepainting(true);
  openGLContext.attachTo(*this);
}

SpectralCubePanel::~SpectralCubePanel() {
  openGLContext.detach();
}

void SpectralCubePanel::paint(juce::Graphics &g) {
  juce::String text;
  {
    const juce::ScopedLock lock(debugLock);
    text = debugText;
  }
  if (text.isNotEmpty()) {
    g.setColour(juce::Colours::black.withAlpha(0.6f));
    auto area = getLocalBounds().reduced(4);
    g.fillRect(area.removeFromTop(36));
    g.setColour(juce::Colours::red);
    g.setFont(12.0f);
    g.drawText(text, getLocalBounds().reduced(6),
               juce::Justification::topLeft, true);
  }
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
  testProgram.reset();

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
  if (lineVAO != 0)
    openGLContext.extensions.glDeleteVertexArrays(1, &lineVAO);
  if (lineVBO != 0)
    openGLContext.extensions.glDeleteBuffers(1, &lineVBO);
  if (testVBO != 0)
    openGLContext.extensions.glDeleteBuffers(1, &testVBO);
  if (testVAO != 0)
    openGLContext.extensions.glDeleteVertexArrays(1, &testVAO);
}

void SpectralCubePanel::setDebugText(const juce::String &text) {
  {
    const juce::ScopedLock lock(debugLock);
    debugText = text;
  }
  juce::MessageManager::callAsync([safe = juce::Component::SafePointer(this)] {
    if (safe != nullptr)
      safe->repaint();
  });
}

void SpectralCubePanel::renderOpenGL() {
  const float scale = (float)openGLContext.getRenderingScale();
  glViewport(0, 0, juce::roundToInt(scale * (float)getWidth()),
             juce::roundToInt(scale * (float)getHeight()));
  juce::OpenGLHelpers::clear(juce::Colours::black);
  glDisable(GL_SCISSOR_TEST);
  glEnable(GL_DEPTH_TEST);
  glDisable(GL_CULL_FACE);
  glLineWidth(1.5f);

  auto proj = getProjectionMatrix();
  auto view = getViewMatrix();
  auto model = juce::Matrix3D<float>::rotation(
      {rotationX, rotationY, 0.0f});
  auto mvp = proj * view * model;

  const bool legacyGL =
      juce::OpenGLShaderProgram::getLanguageVersion() < 1.30f;
  const bool canUseVAO = !legacyGL;

  // Debug triangle to verify GL rendering
  if (legacyGL) {
    glUseProgram(0);
    glDisable(GL_DEPTH_TEST);
    glMatrixMode(GL_PROJECTION);
    glLoadIdentity();
    glMatrixMode(GL_MODELVIEW);
    glLoadIdentity();
    glBegin(GL_TRIANGLES);
    glColor3f(1.0f, 0.2f, 0.2f);
    glVertex2f(0.0f, 0.6f);
    glColor3f(0.2f, 1.0f, 0.2f);
    glVertex2f(-0.6f, -0.6f);
    glColor3f(0.2f, 0.4f, 1.0f);
    glVertex2f(0.6f, -0.6f);
    glEnd();
    glEnable(GL_DEPTH_TEST);
  } else if (testProgram && testVBO != 0 && testVAO != 0) {
    testProgram->use();
    openGLContext.extensions.glBindVertexArray(testVAO);
    glDrawArrays(GL_TRIANGLES, 0, 3);
    openGLContext.extensions.glBindVertexArray(0);
  }

  // Wireframe cube
  if (showWireframe && wireframeProgram && wireframeVBO != 0 &&
      wireframeIBO != 0) {
    wireframeProgram->use();
    if (wireMvpUniform)
      wireMvpUniform->setMatrix4(mvp.mat, 1, false);
    if (wireColorUniform)
      wireColorUniform->set(0.2f, 0.8f, 1.0f);

    if (canUseVAO && wireframeVAO != 0) {
      openGLContext.extensions.glBindVertexArray(wireframeVAO);
      glDrawElements(GL_LINES, 24, GL_UNSIGNED_INT, nullptr);
      openGLContext.extensions.glBindVertexArray(0);
    } else if (wirePosAttrib) {
      glBindBuffer(GL_ARRAY_BUFFER, wireframeVBO);
      glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, wireframeIBO);
      glEnableVertexAttribArray((GLuint)wirePosAttrib->attributeID);
      glVertexAttribPointer((GLuint)wirePosAttrib->attributeID, 3, GL_FLOAT,
                            GL_FALSE, 0, nullptr);
      glDrawElements(GL_LINES, 24, GL_UNSIGNED_INT, nullptr);
      glDisableVertexAttribArray((GLuint)wirePosAttrib->attributeID);
      glBindBuffer(GL_ARRAY_BUFFER, 0);
      glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, 0);
    }
  }

  // Point cloud
  if (showPoints && pointProgram && pointVAO != 0 && pointVBO != 0) {
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

  // Reading line (uses wireframe shader)
  if (showLine && wireframeProgram && lineVAO != 0 && lineVBO != 0) {
    const int resX = processor_.volume.getResolution().x;
    if (resX > 1) {
      std::vector<float> line((size_t)resX * 3);

      const int planeType = static_cast<int>(
          processor_.apvts.getRawParameterValue(ParamID::PLANE_TYPE)->load());
      const float scanPos =
          processor_.apvts.getRawParameterValue(ParamID::SCAN_POS)->load();
      const float shapePhase =
          processor_.apvts.getRawParameterValue(ParamID::SHAPE_PHASE)->load();
      const float pathX =
          processor_.apvts.getRawParameterValue(ParamID::PATH_X)->load();
      const float pathY =
          processor_.apvts.getRawParameterValue(ParamID::PATH_Y)->load();
      const float pathZ =
          processor_.apvts.getRawParameterValue(ParamID::PATH_Z)->load();
      const float rotX =
          processor_.apvts.getRawParameterValue(ParamID::ROT_X)->load();
      const float rotY =
          processor_.apvts.getRawParameterValue(ParamID::ROT_Y)->load();
      const float rotZ =
          processor_.apvts.getRawParameterValue(ParamID::ROT_Z)->load();

      ReadingPath::generateReadingLine(static_cast<PlaneType>(planeType), resX,
                                       scanPos, shapePhase, line.data());

      const float rx = rotX * (3.14159265f / 180.0f);
      const float ry = rotY * (3.14159265f / 180.0f);
      const float rz = rotZ * (3.14159265f / 180.0f);
      const float cx = std::cos(rx);
      const float sx = std::sin(rx);
      const float cy = std::cos(ry);
      const float sy = std::sin(ry);
      const float cz = std::cos(rz);
      const float sz = std::sin(rz);

      const float offX = pathX * 2.0f - 1.0f;
      const float offY = pathY * 2.0f - 1.0f;
      const float offZ = pathZ * 2.0f - 1.0f;

      for (int i = 0; i < resX; ++i) {
        float x = line[i * 3 + 0];
        float y = line[i * 3 + 1];
        float z = line[i * 3 + 2];

        float y1 = y * cx - z * sx;
        float z1 = y * sx + z * cx;
        float x2 = x * cy + z1 * sy;
        float z2 = -x * sy + z1 * cy;
        float x3 = x2 * cz - y1 * sz;
        float y3 = x2 * sz + y1 * cz;
        float z3 = z2;

        line[i * 3 + 0] = x3 + offX;
        line[i * 3 + 1] = y3 + offY;
        line[i * 3 + 2] = z3 + offZ;
      }

      openGLContext.extensions.glBindVertexArray(lineVAO);
      glBindBuffer(GL_ARRAY_BUFFER, lineVBO);
      glBufferData(GL_ARRAY_BUFFER,
                   (GLsizeiptr)(line.size() * sizeof(float)), line.data(),
                   GL_DYNAMIC_DRAW);
      lineCount = resX;

      wireframeProgram->use();
      if (wireMvpUniform)
        wireMvpUniform->setMatrix4(mvp.mat, 1, false);
      if (wireColorUniform)
        wireColorUniform->set(1.0f, 0.4f, 0.2f);

      glDrawArrays(GL_LINE_STRIP, 0, lineCount);
      openGLContext.extensions.glBindVertexArray(0);
    }
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
  juce::String lastError;
  auto buildProgram = [&](const char *vs, const char *fs,
                          const char *label)
      -> std::unique_ptr<juce::OpenGLShaderProgram> {
    auto prog = std::make_unique<juce::OpenGLShaderProgram>(openGLContext);
    if (!prog->addVertexShader(
            juce::OpenGLHelpers::translateVertexShaderToV3(vs))) {
      lastError = juce::String(label) + " vertex shader error:\n" +
                  prog->getLastError();
      return nullptr;
    }
    if (!prog->addFragmentShader(
            juce::OpenGLHelpers::translateFragmentShaderToV3(fs))) {
      lastError = juce::String(label) + " fragment shader error:\n" +
                  prog->getLastError();
      return nullptr;
    }
    if (!prog->link()) {
      lastError =
          juce::String(label) + " link error:\n" + prog->getLastError();
      return nullptr;
    }
    return prog;
  };

  wireframeProgram = buildProgram(kWireVertex, kWireFrag, "Wireframe");
  if (!wireframeProgram) {
    setDebugText(lastError + "\nGLSL: " +
                 juce::String(juce::OpenGLShaderProgram::getLanguageVersion(),
                              2));
    return;
  }
  wirePosAttrib = std::make_unique<juce::OpenGLShaderProgram::Attribute>(
      *wireframeProgram, "position");
  wireMvpUniform = std::make_unique<juce::OpenGLShaderProgram::Uniform>(
      *wireframeProgram, "uMVP");
  wireColorUniform = std::make_unique<juce::OpenGLShaderProgram::Uniform>(
      *wireframeProgram, "uColor");

  testProgram = buildProgram(kTestVertex, kTestFrag, "Test");
  if (!testProgram) {
    setDebugText(lastError + "\nGLSL: " +
                 juce::String(juce::OpenGLShaderProgram::getLanguageVersion(),
                              2));
    return;
  }
  testPosAttrib = std::make_unique<juce::OpenGLShaderProgram::Attribute>(
      *testProgram, "position");
  testColorAttrib = std::make_unique<juce::OpenGLShaderProgram::Attribute>(
      *testProgram, "color");

  pointProgram = buildProgram(kPointVertex, kPointFrag, "Point");
  if (pointProgram) {
    pointPosAttrib = std::make_unique<juce::OpenGLShaderProgram::Attribute>(
        *pointProgram, "position");
    pointDataAttrib = std::make_unique<juce::OpenGLShaderProgram::Attribute>(
        *pointProgram, "color");
    pointMvpUniform = std::make_unique<juce::OpenGLShaderProgram::Uniform>(
        *pointProgram, "uMVP");
  } else {
    setDebugText(lastError + "\nGLSL: " +
                 juce::String(juce::OpenGLShaderProgram::getLanguageVersion(),
                              2));
  }
}

void SpectralCubePanel::createGeometry() {
  const float testVerts[] = {
      0.0f, 0.6f, 0.0f, 1.0f, 0.2f, 0.2f, 1.0f,
      -0.6f, -0.6f, 0.0f, 0.2f, 1.0f, 0.2f, 1.0f,
      0.6f, -0.6f, 0.0f, 0.2f, 0.4f, 1.0f, 1.0f,
  };

  openGLContext.extensions.glGenBuffers(1, &testVBO);
  glBindBuffer(GL_ARRAY_BUFFER, testVBO);
  glBufferData(GL_ARRAY_BUFFER, sizeof(testVerts), testVerts, GL_STATIC_DRAW);
  openGLContext.extensions.glGenVertexArrays(1, &testVAO);
  openGLContext.extensions.glBindVertexArray(testVAO);

  if (testPosAttrib) {
    glEnableVertexAttribArray((GLuint)testPosAttrib->attributeID);
    glVertexAttribPointer((GLuint)testPosAttrib->attributeID, 3, GL_FLOAT,
                          GL_FALSE, 7 * sizeof(float), (void *)0);
  }
  if (testColorAttrib) {
    glEnableVertexAttribArray((GLuint)testColorAttrib->attributeID);
    glVertexAttribPointer((GLuint)testColorAttrib->attributeID, 4, GL_FLOAT,
                          GL_FALSE, 7 * sizeof(float),
                          (void *)(3 * sizeof(float)));
  }

  openGLContext.extensions.glBindVertexArray(0);
  glBindBuffer(GL_ARRAY_BUFFER, 0);

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

  openGLContext.extensions.glGenVertexArrays(1, &lineVAO);
  openGLContext.extensions.glBindVertexArray(lineVAO);
  openGLContext.extensions.glGenBuffers(1, &lineVBO);
  glBindBuffer(GL_ARRAY_BUFFER, lineVBO);
  if (wirePosAttrib) {
    glEnableVertexAttribArray((GLuint)wirePosAttrib->attributeID);
    glVertexAttribPointer((GLuint)wirePosAttrib->attributeID, 3, GL_FLOAT,
                          GL_FALSE, 3 * sizeof(float), (void *)0);
  }
  openGLContext.extensions.glBindVertexArray(0);
}
