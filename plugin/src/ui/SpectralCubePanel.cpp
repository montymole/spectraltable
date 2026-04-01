#include "SpectralCubePanel.h"
#include "../dsp/ReadingPath.h"
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
  // HSV to RGB: hue = vColor.g (phase), sat = 0.8, val = vColor.r (mag)
  float h = fract(vColor.g) * 6.0;
  float s = 0.8;
  float v = clamp(vColor.r, 0.0, 1.0);
  float c = v * s;
  float x = c * (1.0 - abs(mod(h, 2.0) - 1.0));
  float m = v - c;
  vec3 rgb;
  if      (h < 1.0) rgb = vec3(c, x, 0.0);
  else if (h < 2.0) rgb = vec3(x, c, 0.0);
  else if (h < 3.0) rgb = vec3(0.0, c, x);
  else if (h < 4.0) rgb = vec3(0.0, x, c);
  else if (h < 5.0) rgb = vec3(x, 0.0, c);
  else              rgb = vec3(c, 0.0, x);
  gl_FragColor = vec4(rgb + m, 1.0);
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

static void addChar(char c, float x, float y, float z, float s, std::vector<float> &v,
                    int axis) {
  auto l = [&](float x1, float y1, float x2, float y2) {
    if (axis == 0) { // X
      v.push_back(x + x1 * s); v.push_back(y + y1 * s); v.push_back(z);
      v.push_back(x + x2 * s); v.push_back(y + y2 * s); v.push_back(z);
    } else if (axis == 1) { // Y
      v.push_back(x + x1 * s); v.push_back(y + y1 * s); v.push_back(z);
      v.push_back(x + x2 * s); v.push_back(y + y2 * s); v.push_back(z);
    } else { // Z (char width maps to Z)
      v.push_back(x); v.push_back(y + y1 * s); v.push_back(z + x1 * s);
      v.push_back(x); v.push_back(y + y2 * s); v.push_back(z + x2 * s);
    }
  };
  switch (toupper(c)) {
  case 'B': l(0, 0, 0, 2); l(0, 2, 1.5, 2); l(1.5, 2, 2, 1.5); l(2, 1.5, 1.5, 1);
            l(1.5, 1, 0, 1); l(1.5, 1, 2, 0.5); l(2, 0.5, 1.5, 0); l(1.5, 0, 0, 0); break;
  case 'I': l(1, 2, 1, 0); break;
  case 'N': l(0, 0, 0, 2); l(2, 0, 2, 2); l(0, 2, 2, 0); break;
  case 'S': l(2, 2, 0, 2); l(0, 2, 0, 1); l(0, 1, 2, 1); l(2, 1, 2, 0); l(2, 0, 0, 0); break;
  case 'M': l(0, 0, 0, 2); l(2, 0, 2, 2); l(0, 2, 1, 1); l(1, 1, 2, 2); break;
  case 'O': l(0, 0, 2, 0); l(2, 0, 2, 2); l(2, 2, 0, 2); l(0, 2, 0, 0); break;
  case 'R': l(0, 0, 0, 2); l(0, 2, 2, 2); l(2, 2, 2, 1); l(2, 1, 0, 1); l(0, 1, 2, 0); break;
  case 'P': l(0, 0, 0, 2); l(0, 2, 2, 2); l(2, 2, 2, 1); l(2, 1, 0, 1); break;
  case 'H': l(0, 0, 0, 2); l(2, 0, 2, 2); l(0, 1, 2, 1); break;
  case 'T': l(0, 2, 2, 2); l(1, 2, 1, 0); break;
  case 'E': l(0, 2, 2, 2); l(0, 1, 1.5, 1); l(0, 0, 2, 0); l(0, 0, 0, 2); break;
  case 'A': l(0, 0, 1, 2); l(1, 2, 2, 0); l(0.5, 1, 1.5, 1); break;
  }
}

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
  glGenTextures(1, &volumeTexture);
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
  if (planeVAO != 0)
    openGLContext.extensions.glDeleteVertexArrays(1, &planeVAO);
  if (planeVBO != 0)
    openGLContext.extensions.glDeleteBuffers(1, &planeVBO);
  if (planeIBO != 0)
    openGLContext.extensions.glDeleteBuffers(1, &planeIBO);
  if (testVBO != 0)
    openGLContext.extensions.glDeleteBuffers(1, &testVBO);
  if (testVAO != 0)
    openGLContext.extensions.glDeleteVertexArrays(1, &testVAO);
  if (volumeTexture != 0)
    glDeleteTextures(1, &volumeTexture);
  if (axesVAO != 0)
    openGLContext.extensions.glDeleteVertexArrays(1, &axesVAO);
  if (axesVBO != 0)
    openGLContext.extensions.glDeleteBuffers(1, &axesVBO);
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
  glEnable(GL_BLEND);
  glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
  glLineWidth(1.5f);

  auto proj = getProjectionMatrix();
  auto view = getViewMatrix();
  auto model = juce::Matrix3D<float>::rotation(
      {rotationX, rotationY, 0.0f});
  auto mvp = proj * view * model;

  const bool canUseVAO = juce::OpenGLShaderProgram::getLanguageVersion() >= 1.30f;

  // Refresh 3D texture if volume has changed
  uint32_t currentVersion = processor_.volume.getVersion();
  if (currentVersion != lastVolumeVersion && volumeTexture != 0) {
    const auto res = processor_.volume.getResolution();
    glBindTexture(GL_TEXTURE_3D, volumeTexture);
    glTexParameteri(GL_TEXTURE_3D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_3D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_3D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_3D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_3D, GL_TEXTURE_WRAP_R, GL_CLAMP_TO_EDGE);

    // Using GL_RGBA (4 floats per voxel)
    glTexImage3D(GL_TEXTURE_3D, 0, GL_RGBA32F, res.x, res.y, res.z, 0, GL_RGBA,
                 GL_FLOAT, processor_.volume.data());
    lastVolumeVersion = currentVersion;
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

  // Axes and labels use the same legacy-safe path as the cube so they remain
  // visible in the host's GLSL 1.20 context.
  if (showWireframe && wireframeProgram && axesVBO != 0 && wirePosAttrib) {
    wireframeProgram->use();
    if (wireMvpUniform)
      wireMvpUniform->setMatrix4(mvp.mat, 1, false);

    int offset = 0;
    if (canUseVAO && axesVAO != 0) {
      openGLContext.extensions.glBindVertexArray(axesVAO);

      if (wireColorUniform)
        wireColorUniform->set(0.9f, 0.4f, 0.4f);
      glDrawArrays(GL_LINES, offset, axesCounts[0]);
      offset += axesCounts[0];

      if (wireColorUniform)
        wireColorUniform->set(0.4f, 0.9f, 0.4f);
      glDrawArrays(GL_LINES, offset, axesCounts[1]);
      offset += axesCounts[1];

      if (wireColorUniform)
        wireColorUniform->set(0.4f, 0.4f, 0.9f);
      glDrawArrays(GL_LINES, offset, axesCounts[2]);

      openGLContext.extensions.glBindVertexArray(0);
    } else {
      glBindBuffer(GL_ARRAY_BUFFER, axesVBO);
      glEnableVertexAttribArray((GLuint)wirePosAttrib->attributeID);
      glVertexAttribPointer((GLuint)wirePosAttrib->attributeID, 3, GL_FLOAT,
                            GL_FALSE, 3 * sizeof(float), nullptr);

      if (wireColorUniform)
        wireColorUniform->set(0.9f, 0.4f, 0.4f);
      glDrawArrays(GL_LINES, offset, axesCounts[0]);
      offset += axesCounts[0];

      if (wireColorUniform)
        wireColorUniform->set(0.4f, 0.9f, 0.4f);
      glDrawArrays(GL_LINES, offset, axesCounts[1]);
      offset += axesCounts[1];

      if (wireColorUniform)
        wireColorUniform->set(0.4f, 0.4f, 0.9f);
      glDrawArrays(GL_LINES, offset, axesCounts[2]);

      glDisableVertexAttribArray((GLuint)wirePosAttrib->attributeID);
      glBindBuffer(GL_ARRAY_BUFFER, 0);
    }
  }

  // Point cloud
  if (showPoints && pointVBO != 0) {
    // Build point buffer from volume (subsampled)
    const auto res = processor_.volume.getResolution();
    const int stride = 4;
    const float *data = processor_.volume.data();

    std::vector<float> points;
    points.reserve((size_t)res.x * res.y);

    const int stepX = juce::jmax(1, (int)res.x / 64);
    const int stepY = juce::jmax(1, (int)res.y / 8);
    const int stepZ = juce::jmax(1, (int)res.z / 64);

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

    glBindBuffer(GL_ARRAY_BUFFER, pointVBO);
    glBufferData(GL_ARRAY_BUFFER, (GLsizeiptr)(points.size() * sizeof(float)),
                 points.data(), GL_DYNAMIC_DRAW);

    if (pointProgram && pointPosAttrib && pointDataAttrib) {
      pointProgram->use();
      if (pointMvpUniform)
        pointMvpUniform->setMatrix4(mvp.mat, 1, false);

      if (canUseVAO && pointVAO != 0) {
        openGLContext.extensions.glBindVertexArray(pointVAO);
        glDrawArrays(GL_POINTS, 0, pointCount);
        openGLContext.extensions.glBindVertexArray(0);
      } else {
        glEnableVertexAttribArray((GLuint)pointPosAttrib->attributeID);
        glVertexAttribPointer((GLuint)pointPosAttrib->attributeID, 3, GL_FLOAT,
                              GL_FALSE, 7 * sizeof(float), nullptr);
        glEnableVertexAttribArray((GLuint)pointDataAttrib->attributeID);
        glVertexAttribPointer((GLuint)pointDataAttrib->attributeID, 4, GL_FLOAT,
                              GL_FALSE, 7 * sizeof(float),
                              (void *)(3 * sizeof(float)));
        glDrawArrays(GL_POINTS, 0, pointCount);
        glDisableVertexAttribArray((GLuint)pointDataAttrib->attributeID);
        glDisableVertexAttribArray((GLuint)pointPosAttrib->attributeID);
      }
    } else {
      // Legacy fallback when the point shader won't compile in GLSL 1.20.
      auto modelView = view * model;
      glMatrixMode(GL_PROJECTION);
      glLoadMatrixf(proj.mat);
      glMatrixMode(GL_MODELVIEW);
      glLoadMatrixf(modelView.mat);
      glPointSize(3.0f);
      glBegin(GL_POINTS);
      for (int i = 0; i < pointCount; ++i) {
        const size_t base = (size_t)i * 7;
        float mag   = points[base + 3];
        float phase = points[base + 4];
        // HSV→RGB: hue=phase, sat=0.8, val=mag
        float h = std::fmod(phase, 1.0f) * 6.0f;
        float v = mag < 0.0f ? 0.0f : (mag > 1.0f ? 1.0f : mag);
        float c = v * 0.8f;
        float x = c * (1.0f - std::abs(std::fmod(h, 2.0f) - 1.0f));
        float m = v - c;
        float r, g, b;
        if      (h < 1.0f) { r = c; g = x; b = 0; }
        else if (h < 2.0f) { r = x; g = c; b = 0; }
        else if (h < 3.0f) { r = 0; g = c; b = x; }
        else if (h < 4.0f) { r = 0; g = x; b = c; }
        else if (h < 5.0f) { r = x; g = 0; b = c; }
        else               { r = c; g = 0; b = x; }
        glColor4f(r + m, g + m, b + m, 1.0f);
        glVertex3f(points[base + 0], points[base + 1], points[base + 2]);
      }
      glEnd();
    }

    glBindBuffer(GL_ARRAY_BUFFER, 0);
  }

  // Reading line (uses wireframe shader)
  if (showLine && wireframeProgram && lineVBO != 0) {
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
        float x = line[(size_t)i * 3 + 0];
        float y = line[(size_t)i * 3 + 1];
        float z = line[(size_t)i * 3 + 2];

        float y1 = y * cx - z * sx;
        float z1 = y * sx + z * cx;
        float x2 = x * cy + z1 * sy;
        float z2 = -x * sy + z1 * cy;
        float x3 = x2 * cz - y1 * sz;
        float y3 = x2 * sz + y1 * cz;
        float z3 = z2;

        line[(size_t)i * 3 + 0] = x3 + offX;
        line[(size_t)i * 3 + 1] = y3 + offY;
        line[(size_t)i * 3 + 2] = z3 + offZ;
      }

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

      if (canUseVAO && lineVAO != 0) {
        openGLContext.extensions.glBindVertexArray(lineVAO);
        glDrawArrays(GL_LINE_STRIP, 0, lineCount);
        openGLContext.extensions.glBindVertexArray(0);
      } else if (wirePosAttrib) {
        glBindBuffer(GL_ARRAY_BUFFER, lineVBO);
        glEnableVertexAttribArray((GLuint)wirePosAttrib->attributeID);
        glVertexAttribPointer((GLuint)wirePosAttrib->attributeID, 3, GL_FLOAT,
                              GL_FALSE, 3 * sizeof(float), nullptr);
        glDrawArrays(GL_LINE_STRIP, 0, lineCount);
        glDisableVertexAttribArray((GLuint)wirePosAttrib->attributeID);
        glBindBuffer(GL_ARRAY_BUFFER, 0);
      }
    }
  }

  // Reading plane
  if (showPlane && wireframeProgram && planeVBO != 0 &&
      planeIBO != 0) {
    const int gridRes = 24;
    std::vector<float> plane((size_t)(gridRes + 1) * (gridRes + 1) * 3);

    const int planeType = static_cast<int>(
        processor_.apvts.getRawParameterValue(ParamID::PLANE_TYPE)->load());
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

    const float rx = rotX * (3.14159265f / 180.0f);
    const float ry = rotY * (3.14159265f / 180.0f);
    const float rz = rotZ * (3.14159265f / 180.0f);
    const float cx = std::cos(rx), sx = std::sin(rx);
    const float cy = std::cos(ry), sy = std::sin(ry);
    const float cz = std::cos(rz), sz = std::sin(rz);
    const float offX = pathX * 2.0f - 1.0f;
    const float offY = pathY * 2.0f - 1.0f;
    const float offZ = pathZ * 2.0f - 1.0f;

    int vIdx = 0;
    for (int j = 0; j <= gridRes; ++j) {
      float vVal = (float)j / gridRes * 2.0f - 1.0f;
      for (int i = 0; i <= gridRes; ++i) {
        float uVal = (float)i / gridRes * 2.0f - 1.0f;
        Vertex3 v = ReadingPath::calcVertex(
            uVal, vVal, static_cast<PlaneType>(planeType), shapePhase);

        float y1 = v.y * cx - v.z * sx;
        float z1 = v.y * sx + v.z * cx;
        float x2 = v.x * cy + z1 * sy;
        float z2 = -v.x * sy + z1 * cy;
        float x3 = x2 * cz - y1 * sz;
        float y3 = x2 * sz + y1 * cz;
        float z3 = z2;

        plane[vIdx++] = x3 + offX;
        plane[vIdx++] = y3 + offY;
        plane[vIdx++] = z3 + offZ;
      }
    }

    glBindBuffer(GL_ARRAY_BUFFER, planeVBO);
    glBufferData(GL_ARRAY_BUFFER, (GLsizeiptr)(plane.size() * sizeof(float)),
                 plane.data(), GL_DYNAMIC_DRAW);

    wireframeProgram->use();
    if (wireMvpUniform)
      wireMvpUniform->setMatrix4(mvp.mat, 1, false);
    if (wireColorUniform)
      wireColorUniform->set(0.2f, 0.4f, 0.6f); // dark blue plane

    if (canUseVAO && planeVAO != 0) {
      openGLContext.extensions.glBindVertexArray(planeVAO);
      glDrawElements(GL_TRIANGLES, planeIndexCount, GL_UNSIGNED_INT, nullptr);
      openGLContext.extensions.glBindVertexArray(0);
    } else if (wirePosAttrib) {
      glBindBuffer(GL_ARRAY_BUFFER, planeVBO);
      glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, planeIBO);
      glEnableVertexAttribArray((GLuint)wirePosAttrib->attributeID);
      glVertexAttribPointer((GLuint)wirePosAttrib->attributeID, 3, GL_FLOAT,
                            GL_FALSE, 3 * sizeof(float), nullptr);
      glDrawElements(GL_TRIANGLES, planeIndexCount, GL_UNSIGNED_INT, nullptr);
      glDisableVertexAttribArray((GLuint)wirePosAttrib->attributeID);
      glBindBuffer(GL_ARRAY_BUFFER, 0);
      glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, 0);
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
                          GL_FALSE, 7 * sizeof(float), nullptr);
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
                          GL_FALSE, 7 * sizeof(float), nullptr);
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
                          GL_FALSE, 3 * sizeof(float), nullptr);
  }
  openGLContext.extensions.glBindVertexArray(0);

  // Reading plane
  openGLContext.extensions.glGenVertexArrays(1, &planeVAO);
  openGLContext.extensions.glBindVertexArray(planeVAO);
  openGLContext.extensions.glGenBuffers(1, &planeVBO);
  glBindBuffer(GL_ARRAY_BUFFER, planeVBO);
  if (wirePosAttrib) {
    glEnableVertexAttribArray((GLuint)wirePosAttrib->attributeID);
    glVertexAttribPointer((GLuint)wirePosAttrib->attributeID, 3, GL_FLOAT,
                          GL_FALSE, 3 * sizeof(float), nullptr);
  }

  const int gridRes = 24;
  std::vector<unsigned int> planeIndices;
  for (int j = 0; j < gridRes; ++j) {
    for (int i = 0; i < gridRes; ++i) {
      int r0 = j * (gridRes + 1);
      int r1 = (j + 1) * (gridRes + 1);
      planeIndices.push_back((unsigned int)(r0 + i));
      planeIndices.push_back((unsigned int)(r0 + i + 1));
      planeIndices.push_back((unsigned int)(r1 + i));
      planeIndices.push_back((unsigned int)(r0 + i + 1));
      planeIndices.push_back((unsigned int)(r1 + i + 1));
      planeIndices.push_back((unsigned int)(r1 + i));
    }
  }
  planeIndexCount = (int)planeIndices.size();
  openGLContext.extensions.glGenBuffers(1, &planeIBO);
  glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, planeIBO);
  glBufferData(GL_ELEMENT_ARRAY_BUFFER, (GLsizeiptr)(planeIndices.size() * sizeof(unsigned int)),
               planeIndices.data(), GL_STATIC_DRAW);

  openGLContext.extensions.glBindVertexArray(0);

  // Axes and Labels Geometry
  std::vector<float> axesVerts;
  const float origin = -1.2f;
  const float length = 1.0f;
  const float arrow = 0.05f;

  // X - BINS
  int xStart = (int)axesVerts.size() / 3;
  axesVerts.push_back(origin); axesVerts.push_back(origin); axesVerts.push_back(origin);
  axesVerts.push_back(origin + length); axesVerts.push_back(origin); axesVerts.push_back(origin);
  // Arrowhead
  axesVerts.push_back(origin+length); axesVerts.push_back(origin); axesVerts.push_back(origin);
  axesVerts.push_back(origin+length-arrow); axesVerts.push_back(origin+arrow); axesVerts.push_back(origin);
  axesVerts.push_back(origin+length); axesVerts.push_back(origin); axesVerts.push_back(origin);
  axesVerts.push_back(origin+length-arrow); axesVerts.push_back(origin-arrow); axesVerts.push_back(origin);
  // Label BINS
  {
    float lx = origin + 0.2f, ly = origin - 0.2f, lz = origin, s = 0.04f;
    for (char c : std::string("BINS")) {
      addChar(c, lx, ly, lz, s, axesVerts, 0);
      lx += s * 3.0f;
    }
  }
  axesCounts[0] = (int)axesVerts.size() / 3 - xStart;

  // Y - MORPH
  int yStart = (int)axesVerts.size() / 3;
  axesVerts.push_back(origin); axesVerts.push_back(origin); axesVerts.push_back(origin);
  axesVerts.push_back(origin); axesVerts.push_back(origin + length); axesVerts.push_back(origin);
  // Arrowhead
  axesVerts.push_back(origin); axesVerts.push_back(origin+length); axesVerts.push_back(origin);
  axesVerts.push_back(origin+arrow); axesVerts.push_back(origin+length-arrow); axesVerts.push_back(origin);
  axesVerts.push_back(origin); axesVerts.push_back(origin+length); axesVerts.push_back(origin);
  axesVerts.push_back(origin-arrow); axesVerts.push_back(origin+length-arrow); axesVerts.push_back(origin);
  // Label MORPH
  {
    float lx = origin - 0.2f, ly = origin + 0.2f, lz = origin, s = 0.04f;
    for (char c : std::string("MORPH")) {
      addChar(c, lx, ly, lz, s, axesVerts, 1);
      ly += s * 3.0f;
    }
  }
  axesCounts[1] = (int)axesVerts.size() / 3 - yStart;

  // Z - TIME
  int zStart = (int)axesVerts.size() / 3;
  axesVerts.push_back(origin); axesVerts.push_back(origin); axesVerts.push_back(origin);
  axesVerts.push_back(origin); axesVerts.push_back(origin); axesVerts.push_back(origin + length);
  // Arrowhead
  axesVerts.push_back(origin); axesVerts.push_back(origin); axesVerts.push_back(origin+length);
  axesVerts.push_back(origin+arrow); axesVerts.push_back(origin); axesVerts.push_back(origin+length-arrow);
  axesVerts.push_back(origin); axesVerts.push_back(origin); axesVerts.push_back(origin+length);
  axesVerts.push_back(origin-arrow); axesVerts.push_back(origin); axesVerts.push_back(origin+length-arrow);
  // Label TIME
  {
    float lx = origin - 0.2f, ly = origin, lz = origin + 0.2f, s = 0.04f;
    for (char c : std::string("TIME")) {
      addChar(c, lx, ly, lz, s, axesVerts, 2);
      lz += s * 3.0f;
    }
  }
  axesCounts[2] = (int)axesVerts.size() / 3 - zStart;

  openGLContext.extensions.glGenVertexArrays(1, &axesVAO);
  openGLContext.extensions.glBindVertexArray(axesVAO);
  openGLContext.extensions.glGenBuffers(1, &axesVBO);
  glBindBuffer(GL_ARRAY_BUFFER, axesVBO);
  glBufferData(GL_ARRAY_BUFFER, (GLsizeiptr)(axesVerts.size() * sizeof(float)),
               axesVerts.data(), GL_STATIC_DRAW);
  if (wirePosAttrib) {
    glEnableVertexAttribArray((GLuint)wirePosAttrib->attributeID);
    glVertexAttribPointer((GLuint)wirePosAttrib->attributeID, 3, GL_FLOAT,
                          GL_FALSE, 3 * sizeof(float), nullptr);
  }
  openGLContext.extensions.glBindVertexArray(0);
}
