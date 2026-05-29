/**
 * Unit tests for the pure helpers in lib/mux.ts.
 * The fetch-based Mux calls are exercised via manual preprod testing (later task).
 *
 * @jest-environment node
 *
 * Runs in the node environment (not the lib project's default jsdom) because
 * lib/mux.ts imports @mux/mux-node, whose runtime detection requires a global
 * `fetch` at import time. jsdom does not provide one; node does.
 */
import { audioContentTypeForFile, buildAudioTrackKey } from '@/lib/mux';

describe('audioContentTypeForFile', () => {
  it('maps supported audio extensions to MIME types', () => {
    expect(audioContentTypeForFile('voice.m4a')).toBe('audio/mp4');
    expect(audioContentTypeForFile('voice.mp3')).toBe('audio/mpeg');
    expect(audioContentTypeForFile('voice.wav')).toBe('audio/wav');
  });

  it('is case-insensitive on the extension', () => {
    expect(audioContentTypeForFile('VOICE.MP3')).toBe('audio/mpeg');
  });

  it('returns null for unsupported or extension-less files', () => {
    expect(audioContentTypeForFile('clip.mp4')).toBeNull();
    expect(audioContentTypeForFile('noext')).toBeNull();
  });
});

describe('buildAudioTrackKey', () => {
  it('namespaces the key under the asset and keeps the extension', () => {
    const key = buildAudioTrackKey('asset123', 'My Voice.mp3');
    expect(key.startsWith('audio-tracks/asset123/')).toBe(true);
    expect(key.endsWith('.mp3')).toBe(true);
  });

  it('produces a unique key per call', () => {
    expect(buildAudioTrackKey('a', 'v.wav')).not.toBe(buildAudioTrackKey('a', 'v.wav'));
  });
});
