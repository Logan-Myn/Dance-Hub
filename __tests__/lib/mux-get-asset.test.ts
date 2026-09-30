/**
 * getMuxAsset: resolves a direct-upload id to its asset.
 *
 * @jest-environment node
 */
const uploadsRetrieve = jest.fn();
const assetsRetrieve = jest.fn();

jest.mock('@mux/mux-node', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    video: {
      uploads: { retrieve: uploadsRetrieve },
      assets: { retrieve: assetsRetrieve },
    },
  })),
}));

import { getMuxAsset } from '@/lib/mux';

beforeAll(() => {
  process.env.MUX_TOKEN_ID = 'test-id';
  process.env.MUX_TOKEN_SECRET = 'test-secret';
});

beforeEach(() => {
  uploadsRetrieve.mockReset();
  assetsRetrieve.mockReset();
});

test('is pending while the upload has no asset yet', async () => {
  uploadsRetrieve.mockResolvedValue({ status: 'waiting' });
  await expect(getMuxAsset('up1')).resolves.toEqual({ state: 'pending' });
});

test.each(['errored', 'cancelled', 'timed_out'])(
  'fails fast when the upload is %s instead of staying pending',
  async (status) => {
    uploadsRetrieve.mockResolvedValue({ status });
    await expect(getMuxAsset('up1')).resolves.toEqual({ state: 'failed', reason: status });
    expect(assetsRetrieve).not.toHaveBeenCalled();
  }
);

test('fails fast when the asset errored before getting a playback id', async () => {
  uploadsRetrieve.mockResolvedValue({ status: 'asset_created', asset_id: 'a1' });
  assetsRetrieve.mockResolvedValue({ status: 'errored', playback_ids: [] });
  await expect(getMuxAsset('up1')).resolves.toEqual({ state: 'failed', reason: 'asset_errored' });
});

test('returns the asset once it has a playback id', async () => {
  uploadsRetrieve.mockResolvedValue({ status: 'asset_created', asset_id: 'a1' });
  assetsRetrieve.mockResolvedValue({ status: 'preparing', playback_ids: [{ id: 'p1' }] });
  await expect(getMuxAsset('up1')).resolves.toEqual({
    state: 'found',
    id: 'a1',
    playbackId: 'p1',
    status: 'preparing',
  });
});
