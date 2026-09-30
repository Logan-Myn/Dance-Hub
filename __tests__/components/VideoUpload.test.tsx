import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react';
import VideoUpload from '@/components/VideoUpload';

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'u_1' } } }),
}));

jest.mock('react-hot-toast', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

// Minimal XHR stand-in: the real component PUTs the file straight to Mux.
// Uploading always succeeds here; these tests are about what happens after.
class FakeXHR {
  static lastStatus = 200;
  upload = { addEventListener: jest.fn() };
  private listeners: Record<string, Array<() => void>> = {};
  status = FakeXHR.lastStatus;
  statusText = 'OK';
  readyState = 4;
  addEventListener(event: string, fn: () => void) {
    (this.listeners[event] ||= []).push(fn);
  }
  open() {}
  send() {
    setTimeout(() => this.listeners['load']?.forEach((fn) => fn()), 0);
  }
}

const uploadUrlResponse = {
  ok: true,
  status: 200,
  json: async () => ({ uploadId: 'up_1', uploadUrl: 'https://mux.test/put' }),
};

function renderUpload() {
  const onUploadComplete = jest.fn();
  const onUploadError = jest.fn();
  const utils = render(
    <VideoUpload
      communityId="c_1"
      onUploadComplete={onUploadComplete}
      onUploadError={onUploadError}
    />
  );
  const input = utils.container.querySelector(
    'input[type="file"]'
  ) as HTMLInputElement;
  const file = new File(['video-bytes'], 'chacha.mp4', { type: 'video/mp4' });
  return { onUploadComplete, onUploadError, input, file };
}

beforeEach(() => {
  global.fetch = jest.fn();
  (global as any).XMLHttpRequest = FakeXHR;
  FakeXHR.lastStatus = 200;
});

afterEach(() => {
  jest.resetAllMocks();
});

test('attaches the video as soon as the asset exists, even while still encoding', async () => {
  // Marcela's bug: a 4K clip takes minutes to encode, so the asset never reports
  // "ready" while the uploader is watching. It exists though, and that is enough.
  (global.fetch as jest.Mock)
    .mockResolvedValueOnce(uploadUrlResponse)
    .mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'asset_1',
        playbackId: 'pb_1',
        status: 'preparing',
      }),
    });

  const { onUploadComplete, onUploadError, input, file } = renderUpload();
  fireEvent.change(input, { target: { files: [file] } });

  await waitFor(() =>
    expect(onUploadComplete).toHaveBeenCalledWith('asset_1', 'pb_1')
  );
  expect(onUploadError).not.toHaveBeenCalled();
});

test('keeps polling through the pending window instead of aborting', async () => {
  // Right after the PUT, Mux has not linked the asset to the upload yet. That is
  // a normal wait, not a failure.
  (global.fetch as jest.Mock)
    .mockResolvedValueOnce(uploadUrlResponse)
    .mockResolvedValueOnce({
      ok: true,
      status: 202,
      json: async () => ({ state: 'pending' }),
    })
    .mockResolvedValueOnce({
      ok: true,
      status: 202,
      json: async () => ({ state: 'pending' }),
    })
    .mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'asset_2',
        playbackId: 'pb_2',
        status: 'preparing',
      }),
    });

  const { onUploadComplete, onUploadError, input, file } = renderUpload();
  fireEvent.change(input, { target: { files: [file] } });

  await waitFor(() =>
    expect(onUploadComplete).toHaveBeenCalledWith('asset_2', 'pb_2')
  );
  expect(onUploadError).not.toHaveBeenCalled();
});

test('does not attach an asset that Mux failed to encode', async () => {
  // Attaching on existence must not mean attaching a broken video: an errored
  // asset has a playback id but will never play.
  (global.fetch as jest.Mock)
    .mockResolvedValueOnce(uploadUrlResponse)
    .mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'asset_3',
        playbackId: 'pb_3',
        status: 'errored',
      }),
    });

  const { onUploadComplete, onUploadError, input, file } = renderUpload();
  fireEvent.change(input, { target: { files: [file] } });

  await waitFor(() => expect(onUploadError).toHaveBeenCalled());
  expect(onUploadComplete).not.toHaveBeenCalled();
});

test('stops waiting as soon as Mux reports the upload failed', async () => {
  (global.fetch as jest.Mock)
    .mockResolvedValueOnce(uploadUrlResponse)
    .mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ state: 'failed', reason: 'timed_out' }),
    });

  const { onUploadComplete, onUploadError, input, file } = renderUpload();
  fireEvent.change(input, { target: { files: [file] } });

  await waitFor(() => expect(onUploadError).toHaveBeenCalled());
  expect(onUploadComplete).not.toHaveBeenCalled();
  // One poll is enough: a failed upload is final, not something to retry.
  const assetPolls = (global.fetch as jest.Mock).mock.calls.filter(([url]) =>
    String(url).startsWith('/api/mux/assets/')
  );
  expect(assetPolls).toHaveLength(1);
});

test('surfaces a genuine failure through onUploadError', async () => {
  (global.fetch as jest.Mock)
    .mockResolvedValueOnce(uploadUrlResponse)
    .mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Failed to get asset' }),
      text: async () => 'Failed to get asset',
    });

  const { onUploadComplete, onUploadError, input, file } = renderUpload();
  fireEvent.change(input, { target: { files: [file] } });

  await waitFor(() => expect(onUploadError).toHaveBeenCalled());
  expect(onUploadComplete).not.toHaveBeenCalled();
});
