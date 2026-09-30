import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';

// Stand-in for the real player: fails on mount when the test says the video
// is not playable yet, the way Mux does for an asset still being processed.
let failOnMount = false;
jest.mock('@mux/mux-player-react', () => ({
  __esModule: true,
  default: function FakePlayer(props: {
    playbackId: string;
    style?: { opacity?: number };
    onError?: (e: unknown) => void;
    onLoadedMetadata?: () => void;
  }) {
    const { useEffect } = jest.requireActual('react');
    useEffect(() => {
      if (failOnMount) props.onError?.(new Error('not ready'));
      else props.onLoadedMetadata?.();
    }, []);
    return (
      <div data-testid="mux-player" data-visible={props.style?.opacity === 1 ? 'yes' : 'no'}>
        {props.playbackId}
      </div>
    );
  },
}));

import { MuxPlayer } from '@/components/MuxPlayer';

const statusResponse = (status: string) =>
  Promise.resolve({ ok: true, json: async () => ({ status }) } as Response);

beforeEach(() => {
  jest.useFakeTimers();
  failOnMount = false;
  global.fetch = jest.fn();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  (console.error as jest.Mock).mockRestore();
});

test('plays a ready video without asking for its status', () => {
  render(<MuxPlayer playbackId="pb_ready" />);
  expect(screen.getByTestId('mux-player')).toHaveAttribute('data-visible', 'yes');
  expect(global.fetch).not.toHaveBeenCalled();
});

test('keeps the player hidden while it works out why it failed', async () => {
  failOnMount = true;
  let answer: (r: Response) => void = () => {};
  (global.fetch as jest.Mock).mockReturnValueOnce(new Promise<Response>((r) => { answer = r; }));

  render(<MuxPlayer playbackId="pb_new" />);
  // The player's own error box must not be visible during the status check.
  expect(screen.getByTestId('mux-player')).toHaveAttribute('data-visible', 'no');

  await act(async () => {
    answer({ ok: true, json: async () => ({ status: 'processing' }) } as Response);
  });
  expect(await screen.findByText(/your video is processing/i)).toBeInTheDocument();
});

test('shows a processing message instead of the player error, then the video once ready', async () => {
  failOnMount = true;
  (global.fetch as jest.Mock)
    .mockReturnValueOnce(statusResponse('processing'))
    .mockReturnValueOnce(statusResponse('ready'));

  render(<MuxPlayer playbackId="pb_new" />);

  expect(await screen.findByText(/your video is processing/i)).toBeInTheDocument();
  expect(screen.queryByTestId('mux-player')).not.toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith(
    '/api/mux/playback-status/pb_new',
    expect.anything()
  );

  // Next poll says it's ready: the player comes back on its own.
  failOnMount = false;
  await act(async () => {
    jest.advanceTimersByTime(10_000);
  });
  await waitFor(() =>
    expect(screen.getByTestId('mux-player')).toHaveAttribute('data-visible', 'yes')
  );
  expect(screen.queryByText(/your video is processing/i)).not.toBeInTheDocument();
});

test('says so when the video failed to process', async () => {
  failOnMount = true;
  (global.fetch as jest.Mock).mockReturnValueOnce(statusResponse('failed'));

  render(<MuxPlayer playbackId="pb_bad" />);

  expect(await screen.findByText(/could not be processed/i)).toBeInTheDocument();
});

test('leaves the player alone when the video is ready and the error is something else', async () => {
  failOnMount = true;
  (global.fetch as jest.Mock).mockReturnValueOnce(statusResponse('ready'));

  render(<MuxPlayer playbackId="pb_flaky" />);

  await waitFor(() =>
    expect(screen.getByTestId('mux-player')).toHaveAttribute('data-visible', 'yes')
  );
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(/processing/i)).not.toBeInTheDocument();
});
