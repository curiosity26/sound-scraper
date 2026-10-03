/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';
import { formatElapsed } from '../src/RecordBar';

jest.mock('../src/native/NativeSoundScraper', () => ({
  __esModule: true,
  default: {
    getVersion: () => '0.0.0-test',
    listAudioApps: () => [],
    recordTestWav: jest.fn(),
    recorderStart: jest.fn(() => Promise.resolve()),
    recorderPause: jest.fn(),
    recorderResume: jest.fn(),
    recorderStop: jest.fn(() => Promise.resolve('/tmp/x.mp3')),
    recorderState: () => 'idle',
    recoverPartialRecordings: () => 0,
    onRecorderEvent: () => ({ remove: jest.fn() }),
  },
}));

test('renders the core version and an idle record bar', async () => {
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<App />);
  });
  const version = tree!.root.findByProps({ testID: 'core-version' });
  expect(version.props.children.join('')).toBe('Rust core v0.0.0-test');
  expect(
    tree!.root.findAllByProps({ testID: 'record' }).length,
  ).toBeGreaterThan(0);
});

test('formats elapsed time', () => {
  expect(formatElapsed(0)).toBe('0:00.0');
  expect(formatElapsed(65_432)).toBe('1:05.4');
});
