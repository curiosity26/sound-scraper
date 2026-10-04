/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { skinsAvailable } from './src/skin/skins';
import { LibraryApp, MainApp, SettingsApp } from './src/windows';

if (skinsAvailable) {
  // macOS: the skinned main panel, with the library and settings in their
  // own windows (created by SkinWindows.swift).
  AppRegistry.registerComponent(appName, () => MainApp);
  AppRegistry.registerComponent('SoundScraperLibrary', () => LibraryApp);
  AppRegistry.registerComponent('SoundScraperSettings', () => SettingsApp);
} else {
  // Windows, until skins are ported: the plain single-window UI.
  AppRegistry.registerComponent(appName, () => App);
}
