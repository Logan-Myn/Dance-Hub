"use client";

import "@livekit/components-styles";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useConnectionState,
  useLocalParticipant,
  useLocalParticipantPermissions,
  useParticipants,
  useDataChannel,
  useRoomContext,
  VideoTrack,
  useTracks,
} from "@livekit/components-react";
import { ConnectionState, DisconnectReason, Track } from "livekit-client";
import LiveKitControlBar from "./LiveKitControlBar";
import LiveKitChat from "./LiveKitChat";
import type { ChatMessage } from "./LiveKitChat";
import { Button } from "@/components/ui/button";
import { encodeRoomMessage, readRoomMessage, type RoomMessage } from "@/lib/live-class-messages";

/** Live-class moderation. Omitted for 1:1 private lessons. */
export interface ClassModeration {
  /** The teacher's identity. Deny/revoke messages from anyone else are ignored. */
  teacherIdentity: string;
  /** Grant or revoke a participant's mic/camera on the server. */
  setCanPublish: (identity: string, canPublish: boolean) => Promise<void>;
}

interface LiveKitClassRoomProps {
  token: string;
  serverUrl: string;
  onLeave: () => void;
  onEndClass?: () => void;
  classTitle?: string;
  isTeacher?: boolean;
  /** Skip the hand-raise gating and auto-enable camera/mic on join.
   *  Set true for 1:1 private lessons where both participants act as peers. */
  autoEnableMedia?: boolean;
  moderation?: ClassModeration;
  /** Names for identities. Live-class identities are user ids, so the room
   *  has no readable names of its own. */
  lookupNames?: (identities: string[]) => Promise<Record<string, string>>;
  /** Name shown on the local participant's own chat messages. */
  localName?: string;
}

interface CallInterfaceProps {
  onLeave: () => void;
  onEndClass?: () => void;
  classTitle?: string;
  isTeacher?: boolean;
  autoEnableMedia?: boolean;
  moderation?: ClassModeration;
  lookupNames?: (identities: string[]) => Promise<Record<string, string>>;
  localName?: string;
}

function CallInterface({
  onLeave,
  onEndClass,
  classTitle,
  isTeacher = false,
  autoEnableMedia = false,
  moderation,
  lookupNames,
  localName,
}: CallInterfaceProps) {
  const room = useRoomContext();
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  const localPermissions = useLocalParticipantPermissions();
  const connectionState = useConnectionState();
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  // Identities with a raised hand.
  const [raisedHands, setRaisedHands] = useState<string[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [deniedFeedback, setDeniedFeedback] = useState(false);
  const [revokedFeedback, setRevokedFeedback] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});
  const requestedNames = useRef(new Set<string>());
  const messageSeq = useRef(0);

  const teacherIdentity = moderation?.teacherIdentity;
  const localIdentity = localParticipant?.identity;
  // Live-class students join subscribe-only; the server grants publishing
  // when the teacher approves them, so its answer is what counts.
  const canPublishNow = !!localPermissions?.canPublish;
  const hasMediaPermission = isTeacher || autoEnableMedia || canPublishNow;

  const participantIds = participants.map((p) => p.identity).join(",");

  // Look up names for identities we haven't asked about yet.
  useEffect(() => {
    if (!lookupNames || !participantIds) return;
    const missing = participantIds.split(",").filter((id) => !requestedNames.current.has(id));
    if (missing.length === 0) return;
    missing.forEach((id) => requestedNames.current.add(id));
    lookupNames(missing)
      .then((found) => setNames((prev) => ({ ...prev, ...found })))
      .catch(() => missing.forEach((id) => requestedNames.current.delete(id)));
  }, [participantIds, lookupNames]);

  const nameFor = (identity: string): string => {
    if (identity === localIdentity && localName) return localName;
    if (names[identity]) return names[identity];
    const participant = participants.find((p) => p.identity === identity);
    if (participant?.name) return participant.name;
    // Live-class identities are user ids; don't show those while names load.
    return lookupNames ? "Participant" : identity;
  };

  const { send: sendData } = useDataChannel(
    "app-messages",
    useCallback(
      (msg: { payload: Uint8Array; from?: { identity: string } }) => {
        // The sender is whoever the media server says it is, never the payload.
        const event = readRoomMessage(msg.payload, msg.from?.identity, { isTeacher, teacherIdentity });
        if (!event) return;
        switch (event.kind) {
          case "chat":
            setChatMessages((prev) => [
              ...prev,
              {
                id: `msg-${++messageSeq.current}`,
                senderIdentity: event.from,
                text: event.text,
                timestamp: new Date(),
                type: "chat",
                isLocal: false,
              },
            ]);
            if (!isChatOpen) setUnreadCount((c) => c + 1);
            break;
          case "hand-raised":
            setRaisedHands((prev) => (prev.includes(event.from) ? prev : [...prev, event.from]));
            if (!isChatOpen) setUnreadCount((c) => c + 1);
            break;
          case "hand-lowered":
            // Sent when a student steps down; they drop their own permission.
            setRaisedHands((prev) => prev.filter((id) => id !== event.from));
            break;
          case "denied":
            setDeniedFeedback(true);
            break;
          case "revoked":
            setRevokedFeedback(true);
            break;
        }
      },
      [isTeacher, teacherIdentity, isChatOpen]
    )
  );

  const sendAppMessage = useCallback(
    (message: RoomMessage, destinationIdentities?: string[]) => {
      sendData(encodeRoomMessage(message), { destinationIdentities });
    },
    [sendData]
  );

  const addSystemMessage = (text: string) => {
    setChatMessages((prev) => [
      ...prev,
      { id: `system-${++messageSeq.current}`, text, timestamp: new Date(), type: "system" },
    ]);
  };

  // Teacher view: who may use mic/camera right now, straight from the
  // permissions the server pushes (so a student who rejoins with a fresh
  // subscribe-only token drops out), and who is still waiting. People who
  // left drop out of both lists.
  const speakers =
    isTeacher && moderation
      ? participants
          .filter((p) => p.identity !== localIdentity && p.permissions?.canPublish)
          .map((p) => p.identity)
      : [];
  const presentIds = participantIds.split(",");
  const pendingHands = raisedHands.filter((id) => presentIds.includes(id) && !speakers.includes(id));

  const allowHand = async (identity: string) => {
    if (!moderation) return;
    try {
      await moderation.setCanPublish(identity, true);
    } catch {
      addSystemMessage(`Could not give ${nameFor(identity)} mic/camera access. Try again.`);
      return;
    }
    setRaisedHands((prev) => prev.filter((id) => id !== identity));
    addSystemMessage(`${nameFor(identity)} was granted mic/camera access`);
  };

  const denyHand = (identity: string) => {
    sendAppMessage({ type: "hand-denied" }, [identity]);
    setRaisedHands((prev) => prev.filter((id) => id !== identity));
    addSystemMessage(`${nameFor(identity)}'s request was denied`);
  };

  const revokeSpeaker = async (identity: string) => {
    if (!moderation) return;
    try {
      await moderation.setCanPublish(identity, false);
    } catch {
      addSystemMessage(`Could not revoke ${nameFor(identity)}'s access. Try again.`);
      return;
    }
    sendAppMessage({ type: "hand-revoked" }, [identity]);
    setRaisedHands((prev) => prev.filter((id) => id !== identity));
    addSystemMessage(`${nameFor(identity)}'s access was revoked`);
  };

  // A student stepping down gives the permission back on the server too.
  const stepDown = () => {
    if (!moderation || !localIdentity) return;
    moderation.setCanPublish(localIdentity, false).catch((err) => {
      console.error("Failed to step down:", err);
    });
  };

  // When the server takes publishing away (revoked or stepped down), stop
  // the local camera and mic too.
  const couldPublish = useRef(canPublishNow);
  useEffect(() => {
    if (isTeacher || autoEnableMedia || !localParticipant) return;
    if (couldPublish.current && !canPublishNow) {
      localParticipant.setMicrophoneEnabled(false).catch(() => {});
      localParticipant.setCameraEnabled(false).catch(() => {});
      localParticipant.setScreenShareEnabled(false).catch(() => {});
    }
    couldPublish.current = canPublishNow;
  }, [canPublishNow, isTeacher, autoEnableMedia, localParticipant]);

  // Auto-enable camera and mic on connect for the teacher (live classes) and
  // for both peers in private lessons (autoEnableMedia).
  useEffect(() => {
    if (!localParticipant) return;
    if (!isTeacher && !autoEnableMedia) return;
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
  }, [isTeacher, autoEnableMedia, localParticipant?.identity]);

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

  const canSend = hasMediaPermission;

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
    <div className="h-full w-full min-w-0 overflow-x-hidden flex flex-col bg-gray-900">
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
      {(connectionState === ConnectionState.Reconnecting ||
        connectionState === ConnectionState.SignalReconnecting) && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 bg-yellow-500 text-black px-4 py-2 text-sm font-bold rounded-lg">
          Reconnecting...
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
                    <span className="absolute bottom-2 left-2 text-xs text-white bg-black/60 px-2 py-0.5 rounded">
                      {nameFor(participant.identity)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Chat — bottom sheet on mobile (50% height, video stays visible above),
            side panel on desktop (80-wide). */}
        {isChatOpen && (
          <div className="h-1/2 w-full min-w-0 overflow-hidden shrink-0 border-t border-gray-700 sm:h-auto sm:w-80 sm:border-t-0">
            <LiveKitChat
              onClose={toggleChat}
              isTeacher={isTeacher}
              raisedHands={pendingHands}
              speakers={speakers}
              nameFor={nameFor}
              onAllow={allowHand}
              onDeny={denyHand}
              onRevoke={revokeSpeaker}
              chatMessages={chatMessages}
              setChatMessages={setChatMessages}
              sendAppMessage={sendAppMessage}
              localName={localName || localIdentity || "You"}
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
        onStepDown={stepDown}
        sendAppMessage={sendAppMessage}
      />
    </div>
  );
}

type EndReason = DisconnectReason | "connect-error";

function describeDisconnect(reason: EndReason): { title: string; body: string; canRejoin: boolean } {
  switch (reason) {
    case "connect-error":
      return {
        title: "Connection failed",
        body: "We couldn't connect you to the class. Check your internet connection and try again.",
        canRejoin: true,
      };
    case DisconnectReason.DUPLICATE_IDENTITY:
      return {
        title: "You joined somewhere else",
        body: "You joined this class from another tab or device, so this one was disconnected.",
        canRejoin: true,
      };
    case DisconnectReason.PARTICIPANT_REMOVED:
      return { title: "You were removed from the class", body: "You can no longer take part in this class.", canRejoin: false };
    case DisconnectReason.ROOM_DELETED:
    case DisconnectReason.ROOM_CLOSED:
      return { title: "This class has ended", body: "The class room was closed.", canRejoin: false };
    default:
      return { title: "Connection lost", body: "Your connection to the class was lost.", canRejoin: true };
  }
}

function DisconnectedScreen({
  reason,
  onRejoin,
  onLeave,
}: {
  reason: EndReason;
  onRejoin: () => void;
  onLeave: () => void;
}) {
  const { title, body, canRejoin } = describeDisconnect(reason);
  return (
    <div className="h-full w-full flex items-center justify-center bg-gray-900 p-4">
      <div className="w-full max-w-sm text-center space-y-4">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <p className="text-sm text-gray-400">{body}</p>
        <div className="flex justify-center gap-3">
          {canRejoin && <Button onClick={onRejoin}>Rejoin</Button>}
          <Button variant="outline" onClick={onLeave}>
            Leave
          </Button>
        </div>
      </div>
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
  autoEnableMedia = false,
  moderation,
  lookupNames,
  localName,
}: LiveKitClassRoomProps) {
  // Bumped to remount the room, which connects again.
  const [connection, setConnection] = useState(0);
  const [ended, setEnded] = useState<EndReason | null>(null);
  const connected = useRef(false);

  const handleDisconnected = useCallback((reason?: DisconnectReason) => {
    // Leaving (or navigating away) disconnects on purpose.
    if (reason === DisconnectReason.CLIENT_INITIATED) return;
    setEnded(reason ?? DisconnectReason.UNKNOWN_REASON);
  }, []);

  const handleError = useCallback((error: Error) => {
    console.error("Class room error:", error);
    // Only a failed connection ends the call; later errors are just logged.
    if (!connected.current) setEnded("connect-error");
  }, []);

  if (ended !== null) {
    return (
      <DisconnectedScreen
        reason={ended}
        onLeave={onLeave}
        onRejoin={() => {
          connected.current = false;
          setEnded(null);
          setConnection((c) => c + 1);
        }}
      />
    );
  }

  return (
    <LiveKitRoom
      key={connection}
      token={token}
      serverUrl={serverUrl}
      connectOptions={{ autoSubscribe: true }}
      style={{ height: "100%" }}
      onConnected={() => {
        connected.current = true;
      }}
      onDisconnected={handleDisconnected}
      onError={handleError}
    >
      <CallInterface
        onLeave={onLeave}
        onEndClass={onEndClass}
        classTitle={classTitle}
        isTeacher={isTeacher}
        autoEnableMedia={autoEnableMedia}
        moderation={moderation}
        lookupNames={lookupNames}
        localName={localName}
      />
    </LiveKitRoom>
  );
}
