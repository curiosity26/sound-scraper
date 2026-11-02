# mediaremote-adapter

Vendored from https://github.com/ungive/mediaremote-adapter at tag v0.7.7
(e3ff5021eb0875858bd05f48d2e9ba2e962d1cf6), BSD 3-Clause (see LICENSE).

The macOS now-playing backend (core/crates/nowplaying/src/macos.rs) runs
`/usr/bin/perl bin/mediaremote-adapter.pl MediaRemoteAdapter.framework stream`
to read MediaRemote, which since macOS 15.4 only answers Apple's own
processes. core/scripts/build-mediaremote-adapter.sh builds the framework;
the Xcode build embeds it in Contents/Frameworks and the script in
Contents/Resources.

Left out: the test client (src/test) and the `test` command (src/adapter/test.m),
which the backend doesn't use; it falls back to AppleScript when the stream
stays silent instead. Otherwise unchanged: to update, copy src/, include/,
bin/mediaremote-adapter.pl and LICENSE from a newer tag, drop the same files,
and check CMakeLists.txt for new sources or frameworks.
