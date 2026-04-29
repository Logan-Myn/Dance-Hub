'use client';

import MuxPlayerComponent from '@mux/mux-player-react';

interface MuxPlayerProps {
  playbackId: string;
  metadata?: {
    video_title?: string;
    video_description?: string;
  };
  maxResolution?: '720p' | '1080p' | '1440p' | '2160p';
}

export function MuxPlayer({
  playbackId,
  metadata,
  maxResolution = '720p',
}: MuxPlayerProps) {
  // Without an explicit size on the player itself, mux-player-react renders
  // at its intrinsic min dimensions for a beat and then snaps to the video
  // aspect once metadata loads — that's the "tiny then full size" flash.
  // Force the player to fill the 16:9 wrapper from the very first paint.
  return (
    <div className="relative w-full aspect-video bg-black overflow-hidden">
      <MuxPlayerComponent
        streamType="on-demand"
        playbackId={playbackId}
        metadata={metadata}
        preload="metadata"
        maxResolution={maxResolution}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          display: 'block',
        }}
        onError={(error) => {
          console.error('Mux Player Error:', error);
        }}
        onStalled={() => {
          console.log('Video playback stalled, attempting to recover...');
        }}
      />
    </div>
  );
}
