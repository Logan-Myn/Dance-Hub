"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useDaily } from "@daily-co/daily-react";
import type { DailyParticipantPermissionsCanSendValues } from "@daily-co/daily-js";
import { PaperAirplaneIcon, XMarkIcon, HandRaisedIcon, CheckIcon, XCircleIcon, UserMinusIcon } from "@heroicons/react/24/solid";
import type { HandRaise, ActiveSpeaker } from "./CustomDailyRoom";

export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: Date;
  type?: "chat" | "system";
  isLocal?: boolean;
}

interface LiveClassChatProps {
  onClose: () => void;
  isTeacher?: boolean;
  handRaises?: HandRaise[];
  activeSpeakers?: ActiveSpeaker[];
  chatMessages?: ChatMessage[];
  setChatMessages?: (fn: (prev: ChatMessage[]) => ChatMessage[]) => void;
  sendAppMessage?: (data: any, to?: string) => void;
  setHandRaises?: (fn: (prev: HandRaise[]) => HandRaise[]) => void;
  setActiveSpeakers?: (fn: (prev: ActiveSpeaker[]) => ActiveSpeaker[]) => void;
}

export default function LiveClassChat({
  onClose,
  isTeacher = false,
  handRaises = [],
  activeSpeakers = [],
  chatMessages = [],
  setChatMessages,
  sendAppMessage,
  setHandRaises,
  setActiveSpeakers,
}: LiveClassChatProps) {
  const callObject = useDaily();
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages, scrollToBottom]);

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || !sendAppMessage || !callObject) return;

    const local = callObject.participants().local;
    const senderName = local?.user_name || "You";
    const timestamp = Date.now();

    sendAppMessage({ type: "chat", text, senderName, timestamp }, "*");

    setChatMessages?.((prev) => [
      ...prev,
      {
        id: `local-${timestamp}`,
        sender: senderName,
        text,
        timestamp: new Date(timestamp),
        type: "chat",
        isLocal: true,
      },
    ]);
    setInputText("");
  }, [inputText, callObject, sendAppMessage, setChatMessages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleAllow = useCallback(
    (raise: HandRaise) => {
      if (!callObject || !sendAppMessage) return;

      callObject.updateParticipant(raise.sessionId, {
        updatePermissions: {
          canSend: new Set<DailyParticipantPermissionsCanSendValues>(["video", "audio"]),
        },
      });
      sendAppMessage({ type: "hand-approved" }, raise.sessionId);
      setHandRaises?.((prev) => prev.filter((r) => r.sessionId !== raise.sessionId));
      setActiveSpeakers?.((prev) => [...prev, { sessionId: raise.sessionId, userName: raise.userName }]);

      setChatMessages?.((prev) => [
        ...prev,
        {
          id: `system-allow-${Date.now()}`,
          sender: "System",
          text: `${raise.userName} was granted mic/camera access`,
          timestamp: new Date(),
          type: "system",
        },
      ]);
    },
    [callObject, sendAppMessage, setHandRaises, setActiveSpeakers, setChatMessages]
  );

  const handleDeny = useCallback(
    (raise: HandRaise) => {
      if (!sendAppMessage) return;

      sendAppMessage({ type: "hand-denied" }, raise.sessionId);
      setHandRaises?.((prev) => prev.filter((r) => r.sessionId !== raise.sessionId));

      setChatMessages?.((prev) => [
        ...prev,
        {
          id: `system-deny-${Date.now()}`,
          sender: "System",
          text: `${raise.userName}'s request was denied`,
          timestamp: new Date(),
          type: "system",
        },
      ]);
    },
    [sendAppMessage, setHandRaises, setChatMessages]
  );

  const handleRevoke = useCallback(
    (speaker: ActiveSpeaker) => {
      if (!callObject || !sendAppMessage) return;

      callObject.updateParticipant(speaker.sessionId, {
        updatePermissions: { canSend: false },
      });
      sendAppMessage({ type: "hand-revoked" }, speaker.sessionId);
      setActiveSpeakers?.((prev) => prev.filter((s) => s.sessionId !== speaker.sessionId));

      setChatMessages?.((prev) => [
        ...prev,
        {
          id: `system-revoke-${Date.now()}`,
          sender: "System",
          text: `${speaker.userName}'s access was revoked`,
          timestamp: new Date(),
          type: "system",
        },
      ]);
    },
    [callObject, sendAppMessage, setActiveSpeakers, setChatMessages]
  );

  return (
    <div className="flex flex-col h-full bg-gray-850 border-l border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800">
        <h3 className="text-white font-medium text-sm">Chat</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Teacher: Hand raises */}
      {isTeacher && handRaises.length > 0 && (
        <div className="px-4 py-3 border-b border-gray-700 bg-gray-800/50 space-y-2">
          <div className="text-xs font-medium text-yellow-400 flex items-center gap-1">
            <HandRaisedIcon className="h-3.5 w-3.5" />
            Raised Hands ({handRaises.length})
          </div>
          {handRaises.map((raise) => (
            <div
              key={raise.sessionId}
              className="flex items-center justify-between gap-2 bg-gray-700/50 rounded-lg px-3 py-2"
            >
              <span className="text-xs text-gray-200 truncate">{raise.userName}</span>
              <div className="flex gap-1.5 shrink-0">
                <button
                  onClick={() => handleAllow(raise)}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-green-600 hover:bg-green-700 text-white transition-colors"
                  title="Allow"
                >
                  <CheckIcon className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => handleDeny(raise)}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-red-600 hover:bg-red-700 text-white transition-colors"
                  title="Deny"
                >
                  <XCircleIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Teacher: Active speakers with Revoke */}
      {isTeacher && activeSpeakers.length > 0 && (
        <div className="px-4 py-3 border-b border-gray-700 bg-gray-800/50 space-y-2">
          <div className="text-xs font-medium text-green-400">
            Active Speakers ({activeSpeakers.length})
          </div>
          {activeSpeakers.map((speaker) => (
            <div
              key={speaker.sessionId}
              className="flex items-center justify-between gap-2 bg-gray-700/50 rounded-lg px-3 py-2"
            >
              <span className="text-xs text-gray-200 truncate">{speaker.userName}</span>
              <button
                onClick={() => handleRevoke(speaker)}
                className="flex h-6 items-center gap-1 px-2 rounded-full bg-red-600 hover:bg-red-700 text-white transition-colors text-[10px]"
                title="Revoke access"
              >
                <UserMinusIcon className="h-3 w-3" />
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {chatMessages.length === 0 && (
          <p className="text-gray-500 text-sm text-center mt-8">
            No messages yet. Say hello!
          </p>
        )}
        {chatMessages.map((msg) => {
          if (msg.type === "system") {
            return (
              <div key={msg.id} className="flex justify-center">
                <span className="text-xs text-gray-500 italic">{msg.text}</span>
              </div>
            );
          }

          return (
            <div key={msg.id} className={`flex flex-col ${msg.isLocal ? "items-end" : "items-start"}`}>
              <span className="text-xs text-gray-500 mb-1">{msg.sender}</span>
              <div
                className={`rounded-lg px-3 py-2 max-w-[85%] text-sm ${
                  msg.isLocal ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-100"
                }`}
              >
                {msg.text}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-gray-700 bg-gray-800">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="flex-1 bg-gray-700 text-white text-sm rounded-lg px-3 py-2 placeholder-gray-400 outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={handleSend}
            disabled={!inputText.trim()}
            className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <PaperAirplaneIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
