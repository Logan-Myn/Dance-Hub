"use client";

import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
} from "@livekit/components-react";
import "@livekit/components-styles";

interface LiveKitVideoCallProps {
  token: string;
  serverUrl: string;
  onDisconnected?: () => void;
}

export default function LiveKitVideoCall({
  token,
  serverUrl,
  onDisconnected,
}: LiveKitVideoCallProps) {
  return (
    <div className="w-full h-full min-h-[600px] bg-gray-900 rounded-lg overflow-hidden">
      <LiveKitRoom
        token={token}
        serverUrl={serverUrl}
        connectOptions={{ autoSubscribe: true }}
        onDisconnected={onDisconnected}
        style={{ height: "100%" }}
        data-lk-theme="default"
      >
        <VideoConference />
        <RoomAudioRenderer />
      </LiveKitRoom>
    </div>
  );
}
