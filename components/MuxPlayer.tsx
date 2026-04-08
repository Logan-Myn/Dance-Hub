'use client';

import MuxPlayerComponent from '@mux/mux-player-react';

interface MuxPlayerProps {
  playbackId: string;
}

export function MuxPlayer({ playbackId }: MuxPlayerProps) {
  return (
    <div className="aspect-video">
      <MuxPlayerComponent
        streamType="on-demand"
        playbackId={playbackId}
        preload="metadata"
        maxResolution="720p"
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