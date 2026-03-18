import Mux from '@mux/mux-node';

if (!process.env.MUX_TOKEN_ID || !process.env.MUX_TOKEN_SECRET) {
  throw new Error('Missing Mux API credentials');
}

if (!process.env.NEXT_PUBLIC_APP_URL) {
  throw new Error('Missing NEXT_PUBLIC_APP_URL environment variable');
}

const mux = new Mux({
  tokenId: process.env.MUX_TOKEN_ID,
  tokenSecret: process.env.MUX_TOKEN_SECRET,
});

export const Video = mux.video;

export async function createMuxUploadUrl() {
  const upload = await Video.uploads.create({
    new_asset_settings: {
      playback_policy: ['public'],
    },
    cors_origin: process.env.NEXT_PUBLIC_APP_URL!,
  });

  return {
    uploadId: upload.id,
    uploadUrl: upload.url,
  };
}

export async function getMuxAsset(uploadId: string) {
  try {
    // First get the upload to find the asset ID
    const upload = await Video.uploads.retrieve(uploadId);
    if (!upload.asset_id) {
      throw new Error('Asset not yet created');
    }

    // Then get the asset details
    const asset = await Video.assets.retrieve(upload.asset_id);

    // Get the first playback ID
    const playbackId = asset.playback_ids?.[0]?.id;
    if (!playbackId) {
      throw new Error('No playback ID found');
    }

    return {
      id: upload.asset_id,
      playbackId,
      status: asset.status,
    };
  } catch (error) {
    console.error('Error getting Mux asset:', error);
    return null;
  }
}

/**
 * Create a Mux asset from a single URL (e.g., Daily.co recording download).
 */
export async function createAssetFromUrl(url: string, passthrough?: string) {
  const tokenId = process.env.MUX_TOKEN_ID;
  const tokenSecret = process.env.MUX_TOKEN_SECRET;
  if (!tokenId || !tokenSecret) {
    throw new Error('Missing Mux API credentials');
  }

  const body: Record<string, unknown> = {
    input: [{ url }],
    playback_policy: ['public'],
  };
  if (passthrough) {
    body.passthrough = passthrough;
  }

  const response = await fetch('https://api.mux.com/video/v1/assets', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${Buffer.from(`${tokenId}:${tokenSecret}`).toString('base64')}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Mux API error (${response.status}): ${error}`);
  }

  const result = await response.json();
  return result.data;
}

/**
 * @deprecated Use createAssetFromUrl instead. Mux does not support concatenating multiple video URLs.
 * Kept for backward compatibility — only uses the first URL.
 */
export async function createAssetFromUrls(urls: string[], passthrough?: string) {
  return createAssetFromUrl(urls[0], passthrough);
}

// Add new function to delete a Mux asset
export async function deleteMuxAsset(assetId: string) {
  try {
    await Video.assets.delete(assetId);
    return true;
  } catch (error) {
    console.error('Error deleting Mux asset:', error);
    return false;
  }
}