#!/bin/bash
# Draws the DMG window background (assets/dmg/background.png, @2x and a
# combined background.tiff) for
# scripts/package-macos.sh. Layout must match scripts/dmg-layout.applescript:
# 640x420 window, 128 px icons centered at (170,215) and (470,215).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/assets/dmg"
FONT_BOLD=/System/Library/Fonts/Supplemental/Arial\ Rounded\ Bold.ttf
FONT=/System/Library/Fonts/Supplemental/Arial.ttf
DARK='#13303a'
mkdir -p "$OUT"
# Drawn at 2x (1280x840); every coordinate below is 2x.
convert -size 1280x840 gradient:'#8fb0b3'-'#6f9298' \
  \( -size 1600x1600 radial-gradient:'#ffffff30'-'#ffffff00' -gravity center -crop 1280x840+0+0 +repage \) -compose over -composite \
  -font "$FONT_BOLD" -pointsize 54 -fill "$DARK" -gravity north -annotate +0+70 'Install Sound Scraper' \
  -font "$FONT" -pointsize 30 -fill "${DARK}cc" -gravity south -annotate +0+70 'Drag the app onto the Applications folder' \
  -gravity northwest -fill none -stroke "$DARK" -strokewidth 16 -draw "stroke-linecap round path 'M 520,400 Q 640,330 752,400'" \
  -stroke none -fill "$DARK" -draw "polygon 788,422 728,418 757,370" \
  -alpha off -depth 8 "$OUT/background@2x.png"
convert "$OUT/background@2x.png" -resize 640x420 -alpha off -depth 8 "$OUT/background.png"
# Multi-resolution TIFF (1x + 2x) for Finder, kept small with LZW.
tiffutil -cathidpicheck "$OUT/background.png" "$OUT/background@2x.png" -out "$OUT/background.tiff" >/dev/null
tiffutil -lzw "$OUT/background.tiff" -out "$OUT/background.tiff" >/dev/null
echo "Wrote $OUT/background.png and background@2x.png"
