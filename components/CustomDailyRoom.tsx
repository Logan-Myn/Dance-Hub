"use client";

import { useEffect, useRef, useState } from "react";
import { DailyProvider, useDaily, useParticipantIds, useLocalParticipant, useDailyEvent } from "@daily-co/daily-react";
import DailyIframe from "@daily-co/daily-js";
import ParticipantTile from "./ParticipantTile";
import ControlBar from "./ControlBar";
import LiveClassChat from "./LiveClassChat";

interface CustomDailyRoomProps {
  roomUrl: string;
  token: string;
  onLeave: () => void;
  className?: string;
  classTitle?: string;
}

function CallInterface({ onLeave, classTitle }: { onLeave: () => void; classTitle?: string }) {
  const callObject = useDaily();
  const participantIds = useParticipantIds();
  const localParticipant = useLocalParticipant();
  const [callState, setCallState] = useState<string>('loading');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Listen for call state changes
  useDailyEvent('joined-meeting', () => {
    console.log('✅ Joined meeting event received');
    setCallState('joined');
  });

  useDailyEvent('left-meeting', () => {
    console.log('👋 Left meeting event received');
    setCallState('left');
  });

  useDailyEvent('error', (event) => {
    console.error('❌ Daily error:', event);
    setCallState('error');
  });

  useEffect(() => {
    if (callObject) {
      console.log('Call object available, current state:', callObject.meetingState());
      const state = callObject.meetingState();
      if (state === 'joined-meeting') {
        setCallState('joined');
      }
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

  const handleNewMessage = () => {
    if (!isChatOpen) setUnreadCount((c) => c + 1);
  };

  return (
    <div className="h-full flex flex-col bg-gray-900">
      {/* Header with DanceHub branding */}
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
              {participantIds.length} participant{participantIds.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Main content area: video grid + chat */}
      <div className="flex-1 flex overflow-hidden">
        {/* Participant Grid */}
        <div className="flex-1 overflow-auto p-4">
          <div className="h-full grid gap-4 auto-rows-fr"
            style={{
              gridTemplateColumns: participantIds.length === 1
                ? '1fr'
                : participantIds.length <= 2
                  ? 'repeat(2, 1fr)'
                  : participantIds.length <= 4
                    ? 'repeat(2, 1fr)'
                    : 'repeat(3, 1fr)'
            }}
          >
            {/* Local participant first */}
            {localParticipant && (
              <ParticipantTile
                sessionId={localParticipant.session_id}
                isLocal={true}
              />
            )}

            {/* Remote participants */}
            {participantIds
              .filter(id => id !== localParticipant?.session_id)
              .map((id) => (
                <ParticipantTile
                  key={id}
                  sessionId={id}
                  isLocal={false}
                />
              ))}
          </div>
        </div>

        {/* Chat Panel */}
        {isChatOpen && (
          <div className="w-80 flex-shrink-0">
            <LiveClassChat onClose={toggleChat} onNewMessage={handleNewMessage} />
          </div>
        )}
      </div>

      {/* Control Bar */}
      <ControlBar
        onLeave={onLeave}
        onToggleChat={toggleChat}
        isChatOpen={isChatOpen}
        unreadCount={unreadCount}
      />
    </div>
  );
}

export default function CustomDailyRoom({
  roomUrl,
  token,
  onLeave,
  classTitle
}: CustomDailyRoomProps) {
  const callObjectRef = useRef<any>(null);
  const [isCallObjectReady, setIsCallObjectReady] = useState(false);
  const hasJoinedRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    const initializeCall = async () => {
      try {
        // Create call object only once
        if (!callObjectRef.current) {
          console.log("🎥 Creating Daily call object...");
          callObjectRef.current = DailyIframe.createCallObject();
        }

        const callObject = callObjectRef.current;

        if (!mounted || hasJoinedRef.current) return;

        // Use preAuth to load the call bundle before joining
        console.log("🔐 Preloading Daily call bundle...");
        await callObject.preAuth({
          url: roomUrl,
          token: token,
        });

        console.log("✅ Call bundle preloaded successfully");

        if (!mounted || hasJoinedRef.current) return;

        // Set ready state to trigger DailyProvider
        setIsCallObjectReady(true);

        // Wait for DailyProvider to mount
        await new Promise(resolve => setTimeout(resolve, 200));

        if (!mounted || hasJoinedRef.current) return;

        // Now join the call
        console.log("📞 Joining Daily call...");
        hasJoinedRef.current = true;

        await callObject.join({
          url: roomUrl,
          token: token,
        });

        console.log("✅ Successfully joined call");
      } catch (error) {
        console.error("❌ Error initializing call:", error);
        if (mounted) {
          // Show error state
          setIsCallObjectReady(false);
        }
      }
    };

    initializeCall();

    // Cleanup
    return () => {
      mounted = false;
      if (callObjectRef.current && hasJoinedRef.current) {
        console.log("🧹 Cleaning up Daily call object");
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
      <CallInterface onLeave={onLeave} classTitle={classTitle} />
    </DailyProvider>
  );
}
