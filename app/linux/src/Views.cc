#include "Views.h"

#include <cairo.h>
#include <gtk/gtk.h>
#include <react/renderer/core/propsConversions.h>

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <vector>

#include "Shared.h"
#include "sound_scraper.h"

using namespace facebook::react;

namespace soundscraper {

extern const char VisualizerViewComponentName[] = "SSVisualizerView";
extern const char WaveformViewComponentName[] = "SSWaveformView";

VisualizerViewProps::VisualizerViewProps(const PropsParserContext &context,
                                         const VisualizerViewProps &sourceProps,
                                         const RawProps &rawProps)
    : ViewProps(context, sourceProps, rawProps),
      preset(convertRawProp(context, rawProps, "preset", sourceProps.preset, {})),
      pixelated(convertRawProp(context, rawProps, "pixelated", sourceProps.pixelated, true)),
      skinScale(convertRawProp(context, rawProps, "skinScale", sourceProps.skinScale, 1.0)) {}

WaveformViewProps::WaveformViewProps(const PropsParserContext &context,
                                     const WaveformViewProps &sourceProps, const RawProps &rawProps)
    : ViewProps(context, sourceProps, rawProps),
      editorId(convertRawProp(context, rawProps, "editorId", sourceProps.editorId, 0.0)),
      startMs(convertRawProp(context, rawProps, "startMs", sourceProps.startMs, 0.0)),
      msPerPoint(convertRawProp(context, rawProps, "msPerPoint", sourceProps.msPerPoint, 10.0)),
      colors(convertRawProp(context, rawProps, "colors", sourceProps.colors, {})) {}

namespace {

/// The display's pixels per point for a widget (fractional scales too).
double pointScale(GtkWidget *widget) {
  if (GtkNative *native = gtk_widget_get_native(widget)) {
    if (GdkSurface *surface = gtk_native_get_surface(native)) {
      double scale = gdk_surface_get_scale(surface);
      if (scale > 0) return scale;
    }
  }
  return std::max(1, gtk_widget_get_scale_factor(widget));
}

/// Paints premultiplied RGBA pixels (w × h) over the widget's area, scaled
/// to (width × height) points; `nearest` keeps pixel art's hard edges.
void paint(cairo_t *cr, std::vector<uint8_t> &rgba, int w, int h, int width, int height,
           bool nearest) {
  // Cairo's ARGB32 is premultiplied BGRA in memory on little-endian.
  for (size_t i = 0; i + 3 < rgba.size(); i += 4) std::swap(rgba[i], rgba[i + 2]);
  int stride = cairo_format_stride_for_width(CAIRO_FORMAT_ARGB32, w);
  if (stride != w * 4) return;  // never for ARGB32, but don't read past the buffer
  cairo_surface_t *image =
      cairo_image_surface_create_for_data(rgba.data(), CAIRO_FORMAT_ARGB32, w, h, stride);
  cairo_save(cr);
  cairo_scale(cr, double(width) / w, double(height) / h);
  cairo_set_source_surface(cr, image, 0, 0);
  cairo_pattern_set_filter(cairo_get_source(cr), nearest ? CAIRO_FILTER_NEAREST : CAIRO_FILTER_GOOD);
  cairo_paint(cr);
  cairo_restore(cr);
  cairo_surface_destroy(image);
}

// ---- Visualizer ----

struct Visualizer {
  SsVis *vis = nullptr;
  std::string preset, appliedPreset;
  bool pixelated = true;
  double skinScale = 1.0;
  bool needsIdleDraw = true;
  guint tick = 0;
  std::vector<uint8_t> pixels;

  ~Visualizer() { ss_vis_destroy(vis); }
};

Visualizer *visualizerOf(GtkWidget *widget) {
  return static_cast<Visualizer *>(g_object_get_data(G_OBJECT(widget), "ss-visualizer"));
}

void drawVisualizer(GtkDrawingArea *area, cairo_t *cr, int width, int height, gpointer) {
  Visualizer *v = visualizerOf(GTK_WIDGET(area));
  if (!v || !v->vis || width <= 0 || height <= 0) return;
  // Pixelated: one pixel per skin point, enlarged with hard edges.
  double scale = pointScale(GTK_WIDGET(area));
  double perPoint = v->pixelated ? 1.0 / v->skinScale : scale;
  double unit = v->pixelated ? 1.0 : v->skinScale * scale;
  int w = int(std::lround(width * perPoint)), h = int(std::lround(height * perPoint));
  if (w <= 0 || h <= 0) return;
  v->pixels.resize(size_t(w) * h * 4);
  ss_vis_render(v->vis, uint32_t(w), uint32_t(h), float(unit), v->pixels.data(), v->pixels.size());
  paint(cr, v->pixels, w, h, width, height, v->pixelated);
}

gboolean tickVisualizer(GtkWidget *widget, GdkFrameClock *, gpointer) {
  Visualizer *v = visualizerOf(widget);
  if (!v) return G_SOURCE_REMOVE;
  if (!v->vis) {
    if (!currentRecorder()) return G_SOURCE_CONTINUE;
    v->vis = ss_vis_create(currentRecorder());
    if (!v->vis) return G_SOURCE_CONTINUE;
  }
  if (v->preset != v->appliedPreset) {
    ss_vis_set_preset(v->vis, v->preset.c_str());
    v->appliedPreset = v->preset;
    v->needsIdleDraw = true;
  }
  bool live = ss_vis_is_live(v->vis);
  if (live || v->needsIdleDraw) {
    gtk_widget_queue_draw(widget);
    v->needsIdleDraw = live;  // after a recording ends, the idle look once
  }
  return G_SOURCE_CONTINUE;
}

// ---- Waveform ----

struct Waveform {
  uint64_t editorId = 0;
  double startMs = 0, msPerPoint = 10;
  std::string colors;
  bool ready = false;
  gint64 lastPoll = 0;
  std::vector<uint8_t> pixels;
};

Waveform *waveformOf(GtkWidget *widget) {
  return static_cast<Waveform *>(g_object_get_data(G_OBJECT(widget), "ss-waveform"));
}

void drawWaveform(GtkDrawingArea *area, cairo_t *cr, int width, int height, gpointer) {
  Waveform *wf = waveformOf(GTK_WIDGET(area));
  if (!wf || wf->editorId == 0 || width <= 0 || height <= 0) return;
  double scale = pointScale(GTK_WIDGET(area));
  int w = int(std::lround(width * scale)), h = int(std::lround(height * scale));
  if (w <= 0 || h <= 0) return;
  wf->pixels.resize(size_t(w) * h * 4);
  wf->ready = ss_editor_render(wf->editorId, wf->startMs, wf->msPerPoint / scale, uint32_t(w),
                               uint32_t(h), wf->colors.c_str(), wf->pixels.data(), wf->pixels.size());
  paint(cr, wf->pixels, w, h, width, height, false);
}

/// Redraws while the waveform is still loading, about ten times a second.
gboolean tickWaveform(GtkWidget *widget, GdkFrameClock *clock, gpointer) {
  Waveform *wf = waveformOf(widget);
  if (!wf) return G_SOURCE_REMOVE;
  gint64 now = gdk_frame_clock_get_frame_time(clock);
  if (!wf->ready && wf->editorId != 0 && now - wf->lastPoll > 100000) {
    wf->lastPoll = now;
    gtk_widget_queue_draw(widget);
  }
  return G_SOURCE_CONTINUE;
}

}  // namespace

rngtk::NativeComponent visualizerViewComponent() {
  rngtk::NativeComponent component;
  component.descriptor = concreteComponentDescriptorProvider<VisualizerViewComponentDescriptor>();
  component.create = [](const ShadowView &) {
    GtkWidget *area = gtk_drawing_area_new();
    auto *v = new Visualizer();
    g_object_set_data_full(G_OBJECT(area), "ss-visualizer", v,
                           [](gpointer p) { delete static_cast<Visualizer *>(p); });
    gtk_drawing_area_set_draw_func(GTK_DRAWING_AREA(area), drawVisualizer, nullptr, nullptr);
    // Every display refresh, as SSVisualizerView does on macOS (no JS per frame).
    v->tick = gtk_widget_add_tick_callback(area, tickVisualizer, nullptr, nullptr);
    // Redraw at the new size.
    g_signal_connect(area, "resize", G_CALLBACK(+[](GtkDrawingArea *a, int, int, gpointer) {
                       if (Visualizer *vv = visualizerOf(GTK_WIDGET(a))) vv->needsIdleDraw = true;
                     }),
                     nullptr);
    return area;
  };
  component.update = [](GtkWidget *widget, const ShadowView &, const ShadowView &newView) {
    Visualizer *v = visualizerOf(widget);
    auto props = std::static_pointer_cast<const VisualizerViewProps>(newView.props);
    if (!v || !props) return;
    v->preset = props->preset;
    v->pixelated = props->pixelated;
    v->skinScale = std::max(0.25, props->skinScale);
    v->needsIdleDraw = true;
  };
  return component;
}

rngtk::NativeComponent waveformViewComponent() {
  rngtk::NativeComponent component;
  component.descriptor = concreteComponentDescriptorProvider<WaveformViewComponentDescriptor>();
  component.create = [](const ShadowView &) {
    GtkWidget *area = gtk_drawing_area_new();
    g_object_set_data_full(G_OBJECT(area), "ss-waveform", new Waveform(),
                           [](gpointer p) { delete static_cast<Waveform *>(p); });
    gtk_drawing_area_set_draw_func(GTK_DRAWING_AREA(area), drawWaveform, nullptr, nullptr);
    gtk_widget_add_tick_callback(area, tickWaveform, nullptr, nullptr);
    return area;
  };
  component.update = [](GtkWidget *widget, const ShadowView &, const ShadowView &newView) {
    Waveform *wf = waveformOf(widget);
    auto props = std::static_pointer_cast<const WaveformViewProps>(newView.props);
    if (!wf || !props) return;
    wf->editorId = props->editorId > 0 ? uint64_t(props->editorId) : 0;
    wf->startMs = props->startMs;
    wf->msPerPoint = props->msPerPoint > 0 ? props->msPerPoint : 10;
    wf->colors = props->colors;
    wf->ready = false;
    gtk_widget_queue_draw(widget);
  };
  return component;
}

}  // namespace soundscraper
