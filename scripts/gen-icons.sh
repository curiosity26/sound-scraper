#!/bin/bash
# Generates the macOS AppIcon set and the Windows MSIX/.ico assets from
# assets/icon-source.png (1024x1024). Small sizes (<= 50 px) use a tight crop
# on the head and headphones, which stays readable where the full scene
# doesn't. Needs ImageMagick (convert).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/assets/icon-source.png"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

# Head + headphones crop, re-framed with rounded corners and the cream border.
convert "$SRC" -crop 520x520+215+140 +repage -resize 1024x1024 "$TMP/crop-raw.png"
convert -size 1024x1024 xc:none -fill white -draw "roundrectangle 0,0,1023,1023,190,190" "$TMP/mask.png"
convert "$TMP/crop-raw.png" "$TMP/mask.png" -alpha off -compose CopyOpacity -composite \
  \( -size 1024x1024 xc:none -fill none -stroke '#efe3c8' -strokewidth 44 \
     -draw "roundrectangle 22,22,1001,1001,170,170" \) -compose over -composite "$ROOT/assets/icon-small-source.png"
SMALL="$ROOT/assets/icon-small-source.png"

# fit <src> <size> <inset 0-1> <out>: scale into a transparent square, centered.
fit() {
  local inner; inner=$(python3 -c "print(round($2*$3))")
  convert "$1" -resize "${inner}x${inner}" -background none -gravity center -extent "$2x$2" "$4"
}

# macOS: the artwork sits on Apple's icon grid (~80% of the canvas).
MAC="$ROOT/app/macos/SoundScraper-macOS/Assets.xcassets/AppIcon.appiconset"
fit "$SMALL" 16 0.88 "$MAC/icon_16x16.png"
fit "$SMALL" 32 0.88 "$MAC/icon_16x16@2x.png"
fit "$SMALL" 32 0.88 "$MAC/icon_32x32.png"
fit "$SRC" 64 0.82 "$MAC/icon_32x32@2x.png"
fit "$SRC" 128 0.82 "$MAC/icon_128x128.png"
fit "$SRC" 256 0.82 "$MAC/icon_128x128@2x.png"
fit "$SRC" 256 0.82 "$MAC/icon_256x256.png"
fit "$SRC" 512 0.82 "$MAC/icon_256x256@2x.png"
fit "$SRC" 512 0.82 "$MAC/icon_512x512.png"
fit "$SRC" 1024 0.82 "$MAC/icon_512x512@2x.png"
cat > "$MAC/Contents.json" <<'JSON'
{
  "images" : [
    { "filename" : "icon_16x16.png", "idiom" : "mac", "scale" : "1x", "size" : "16x16" },
    { "filename" : "icon_16x16@2x.png", "idiom" : "mac", "scale" : "2x", "size" : "16x16" },
    { "filename" : "icon_32x32.png", "idiom" : "mac", "scale" : "1x", "size" : "32x32" },
    { "filename" : "icon_32x32@2x.png", "idiom" : "mac", "scale" : "2x", "size" : "32x32" },
    { "filename" : "icon_128x128.png", "idiom" : "mac", "scale" : "1x", "size" : "128x128" },
    { "filename" : "icon_128x128@2x.png", "idiom" : "mac", "scale" : "2x", "size" : "128x128" },
    { "filename" : "icon_256x256.png", "idiom" : "mac", "scale" : "1x", "size" : "256x256" },
    { "filename" : "icon_256x256@2x.png", "idiom" : "mac", "scale" : "2x", "size" : "256x256" },
    { "filename" : "icon_512x512.png", "idiom" : "mac", "scale" : "1x", "size" : "512x512" },
    { "filename" : "icon_512x512@2x.png", "idiom" : "mac", "scale" : "2x", "size" : "512x512" }
  ],
  "info" : { "author" : "xcode", "version" : 1 }
}
JSON

# Windows MSIX logos (Images/, referenced by Package.appxmanifest).
WIN="$ROOT/app/windows/SoundScraper.Package/Images"
fit "$SMALL" 88 1.0 "$WIN/Square44x44Logo.scale-200.png"
for t in 16 24 32 48; do fit "$SMALL" $t 1.0 "$WIN/Square44x44Logo.targetsize-${t}_altform-unplated.png"; done
fit "$SRC" 256 1.0 "$WIN/Square44x44Logo.targetsize-256_altform-unplated.png"
fit "$SMALL" 48 1.0 "$WIN/LockScreenLogo.scale-200.png"
fit "$SMALL" 50 1.0 "$WIN/StoreLogo.png"
fit "$SRC" 300 0.9 "$WIN/Square150x150Logo.scale-200.png"
convert "$SRC" -resize 270x270 -background none -gravity center -extent 620x300 "$WIN/Wide310x150Logo.scale-200.png"
convert "$SRC" -resize 520x520 -background none -gravity center -extent 1240x600 "$WIN/SplashScreen.scale-200.png"

# Windows exe icons.
EXE="$ROOT/app/windows/SoundScraper"
for s in 16 32 48; do fit "$SMALL" $s 1.0 "$TMP/ico-$s.png"; done
for s in 64 128 256; do fit "$SRC" $s 1.0 "$TMP/ico-$s.png"; done
convert "$TMP"/ico-{16,32,48,64,128,256}.png "$EXE/SoundScraper.ico"
convert "$TMP"/ico-{16,32}.png "$EXE/small.ico"
echo "Icons generated from $SRC"
