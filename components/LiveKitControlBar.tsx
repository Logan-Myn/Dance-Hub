"use client";

import { useCallback } from "react";
import { useLocalParticipant, useRoomContext } from "@livekit/components-react";
import {
  MicrophoneIcon,
  VideoCameraIcon,
  PhoneXMarkIcon,
  ArrowUpOnSquareIcon,
  Cog6ToothIcon,
  ChatBubbleLeftIcon,
  HandRaisedIcon,
  UserMinusIcon,
  StopCircleIcon,
} from "@heroicons/react/24/solid";
import {
  MicrophoneIcon as MicrophoneOffIcon,
  VideoCameraSlashIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";

interface LiveKitControlBarProps {
  onLeave: () => void;
  onEndClass?: () => void;
  onToggleChat?: () => void;
  isChatOpen?: boolean;
  unreadCount?: number;
  isTeacher?: boolean;
  hasMediaPermission?: boolean;
  setHasMediaPermission?: (v: boolean) => void;
  sendAppMessage?: (data: any, destinationIdentities?: string[]) => void;
}

export default function LiveKitControlBar({
  onLeave,
  onEndClass,
  onToggleChat,
  isChatOpen,
  unreadCount = 0,
  isTeacher = false,
  hasMediaPermission = true,
  setHasMediaPermission,
  sendAppMessage,
}: LiveKitControlBarProps) {
  const room = useRoomContext();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } =
    useLocalParticipant();

  const canSend = isTeacher || hasMediaPermission;

  const toggleAudio = useCallback(async () => {
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } catch {}
  }, [localParticipant, isMicrophoneEnabled]);

  const toggleVideo = useCallback(async () => {
    try {
      await localParticipant.setCameraEnabled(!isCameraEnabled);
    } catch {}
  }, [localParticipant, isCameraEnabled]);

  const toggleScreenShare = useCallback(async () => {
    try {
      await localParticipant.setScreenShareEnabled(!isScreenShareEnabled);
    } catch {}
  }, [localParticipant, isScreenShareEnabled]);

  const handleLeave = useCallback(async () => {
    try {
      await room.disconnect();
    } catch {}
    onLeave();
  }, [room, onLeave]);

  const requestParticipation = useCallback(() => {
    if (!sendAppMessage) return;
    sendAppMessage({
      type: "hand-raise",
      sender: localParticipant.name || localParticipant.identity || "Student",
      sessionId: localParticipant.identity,
    });
  }, [localParticipant, sendAppMessage]);

  const stepDown = useCallback(async () => {
    if (!sendAppMessage) return;
    try { await localParticipant.setMicrophoneEnabled(false); } catch {}
    try { await localParticipant.setCameraEnabled(false); } catch {}
    setHasMediaPermission?.(false);
    sendAppMessage({ type: "hand-lowered", sessionId: localParticipant.identity });
  }, [localParticipant, sendAppMessage, setHasMediaPermission]);

  // Derive muted/camOff states from LiveKit participant state
  const isMuted = !isMicrophoneEnabled;
  const isCamOff = !isCameraEnabled;
  const isSharingScreen = isScreenShareEnabled;

  return (
    <div className="bg-gray-800 border-t border-gray-700 px-6 py-4">
      <div className="flex items-center justify-center gap-3">
        {canSend ? (
          <>
            {/* Mic */}
            <Button
              onClick={toggleAudio}
              size="lg"
              variant={isMuted ? "destructive" : "default"}
              className={`rounded-full w-14 h-14 ${
                isMuted ? "bg-red-500 hover:bg-red-600" : "bg-gray-700 hover:bg-gray-600"
              }`}
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? <MicrophoneOffIcon className="h-6 w-6" /> : <MicrophoneIcon className="h-6 w-6" />}
            </Button>

            {/* Camera */}
            <Button
              onClick={toggleVideo}
              size="lg"
              variant={isCamOff ? "destructive" : "default"}
              className={`rounded-full w-14 h-14 ${
                isCamOff ? "bg-red-500 hover:bg-red-600" : "bg-gray-700 hover:bg-gray-600"
              }`}
              title={isCamOff ? "Turn on camera" : "Turn off camera"}
            >
              {isCamOff ? <VideoCameraSlashIcon className="h-6 w-6" /> : <VideoCameraIcon className="h-6 w-6" />}
            </Button>

            {/* Screen Share */}
            <Button
              onClick={toggleScreenShare}
              size="lg"
              variant="default"
              className={`rounded-full w-14 h-14 ${
                isSharingScreen ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-700 hover:bg-gray-600"
              }`}
              title={isSharingScreen ? "Stop sharing" : "Share screen"}
            >
              <ArrowUpOnSquareIcon className="h-6 w-6" />
            </Button>

            {/* Step down for approved students */}
            {!isTeacher && hasMediaPermission && (
              <Button
                onClick={stepDown}
                size="lg"
                variant="default"
                className="rounded-full h-14 px-4 bg-gray-700 hover:bg-gray-600 gap-2"
                title="Step down"
              >
                <UserMinusIcon className="h-5 w-5" />
                <span className="text-xs">Step Down</span>
              </Button>
            )}
          </>
        ) : (
          /* Student viewer: Raise Hand */
          <Button
            onClick={requestParticipation}
            size="lg"
            variant="default"
            className="rounded-full px-6 h-14 bg-yellow-500 hover:bg-yellow-600 text-black font-medium gap-2"
            title="Raise hand to request mic/camera"
          >
            <HandRaisedIcon className="h-6 w-6" />
            <span className="text-sm">Raise Hand</span>
          </Button>
        )}

        <div className="mx-4 h-10 w-px bg-gray-700"></div>

        {/* Chat */}
        {onToggleChat && (
          <Button
            onClick={onToggleChat}
            size="lg"
            variant="default"
            className={`rounded-full w-14 h-14 relative ${
              isChatOpen ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-700 hover:bg-gray-600"
            }`}
            title={isChatOpen ? "Close chat" : "Open chat"}
          >
            <ChatBubbleLeftIcon className="h-6 w-6" />
            {!isChatOpen && unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Button>
        )}

        {/* Settings */}
        <Button
          size="lg"
          variant="default"
          className="rounded-full w-14 h-14 bg-gray-700 hover:bg-gray-600"
          title="Settings"
        >
          <Cog6ToothIcon className="h-6 w-6" />
        </Button>

        {/* End Class (teacher only) */}
        {isTeacher && onEndClass && (
          <Button
            onClick={onEndClass}
            size="lg"
            variant="destructive"
            className="rounded-full h-14 px-4 bg-orange-600 hover:bg-orange-700 gap-2"
            title="End class for everyone"
          >
            <StopCircleIcon className="h-5 w-5" />
            <span className="text-xs">End Class</span>
          </Button>
        )}

        {/* Leave */}
        <Button
          onClick={handleLeave}
          size="lg"
          variant="destructive"
          className="rounded-full w-14 h-14 bg-red-600 hover:bg-red-700"
          title="Leave class"
        >
          <PhoneXMarkIcon className="h-6 w-6" />
        </Button>
      </div>

      {/* Labels */}
      <div className="flex items-center justify-center gap-3 mt-2">
        {canSend ? (
          <>
            <span className="text-xs text-gray-400 w-14 text-center">{isMuted ? "Unmute" : "Mute"}</span>
            <span className="text-xs text-gray-400 w-14 text-center">{isCamOff ? "Start" : "Stop"} Video</span>
            <span className="text-xs text-gray-400 w-14 text-center">{isSharingScreen ? "Stop" : "Share"}</span>
            {!isTeacher && hasMediaPermission && (
              <span className="text-xs text-gray-400 text-center">Step Down</span>
            )}
          </>
        ) : (
          <span className="text-xs text-gray-400 text-center">Request to speak</span>
        )}
        <div className="mx-4 w-px"></div>
        {onToggleChat && <span className="text-xs text-gray-400 w-14 text-center">Chat</span>}
        <span className="text-xs text-gray-400 w-14 text-center">Settings</span>
        {isTeacher && onEndClass && <span className="text-xs text-orange-400 text-center">End Class</span>}
        <span className="text-xs text-gray-400 w-14 text-center text-red-400">Leave</span>
      </div>
    </div>
  );
}
