/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { skinsAvailable } from './src/skin/skins';
import {
  BurnApp,
  DetailsApp,
  EditorApp,
  LibraryApp,
  MainApp,
  SettingsApp,
} from './src/windows';

if (skinsAvailable) {
  // The skinned main panel, with the library, settings and details in
  // their own windows (SkinWindows.swift on macOS, WindowManager.cpp on
  // Windows).
  AppRegistry.registerComponent(appName, () => MainApp);
  AppRegistry.registerComponent('SoundScraperLibrary', () => LibraryApp);
  AppRegistry.registerComponent('SoundScraperSettings', () => SettingsApp);
  AppRegistry.registerComponent('SoundScraperDetails', () => DetailsApp);
  AppRegistry.registerComponent('SoundScraperEditor', () => EditorApp);
  AppRegistry.registerComponent('SoundScraperBurn', () => BurnApp);
} else {
  // No native skin support: the plain single-window UI.
  AppRegistry.registerComponent(appName, () => App);
}
