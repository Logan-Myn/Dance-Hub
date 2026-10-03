"use client";

import { useCallback, useId, useState } from "react";
import { useMediaDeviceSelect } from "@livekit/components-react";
import { supportsAudioOutputSelection } from "livekit-client";
import { Cog6ToothIcon } from "@heroicons/react/24/solid";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const NOUNS: Record<MediaDeviceKind, string> = {
  audioinput: "microphone",
  videoinput: "camera",
  audiooutput: "speaker",
};

/** One device list. Picking a device switches the room to it straight away;
 *  with no track yet (mic off, or not allowed to speak) it's used when the
 *  track starts. */
function DeviceSelect({ kind, label }: { kind: MediaDeviceKind; label: string }) {
  const id = useId();
  const noun = NOUNS[kind];
  const [blocked, setBlocked] = useState(false);
  const [switching, setSwitching] = useState(false);
  // Stable, or the hook builds a new device watcher on every render.
  const onError = useCallback(() => setBlocked(true), []);
  const { devices, activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({ kind, onError });

  // Browsers without a "default" entry report it anyway until a device is
  // picked; that's the first one they list.
  const value = devices.some((d) => d.deviceId === activeDeviceId)
    ? activeDeviceId
    : devices[0]?.deviceId ?? "";

  const choose = async (deviceId: string) => {
    setSwitching(true);
    try {
      await setActiveMediaDevice(deviceId, { exact: true });
    } catch (err) {
      console.error(`Failed to switch ${noun}:`, err);
      toast.error(
        kind === "audiooutput"
          ? `Couldn't switch to that ${noun}.`
          : `Couldn't switch to that ${noun}. It may be in use by another app.`
      );
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-medium text-gray-300">
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={devices.length === 0 || switching}
        onChange={(e) => choose(e.target.value)}
        className="w-full bg-gray-700 text-white text-base sm:text-sm rounded-md px-3 py-2 outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
      >
        {devices.length === 0 && <option value="">No {noun} found</option>}
        {devices.map((device, i) => (
          <option key={device.deviceId || i} value={device.deviceId}>
            {device.label || `${label} ${i + 1}`}
          </option>
        ))}
      </select>
      {blocked && (
        <p className="text-xs text-red-400">
          Allow access to your {noun} in your browser to choose one.
        </p>
      )}
    </div>
  );
}

// Rendered only while the panel is open, so devices are listed (and the
// browser asked for access, if it must be) only when someone opens it.
function DevicePanel({ canPublish }: { canPublish: boolean }) {
  return (
    <>
      <h3 className="text-sm font-semibold">Audio and video</h3>
      <DeviceSelect kind="audioinput" label="Microphone" />
      <DeviceSelect kind="videoinput" label="Camera" />
      {supportsAudioOutputSelection() && <DeviceSelect kind="audiooutput" label="Speaker" />}
      {!canPublish && (
        <p className="text-xs text-gray-400">
          Your microphone and camera choice is used once the teacher lets you speak.
        </p>
      )}
    </>
  );
}

/** The control bar's Settings button and its device panel. */
export default function LiveKitDeviceSettings({ canPublish }: { canPublish: boolean }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="lg"
          variant="default"
          className="rounded-full w-11 h-11 sm:w-14 sm:h-14 bg-gray-700 hover:bg-gray-600"
          title="Settings"
          aria-label="Settings"
        >
          <Cog6ToothIcon className="h-5 w-5 sm:h-6 sm:w-6" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        sideOffset={12}
        collisionPadding={8}
        className="w-72 bg-gray-800 border-gray-700 text-white space-y-4"
      >
        <DevicePanel canPublish={canPublish} />
      </PopoverContent>
    </Popover>
  );
}
