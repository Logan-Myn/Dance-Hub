import Mux from '@mux/mux-node';

let muxClient: Mux | null = null;

function getMux(): Mux {
  if (muxClient) return muxClient;
  const tokenId = process.env.MUX_TOKEN_ID;
  const tokenSecret = process.env.MUX_TOKEN_SECRET;
  if (!tokenId || !tokenSecret) {
    throw new Error('Missing Mux API credentials');
  }
  muxClient = new Mux({ tokenId, tokenSecret });
  return muxClient;
}

// Back-compat for callers that import { Video }; resolved lazily.
export const Video = new Proxy({} as Mux['video'], {
  get(_target, prop) {
    return Reflect.get(getMux().video, prop);
  },
});

export async function createMuxUploadUrl() {
  const corsOrigin = process.env.NEXT_PUBLIC_APP_URL;
  if (!corsOrigin) {
    throw new Error('Missing NEXT_PUBLIC_APP_URL environment variable');
  }
  const upload = await getMux().video.uploads.create({
    new_asset_settings: {
      playback_policy: ['public'],
    },
    cors_origin: corsOrigin,
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

const MUX_API_BASE = 'https://api.mux.com/video/v1';

function muxAuthHeader(): string {
  const tokenId = process.env.MUX_TOKEN_ID;
  const tokenSecret = process.env.MUX_TOKEN_SECRET;
  if (!tokenId || !tokenSecret) {
    throw new Error('Missing Mux API credentials');
  }
  return `Basic ${Buffer.from(`${tokenId}:${tokenSecret}`).toString('base64')}`;
}

const SUPPORTED_AUDIO_TYPES: Record<string, string> = {
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
};

/** Map a filename to a supported audio MIME type, or null if unsupported. Pure. */
export function audioContentTypeForFile(fileName: string): string | null {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (!ext) return null;
  return SUPPORTED_AUDIO_TYPES[ext] ?? null;
}

/** Build a unique B2 object key for an asset's audio track. Pure. */
export function buildAudioTrackKey(assetId: string, fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? 'bin';
  return `audio-tracks/${assetId}/${crypto.randomUUID()}.${ext}`;
}

export interface AudioTrackInput {
  url: string;
  languageCode: string;
  name: string;
}

/** Attach an alternate audio track to a ready Mux asset. Returns the new track id. */
export async function addAudioTrack(
  assetId: string,
  { url, languageCode, name }: AudioTrackInput
): Promise<{ trackId: string }> {
  const response = await fetch(`${MUX_API_BASE}/assets/${assetId}/tracks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: muxAuthHeader() },
    body: JSON.stringify({ url, type: 'audio', language_code: languageCode, name }),
  });
  if (!response.ok) {
    throw new Error(`Mux add-track error (${response.status}): ${await response.text()}`);
  }
  const result = await response.json();
  return { trackId: result.data.id };
}

/** Remove an audio track from an asset. Treats 404 as already-gone. */
export async function deleteAudioTrack(assetId: string, trackId: string): Promise<void> {
  const response = await fetch(`${MUX_API_BASE}/assets/${assetId}/tracks/${trackId}`, {
    method: 'DELETE',
    headers: { Authorization: muxAuthHeader() },
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Mux delete-track error (${response.status}): ${await response.text()}`);
  }
}

export interface MuxAudioTrack {
  id: string;
  status: string; // 'preparing' | 'ready' | 'errored'
  language_code?: string;
  name?: string;
}

/** List the audio tracks Mux knows about for an asset (authoritative status). */
export async function listAssetAudioTracks(assetId: string): Promise<MuxAudioTrack[]> {
  const response = await fetch(`${MUX_API_BASE}/assets/${assetId}`, {
    headers: { Authorization: muxAuthHeader() },
  });
  if (!response.ok) {
    throw new Error(`Mux asset retrieve error (${response.status}): ${await response.text()}`);
  }
  const result = await response.json();
  const tracks: Array<{ id: string; type: string; status: string; language_code?: string; name?: string }> =
    result.data.tracks ?? [];
  return tracks.filter((t) => t.type === 'audio').map((t) => ({
    id: t.id,
    status: t.status,
    language_code: t.language_code,
    name: t.name,
  }));
}

/** Resolve the owning asset id for a playback id (About-page videos store only the playback id). */
export async function resolveAssetIdFromPlaybackId(playbackId: string): Promise<string> {
  const response = await fetch(`${MUX_API_BASE}/playback-ids/${playbackId}`, {
    headers: { Authorization: muxAuthHeader() },
  });
  if (!response.ok) {
    throw new Error(`Mux playback-id lookup error (${response.status}): ${await response.text()}`);
  }
  const result = await response.json();
  return result.data.object.id;
}