"use client";

import { useCallback, useState, useEffect } from "react";
import { useDaily, useLocalParticipant, useScreenShare } from "@daily-co/daily-react";
import type { DailyParticipantPermissionsCanSendValues } from "@daily-co/daily-js";
import {
  MicrophoneIcon,
  VideoCameraIcon,
  PhoneXMarkIcon,
  ArrowUpOnSquareIcon,
  Cog6ToothIcon,
  ChatBubbleLeftIcon,
  HandRaisedIcon,
} from "@heroicons/react/24/solid";
import {
  MicrophoneIcon as MicrophoneOffIcon,
  VideoCameraSlashIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";

interface ControlBarProps {
  onLeave: () => void;
  onToggleChat?: () => void;
  isChatOpen?: boolean;
  unreadCount?: number;
  isTeacher?: boolean;
  hasMediaPermission?: boolean;
  raisedHands?: Set<string>;
  setRaisedHands?: (fn: (prev: Set<string>) => Set<string>) => void;
}

export default function ControlBar({
  onLeave,
  onToggleChat,
  isChatOpen,
  unreadCount = 0,
  isTeacher = false,
  hasMediaPermission = true,
  raisedHands,
  setRaisedHands,
}: ControlBarProps) {
  const callObject = useDaily();
  const localParticipant = useLocalParticipant();
  const { isSharingScreen, startScreenShare, stopScreenShare } = useScreenShare();
  const [isHandRaised, setIsHandRaised] = useState(false);

  // Reset hand raise when permission changes (granted or revoked)
  useEffect(() => {
    setIsHandRaised(false);
  }, [hasMediaPermission]);

  const toggleAudio = useCallback(() => {
    if (!callObject) return;
    callObject.setLocalAudio(!localParticipant?.audio);
  }, [callObject, localParticipant]);

  const toggleVideo = useCallback(() => {
    if (!callObject) return;
    callObject.setLocalVideo(!localParticipant?.video);
  }, [callObject, localParticipant]);

  const toggleScreenShare = useCallback(async () => {
    if (!callObject) return;

    if (isSharingScreen) {
      stopScreenShare();
    } else {
      try {
        await startScreenShare();
      } catch (error) {
        console.error("Error starting screen share:", error);
      }
    }
  }, [callObject, isSharingScreen, startScreenShare, stopScreenShare]);

  const handleLeave = useCallback(async () => {
    if (!callObject) return;

    try {
      await callObject.leave();
      onLeave();
    } catch (error) {
      console.error("Error leaving call:", error);
      onLeave();
    }
  }, [callObject, onLeave]);

  const toggleRaiseHand = useCallback(() => {
    if (!callObject || !localParticipant) return;

    const newState = !isHandRaised;
    setIsHandRaised(newState);

    callObject.sendAppMessage(
      {
        type: newState ? "hand-raise" : "hand-lower",
        sender: localParticipant.user_name || "Student",
        sessionId: localParticipant.session_id,
      },
      "*"
    );
  }, [callObject, localParticipant, isHandRaised]);

  const revokeParticipant = useCallback(
    (sessionId: string) => {
      if (!callObject) return;
      callObject.updateParticipant(sessionId, {
        updatePermissions: {
          canSend: new Set<DailyParticipantPermissionsCanSendValues>(["screenVideo", "screenAudio"]),
        },
      });
      callObject.sendAppMessage(
        { type: "hand-denied", sessionId },
        "*"
      );
      if (setRaisedHands) {
        setRaisedHands((prev) => {
          const next = new Set(prev);
          next.delete(sessionId);
          return next;
        });
      }
    },
    [callObject, setRaisedHands]
  );

  const isAudioOn = localParticipant?.audio;
  const isVideoOn = localParticipant?.video;
  const showMediaButtons = isTeacher || hasMediaPermission;

  return (
    <div className="bg-gray-800 border-t border-gray-700 px-6 py-4">
      <div className="flex items-center justify-center gap-3">
        {/* Mic/Cam buttons: only visible if teacher or permission granted */}
        {showMediaButtons && (
          <>
            <Button
              onClick={toggleAudio}
              size="lg"
              variant={isAudioOn ? "default" : "destructive"}
              className={`rounded-full w-14 h-14 ${
                isAudioOn
                  ? "bg-gray-700 hover:bg-gray-600"
                  : "bg-red-500 hover:bg-red-600"
              }`}
              title={isAudioOn ? "Mute" : "Unmute"}
            >
              {isAudioOn ? (
                <MicrophoneIcon className="h-6 w-6" />
              ) : (
                <MicrophoneOffIcon className="h-6 w-6" />
              )}
            </Button>

            <Button
              onClick={toggleVideo}
              size="lg"
              variant={isVideoOn ? "default" : "destructive"}
              className={`rounded-full w-14 h-14 ${
                isVideoOn
                  ? "bg-gray-700 hover:bg-gray-600"
                  : "bg-red-500 hover:bg-red-600"
              }`}
              title={isVideoOn ? "Turn off camera" : "Turn on camera"}
            >
              {isVideoOn ? (
                <VideoCameraIcon className="h-6 w-6" />
              ) : (
                <VideoCameraSlashIcon className="h-6 w-6" />
              )}
            </Button>
          </>
        )}

        {/* Raise Hand button: only for students */}
        {!isTeacher && (
          <Button
            onClick={toggleRaiseHand}
            size="lg"
            variant="default"
            className={`rounded-full w-14 h-14 ${
              isHandRaised
                ? "bg-yellow-500 hover:bg-yellow-600"
                : "bg-gray-700 hover:bg-gray-600"
            }`}
            title={isHandRaised ? "Lower hand" : "Raise hand"}
          >
            <HandRaisedIcon className="h-6 w-6" />
          </Button>
        )}

        {/* Screen Share Button */}
        {(isTeacher || hasMediaPermission) && (
          <Button
            onClick={toggleScreenShare}
            size="lg"
            variant="default"
            className={`rounded-full w-14 h-14 ${
              isSharingScreen
                ? "bg-blue-600 hover:bg-blue-700"
                : "bg-gray-700 hover:bg-gray-600"
            }`}
            title={isSharingScreen ? "Stop sharing" : "Share screen"}
          >
            <ArrowUpOnSquareIcon className="h-6 w-6" />
          </Button>
        )}

        <div className="mx-4 h-10 w-px bg-gray-700"></div>

        {/* Chat Button */}
        {onToggleChat && (
          <Button
            onClick={onToggleChat}
            size="lg"
            variant="default"
            className={`rounded-full w-14 h-14 relative ${
              isChatOpen
                ? "bg-blue-600 hover:bg-blue-700"
                : "bg-gray-700 hover:bg-gray-600"
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

        {/* Settings Button */}
        <Button
          size="lg"
          variant="default"
          className="rounded-full w-14 h-14 bg-gray-700 hover:bg-gray-600"
          title="Settings"
        >
          <Cog6ToothIcon className="h-6 w-6" />
        </Button>

        {/* Leave Button */}
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

      {/* Control labels */}
      <div className="flex items-center justify-center gap-3 mt-2">
        {showMediaButtons && (
          <>
            <span className="text-xs text-gray-400 w-14 text-center">
              {isAudioOn ? "Mute" : "Unmute"}
            </span>
            <span className="text-xs text-gray-400 w-14 text-center">
              {isVideoOn ? "Stop" : "Start"} Video
            </span>
          </>
        )}
        {!isTeacher && (
          <span className="text-xs text-gray-400 w-14 text-center">
            {isHandRaised ? "Lower" : "Raise"} Hand
          </span>
        )}
        {(isTeacher || hasMediaPermission) && (
          <span className="text-xs text-gray-400 w-14 text-center">
            {isSharingScreen ? "Stop" : "Share"}
          </span>
        )}
        <div className="mx-4 w-px"></div>
        {onToggleChat && (
          <span className="text-xs text-gray-400 w-14 text-center">Chat</span>
        )}
        <span className="text-xs text-gray-400 w-14 text-center">Settings</span>
        <span className="text-xs text-gray-400 w-14 text-center text-red-400">Leave</span>
      </div>
    </div>
  );
}
