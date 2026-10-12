# Sound Scraper for Linux (GTK4), with @curiosity26/react-native-gtk4.
#
# `npx react-native run-linux` builds the React Native host once into a
# shared cache and points this build at it (ReactNativeGtk_DIR). To build by
# hand afterwards:
#   cmake -S linux -B linux/build/Debug -G Ninja -DCMAKE_BUILD_TYPE=Debug \
#     -DReactNativeGtk_DIR=<cache>/host/<id>/lib/cmake/ReactNativeGtk
#   cmake --build linux/build/Debug
#
# The Rust core (../../core) is built with cargo as part of this build:
# libsound_scraper_core.a is linked in, and LAME's shared library
# (libmp3lame.so.0, LGPL) is copied next to the executable.
cmake_minimum_required(VERSION 3.22)

if(NOT CMAKE_CXX_COMPILER AND NOT DEFINED ENV{CXX})
  set(CMAKE_CXX_COMPILER clang++)
endif()
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Debug)
endif()

project(SoundScraper LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(ReactNativeGtk REQUIRED)
find_package(PkgConfig REQUIRED)
pkg_check_modules(LIBPULSE REQUIRED IMPORTED_TARGET libpulse)
pkg_check_modules(ALSA REQUIRED IMPORTED_TARGET alsa)

# ---- The Rust core ----
get_filename_component(SS_CORE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../core" ABSOLUTE)
find_program(CARGO cargo HINTS "$ENV{HOME}/.cargo/bin" REQUIRED)
if(CMAKE_BUILD_TYPE STREQUAL "Debug")
  set(SS_CARGO_PROFILE debug)
  set(SS_CARGO_ARGS "")
  # Test builds get the simulated CD recorder (never releases).
  set(SS_CARGO_FEATURES --features simulator)
else()
  set(SS_CARGO_PROFILE release)
  set(SS_CARGO_ARGS --release)
  set(SS_CARGO_FEATURES "")
  if(DEFINED ENV{SS_SIMULATOR} AND "$ENV{SS_SIMULATOR}" STREQUAL "1")
    set(SS_CARGO_FEATURES --features simulator)
  endif()
endif()
set(SS_CORE_OUT "${SS_CORE_DIR}/target/${SS_CARGO_PROFILE}")
set(SS_CORE_LIB "${SS_CORE_OUT}/libsound_scraper_core.a")
set(SS_LAME_LIB "${SS_CORE_OUT}/libmp3lame.so.0")
# Always runs cargo (it knows what changed); BYPRODUCTS lets Ninja link
# against the outputs.
add_custom_target(sound_scraper_core_build
  COMMAND ${CARGO} build --manifest-path "${SS_CORE_DIR}/Cargo.toml" -p sound_scraper_core
          ${SS_CARGO_ARGS} ${SS_CARGO_FEATURES}
  BYPRODUCTS "${SS_CORE_LIB}" "${SS_LAME_LIB}"
  WORKING_DIRECTORY "${SS_CORE_DIR}"
  USES_TERMINAL
  COMMENT "Building the Rust core (cargo, ${SS_CARGO_PROFILE})")

add_library(sound_scraper_core STATIC IMPORTED)
set_target_properties(sound_scraper_core PROPERTIES
  IMPORTED_LOCATION "${SS_CORE_LIB}"
  INTERFACE_INCLUDE_DIRECTORIES "${SS_CORE_DIR}/include")
add_dependencies(sound_scraper_core sound_scraper_core_build)
# What the Rust standard library and the core's crates need from the system
# (cargo rustc -- --print native-static-libs): LAME, PulseAudio (capture),
# ALSA (cpal's playback).
# An imported target links LAME by its full path: a bare
# libmp3lame.so.0 path would become -lmp3lame, which needs libmp3lame-dev.
add_library(sound_scraper_lame SHARED IMPORTED)
set_target_properties(sound_scraper_lame PROPERTIES
  IMPORTED_LOCATION "${SS_LAME_LIB}"
  IMPORTED_SONAME libmp3lame.so.0)
add_dependencies(sound_scraper_lame sound_scraper_core_build)
target_link_libraries(sound_scraper_core INTERFACE
  sound_scraper_lame PkgConfig::LIBPULSE PkgConfig::ALSA dl pthread m rt util)

# ---- The app's native modules and views ----
add_library(sound_scraper_native STATIC
  src/Dialogs.cc
  src/EditorModule.cc
  src/PanelChrome.cc
  src/SkinsModule.cc
  src/SoundScraperModule.cc
  src/SoundScraperPackage.cc
  src/Views.cc)
set_target_properties(sound_scraper_native PROPERTIES POSITION_INDEPENDENT_CODE ON)
# PRIVATE: React Native's headers and the host's flags (NDEBUG as the
# host's) are for these sources, not main.cc.
target_link_libraries(sound_scraper_native PRIVATE ReactNativeGtk::sdk)
target_link_libraries(sound_scraper_native PUBLIC sound_scraper_core)

add_executable(SoundScraper main.cc)
target_link_libraries(SoundScraper PRIVATE ReactNativeGtk::host sound_scraper_native)
# Copies the host libraries next to the executable. Release builds also get
# index.bundle.js and the assets there (run-linux --release bundles them).
rngtk_app(SoundScraper)

# LAME next to the executable (it's found through $ORIGIN), and installed
# with the host libraries.
add_custom_command(TARGET SoundScraper POST_BUILD
  COMMAND ${CMAKE_COMMAND} -E copy "${SS_LAME_LIB}" $<TARGET_FILE_DIR:SoundScraper>
  VERBATIM)
if(CMAKE_BUILD_TYPE STREQUAL "Debug")
  get_target_property(SS_RPATH SoundScraper BUILD_RPATH)
  set_target_properties(SoundScraper PROPERTIES BUILD_RPATH "${SS_RPATH};$ORIGIN")
else()
  install(FILES "${SS_LAME_LIB}" DESTINATION lib/SoundScraper)
endif()
