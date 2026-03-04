"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useDaily, useLocalParticipant, useDailyEvent } from "@daily-co/daily-react";
import type { DailyParticipantPermissionsCanSendValues } from "@daily-co/daily-js";
import { PaperAirplaneIcon, XMarkIcon, HandRaisedIcon } from "@heroicons/react/24/solid";

interface ChatMessage {
  sender: string;
  text: string;
  timestamp: Date;
  type?: "chat" | "hand-raise" | "hand-lower" | "hand-granted" | "hand-denied";
  sessionId?: string;
  handled?: boolean;
}

interface LiveClassChatProps {
  onClose: () => void;
  onNewMessage: () => void;
  isTeacher?: boolean;
  raisedHands?: Set<string>;
  setRaisedHands?: (fn: (prev: Set<string>) => Set<string>) => void;
}

export default function LiveClassChat({
  onClose,
  onNewMessage,
  isTeacher = false,
  raisedHands,
  setRaisedHands,
}: LiveClassChatProps) {
  const callObject = useDaily();
  const localParticipant = useLocalParticipant();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useDailyEvent("app-message", (event) => {
    if (!event) return;
    const { data, fromId } = event;

    if (fromId === localParticipant?.session_id) return;

    if (data?.type === "chat") {
      setMessages((prev) => [
        ...prev,
        { sender: data.sender, text: data.text, timestamp: new Date(), type: "chat" },
      ]);
      onNewMessage();
    } else if (data?.type === "hand-raise") {
      setMessages((prev) => [
        ...prev,
        {
          sender: data.sender,
          text: `${data.sender} raised their hand`,
          timestamp: new Date(),
          type: "hand-raise",
          sessionId: data.sessionId,
        },
      ]);
      onNewMessage();
    } else if (data?.type === "hand-lower") {
      setMessages((prev) => [
        ...prev,
        {
          sender: data.sender,
          text: `${data.sender} lowered their hand`,
          timestamp: new Date(),
          type: "hand-lower",
          sessionId: data.sessionId,
        },
      ]);
    } else if (data?.type === "hand-granted") {
      setMessages((prev) => [
        ...prev,
        {
          sender: "System",
          text: "Mic & camera access granted",
          timestamp: new Date(),
          type: "hand-granted",
          sessionId: data.sessionId,
          handled: true,
        },
      ]);
      // Also mark corresponding hand-raise as handled
      setMessages((prev) =>
        prev.map((msg) =>
          msg.type === "hand-raise" && msg.sessionId === data.sessionId
            ? { ...msg, handled: true }
            : msg
        )
      );
    } else if (data?.type === "hand-denied") {
      setMessages((prev) => [
        ...prev,
        {
          sender: "System",
          text: "Request denied",
          timestamp: new Date(),
          type: "hand-denied",
          sessionId: data.sessionId,
          handled: true,
        },
      ]);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.type === "hand-raise" && msg.sessionId === data.sessionId
            ? { ...msg, handled: true }
            : msg
        )
      );
    }
  });

  const sendMessage = useCallback(() => {
    const text = inputText.trim();
    if (!text || !callObject) return;

    const senderName = localParticipant?.user_name || "You";

    callObject.sendAppMessage(
      { type: "chat", sender: senderName, text },
      "*"
    );

    setMessages((prev) => [
      ...prev,
      { sender: senderName, text, timestamp: new Date(), type: "chat" },
    ]);
    setInputText("");
  }, [inputText, callObject, localParticipant]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleAllow = useCallback(
    (sessionId: string) => {
      if (!callObject) return;

      callObject.updateParticipant(sessionId, {
        updatePermissions: {
          canSend: new Set<DailyParticipantPermissionsCanSendValues>(["audio", "video", "screenVideo", "screenAudio"]),
        },
      });

      callObject.sendAppMessage(
        { type: "hand-granted", sessionId },
        "*"
      );

      // Mark message as handled locally
      setMessages((prev) =>
        prev.map((msg) =>
          msg.type === "hand-raise" && msg.sessionId === sessionId
            ? { ...msg, handled: true }
            : msg
        )
      );

      // Add system message locally
      setMessages((prev) => [
        ...prev,
        {
          sender: "System",
          text: "Mic & camera access granted",
          timestamp: new Date(),
          type: "hand-granted",
          sessionId,
          handled: true,
        },
      ]);

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

  const handleDeny = useCallback(
    (sessionId: string) => {
      if (!callObject) return;

      callObject.sendAppMessage(
        { type: "hand-denied", sessionId },
        "*"
      );

      setMessages((prev) =>
        prev.map((msg) =>
          msg.type === "hand-raise" && msg.sessionId === sessionId
            ? { ...msg, handled: true }
            : msg
        )
      );

      setMessages((prev) => [
        ...prev,
        {
          sender: "System",
          text: "Request denied",
          timestamp: new Date(),
          type: "hand-denied",
          sessionId,
          handled: true,
        },
      ]);

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

  return (
    <div className="flex flex-col h-full bg-gray-850 border-l border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800">
        <h3 className="text-white font-medium text-sm">Chat</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white transition-colors"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-gray-500 text-sm text-center mt-8">
            No messages yet. Say hello!
          </p>
        )}
        {messages.map((msg, i) => {
          const isLocal = msg.sender === (localParticipant?.user_name || "You");

          // System/hand-raise messages
          if (msg.type === "hand-raise" || msg.type === "hand-lower") {
            return (
              <div key={i} className="flex flex-col items-center gap-1">
                <div className="flex items-center gap-1.5 bg-gray-700/60 rounded-full px-3 py-1.5">
                  <HandRaisedIcon className="h-3.5 w-3.5 text-yellow-400" />
                  <span className="text-xs text-gray-300">{msg.text}</span>
                </div>
                {isTeacher && msg.type === "hand-raise" && msg.sessionId && !msg.handled && (
                  <div className="flex gap-2 mt-1">
                    <button
                      onClick={() => handleAllow(msg.sessionId!)}
                      className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded-full transition-colors"
                    >
                      Allow
                    </button>
                    <button
                      onClick={() => handleDeny(msg.sessionId!)}
                      className="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-full transition-colors"
                    >
                      Deny
                    </button>
                  </div>
                )}
              </div>
            );
          }

          if (msg.type === "hand-granted" || msg.type === "hand-denied") {
            return (
              <div key={i} className="flex justify-center">
                <span className="text-xs text-gray-500 italic">{msg.text}</span>
              </div>
            );
          }

          // Regular chat messages
          return (
            <div key={i} className={`flex flex-col ${isLocal ? "items-end" : "items-start"}`}>
              <span className="text-xs text-gray-500 mb-1">{msg.sender}</span>
              <div
                className={`rounded-lg px-3 py-2 max-w-[85%] text-sm ${
                  isLocal
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-100"
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
            onClick={sendMessage}
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
