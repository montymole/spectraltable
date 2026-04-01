#pragma once
#include "../PluginProcessor.h"
#include <juce_gui_basics/juce_gui_basics.h>
#include <juce_opengl/juce_opengl.h>

class SpectralCubePanel : public juce::Component, public juce::OpenGLRenderer {
public:
  SpectralCubePanel(PluginProcessor &processor);
  ~SpectralCubePanel() override;

  void paint(juce::Graphics &g) override;
  void resized() override;
  void mouseDown(const juce::MouseEvent &event) override;
  void mouseDrag(const juce::MouseEvent &event) override;
  void mouseWheelMove(const juce::MouseEvent &event,
                      const juce::MouseWheelDetails &wheel) override;

  void setShowWireframe(bool shouldShow) { showWireframe = shouldShow; }
  void setShowPoints(bool shouldShow) { showPoints = shouldShow; }
  void setShowLine(bool shouldShow) { showLine = shouldShow; }
  void setShowPlane(bool shouldShow) { showPlane = shouldShow; }

  // OpenGLRenderer overrides
  void newOpenGLContextCreated() override;
  void renderOpenGL() override;
  void openGLContextClosing() override;

  void setDebugText(const juce::String &text);

private:
  PluginProcessor &processor_;
  juce::OpenGLContext openGLContext;

  std::unique_ptr<juce::OpenGLShaderProgram> wireframeProgram;
  std::unique_ptr<juce::OpenGLShaderProgram> pointProgram;
  std::unique_ptr<juce::OpenGLShaderProgram> testProgram;
  std::unique_ptr<juce::OpenGLShaderProgram::Attribute> wirePosAttrib;
  std::unique_ptr<juce::OpenGLShaderProgram::Uniform> wireMvpUniform;
  std::unique_ptr<juce::OpenGLShaderProgram::Uniform> wireColorUniform;
  std::unique_ptr<juce::OpenGLShaderProgram::Attribute> pointPosAttrib;
  std::unique_ptr<juce::OpenGLShaderProgram::Attribute> pointDataAttrib;
  std::unique_ptr<juce::OpenGLShaderProgram::Uniform> pointMvpUniform;
  std::unique_ptr<juce::OpenGLShaderProgram::Attribute> testPosAttrib;
  std::unique_ptr<juce::OpenGLShaderProgram::Attribute> testColorAttrib;

  GLuint wireframeVAO = 0;
  GLuint wireframeVBO = 0;
  GLuint wireframeIBO = 0;

  GLuint pointVAO = 0;
  GLuint pointVBO = 0;
  int pointCount = 0;

  GLuint lineVAO = 0;
  GLuint lineVBO = 0;
  int lineCount = 0;

  GLuint planeVAO = 0;
  GLuint planeVBO = 0;
  GLuint planeIBO = 0;
  int planeIndexCount = 0;

  GLuint axesVAO = 0;
  GLuint axesVBO = 0;
  int axesCounts[3] = {0, 0, 0};

  GLuint volumeTexture = 0;
  uint32_t lastVolumeVersion = 0;
  GLuint testVBO = 0;
  GLuint testVAO = 0;

  float rotationX = 0.3f;
  float rotationY = 0.4f;
  float zoom = 3.0f;
  juce::Point<int> lastMousePos;

  bool showWireframe = true;
  bool showPoints = true;
  bool showLine = false;
  bool showPlane = true;

  juce::String debugText = "cube";
  juce::CriticalSection debugLock;

  juce::Matrix3D<float> getProjectionMatrix() const;
  juce::Matrix3D<float> getViewMatrix() const;

  void createPrograms();
  void createGeometry();

  JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(SpectralCubePanel)
};
