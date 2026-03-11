"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  DailyProvider,
  DailyAudio,
  DailyVideo,
  useDaily,
  useParticipantIds,
  useLocalSessionId,
  useAppMessage,
  useDailyEvent,
} from "@daily-co/daily-react";
import DailyIframe from "@daily-co/daily-js";
import ControlBar from "./ControlBar";
import LiveClassChat from "./LiveClassChat";
import type { ChatMessage } from "./LiveClassChat";

interface CustomDailyRoomProps {
  roomUrl: string;
  token: string;
  onLeave: () => void;
  onEndClass?: () => void;
  className?: string;
  classTitle?: string;
  isTeacher?: boolean;
}

interface AppMessage {
  type: string;
  sender?: string;
  sessionId?: string;
  text?: string;
  senderName?: string;
  timestamp?: number;
}

export interface HandRaise {
  sessionId: string;
  userName: string;
}

export interface ActiveSpeaker {
  sessionId: string;
  userName: string;
}

function CallInterface({ onLeave, onEndClass, classTitle, isTeacher = false }: { onLeave: () => void; onEndClass?: () => void; classTitle?: string; isTeacher?: boolean }) {
  const callObject = useDaily();
  const allParticipantIds = useParticipantIds();
  const localSessionId = useLocalSessionId();
  const [callState, setCallState] = useState<string>('loading');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasMediaPermission, setHasMediaPermission] = useState(isTeacher);
  const [handRaises, setHandRaises] = useState<HandRaise[]>([]);
  const [activeSpeakers, setActiveSpeakers] = useState<ActiveSpeaker[]>([]);
  const [isMuted, setIsMuted] = useState(true);
  const [isCamOff, setIsCamOff] = useState(!isTeacher);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [deniedFeedback, setDeniedFeedback] = useState(false);
  const [revokedFeedback, setRevokedFeedback] = useState(false);
  const [, setParticipantVersion] = useState(0);

  const sendAppMessage = useAppMessage({
    onAppMessage: useCallback(
      (ev: { data: AppMessage; fromId: string }) => {
        const { data, fromId } = ev;

        // Chat messages
        if (data.type === "chat" && data.text) {
          setChatMessages((prev) => [
            ...prev,
            {
              id: `${fromId}-${data.timestamp}`,
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
          if (data.type === "hand-raise" && data.sender && data.sessionId) {
            setHandRaises((prev) => {
              if (prev.some((r) => r.sessionId === data.sessionId)) return prev;
              return [...prev, { sessionId: data.sessionId!, userName: data.sender! }];
            });
            if (!isChatOpen) setUnreadCount((c) => c + 1);
          }
          if (data.type === "hand-lowered" && data.sessionId) {
            setHandRaises((prev) => prev.filter((r) => r.sessionId !== data.sessionId));
            setActiveSpeakers((prev) => prev.filter((s) => s.sessionId !== data.sessionId));
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
            try { callObject?.setLocalAudio(false); } catch {}
            try { callObject?.setLocalVideo(false); } catch {}
            setIsMuted(true);
            setIsCamOff(true);
          }
        }
      },
      [isTeacher, callObject, isChatOpen],
    ),
  });

  // Re-render when participant tracks change
  useEffect(() => {
    if (!callObject) return;
    const onUpdated = () => setParticipantVersion((v) => v + 1);
    callObject.on("participant-updated", onUpdated);
    return () => { callObject.off("participant-updated", onUpdated); };
  }, [callObject]);

  // Clean up stale hand raises / active speakers when participants leave
  useEffect(() => {
    if (!isTeacher) return;
    setHandRaises((prev) => prev.filter((r) => allParticipantIds.includes(r.sessionId)));
    setActiveSpeakers((prev) => prev.filter((s) => allParticipantIds.includes(s.sessionId)));
  }, [allParticipantIds, isTeacher]);

  // Clear feedback after delay
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

  // Listen for call state changes
  useDailyEvent('joined-meeting', () => {
    setCallState('joined');
    if (isTeacher && callObject) {
      callObject.setLocalVideo(true);
      callObject.setLocalAudio(true);
      setIsCamOff(false);
      setIsMuted(false);
    }
  });

  useDailyEvent('left-meeting', () => setCallState('left'));
  useDailyEvent('error', () => setCallState('error'));

  useEffect(() => {
    if (callObject) {
      const state = callObject.meetingState();
      if (state === 'joined-meeting') setCallState('joined');
    }
  }, [callObject]);

  if (!callObject || callState !== 'joined') {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <div className="text-white text-lg">
            {callState === 'error' ? 'Error joining call...' : 'Joining class...'}
          </div>
          <div className="text-gray-400 text-sm mt-2">Please wait</div>
        </div>
      </div>
    );
  }

  const toggleChat = () => {
    setIsChatOpen((prev) => !prev);
    if (!isChatOpen) setUnreadCount(0);
  };

  const canSend = isTeacher || hasMediaPermission;
  const showLocalVideo = canSend && !isCamOff;

  // Only show remote participants with a playable video track
  const remoteParticipants = allParticipantIds.filter((id) => {
    if (id === localSessionId) return false;
    const p = callObject.participants()[id];
    if (!p) return false;
    const videoState = p.tracks?.video?.state;
    return videoState === "playable";
  });

  const visibleCount = remoteParticipants.length + (showLocalVideo ? 1 : 0);

  return (
    <div className="h-full flex flex-col bg-gray-900">
      <DailyAudio />

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
      <div className="bg-gray-800 px-6 py-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="text-2xl font-bold text-blue-500">DanceHub</div>
            {classTitle && (
              <>
                <div className="text-gray-500">|</div>
                <div className="text-white font-medium">{classTitle}</div>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-sm text-gray-400">
              {allParticipantIds.length} participant{allParticipantIds.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Main content area: video grid + chat */}
      <div className="flex-1 flex overflow-hidden">
        {/* Participant Grid */}
        <div className="flex-1 min-h-0 p-4">
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
                    ? "grid-cols-2"
                    : "grid-cols-3"
              }`}
            >
              {/* Local participant — only when cam is on */}
              {showLocalVideo && localSessionId && (
                <div className="relative rounded-lg border border-blue-500/30 bg-gray-800 overflow-hidden min-h-0">
                  <DailyVideo
                    sessionId={localSessionId}
                    type="video"
                    automirror
                    fit="cover"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                  <span className="absolute bottom-2 left-2 text-xs text-white bg-black/60 px-2 py-0.5 rounded">
                    You
                  </span>
                </div>
              )}

              {/* Remote participants — only those with playable video */}
              {remoteParticipants.map((id) => {
                const p = callObject.participants()[id];
                return (
                  <div
                    key={id}
                    className="relative rounded-lg border border-gray-700 bg-gray-800 overflow-hidden min-h-0"
                  >
                    <DailyVideo
                      sessionId={id}
                      type="video"
                      fit="cover"
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                    {p?.user_name && (
                      <span className="absolute bottom-2 left-2 text-xs text-white bg-black/60 px-2 py-0.5 rounded">
                        {p.user_name}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Chat Panel */}
        {isChatOpen && (
          <div className="w-80 flex-shrink-0">
            <LiveClassChat
              onClose={toggleChat}
              isTeacher={isTeacher}
              handRaises={handRaises}
              activeSpeakers={activeSpeakers}
              chatMessages={chatMessages}
              setChatMessages={setChatMessages}
              sendAppMessage={sendAppMessage}
              setHandRaises={setHandRaises}
              setActiveSpeakers={setActiveSpeakers}
            />
          </div>
        )}
      </div>

      {/* Control Bar */}
      <ControlBar
        onLeave={onLeave}
        onEndClass={onEndClass}
        onToggleChat={toggleChat}
        isChatOpen={isChatOpen}
        unreadCount={unreadCount}
        isTeacher={isTeacher}
        hasMediaPermission={hasMediaPermission}
        setHasMediaPermission={setHasMediaPermission}
        sendAppMessage={sendAppMessage}
        isMuted={isMuted}
        setIsMuted={setIsMuted}
        isCamOff={isCamOff}
        setIsCamOff={setIsCamOff}
      />
    </div>
  );
}

export default function CustomDailyRoom({
  roomUrl,
  token,
  onLeave,
  onEndClass,
  classTitle,
  isTeacher = false
}: CustomDailyRoomProps) {
  const callObjectRef = useRef<any>(null);
  const [isCallObjectReady, setIsCallObjectReady] = useState(false);
  const hasJoinedRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    const initializeCall = async () => {
      try {
        if (!callObjectRef.current) {
          callObjectRef.current = DailyIframe.createCallObject();
        }

        const callObject = callObjectRef.current;
        if (!mounted || hasJoinedRef.current) return;

        await callObject.preAuth({ url: roomUrl, token });
        if (!mounted || hasJoinedRef.current) return;

        setIsCallObjectReady(true);
        await new Promise(resolve => setTimeout(resolve, 200));
        if (!mounted || hasJoinedRef.current) return;

        hasJoinedRef.current = true;
        await callObject.join({ url: roomUrl, token });
      } catch (error) {
        console.error("Error initializing call:", error);
        if (mounted) setIsCallObjectReady(false);
      }
    };

    initializeCall();

    return () => {
      mounted = false;
      if (callObjectRef.current && hasJoinedRef.current) {
        callObjectRef.current.leave().catch(console.error);
        callObjectRef.current.destroy().catch(console.error);
        callObjectRef.current = null;
        hasJoinedRef.current = false;
      }
    };
  }, [roomUrl, token]);

  if (!isCallObjectReady) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <div className="text-white text-lg">Preparing video...</div>
        </div>
      </div>
    );
  }

  return (
    <DailyProvider callObject={callObjectRef.current}>
      <CallInterface onLeave={onLeave} onEndClass={onEndClass} classTitle={classTitle} isTeacher={isTeacher} />
    </DailyProvider>
  );
}
