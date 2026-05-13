"use client";

import { useCallback } from "react";
import React from "react";
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
    } catch (err) {
      console.error("Failed to toggle mic:", err);
    }
  }, [localParticipant, isMicrophoneEnabled]);

  const toggleVideo = useCallback(async () => {
    try {
      await localParticipant.setCameraEnabled(!isCameraEnabled);
    } catch (err) {
      console.error("Failed to toggle camera:", err);
    }
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
      participantIdentity: localParticipant.identity,
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

  const ControlBtn = ({ label, labelClass, children }: { label?: string; labelClass?: string; children: React.ReactNode }) => (
    <div className="flex flex-col items-center gap-1">
      {children}
      {label && <span className={`hidden sm:block text-xs text-center ${labelClass ?? "text-gray-400"}`}>{label}</span>}
    </div>
  );

  return (
    <div className="bg-gray-800 border-t border-gray-700 px-2 py-2 sm:px-6 sm:py-4 pb-safe">
      <div className="flex flex-wrap items-end justify-center gap-1.5 sm:gap-3">
        {canSend ? (
          <>
            <ControlBtn label={isMuted ? "Unmute" : "Mute"}>
              <Button
                onClick={toggleAudio}
                size="lg"
                variant={isMuted ? "destructive" : "default"}
                className={`rounded-full w-11 h-11 sm:w-14 sm:h-14 ${
                  isMuted ? "bg-red-500 hover:bg-red-600" : "bg-gray-700 hover:bg-gray-600"
                }`}
                title={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? <MicrophoneOffIcon className="h-5 w-5 sm:h-6 sm:w-6" /> : <MicrophoneIcon className="h-5 w-5 sm:h-6 sm:w-6" />}
              </Button>
            </ControlBtn>

            <ControlBtn label={`${isCamOff ? "Start" : "Stop"} Video`}>
              <Button
                onClick={toggleVideo}
                size="lg"
                variant={isCamOff ? "destructive" : "default"}
                className={`rounded-full w-11 h-11 sm:w-14 sm:h-14 ${
                  isCamOff ? "bg-red-500 hover:bg-red-600" : "bg-gray-700 hover:bg-gray-600"
                }`}
                title={isCamOff ? "Turn on camera" : "Turn off camera"}
              >
                {isCamOff ? <VideoCameraSlashIcon className="h-5 w-5 sm:h-6 sm:w-6" /> : <VideoCameraIcon className="h-5 w-5 sm:h-6 sm:w-6" />}
              </Button>
            </ControlBtn>

            <ControlBtn label={isSharingScreen ? "Stop" : "Share"}>
              <Button
                onClick={toggleScreenShare}
                size="lg"
                variant="default"
                className={`rounded-full w-11 h-11 sm:w-14 sm:h-14 ${
                  isSharingScreen ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-700 hover:bg-gray-600"
                }`}
                title={isSharingScreen ? "Stop sharing" : "Share screen"}
              >
                <ArrowUpOnSquareIcon className="h-5 w-5 sm:h-6 sm:w-6" />
              </Button>
            </ControlBtn>

            {!isTeacher && hasMediaPermission && (
              <ControlBtn label="Step Down">
                <Button
                  onClick={stepDown}
                  size="lg"
                  variant="default"
                  className="rounded-full h-11 sm:h-14 px-3 sm:px-4 bg-gray-700 hover:bg-gray-600 gap-1.5 sm:gap-2"
                  title="Step down"
                >
                  <UserMinusIcon className="h-4 w-4 sm:h-5 sm:w-5" />
                </Button>
              </ControlBtn>
            )}
          </>
        ) : (
          <ControlBtn label="Request to speak">
            <Button
              onClick={requestParticipation}
              size="lg"
              variant="default"
              className="rounded-full px-4 sm:px-6 h-11 sm:h-14 bg-yellow-500 hover:bg-yellow-600 text-black font-medium gap-1.5 sm:gap-2"
              title="Raise hand to request mic/camera"
            >
              <HandRaisedIcon className="h-5 w-5 sm:h-6 sm:w-6" />
              <span className="text-sm sm:hidden">Raise Hand</span>
            </Button>
          </ControlBtn>
        )}

        <div className="hidden sm:block self-center mx-2 h-10 w-px bg-gray-700" />

        {onToggleChat && (
          <ControlBtn label={isChatOpen ? "Close Chat" : "Chat"}>
            <Button
              onClick={onToggleChat}
              size="lg"
              variant="default"
              className={`rounded-full w-11 h-11 sm:w-14 sm:h-14 relative ${
                isChatOpen ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-700 hover:bg-gray-600"
              }`}
              title={isChatOpen ? "Close chat" : "Open chat"}
            >
              <ChatBubbleLeftIcon className="h-5 w-5 sm:h-6 sm:w-6" />
              {!isChatOpen && unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Button>
          </ControlBtn>
        )}

        <ControlBtn label="Settings">
          <Button
            size="lg"
            variant="default"
            className="rounded-full w-11 h-11 sm:w-14 sm:h-14 bg-gray-700 hover:bg-gray-600"
            title="Settings"
          >
            <Cog6ToothIcon className="h-5 w-5 sm:h-6 sm:w-6" />
          </Button>
        </ControlBtn>

        {isTeacher && onEndClass && (
          <ControlBtn label="End Class" labelClass="text-orange-400">
            <Button
              onClick={onEndClass}
              size="lg"
              variant="destructive"
              className="rounded-full h-11 sm:h-14 px-3 sm:px-4 bg-orange-600 hover:bg-orange-700 gap-1.5 sm:gap-2"
              title="End class for everyone"
            >
              <StopCircleIcon className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="text-xs">End Class</span>
            </Button>
          </ControlBtn>
        )}

        <ControlBtn label="Leave" labelClass="text-red-400">
          <Button
            onClick={handleLeave}
            size="lg"
            variant="destructive"
            className="rounded-full w-11 h-11 sm:w-14 sm:h-14 bg-red-600 hover:bg-red-700"
            title="Leave class"
          >
            <PhoneXMarkIcon className="h-5 w-5 sm:h-6 sm:w-6" />
          </Button>
        </ControlBtn>
      </div>
    </div>
  );
}
