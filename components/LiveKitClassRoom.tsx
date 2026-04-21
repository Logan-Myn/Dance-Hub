"use client";

import "@livekit/components-styles";
import { useEffect, useState, useCallback } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useLocalParticipant,
  useParticipants,
  useDataChannel,
  useRoomContext,
  VideoTrack,
  useTracks,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import LiveKitControlBar from "./LiveKitControlBar";
import LiveKitChat from "./LiveKitChat";
import type { ChatMessage } from "./LiveKitChat";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface HandRaise {
  participantIdentity: string;
  userName: string;
}

interface DataMessage {
  type: string;
  sender?: string;
  participantIdentity?: string;
  text?: string;
  senderName?: string;
  timestamp?: number;
}

interface LiveKitClassRoomProps {
  token: string;
  serverUrl: string;
  onLeave: () => void;
  onEndClass?: () => void;
  classTitle?: string;
  isTeacher?: boolean;
}

function CallInterface({
  onLeave,
  onEndClass,
  classTitle,
  isTeacher = false,
}: {
  onLeave: () => void;
  onEndClass?: () => void;
  classTitle?: string;
  isTeacher?: boolean;
}) {
  const room = useRoomContext();
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasMediaPermission, setHasMediaPermission] = useState(isTeacher);
  const [handRaises, setHandRaises] = useState<HandRaise[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [deniedFeedback, setDeniedFeedback] = useState(false);
  const [revokedFeedback, setRevokedFeedback] = useState(false);

  const { send: sendData } = useDataChannel("app-messages", useCallback((msg: any) => {
    const data: DataMessage = JSON.parse(decoder.decode(msg.payload));
    const fromIdentity = msg.from?.identity ?? "";

    // Chat messages
    if (data.type === "chat" && data.text) {
      setChatMessages((prev) => [
        ...prev,
        {
          id: `${fromIdentity}-${data.timestamp ?? Date.now()}`,
          sender: data.senderName || data.sender || "?",
          text: data.text || "",
          timestamp: new Date(data.timestamp || Date.now()),
          type: "chat",
          isLocal: false,
        },
      ]);
      if (!isChatOpen) setUnreadCount((c) => c + 1);
    }

    // Hand-raise flow
    if (isTeacher) {
      if (data.type === "hand-raise" && data.sender && data.participantIdentity) {
        setHandRaises((prev) => {
          if (prev.some((r) => r.participantIdentity === data.participantIdentity)) return prev;
          return [...prev, { participantIdentity: data.participantIdentity!, userName: data.sender! }];
        });
        if (!isChatOpen) setUnreadCount((c) => c + 1);
      }
      if (data.type === "hand-lowered" && data.participantIdentity) {
        setHandRaises((prev) => prev.filter((r) => r.participantIdentity !== data.participantIdentity));
      }
    } else {
      if (data.type === "hand-approved") {
        setHasMediaPermission(true);
      }
      if (data.type === "hand-denied") {
        setHasMediaPermission(false);
        setDeniedFeedback(true);
      }
      if (data.type === "hand-revoked") {
        setHasMediaPermission(false);
        setRevokedFeedback(true);
        localParticipant?.setMicrophoneEnabled(false);
        localParticipant?.setCameraEnabled(false);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTeacher, isChatOpen, localParticipant]));

  const sendAppMessage = useCallback(
    (data: DataMessage, destinationIdentities?: string[]) => {
      const payload = encoder.encode(JSON.stringify(data));
      sendData(payload, { destinationIdentities });
    },
    [sendData]
  );

  // Clean up stale hand raises / active speakers when participants leave
  useEffect(() => {
    if (!isTeacher) return;
    const identities = participants.map((p) => p.identity);
    setHandRaises((prev) => prev.filter((r) => identities.includes(r.participantIdentity)));
  }, [participants, isTeacher]);

  // Teacher auto-enables camera and mic on connect
  useEffect(() => {
    if (!isTeacher || !localParticipant) return;
    const enableMedia = async () => {
      try {
        await localParticipant.setCameraEnabled(true);
        await localParticipant.setMicrophoneEnabled(true);
      } catch (err) {
        console.error("Error enabling media:", err);
      }
    };
    enableMedia();
  // Run once when localParticipant becomes available
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTeacher, localParticipant?.identity]);

  // Clear feedback toasts after delay
  useEffect(() => {
    if (deniedFeedback) {
      const timer = setTimeout(() => setDeniedFeedback(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [deniedFeedback]);

  useEffect(() => {
    if (revokedFeedback) {
      const timer = setTimeout(() => setRevokedFeedback(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [revokedFeedback]);

  const trackRefs = useTracks(
    [Track.Source.Camera, Track.Source.ScreenShare],
    { onlySubscribed: true }
  );

  const toggleChat = () => {
    setIsChatOpen((prev) => !prev);
    if (!isChatOpen) setUnreadCount(0);
  };

  const canSend = isTeacher || hasMediaPermission;

  // Build the visible track refs: local camera (if enabled) + remote tracks
  const localCameraTrack = trackRefs.find(
    (t) => t.participant.identity === localParticipant?.identity && t.source === Track.Source.Camera
  );
  const remoteTrackRefs = trackRefs.filter(
    (t) => t.participant.identity !== localParticipant?.identity
  );

  const showLocalVideo = canSend && !!localCameraTrack;
  const visibleCount = remoteTrackRefs.length + (showLocalVideo ? 1 : 0);

  return (
    <div className="h-full flex flex-col bg-gray-900">
      <RoomAudioRenderer />

      {/* Feedback toasts */}
      {deniedFeedback && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 bg-red-500 text-white px-4 py-2 text-sm font-bold rounded-lg animate-pulse">
          Your request was denied
        </div>
      )}
      {revokedFeedback && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 bg-red-500 text-white px-4 py-2 text-sm font-bold rounded-lg animate-pulse">
          Your mic/camera access was revoked
        </div>
      )}

      {/* Header */}
      <div className="bg-gray-800 px-3 py-2 sm:px-6 sm:py-4 border-b border-gray-700">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <div className="text-lg sm:text-2xl font-bold text-blue-500 shrink-0">DanceHub</div>
            {classTitle && (
              <>
                <div className="text-gray-500 hidden sm:block">|</div>
                <div className="text-white font-medium text-sm sm:text-base truncate">{classTitle}</div>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-xs sm:text-sm text-gray-400">
              {participants.length}
              <span className="hidden sm:inline"> participant{participants.length !== 1 ? "s" : ""}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Main content area: video grid + chat
          Mobile (chat open): stacks as a bottom sheet — video on top, chat on bottom 50%.
          Desktop: chat is an 80-wide side panel. */}
      <div
        className={`flex-1 overflow-hidden flex ${
          isChatOpen ? "flex-col sm:flex-row" : "flex-row"
        }`}
      >
        {/* Participant Grid */}
        <div className="flex-1 min-h-0 min-w-0 p-2 sm:p-4">
          {visibleCount === 0 ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-gray-500 text-sm">No one has their camera on yet</p>
            </div>
          ) : (
            <div
              className={`grid h-full gap-2 ${
                visibleCount <= 1
                  ? "grid-cols-1"
                  : visibleCount <= 4
                    ? "grid-cols-1 sm:grid-cols-2"
                    : "grid-cols-2 sm:grid-cols-3"
              }`}
            >
              {/* Local participant — only when cam is on */}
              {showLocalVideo && localCameraTrack && (
                <div className="relative rounded-lg border border-blue-500/30 bg-gray-800 overflow-hidden min-h-0">
                  <VideoTrack
                    trackRef={localCameraTrack}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                  <span className="absolute bottom-2 left-2 text-xs text-white bg-black/60 px-2 py-0.5 rounded">
                    You
                  </span>
                </div>
              )}

              {/* Remote participants */}
              {remoteTrackRefs.map((trackRef) => {
                const participant = trackRef.participant;
                return (
                  <div
                    key={`${participant.identity}-${trackRef.source}`}
                    className="relative rounded-lg border border-gray-700 bg-gray-800 overflow-hidden min-h-0"
                  >
                    <VideoTrack
                      trackRef={trackRef}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                    {participant.name && (
                      <span className="absolute bottom-2 left-2 text-xs text-white bg-black/60 px-2 py-0.5 rounded">
                        {participant.name}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Chat — bottom sheet on mobile (50% height, video stays visible above),
            side panel on desktop (80-wide). */}
        {isChatOpen && (
          <div className="h-1/2 w-full shrink-0 border-t border-gray-700 sm:h-auto sm:w-80 sm:border-t-0">
            <LiveKitChat
              onClose={toggleChat}
              isTeacher={isTeacher}
              handRaises={handRaises}
              chatMessages={chatMessages}
              setChatMessages={setChatMessages}
              sendAppMessage={sendAppMessage}
              setHandRaises={setHandRaises}
              localParticipant={localParticipant}
            />
          </div>
        )}
      </div>

      {/* Control Bar */}
      <LiveKitControlBar
        onLeave={onLeave}
        onEndClass={onEndClass}
        onToggleChat={toggleChat}
        isChatOpen={isChatOpen}
        unreadCount={unreadCount}
        isTeacher={isTeacher}
        hasMediaPermission={hasMediaPermission}
        setHasMediaPermission={setHasMediaPermission}
        sendAppMessage={sendAppMessage}
      />
    </div>
  );
}

export default function LiveKitClassRoom({
  token,
  serverUrl,
  onLeave,
  onEndClass,
  classTitle,
  isTeacher = false,
}: LiveKitClassRoomProps) {
  return (
    <LiveKitRoom
      token={token}
      serverUrl={serverUrl}
      connectOptions={{ autoSubscribe: true }}
      style={{ height: "100%" }}
    >
      <CallInterface
        onLeave={onLeave}
        onEndClass={onEndClass}
        classTitle={classTitle}
        isTeacher={isTeacher}
      />
    </LiveKitRoom>
  );
}
