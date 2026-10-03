/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

jest.mock('../src/native/NativeSoundScraper', () => ({
  __esModule: true,
  default: {
    getVersion: () => '0.0.0-test',
    listAudioApps: () => [],
    recordTestWav: jest.fn(),
  },
}));

test('renders the core version', async () => {
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<App />);
  });
  const text = tree!.root.findByProps({testID: 'core-version'});
  expect(text.props.children.join('')).toBe('Rust core v0.0.0-test');
});
