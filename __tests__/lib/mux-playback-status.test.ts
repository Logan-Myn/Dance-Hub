/**
 * getPlaybackStatus: tells the player whether a video can play yet.
 *
 * @jest-environment node
 */
jest.mock('@/lib/db', () => ({ queryOne: jest.fn(), query: jest.fn() }));
const assetsRetrieve = jest.fn();
const resolveAssetId = jest.fn();
jest.mock('@/lib/mux', () => ({
  Video: { assets: { retrieve: (...a: unknown[]) => assetsRetrieve(...a) } },
  resolveAssetIdFromPlaybackId: (...a: unknown[]) => resolveAssetId(...a),
}));

import { queryOne } from '@/lib/db';
import { getPlaybackStatus } from '@/lib/mux-playback-status';

const mockQueryOne = queryOne as jest.Mock;

beforeEach(() => {
  jest.resetAllMocks();
});

test('returns null without calling Mux for a playback id we do not use', async () => {
  mockQueryOne.mockResolvedValue(null);
  await expect(getPlaybackStatus('strangers-id')).resolves.toBeNull();
  expect(assetsRetrieve).not.toHaveBeenCalled();
  expect(resolveAssetId).not.toHaveBeenCalled();
});

test.each([
  ['preparing', 'processing'],
  ['ready', 'ready'],
  ['errored', 'failed'],
])('maps a lesson asset that is %s to %s', async (muxStatus, expected) => {
  mockQueryOne.mockResolvedValueOnce({ video_asset_id: 'asset_1' });
  assetsRetrieve.mockResolvedValue({ status: muxStatus });
  await expect(getPlaybackStatus('pb_1')).resolves.toBe(expected);
  expect(assetsRetrieve).toHaveBeenCalledWith('asset_1');
});

test('finds About page videos too', async () => {
  mockQueryOne
    .mockResolvedValueOnce(null) // not a lesson
    .mockResolvedValueOnce({ asset_id: 'asset_about' });
  assetsRetrieve.mockResolvedValue({ status: 'ready' });
  await expect(getPlaybackStatus('pb_about')).resolves.toBe('ready');
  expect(assetsRetrieve).toHaveBeenCalledWith('asset_about');
});

test('resolves the asset from Mux when we only stored the playback id', async () => {
  mockQueryOne.mockResolvedValueOnce({ video_asset_id: null });
  resolveAssetId.mockResolvedValue('asset_resolved');
  assetsRetrieve.mockResolvedValue({ status: 'preparing' });
  await expect(getPlaybackStatus('pb_old')).resolves.toBe('processing');
  expect(assetsRetrieve).toHaveBeenCalledWith('asset_resolved');
});
