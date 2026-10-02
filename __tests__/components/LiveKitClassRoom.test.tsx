/**
 * Live-class room behaviour that used to trust whatever a participant sent:
 * - moderation messages count only from the teacher's identity,
 * - chat names come from the sender's identity (looked up), not the payload,
 * - publishing is granted / revoked on the server and an approved student
 *   stays revocable,
 * - a dropped or kicked connection shows a rejoin screen instead of a frozen room.
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
  token?: string;
  onDisconnected?: (reason?: number) => void;
  onError?: (e: Error) => void;
};
let mockRoomProps: RoomProps = {};
let mockRoomMounts = 0;
let mockParticipants: Array<Record<string, unknown>> = [];
let mockLocal: Record<string, unknown> = {};
let mockPermissions: { canPublish: boolean; canUpdateMetadata?: boolean } | undefined;
let mockDataHandler: ((msg: Msg) => void) | undefined;
let mockConnectionState = "connected";
const mockSend = jest.fn();

const mockToastError = jest.fn();
jest.mock("react-hot-toast", () => ({
  __esModule: true,
  toast: { error: (...a: unknown[]) => mockToastError(...a) },
  default: { error: (...a: unknown[]) => mockToastError(...a) },
}));
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
    useConnectionState: () => mockConnectionState,
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
const getFreshToken = jest.fn();

const participant = (identity: string, canPublish = false) => ({
  identity,
  name: "",
  permissions: { canPublish },
  trackPublications: new Map(),
});

async function renderRoom(isTeacher: boolean) {
  mockLocal = {
    ...participant(isTeacher ? "u-teacher" : "u-student", isTeacher),
    setMicrophoneEnabled: jest.fn().mockResolvedValue(undefined),
    setCameraEnabled: jest.fn().mockResolvedValue(undefined),
    setScreenShareEnabled: jest.fn().mockResolvedValue(undefined),
    setName: jest.fn().mockResolvedValue(undefined),
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
      getFreshToken={getFreshToken}
    />
  );
  return view;
}

beforeEach(() => {
  mockParticipants = [];
  mockPermissions = { canPublish: false };
  mockConnectionState = "connected";
  mockRoomMounts = 0;
  mockSend.mockReset();
  mockToastError.mockReset();
  setCanPublish.mockReset().mockResolvedValue(undefined);
  lookupNames.mockClear();
  onLeave.mockReset();
  getFreshToken.mockReset().mockResolvedValue({ token: "fresh", serverUrl: "wss://media" });
});

describe("names", () => {
  it("sets the local participant's name once connected, so recordings show it", async () => {
    mockPermissions = { canPublish: false, canUpdateMetadata: true };
    await renderRoom(false);
    await waitFor(() => expect(mockLocal.setName).toHaveBeenCalledWith("Sam"));
  });

  it("doesn't try when the token doesn't allow it", async () => {
    await renderRoom(false);
    await act(async () => {});
    expect(mockLocal.setName).not.toHaveBeenCalled();
  });

  it("never shows a name a participant gave themselves, even before names load", async () => {
    // The token lets everyone rename themselves, so the room's name is untrusted.
    lookupNames.mockImplementationOnce(() => new Promise(() => {}));
    mockParticipants = [{ ...participant("u-mallory"), name: "Anna (teacher)" }];
    await renderRoom(false);
    await userEvent.click(screen.getByTitle("Open chat"));
    deliver("u-mallory", { type: "chat", text: "hello" });
    expect(screen.getByText("Participant")).toBeInTheDocument();
    expect(screen.queryByText("Anna (teacher)")).not.toBeInTheDocument();
  });
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

  it("is told when stepping down fails", async () => {
    mockPermissions = { canPublish: true };
    setCanPublish.mockRejectedValue(new Error("502"));
    await renderRoom(false);

    await userEvent.click(screen.getByTitle("Step down"));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith(expect.stringMatching(/step down/i)));
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

  it("shows a new raised hand from an approved student who reconnected", async () => {
    mockParticipants = [participant("u-bob")];
    const view = await renderRoom(true);
    await userEvent.click(screen.getByTitle("Open chat"));
    deliver("u-bob", { type: "hand-raise" });
    await userEvent.click(await screen.findByTitle("Allow"));
    expect(setCanPublish).toHaveBeenCalledWith("u-bob", true);

    // Bob drops and rejoins with a fresh subscribe-only token.
    mockParticipants = [mockLocal, participant("u-bob", false)];
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
    expect(screen.queryByTitle("Revoke access")).not.toBeInTheDocument();

    deliver("u-bob", { type: "hand-raise" });
    expect(await screen.findByTitle("Allow")).toBeInTheDocument();
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
    expect(mockToastError).toHaveBeenCalledWith(expect.stringMatching(/could not give bob/i));
    expect(screen.getByTitle("Allow")).toBeEnabled();
  });

  it("disables a student's buttons while the request is in flight", async () => {
    setCanPublish.mockReturnValue(new Promise(() => {}));
    mockParticipants = [participant("u-bob"), participant("u-carl", true)];
    await renderRoom(true);
    await userEvent.click(screen.getByTitle("Open chat"));
    deliver("u-bob", { type: "hand-raise" });

    await userEvent.click(await screen.findByTitle("Allow"));
    expect(screen.getByTitle("Allow")).toBeDisabled();
    expect(screen.getByTitle("Deny")).toBeDisabled();

    await userEvent.click(screen.getByTitle("Revoke access"));
    expect(screen.getByTitle("Revoke access")).toBeDisabled();
    expect(setCanPublish).toHaveBeenCalledTimes(2);
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

describe("when the connection ends", () => {
  it("offers to rejoin after being replaced by another tab", async () => {
    await renderRoom(false);
    expect(mockRoomMounts).toBe(1);

    act(() => mockRoomProps.onDisconnected?.(2));
    expect(screen.queryByTestId("room")).not.toBeInTheDocument();
    expect(screen.getByText(/another tab or device/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /rejoin/i }));
    expect(screen.getByTestId("room")).toBeInTheDocument();
    expect(mockRoomMounts).toBe(2);
    // With a new token, not the one from the first join.
    expect(getFreshToken).toHaveBeenCalledTimes(1);
    expect(mockRoomProps.token).toBe("fresh");
  });

  it("explains why it can't rejoin when a new token is refused", async () => {
    getFreshToken.mockRejectedValue(new Error("Class has ended"));
    await renderRoom(false);
    act(() => mockRoomProps.onDisconnected?.(0));

    await userEvent.click(screen.getByRole("button", { name: /rejoin/i }));

    expect(await screen.findByText("Class has ended")).toBeInTheDocument();
    expect(screen.queryByTestId("room")).not.toBeInTheDocument();
  });

  it("does nothing special when the user leaves on purpose", async () => {
    await renderRoom(false);
    act(() => mockRoomProps.onDisconnected?.(1));
    expect(screen.getByTestId("room")).toBeInTheDocument();
  });

  it("says the class has ended when the room is gone, with no rejoin", async () => {
    await renderRoom(false);
    act(() => mockRoomProps.onDisconnected?.(5));
    expect(screen.getByText(/class has ended/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /rejoin/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /leave/i }));
    expect(onLeave).toHaveBeenCalled();
  });

  it("offers to retry when it could not connect at all", async () => {
    await renderRoom(false);
    act(() => mockRoomProps.onError?.(new Error("could not establish signal connection")));
    expect(screen.getByText(/couldn't connect/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /rejoin/i })).toBeInTheDocument();
  });
});
