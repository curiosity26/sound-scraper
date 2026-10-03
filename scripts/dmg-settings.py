# dmgbuild settings for the Sound Scraper installer (scripts/package-macos.sh).
# Defines passed with -D: app (path to the staged "Sound Scraper.app"),
# icon (volume .icns), background (assets/dmg/background.tiff, 1x + 2x). Layout matches scripts/gen-dmg-background.sh.
import os.path

app = defines["app"]  # noqa: F821  (injected by dmgbuild)
app_name = os.path.basename(app)

format = "UDZO"
files = [app]
symlinks = {"Applications": "/Applications"}
icon = defines["icon"]  # noqa: F821
background = defines["background"]  # noqa: F821

window_rect = ((200, 140), (640, 420))
default_view = "icon-view"
show_status_bar = False
show_tab_view = False
show_toolbar = False
show_pathbar = False
show_sidebar = False
icon_size = 128
text_size = 14
icon_locations = {
    app_name: (170, 215),
    "Applications": (470, 215),
}
