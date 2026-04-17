'use client';

import MuxPlayerComponent from '@mux/mux-player-react';

interface MuxPlayerProps {
  playbackId: string;
}

export function MuxPlayer({ playbackId }: MuxPlayerProps) {
  // Without an explicit size on the player itself, mux-player-react renders
  // at its intrinsic min dimensions for a beat and then snaps to the video
  // aspect once metadata loads — that's the "tiny then full size" flash.
  // Force the player to fill the 16:9 wrapper from the very first paint.
  return (
    <div className="relative w-full aspect-video bg-black overflow-hidden">
      <MuxPlayerComponent
        streamType="on-demand"
        playbackId={playbackId}
        preload="metadata"
        maxResolution="720p"
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
