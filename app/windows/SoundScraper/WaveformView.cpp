#include "pch.h"

#include "WaveformView.h"

#include <NativeModules.h>
#include <d2d1_1.h>
#include <d3d11.h>
#include <dxgi.h>
#include <winrt/Microsoft.Graphics.DirectX.h>
#include <winrt/Microsoft.UI.Composition.Interop.h>

#include <cmath>
#include <optional>
#include <string>
#include <vector>

#include "Shared.h"
#include "sound_scraper.h"

namespace SoundScraper {

namespace rn = winrt::Microsoft::ReactNative;
namespace comp = winrt::Microsoft::UI::Composition;

// The composition graphics device the visualizer uses (VisualizerView.cpp).
comp::CompositionGraphicsDevice SharedGraphicsDevice(comp::Compositor const &compositor);

REACT_STRUCT(WaveformProps)
struct WaveformProps : winrt::implements<WaveformProps, rn::IComponentProps> {
  WaveformProps(rn::ViewProps props, rn::IComponentProps const &cloneFrom) : ViewProps(props) {
    if (cloneFrom) {
      auto from = cloneFrom.as<WaveformProps>();
      editorId = from->editorId;
      startMs = from->startMs;
      msPerPoint = from->msPerPoint;
      colors = from->colors;
    }
  }

  void SetProp(uint32_t hash, winrt::hstring propName, rn::IJSValueReader value) noexcept {
    rn::ReadProp(hash, propName, value, *this);
  }

  REACT_FIELD(editorId)
  std::optional<double> editorId;

  /// The time at the left edge, and milliseconds per point.
  REACT_FIELD(startMs)
  std::optional<double> startMs;

  REACT_FIELD(msPerPoint)
  std::optional<double> msPerPoint;

  /// Colors as JSON: background, wave, rms, center.
  REACT_FIELD(colors)
  std::optional<std::string> colors;

  const rn::ViewProps ViewProps;
};

struct WaveformState : winrt::implements<WaveformState, winrt::Windows::Foundation::IInspectable> {
  ~WaveformState() {
    Stop();
  }

  comp::Visual CreateVisual(comp::Compositor const &compositor) {
    m_visual = compositor.CreateSpriteVisual();
    try {
      m_surface = SharedGraphicsDevice(compositor).CreateDrawingSurface(
          {1, 1}, winrt::Microsoft::Graphics::DirectX::DirectXPixelFormat::B8G8R8A8UIntNormalized,
          winrt::Microsoft::Graphics::DirectX::DirectXAlphaMode::Premultiplied);
      m_brush = compositor.CreateSurfaceBrush(m_surface);
      m_brush.Stretch(comp::CompositionStretch::Fill);
      m_visual.Brush(m_brush);
    } catch (...) {
      LogError("waveform: no graphics device");
    }
    // Polls while the waveform is being built; stopped once it's drawn.
    m_timer = winrt::Microsoft::UI::Dispatching::DispatcherQueue::GetForCurrentThread().CreateTimer();
    m_timer.Interval(std::chrono::milliseconds(250));
    m_timer.Tick([weak = get_weak()](auto const &, auto const &) {
      if (auto self = weak.get()) {
        Guarded("waveform poll", [&] { self->Draw(); });
      }
    });
    return m_visual;
  }

  void UpdateProps(winrt::com_ptr<WaveformProps> const &props) {
    m_editorId = static_cast<uint64_t>(props->editorId.value_or(0));
    m_startMs = props->startMs.value_or(0);
    m_msPerPoint = props->msPerPoint.value_or(0);
    m_colors = props->colors.value_or("");
    Draw();
  }

  void Layout(rn::LayoutMetrics const &metrics) {
    m_size = {metrics.Frame.Width, metrics.Frame.Height};
    m_pointScale = metrics.PointScaleFactor > 0 ? metrics.PointScaleFactor : 1.0f;
    if (m_visual) {
      m_visual.Size({metrics.Frame.Width * m_pointScale, metrics.Frame.Height * m_pointScale});
    }
    Draw();
  }

  void Stop() {
    if (m_timer) {
      m_timer.Stop();
      m_timer = nullptr;
    }
  }

  void Draw() {
    if (!m_surface || m_editorId == 0 || m_msPerPoint <= 0 || m_size.Width <= 0 || m_size.Height <= 0) {
      return;
    }
    UINT w = static_cast<UINT>(std::lround(m_size.Width * m_pointScale));
    UINT h = static_cast<UINT>(std::lround(m_size.Height * m_pointScale));
    if (w == 0 || h == 0) {
      return;
    }
    m_pixels.resize(static_cast<size_t>(w) * h * 4);
    bool ready = ss_editor_render(m_editorId, m_startMs, m_msPerPoint / m_pointScale, w, h, m_colors.c_str(),
                                  m_pixels.data(), m_pixels.size());
    if (m_timer) {
      if (ready) {
        m_timer.Stop();
      } else if (!m_timer.IsRunning()) {
        m_timer.Start();
      }
    }
    // Premultiplied RGBA → BGRA.
    for (size_t i = 0; i < m_pixels.size(); i += 4) {
      std::swap(m_pixels[i], m_pixels[i + 2]);
    }
    auto interop = m_surface.as<comp::ICompositionDrawingSurfaceInterop>();
    if (static_cast<LONG>(w) != m_surfaceSize.cx || static_cast<LONG>(h) != m_surfaceSize.cy) {
      m_surfaceSize = {static_cast<LONG>(w), static_cast<LONG>(h)};
      interop->Resize(m_surfaceSize);
    }
    winrt::com_ptr<ID2D1DeviceContext> context;
    POINT offset{};
    if (FAILED(interop->BeginDraw(nullptr, __uuidof(ID2D1DeviceContext), context.put_void(), &offset))) {
      return;
    }
    D2D1_BITMAP_PROPERTIES1 properties{};
    properties.pixelFormat = {DXGI_FORMAT_B8G8R8A8_UNORM, D2D1_ALPHA_MODE_PREMULTIPLIED};
    properties.dpiX = properties.dpiY = 96;
    winrt::com_ptr<ID2D1Bitmap1> bitmap;
    context->Clear(D2D1::ColorF(0, 0, 0, 0));
    if (SUCCEEDED(context->CreateBitmap({w, h}, m_pixels.data(), w * 4, properties, bitmap.put()))) {
      float x = static_cast<float>(offset.x), y = static_cast<float>(offset.y);
      context->DrawBitmap(bitmap.get(), D2D1::RectF(x, y, x + w, y + h));
    }
    interop->EndDraw();
  }

 private:
  comp::SpriteVisual m_visual{nullptr};
  comp::CompositionDrawingSurface m_surface{nullptr};
  comp::CompositionSurfaceBrush m_brush{nullptr};
  winrt::Microsoft::UI::Dispatching::DispatcherQueueTimer m_timer{nullptr};
  uint64_t m_editorId{0};
  double m_startMs{0}, m_msPerPoint{0};
  std::string m_colors;
  winrt::Windows::Foundation::Size m_size{0, 0};
  float m_pointScale{1.0f};
  SIZE m_surfaceSize{0, 0};
  std::vector<uint8_t> m_pixels;
};

void RegisterWaveformView(rn::IReactPackageBuilder const &packageBuilder) noexcept {
  auto fabric = packageBuilder.try_as<rn::IReactPackageBuilderFabric>();
  if (!fabric) {
    return;
  }
  fabric.AddViewComponent(L"SSWaveformView", [](rn::IReactViewComponentBuilder const &builder) noexcept {
    builder.SetCreateProps([](rn::ViewProps props, rn::IComponentProps const &cloneFrom) noexcept {
      return winrt::make<WaveformProps>(props, cloneFrom);
    });
    builder.SetUpdatePropsHandler(
        [](rn::ComponentView const &view, rn::IComponentProps const &newProps, rn::IComponentProps const &) noexcept {
          Guarded("waveform props", [&] {
            if (auto state = view.UserData(); state && newProps) {
              winrt::get_self<WaveformState>(state)->UpdateProps(newProps.as<WaveformProps>());
            }
          });
        });
    auto compositionBuilder = builder.as<rn::Composition::IReactCompositionViewComponentBuilder>();
    compositionBuilder.SetViewComponentViewInitializer([](rn::Composition::ViewComponentView const &) noexcept {});
    compositionBuilder.SetViewFeatures(rn::Composition::ComponentViewFeatures::NativeBorder);
    compositionBuilder.SetCreateVisualHandler([](rn::ComponentView const &view) noexcept {
      auto state = winrt::make_self<WaveformState>();
      view.UserData(*state);
      view.Destroying([](auto const &, rn::ComponentView const &destroyed) {
        if (auto data = destroyed.UserData()) {
          winrt::get_self<WaveformState>(data)->Stop();
        }
      });
      return state->CreateVisual(view.as<rn::Composition::ComponentView>().Compositor());
    });
    compositionBuilder.SetUpdateLayoutMetricsHandler(
        [](rn::ComponentView const &view, rn::LayoutMetrics const &newMetrics, rn::LayoutMetrics const &) noexcept {
          Guarded("waveform layout", [&] {
            if (auto state = view.UserData()) {
              winrt::get_self<WaveformState>(state)->Layout(newMetrics);
            }
          });
        });
  });
}

} // namespace SoundScraper
