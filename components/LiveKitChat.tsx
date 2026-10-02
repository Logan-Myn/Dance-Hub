"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { PaperAirplaneIcon, XMarkIcon, HandRaisedIcon, CheckIcon, XCircleIcon, UserMinusIcon, MicrophoneIcon } from "@heroicons/react/24/solid";
import type { RoomMessage } from "@/lib/live-class-messages";

export interface ChatMessage {
  id: string;
  /** Who sent a remote message; the name is looked up when shown. */
  senderIdentity?: string;
  /** Fixed label for local messages. */
  sender?: string;
  text: string;
  timestamp: Date;
  type?: "chat" | "system";
  isLocal?: boolean;
}

interface LiveKitChatProps {
  onClose: () => void;
  isTeacher?: boolean;
  /** Teacher only: identities waiting for mic/camera access. */
  raisedHands?: string[];
  /** Teacher only: identities currently allowed to use mic/camera. */
  speakers?: string[];
  /** Identities with an allow/revoke request in flight. */
  pending?: string[];
  nameFor: (identity: string) => string;
  onAllow?: (identity: string) => void;
  onDeny?: (identity: string) => void;
  onRevoke?: (identity: string) => void;
  chatMessages?: ChatMessage[];
  setChatMessages?: (fn: (prev: ChatMessage[]) => ChatMessage[]) => void;
  sendAppMessage?: (data: RoomMessage, destinationIdentities?: string[]) => void;
  localName: string;
}

export default function LiveKitChat({
  onClose,
  isTeacher = false,
  raisedHands = [],
  speakers = [],
  pending = [],
  nameFor,
  onAllow,
  onDeny,
  onRevoke,
  chatMessages = [],
  setChatMessages,
  sendAppMessage,
  localName,
}: LiveKitChatProps) {
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
    if (!text || !sendAppMessage) return;

    const timestamp = Date.now();

    // Receivers take the sender from the connection, so only the text is sent.
    sendAppMessage({ type: "chat", text });

    setChatMessages?.((prev) => [
      ...prev,
      {
        id: `local-${timestamp}`,
        sender: localName,
        text,
        timestamp: new Date(timestamp),
        type: "chat",
        isLocal: true,
      },
    ]);
    setInputText("");
  }, [inputText, localName, sendAppMessage, setChatMessages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full w-full min-w-0 overflow-hidden bg-gray-900 sm:border-l border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800">
        <h3 className="text-white font-medium text-sm">Chat</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Teacher: raised hands (allow / deny) and people allowed to speak (revoke) */}
      {isTeacher && (raisedHands.length > 0 || speakers.length > 0) && (
        <div className="px-4 py-3 border-b border-gray-700 bg-gray-800/50 space-y-2">
          {raisedHands.length > 0 && (
            <>
              <div className="text-xs font-medium text-yellow-400 flex items-center gap-1">
                <HandRaisedIcon className="h-3.5 w-3.5" />
                Raised Hands ({raisedHands.length})
              </div>
              {raisedHands.map((identity) => (
                <div
                  key={identity}
                  className="flex items-center justify-between gap-2 bg-gray-700/50 rounded-lg px-3 py-2"
                >
                  <span className="text-xs text-gray-200 truncate">{nameFor(identity)}</span>
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      onClick={() => onAllow?.(identity)}
                      disabled={pending.includes(identity)}
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-green-600 hover:bg-green-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Allow"
                    >
                      <CheckIcon className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => onDeny?.(identity)}
                      disabled={pending.includes(identity)}
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Deny"
                    >
                      <XCircleIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
          {speakers.length > 0 && (
            <>
              <div className="text-xs font-medium text-green-400 flex items-center gap-1">
                <MicrophoneIcon className="h-3.5 w-3.5" />
                Allowed to speak ({speakers.length})
              </div>
              {speakers.map((identity) => (
                <div
                  key={identity}
                  className="flex items-center justify-between gap-2 bg-gray-700/50 rounded-lg px-3 py-2"
                >
                  <span className="text-xs text-gray-200 truncate">{nameFor(identity)}</span>
                  <button
                    onClick={() => onRevoke?.(identity)}
                    disabled={pending.includes(identity)}
                    className="flex h-6 items-center gap-1 px-2 rounded-full bg-red-600 hover:bg-red-700 text-white transition-colors text-[10px] shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Revoke access"
                  >
                    <UserMinusIcon className="h-3 w-3" />
                    Revoke
                  </button>
                </div>
              ))}
            </>
          )}
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
              <span className="text-xs text-gray-500 mb-1">
                {!msg.isLocal && msg.senderIdentity ? nameFor(msg.senderIdentity) : msg.sender}
              </span>
              <div
                className={`rounded-lg px-3 py-2 max-w-[85%] text-sm break-words ${
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
      <div className="px-4 py-3 border-t border-gray-700 bg-gray-800">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="flex-1 min-w-0 bg-gray-700 text-white text-base sm:text-sm rounded-full px-4 py-2.5 sm:py-2 placeholder-gray-400 outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={handleSend}
            disabled={!inputText.trim()}
            className="shrink-0 h-10 w-10 sm:h-9 sm:w-9 flex items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Send"
          >
            <PaperAirplaneIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
