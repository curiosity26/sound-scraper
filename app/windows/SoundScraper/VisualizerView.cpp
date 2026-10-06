#include "pch.h"

#include "VisualizerView.h"

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

#pragma comment(lib, "d2d1.lib")
#pragma comment(lib, "d3d11.lib")
#pragma comment(lib, "dxgi.lib")

namespace SoundScraper {

namespace rn = winrt::Microsoft::ReactNative;
namespace comp = winrt::Microsoft::UI::Composition;

REACT_STRUCT(VisualizerProps)
struct VisualizerProps : winrt::implements<VisualizerProps, rn::IComponentProps> {
  VisualizerProps(rn::ViewProps props, rn::IComponentProps const &cloneFrom) : ViewProps(props) {
    if (cloneFrom) {
      auto from = cloneFrom.as<VisualizerProps>();
      preset = from->preset;
      pixelated = from->pixelated;
      skinScale = from->skinScale;
    }
  }

  void SetProp(uint32_t hash, winrt::hstring propName, rn::IJSValueReader value) noexcept {
    rn::ReadProp(hash, propName, value, *this);
  }

  /// One of the skin's visualizer presets, as JSON.
  REACT_FIELD(preset)
  std::optional<std::string> preset;

  REACT_FIELD(pixelated)
  std::optional<bool> pixelated;

  REACT_FIELD(skinScale)
  std::optional<double> skinScale;

  const rn::ViewProps ViewProps;
};

/// One Direct2D device and composition graphics device for all views (the
/// visualizer and the editor's waveform).
comp::CompositionGraphicsDevice SharedGraphicsDevice(comp::Compositor const &compositor) {
  static comp::CompositionGraphicsDevice device{nullptr};
  if (device) {
    return device;
  }
  winrt::com_ptr<ID3D11Device> d3d;
  UINT flags = D3D11_CREATE_DEVICE_BGRA_SUPPORT;
  if (FAILED(D3D11CreateDevice(nullptr, D3D_DRIVER_TYPE_HARDWARE, nullptr, flags, nullptr, 0, D3D11_SDK_VERSION,
                               d3d.put(), nullptr, nullptr))) {
    // No GPU (or a VM without one): software rendering.
    winrt::check_hresult(D3D11CreateDevice(nullptr, D3D_DRIVER_TYPE_WARP, nullptr, flags, nullptr, 0,
                                           D3D11_SDK_VERSION, d3d.put(), nullptr, nullptr));
  }
  winrt::com_ptr<ID2D1Factory1> factory;
  winrt::check_hresult(D2D1CreateFactory(D2D1_FACTORY_TYPE_SINGLE_THREADED, factory.put()));
  winrt::com_ptr<ID2D1Device> d2d;
  winrt::check_hresult(factory->CreateDevice(d3d.as<IDXGIDevice>().get(), d2d.put()));
  auto interop = compositor.as<comp::ICompositorInterop>();
  winrt::check_hresult(interop->CreateGraphicsDevice(d2d.get(), &device));
  return device;
}

struct VisualizerState : winrt::implements<VisualizerState, winrt::Windows::Foundation::IInspectable> {
  ~VisualizerState() {
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
    } catch (winrt::hresult_error const &e) {
      // No graphics device: the view stays empty.
      LogError(("visualizer: no graphics device: " + winrt::to_string(e.message())).c_str());
    } catch (...) {
      LogError("visualizer: no graphics device");
    }
    m_timer = winrt::Microsoft::UI::Dispatching::DispatcherQueue::GetForCurrentThread().CreateTimer();
    m_timer.Interval(std::chrono::milliseconds(16));
    m_timer.Tick([weak = get_weak()](auto const &, auto const &) {
      if (auto self = weak.get()) {
        Guarded("visualizer tick", [&] { self->Tick(); });
      }
    });
    m_timer.Start();
    return m_visual;
  }

  void UpdateProps(winrt::com_ptr<VisualizerProps> const &props) {
    m_preset = props->preset.value_or("");
    m_pixelated = props->pixelated.value_or(true);
    m_skinScale = std::max(0.25, props->skinScale.value_or(1.0));
    if (m_brush) {
      m_brush.BitmapInterpolationMode(m_pixelated ? comp::CompositionBitmapInterpolationMode::NearestNeighbor
                                                  : comp::CompositionBitmapInterpolationMode::Linear);
    }
    m_needsIdleDraw = true;
  }

  void Layout(rn::LayoutMetrics const &metrics) {
    m_size = {metrics.Frame.Width, metrics.Frame.Height};
    m_pointScale = metrics.PointScaleFactor > 0 ? metrics.PointScaleFactor : 1.0f;
    if (m_visual) {
      m_visual.Size({metrics.Frame.Width * m_pointScale, metrics.Frame.Height * m_pointScale});
    }
    m_needsIdleDraw = true;
  }

  void Stop() {
    if (m_timer) {
      m_timer.Stop();
      m_timer = nullptr;
    }
    ss_vis_destroy(m_vis);
    m_vis = nullptr;
  }

 private:
  void Tick() {
    if (!m_vis) {
      if (!CurrentRecorder()) {
        return;
      }
      m_vis = ss_vis_create(CurrentRecorder());
    }
    if (m_preset != m_appliedPreset) {
      ss_vis_set_preset(m_vis, m_preset.c_str());
      m_appliedPreset = m_preset;
      m_needsIdleDraw = true;
    }
    bool live = ss_vis_is_live(m_vis);
    if (!live && !m_needsIdleDraw) {
      return;
    }
    Draw();
    m_needsIdleDraw = live; // after a recording ends, the idle look once
  }

  void Draw() {
    if (!m_surface || m_size.Width <= 0 || m_size.Height <= 0) {
      return;
    }
    // Pixelated: one pixel per skin point, enlarged with hard edges.
    double perPoint = m_pixelated ? 1.0 / m_skinScale : m_pointScale;
    double unit = m_pixelated ? 1.0 : m_skinScale * m_pointScale;
    UINT w = static_cast<UINT>(std::lround(m_size.Width * perPoint));
    UINT h = static_cast<UINT>(std::lround(m_size.Height * perPoint));
    if (w == 0 || h == 0) {
      return;
    }
    m_pixels.resize(static_cast<size_t>(w) * h * 4);
    ss_vis_render(m_vis, w, h, static_cast<float>(unit), m_pixels.data(), m_pixels.size());
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

  comp::SpriteVisual m_visual{nullptr};
  comp::CompositionDrawingSurface m_surface{nullptr};
  comp::CompositionSurfaceBrush m_brush{nullptr};
  winrt::Microsoft::UI::Dispatching::DispatcherQueueTimer m_timer{nullptr};
  SsVis *m_vis{nullptr};
  std::string m_preset, m_appliedPreset;
  bool m_pixelated{true};
  double m_skinScale{1.0};
  winrt::Windows::Foundation::Size m_size{0, 0};
  float m_pointScale{1.0f};
  SIZE m_surfaceSize{0, 0};
  bool m_needsIdleDraw{true};
  std::vector<uint8_t> m_pixels;
};

void RegisterVisualizerView(rn::IReactPackageBuilder const &packageBuilder) noexcept {
  auto fabric = packageBuilder.try_as<rn::IReactPackageBuilderFabric>();
  if (!fabric) {
    return;
  }
  fabric.AddViewComponent(L"SSVisualizerView", [](rn::IReactViewComponentBuilder const &builder) noexcept {
    builder.SetCreateProps([](rn::ViewProps props, rn::IComponentProps const &cloneFrom) noexcept {
      return winrt::make<VisualizerProps>(props, cloneFrom);
    });
    builder.SetUpdatePropsHandler(
        [](rn::ComponentView const &view, rn::IComponentProps const &newProps, rn::IComponentProps const &) noexcept {
          Guarded("visualizer props", [&] {
            if (auto state = view.UserData(); state && newProps) {
              winrt::get_self<VisualizerState>(state)->UpdateProps(newProps.as<VisualizerProps>());
            }
          });
        });
    auto compositionBuilder = builder.as<rn::Composition::IReactCompositionViewComponentBuilder>();
    // A plain view component (its visual comes from the handler below);
    // without an initializer the component has no descriptor.
    compositionBuilder.SetViewComponentViewInitializer([](rn::Composition::ViewComponentView const &) noexcept {});
    // Positioned like any view, but no background: React Native would
    // otherwise set the visual's brush (to none), hiding the frames.
    compositionBuilder.SetViewFeatures(rn::Composition::ComponentViewFeatures::NativeBorder);
    compositionBuilder.SetCreateVisualHandler([](rn::ComponentView const &view) noexcept {
      auto state = winrt::make_self<VisualizerState>();
      view.UserData(*state);
      view.Destroying([](auto const &, rn::ComponentView const &destroyed) {
        if (auto data = destroyed.UserData()) {
          winrt::get_self<VisualizerState>(data)->Stop();
        }
      });
      return state->CreateVisual(view.as<rn::Composition::ComponentView>().Compositor());
    });
    compositionBuilder.SetUpdateLayoutMetricsHandler(
        [](rn::ComponentView const &view, rn::LayoutMetrics const &newMetrics, rn::LayoutMetrics const &) noexcept {
          Guarded("visualizer layout", [&] {
            if (auto state = view.UserData()) {
              winrt::get_self<VisualizerState>(state)->Layout(newMetrics);
            }
          });
        });
  });
}

} // namespace SoundScraper
