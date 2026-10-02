/**
 * Live-class room behaviour that used to trust whatever a participant sent:
 * - moderation messages count only from the teacher's identity,
 * - chat names come from the sender's identity (looked up), not the payload,
 * - publishing is granted / revoked on the server and an approved student
 *   stays revocable.
 */
import React from "react";
import { TextDecoder, TextEncoder } from "util";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LiveKitClassRoom from "@/components/LiveKitClassRoom";

// jsdom has no TextEncoder or scrollIntoView; browsers do.
Object.assign(global, { TextEncoder, TextDecoder });
Element.prototype.scrollIntoView = jest.fn();

type Msg = { payload: Uint8Array; from?: { identity: string } };

type RoomProps = {
  children?: React.ReactNode;
  onDisconnected?: (reason?: number) => void;
  onError?: (e: Error) => void;
};
let mockRoomProps: RoomProps = {};
let mockRoomMounts = 0;
let mockParticipants: Array<Record<string, unknown>> = [];
let mockLocal: Record<string, unknown> = {};
let mockPermissions: { canPublish: boolean } | undefined;
let mockDataHandler: ((msg: Msg) => void) | undefined;
const mockSend = jest.fn();

jest.mock("@livekit/components-styles", () => ({}));
jest.mock("@livekit/components-react", () => {
  const React = jest.requireActual("react");
  return {
    LiveKitRoom: (props: RoomProps) => {
      mockRoomProps = props;
      React.useEffect(() => {
        mockRoomMounts += 1;
      }, []);
      return React.createElement("div", { "data-testid": "room" }, props.children);
    },
    RoomAudioRenderer: () => null,
    VideoTrack: () => null,
    useRoomContext: () => ({ disconnect: jest.fn().mockResolvedValue(undefined) }),
    useParticipants: () => mockParticipants,
    useLocalParticipant: () => ({
      localParticipant: mockLocal,
      isMicrophoneEnabled: false,
      isCameraEnabled: false,
      isScreenShareEnabled: false,
    }),
    useLocalParticipantPermissions: () => mockPermissions,
    useDataChannel: (_topic: string, onMessage: (msg: Msg) => void) => {
      mockDataHandler = onMessage;
      return { send: mockSend };
    },
    useTracks: () => [],
    useConnectionState: () => "connected",
  };
});
jest.mock("livekit-client", () => ({
  Track: { Source: { Camera: "camera", ScreenShare: "screen_share" } },
  ConnectionState: {
    Disconnected: "disconnected",
    Connecting: "connecting",
    Connected: "connected",
    Reconnecting: "reconnecting",
    SignalReconnecting: "signalReconnecting",
  },
  DisconnectReason: {
    UNKNOWN_REASON: 0,
    CLIENT_INITIATED: 1,
    DUPLICATE_IDENTITY: 2,
    SERVER_SHUTDOWN: 3,
    PARTICIPANT_REMOVED: 4,
    ROOM_DELETED: 5,
    ROOM_CLOSED: 10,
  },
}));

const enc = (data: unknown) => new TextEncoder().encode(JSON.stringify(data));
const dec = (payload: Uint8Array) => JSON.parse(new TextDecoder().decode(payload));
const deliver = (from: string, data: unknown) =>
  act(() => mockDataHandler!({ payload: enc(data), from: { identity: from } }));

const NAMES: Record<string, string> = { "u-teacher": "Anna", "u-bob": "Bob", "u-carl": "Carl", "u-mallory": "Mallory" };
const lookupNames = jest.fn(async (ids: string[]) =>
  Object.fromEntries(ids.filter((id) => NAMES[id]).map((id) => [id, NAMES[id]]))
);
const setCanPublish = jest.fn();
const onLeave = jest.fn();

const participant = (identity: string, canPublish = false) => ({
  identity,
  name: "",
  permissions: { canPublish },
  trackPublications: new Map(),
});

// Let the name lookup resolve before clicking: the control bar re-creates its
// buttons on every render, so a re-render mid-click would swallow the click.
const settle = () => act(async () => {});

async function renderRoom(isTeacher: boolean) {
  mockLocal = {
    ...participant(isTeacher ? "u-teacher" : "u-student", isTeacher),
    setMicrophoneEnabled: jest.fn().mockResolvedValue(undefined),
    setCameraEnabled: jest.fn().mockResolvedValue(undefined),
    setScreenShareEnabled: jest.fn().mockResolvedValue(undefined),
  };
  mockParticipants = [mockLocal, ...mockParticipants];
  const view = render(
    <LiveKitClassRoom
      token="t"
      serverUrl="wss://media"
      onLeave={onLeave}
      isTeacher={isTeacher}
      localName={isTeacher ? "Anna" : "Sam"}
      lookupNames={lookupNames}
      moderation={{ teacherIdentity: "u-teacher", setCanPublish }}
    />
  );
  await settle();
  return view;
}

beforeEach(() => {
  mockParticipants = [];
  mockPermissions = { canPublish: false };
  mockRoomMounts = 0;
  mockSend.mockReset();
  setCanPublish.mockReset().mockResolvedValue(undefined);
  lookupNames.mockClear();
  onLeave.mockReset();
});

describe("as a student", () => {
  it("ignores a revoke from another student and honours the teacher's", async () => {
    mockParticipants = [participant("u-teacher", true), participant("u-mallory")];
    await renderRoom(false);

    deliver("u-mallory", { type: "hand-revoked", sender: "u-teacher" });
    expect(screen.queryByText(/access was revoked/i)).not.toBeInTheDocument();

    deliver("u-teacher", { type: "hand-revoked" });
    expect(screen.getByText(/access was revoked/i)).toBeInTheDocument();
  });

  it("shows chat under the sender's own name, not the name in the message", async () => {
    mockParticipants = [participant("u-teacher", true), participant("u-mallory")];
    await renderRoom(false);
    await userEvent.click(screen.getByTitle("Open chat"));

    deliver("u-mallory", { type: "chat", text: "class is cancelled", senderName: "Anna (teacher)" });

    expect(screen.getByText("class is cancelled")).toBeInTheDocument();
    expect(await screen.findByText("Mallory")).toBeInTheDocument();
    expect(screen.queryByText("Anna (teacher)")).not.toBeInTheDocument();
  });

  it("can only raise a hand until the server allows publishing", async () => {
    await renderRoom(false);
    expect(screen.queryByTitle("Mute")).not.toBeInTheDocument();

    await userEvent.click(screen.getByTitle("Raise hand to request mic/camera"));
    expect(dec(mockSend.mock.calls[0][0])).toEqual({ type: "hand-raise" });
  });

  it("gets controls once allowed, and stepping down drops the permission on the server", async () => {
    mockPermissions = { canPublish: true };
    await renderRoom(false);
    expect(screen.getByTitle("Unmute")).toBeInTheDocument();

    await userEvent.click(screen.getByTitle("Step down"));

    expect(setCanPublish).toHaveBeenCalledWith("u-student", false);
    expect(dec(mockSend.mock.calls[0][0])).toEqual({ type: "hand-lowered" });
  });
});

describe("as the teacher", () => {
  it("approves on the server, attributes the raise to its sender, and can still revoke", async () => {
    mockParticipants = [participant("u-bob")];
    const view = await renderRoom(true);
    await userEvent.click(screen.getByTitle("Open chat"));

    deliver("u-bob", { type: "hand-raise", participantIdentity: "u-victim", sender: "Victim" });
    expect(await screen.findByText("Bob")).toBeInTheDocument();

    await userEvent.click(screen.getByTitle("Allow"));
    expect(setCanPublish).toHaveBeenCalledWith("u-bob", true);

    // The server now reports Bob as allowed to publish.
    mockParticipants = [mockLocal, participant("u-bob", true)];
    view.rerender(
      <LiveKitClassRoom
        token="t"
        serverUrl="wss://media"
        onLeave={onLeave}
        isTeacher
        localName="Anna"
        lookupNames={lookupNames}
        moderation={{ teacherIdentity: "u-teacher", setCanPublish }}
      />
    );

    await userEvent.click(await screen.findByTitle("Revoke access"));
    expect(setCanPublish).toHaveBeenLastCalledWith("u-bob", false);
    const [payload, opts] = mockSend.mock.calls[mockSend.mock.calls.length - 1];
    expect(dec(payload)).toEqual({ type: "hand-revoked" });
    expect(opts).toEqual({ destinationIdentities: ["u-bob"] });
  });

  it("can revoke a student who is already allowed after a reload, without a raised hand", async () => {
    mockParticipants = [participant("u-carl", true)];
    await renderRoom(true);
    await userEvent.click(screen.getByTitle("Open chat"));

    expect(await screen.findByText("Carl")).toBeInTheDocument();
    await userEvent.click(screen.getByTitle("Revoke access"));
    expect(setCanPublish).toHaveBeenCalledWith("u-carl", false);
  });

  it("keeps the hand raised and says so when approving fails", async () => {
    setCanPublish.mockRejectedValue(new Error("502"));
    mockParticipants = [participant("u-bob")];
    await renderRoom(true);
    await userEvent.click(screen.getByTitle("Open chat"));
    deliver("u-bob", { type: "hand-raise" });

    await userEvent.click(await screen.findByTitle("Allow"));

    expect(await screen.findByText(/could not give bob/i)).toBeInTheDocument();
    expect(screen.getByTitle("Allow")).toBeInTheDocument();
  });

  it("ignores hand raises lowered by someone else", async () => {
    mockParticipants = [participant("u-bob"), participant("u-mallory")];
    await renderRoom(true);
    await userEvent.click(screen.getByTitle("Open chat"));
    deliver("u-bob", { type: "hand-raise" });
    expect(await screen.findByText("Bob")).toBeInTheDocument();

    deliver("u-mallory", { type: "hand-lowered", participantIdentity: "u-bob", sessionId: "u-bob" });
    expect(screen.getByText("Bob")).toBeInTheDocument();

    deliver("u-bob", { type: "hand-lowered" });
    await waitFor(() => expect(screen.queryByTitle("Allow")).not.toBeInTheDocument());
  });
});
