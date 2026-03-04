"use client";

import { useParticipant } from "@daily-co/daily-react";
import { DailyVideo } from "@daily-co/daily-react";
import { MicrophoneIcon } from "@heroicons/react/24/solid";
import { MicrophoneIcon as MicrophoneOffIcon } from "@heroicons/react/24/outline";

interface ParticipantTileProps {
  sessionId: string;
  isLocal: boolean;
}

export default function ParticipantTile({ sessionId, isLocal }: ParticipantTileProps) {
  const participant = useParticipant(sessionId);

  if (!participant) {
    return null;
  }

  const { user_name, audio, video } = participant;

  return (
    <div className="relative bg-gray-800 rounded-lg overflow-hidden aspect-video">
      {/* DailyVideo handles video track rendering automatically */}
      <DailyVideo
        sessionId={sessionId}
        type="video"
        automirror={isLocal}
        fit="cover"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: video ? "block" : "none",
        }}
      />

      {/* Placeholder when video is off */}
      {!video && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-700 to-gray-900">
          <div className="w-20 h-20 rounded-full bg-blue-500 flex items-center justify-center text-white text-2xl font-bold">
            {user_name?.charAt(0).toUpperCase() || '?'}
          </div>
        </div>
      )}

      {/* Name tag and status */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
        <div className="flex items-center justify-between">
          <span className="text-white text-sm font-medium truncate">
            {user_name || 'Guest'}
            {isLocal && ' (You)'}
          </span>
          <div className="flex items-center gap-2">
            {!audio ? (
              <div className="bg-red-500 rounded-full p-1">
                <MicrophoneOffIcon className="h-4 w-4 text-white" />
              </div>
            ) : (
              <div className="bg-green-500 rounded-full p-1">
                <MicrophoneIcon className="h-4 w-4 text-white" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Speaking indicator */}
      {audio && (
        <div className="absolute top-2 right-2">
          <div className="bg-green-500 rounded-full p-1 animate-pulse">
            <div className="h-2 w-2 bg-white rounded-full"></div>
          </div>
        </div>
      )}

      {/* Local participant indicator */}
      {isLocal && (
        <div className="absolute top-2 left-2">
          <div className="bg-blue-500 px-2 py-1 rounded text-xs text-white font-medium">
            You
          </div>
        </div>
      )}
    </div>
  );
}
