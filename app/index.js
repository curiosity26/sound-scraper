/**
 * @format
 */

// First, so every module sees the ES2023 built-ins Hermes lacks.
import './src/shared/polyfills/es2023'

import { AppRegistry, Platform } from 'react-native'

import { name as appName } from './app.json'
import {
  BurnWindow,
  DetailsWindow,
  EditorWindow,
  LibraryWindow,
  MainWindow,
  SettingsWindow,
  Stage,
} from './src/roots'
import { exposeDevConsole } from './src/roots/devConsole/exposeDevConsole'

exposeDevConsole()

// The skinned main panel, with the library, settings and details in their
// own windows (SkinWindows.swift on macOS, WindowManager.cpp on Windows).
// On Linux, the stage holds them all in one window (src/roots/Stage).
AppRegistry.registerComponent(appName, () =>
  Platform.OS === 'linux' ? Stage : MainWindow,
)
AppRegistry.registerComponent('SoundScraperLibrary', () => LibraryWindow)
AppRegistry.registerComponent('SoundScraperSettings', () => SettingsWindow)
AppRegistry.registerComponent('SoundScraperDetails', () => DetailsWindow)
AppRegistry.registerComponent('SoundScraperEditor', () => EditorWindow)
AppRegistry.registerComponent('SoundScraperBurn', () => BurnWindow)
