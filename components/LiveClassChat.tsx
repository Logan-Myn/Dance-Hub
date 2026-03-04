"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useDaily, useLocalParticipant, useDailyEvent } from "@daily-co/daily-react";
import { PaperAirplaneIcon, XMarkIcon } from "@heroicons/react/24/solid";

interface ChatMessage {
  sender: string;
  text: string;
  timestamp: Date;
}

interface LiveClassChatProps {
  onClose: () => void;
  onNewMessage: () => void;
}

export default function LiveClassChat({ onClose, onNewMessage }: LiveClassChatProps) {
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
    if (data?.type === "chat" && fromId !== localParticipant?.session_id) {
      setMessages((prev) => [
        ...prev,
        { sender: data.sender, text: data.text, timestamp: new Date() },
      ]);
      onNewMessage();
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
      { sender: senderName, text, timestamp: new Date() },
    ]);
    setInputText("");
  }, [inputText, callObject, localParticipant]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

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
