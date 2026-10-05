'use client';

import { useCallback, useEffect, useState } from 'react';
import MuxPlayerComponent from '@mux/mux-player-react';
import { Loader2 } from 'lucide-react';

interface MuxPlayerProps {
  playbackId: string;
  metadata?: {
    video_title?: string;
    video_description?: string;
  };
  maxResolution?: '720p' | '1080p' | '1440p' | '2160p';
  /** Classroom extras (all optional; other players keep Mux's defaults). */
  playbackRates?: number[];
  seekOffset?: number;
  autoPlay?: boolean;
  onEnded?: () => void;
}

type PlaybackStatus = 'ready' | 'processing' | 'failed';
type Phase = 'player' | 'processing' | 'failed';

const POLL_MS = 8_000;

async function fetchPlaybackStatus(playbackId: string): Promise<PlaybackStatus | null> {
  try {
    const res = await fetch(`/api/mux/playback-status/${encodeURIComponent(playbackId)}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.status ?? null;
  } catch {
    return null;
  }
}

export function MuxPlayer(props: MuxPlayerProps) {
  // Fresh state per video: switching lessons must not carry over
  // "processing" or "loaded" from the previous one.
  return <MuxPlayerForVideo key={props.playbackId} {...props} />;
}

function MuxPlayerForVideo({
  playbackId,
  metadata,
  maxResolution = '720p',
  playbackRates,
  seekOffset,
  autoPlay,
  onEnded,
}: MuxPlayerProps) {
  // Videos are attached to a lesson as soon as the upload lands (so a long
  // encode can never lose them), which means a video can be shown before it
  // is playable. When the player fails, ask whether the video is simply
  // still processing and, if so, show that instead of the player's error,
  // then bring the player back once it's ready.
  const [phase, setPhase] = useState<Phase>('player');
  const [playerKey, setPlayerKey] = useState(0);
  // The player stays invisible until it has loaded the video or we know why
  // it couldn't, so viewers never glimpse the player's own error box.
  const [revealed, setRevealed] = useState(false);

  // Safety net: never keep a working player hidden if no event arrives.
  useEffect(() => {
    if (phase !== 'player' || revealed) return;
    const timer = setTimeout(() => setRevealed(true), 6_000);
    return () => clearTimeout(timer);
  }, [phase, revealed, playerKey]);

  const handleError = useCallback(
    async (error: unknown) => {
      console.error('Mux Player Error:', error);
      const status = await fetchPlaybackStatus(playbackId);
      if (status === 'processing') setPhase('processing');
      else if (status === 'failed') setPhase('failed');
      // 'ready' or unknown: a genuine playback problem, show the player's own UI.
      else setRevealed(true);
    },
    [playbackId]
  );

  useEffect(() => {
    if (phase !== 'processing') return;
    let cancelled = false;
    const timer = setInterval(async () => {
      const status = await fetchPlaybackStatus(playbackId);
      if (cancelled) return;
      if (status === 'ready') {
        setPlayerKey((k) => k + 1);
        setRevealed(false);
        setPhase('player');
      } else if (status === 'failed') {
        setPhase('failed');
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [phase, playbackId]);

  // Without an explicit size on the player itself, mux-player-react renders
  // at its intrinsic min dimensions for a beat and then snaps to the video
  // aspect once metadata loads — that's the "tiny then full size" flash.
  // Force the player to fill the 16:9 wrapper from the very first paint.
  return (
    <div className="relative w-full aspect-video bg-black overflow-hidden">
      {phase === 'player' ? (
        <MuxPlayerComponent
          key={playerKey}
          streamType="on-demand"
          playbackId={playbackId}
          metadata={metadata}
          preload="metadata"
          maxResolution={maxResolution}
          playbackRates={playbackRates}
          forwardSeekOffset={seekOffset}
          backwardSeekOffset={seekOffset}
          autoPlay={autoPlay}
          onEnded={onEnded}
          accentColor={playbackRates ? '#8E57DB' : undefined}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            display: 'block',
            opacity: revealed ? 1 : 0,
          }}
          aria-hidden={!revealed}
          onLoadedMetadata={() => setRevealed(true)}
          onError={handleError}
          onStalled={() => {
            console.log('Video playback stalled, attempting to recover...');
          }}
        />
      ) : (
        <div
          role="status"
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-white"
        >
          {phase === 'processing' ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-white/70" aria-hidden />
              <p className="text-base font-medium">Your video is processing</p>
              <p className="max-w-sm text-sm text-white/60">
                It will appear here automatically when it&apos;s ready. Long videos can take a few minutes.
              </p>
            </>
          ) : (
            <>
              <p className="text-base font-medium">This video could not be processed</p>
              <p className="max-w-sm text-sm text-white/60">Try uploading it again.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
