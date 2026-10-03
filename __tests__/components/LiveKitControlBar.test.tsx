/**
 * The Settings button in the call's control bar opens a device panel: pick a
 * microphone, camera and (where the browser can route audio) speaker, applied
 * to the room straight away. Students who may not speak yet still get it, so
 * they can set their speaker now and their mic/camera for later.
 */
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LiveKitControlBar from "@/components/LiveKitControlBar";

const DEVICES: Record<string, Array<{ deviceId: string; label: string }>> = {
  audioinput: [
    { deviceId: "mic-1", label: "Built-in Microphone" },
    { deviceId: "mic-2", label: "USB Microphone" },
  ],
  videoinput: [
    { deviceId: "cam-1", label: "FaceTime Camera" },
    { deviceId: "cam-2", label: "Studio Camera" },
  ],
  audiooutput: [
    { deviceId: "spk-1", label: "Built-in Speakers" },
    { deviceId: "spk-2", label: "Headphones" },
  ],
};
const mockSetActive: Record<string, jest.Mock> = {};
let mockSupportsOutput = true;

const mockToastError = jest.fn();
jest.mock("react-hot-toast", () => ({
  __esModule: true,
  toast: { error: (...a: unknown[]) => mockToastError(...a) },
  default: { error: (...a: unknown[]) => mockToastError(...a) },
}));
jest.mock("@livekit/components-react", () => ({
  useRoomContext: () => ({ disconnect: jest.fn() }),
  useLocalParticipant: () => ({
    localParticipant: {},
    isMicrophoneEnabled: true,
    isCameraEnabled: true,
    isScreenShareEnabled: false,
  }),
  useMediaDeviceSelect: ({ kind }: { kind: string }) => ({
    devices: DEVICES[kind],
    activeDeviceId: DEVICES[kind][0].deviceId,
    setActiveMediaDevice: mockSetActive[kind],
    className: "",
  }),
}));
jest.mock("livekit-client", () => ({
  supportsAudioOutputSelection: () => mockSupportsOutput,
}));

beforeAll(() => {
  // jsdom has no ResizeObserver; the popover measures itself with it.
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

beforeEach(() => {
  mockSupportsOutput = true;
  mockToastError.mockReset();
  for (const kind of Object.keys(DEVICES)) {
    mockSetActive[kind] = jest.fn().mockResolvedValue(undefined);
  }
});

async function openSettings(props: Partial<React.ComponentProps<typeof LiveKitControlBar>> = {}) {
  const user = userEvent.setup();
  render(<LiveKitControlBar onLeave={jest.fn()} {...props} />);
  await user.click(screen.getByRole("button", { name: "Settings" }));
  return { user, panel: await screen.findByRole("dialog") };
}

it("switches the microphone, camera and speaker from the Settings panel", async () => {
  const { user, panel } = await openSettings({ isTeacher: true });

  const mic = within(panel).getByLabelText("Microphone");
  expect(mic).toHaveValue("mic-1");
  await user.selectOptions(mic, "USB Microphone");
  expect(mockSetActive.audioinput).toHaveBeenCalledWith("mic-2", { exact: true });

  await user.selectOptions(within(panel).getByLabelText("Camera"), "Studio Camera");
  expect(mockSetActive.videoinput).toHaveBeenCalledWith("cam-2", { exact: true });

  await user.selectOptions(within(panel).getByLabelText("Speaker"), "Headphones");
  expect(mockSetActive.audiooutput).toHaveBeenCalledWith("spk-2", { exact: true });
});

it("leaves out the speaker where the browser can't choose one", async () => {
  mockSupportsOutput = false;
  const { panel } = await openSettings({ isTeacher: true });

  expect(within(panel).getByLabelText("Microphone")).toBeInTheDocument();
  expect(within(panel).queryByLabelText("Speaker")).not.toBeInTheDocument();
});

it("lets a student who may not speak yet choose a speaker and set up their mic and camera", async () => {
  const { user, panel } = await openSettings({ isTeacher: false, hasMediaPermission: false });

  await user.selectOptions(within(panel).getByLabelText("Speaker"), "Headphones");
  expect(mockSetActive.audiooutput).toHaveBeenCalledWith("spk-2", { exact: true });
  await user.selectOptions(within(panel).getByLabelText("Microphone"), "USB Microphone");
  expect(mockSetActive.audioinput).toHaveBeenCalledWith("mic-2", { exact: true });
  expect(within(panel).getByText(/once the teacher lets you speak/)).toBeInTheDocument();
});

it("says so when a device can't be switched to", async () => {
  mockSetActive.videoinput.mockRejectedValue(new Error("NotReadableError"));
  const { user, panel } = await openSettings({ isTeacher: true });

  await user.selectOptions(within(panel).getByLabelText("Camera"), "Studio Camera");

  await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("Couldn't switch to that camera. It may be in use by another app."));
});
