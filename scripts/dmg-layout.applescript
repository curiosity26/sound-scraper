-- Lays out the mounted installer volume (run by scripts/package-macos.sh).
-- Finder itself writes the .DS_Store, so the background is always honored.
-- Layout matches scripts/gen-dmg-background.sh: 640x420 content, 128 px
-- icons centered at (170,215) and (470,215).
on run argv
	set volumeName to item 1 of argv
	tell application "Finder"
		tell disk volumeName
			open
			set current view of container window to icon view
			set toolbar visible of container window to false
			set statusbar visible of container window to false
			set sidebar width of container window to 0
			-- bounds are {left, top, right, bottom}; 640x420 of content.
			set the bounds of container window to {200, 140, 840, 560}
			set viewOptions to the icon view options of container window
			set arrangement of viewOptions to not arranged
			set icon size of viewOptions to 128
			set text size of viewOptions to 14
			set label position of viewOptions to bottom
			set background picture of viewOptions to file ".background:background.tiff"
			set position of item "Sound Scraper.app" of container window to {170, 215}
			set position of item "Applications" of container window to {470, 215}
			update without registering applications
			delay 1
			close
			-- Reopen once so Finder flushes the layout to .DS_Store.
			open
			delay 2
			close
		end tell
	end tell
end run
