"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { AUDIO_LANGUAGES, languageLabel } from "@/lib/languages";

interface AudioTrack {
  id: string;
  language_code: string;
  name: string;
  status: "preparing" | "ready" | "errored";
}

interface AudioLanguagesPanelProps {
  assetId: string;
  communityId: string;
  /** Label for the baked-in original audio (default English). */
  originalLanguageLabel?: string;
}

const STATUS_LABEL: Record<AudioTrack["status"], string> = {
  preparing: "Processing",
  ready: "Ready",
  errored: "Failed",
};

export function AudioLanguagesPanel({
  assetId,
  communityId,
  originalLanguageLabel = "English",
}: AudioLanguagesPanelProps) {
  const [tracks, setTracks] = useState<AudioTrack[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [languageCode, setLanguageCode] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadTracks = useCallback(async () => {
    const res = await fetch(`/api/mux/assets/${assetId}/audio-tracks`);
    if (!res.ok) return;
    const data = await res.json();
    setTracks(data.tracks ?? []);
  }, [assetId]);

  useEffect(() => {
    loadTracks();
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [loadTracks]);

  // Poll while anything is still processing.
  useEffect(() => {
    if (!tracks.some((t) => t.status === "preparing")) return;
    pollRef.current = setTimeout(loadTracks, 4000);
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [tracks, loadTracks]);

  const addedCodes = new Set(tracks.map((t) => t.language_code));
  const available = AUDIO_LANGUAGES.filter((l) => !addedCodes.has(l.code));

  const handleAdd = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!languageCode || !file) {
      toast.error("Pick a language and an audio file.");
      return;
    }
    setIsUploading(true);
    try {
      const urlRes = await fetch("/api/mux/audio-upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ communityId, assetId, fileName: file.name }),
      });
      if (!urlRes.ok) throw new Error((await urlRes.json()).error || "Could not start upload");
      const { uploadUrl, key } = await urlRes.json();

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.addEventListener("load", () =>
          xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("Upload failed"))
        );
        xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
        xhr.open("PUT", uploadUrl);
        xhr.send(file);
      });

      const createRes = await fetch(`/api/mux/assets/${assetId}/audio-tracks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId,
          languageCode,
          name: languageLabel(languageCode),
          b2Key: key,
        }),
      });
      if (!createRes.ok) throw new Error((await createRes.json()).error || "Could not add language");

      toast.success("Language added. It is processing now.");
      setIsAdding(false);
      setLanguageCode("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadTracks();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add language");
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = async (track: AudioTrack) => {
    const res = await fetch(
      `/api/mux/assets/${assetId}/audio-tracks/${track.id}?communityId=${encodeURIComponent(communityId)}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      toast.success("Language removed.");
      await loadTracks();
    } else {
      toast.error("Could not remove language.");
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-border/50 bg-muted/20 p-4">
      <h4 className="text-sm font-medium text-foreground">Languages</h4>
      <p className="mt-1 text-xs text-muted-foreground">
        Viewers can switch language in the player. Add a voice only recording. Record it while
        watching the video so the timing lines up.
      </p>

      <ul className="mt-3 space-y-2">
        <li className="flex items-center justify-between rounded-lg bg-background/60 px-3 py-2 text-sm">
          <span>{originalLanguageLabel} (original)</span>
          <span className="text-xs text-muted-foreground">Ready</span>
        </li>
        {tracks.map((track) => (
          <li
            key={track.id}
            className="flex items-center justify-between rounded-lg bg-background/60 px-3 py-2 text-sm"
          >
            <span>{track.name}</span>
            <span className="flex items-center gap-3">
              <span
                className={
                  track.status === "errored"
                    ? "text-xs text-destructive"
                    : "text-xs text-muted-foreground"
                }
              >
                {STATUS_LABEL[track.status]}
              </span>
              <button
                onClick={() => handleRemove(track)}
                className="text-xs text-muted-foreground hover:text-destructive"
              >
                Remove
              </button>
            </span>
          </li>
        ))}
      </ul>

      {isAdding ? (
        <div className="mt-3 space-y-3 rounded-lg border border-border/50 bg-background/60 p-3">
          <select
            value={languageCode}
            onChange={(e) => setLanguageCode(e.target.value)}
            className="w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm"
          >
            <option value="">Choose a language</option>
            {available.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
          <input
            ref={fileInputRef}
            type="file"
            accept=".m4a,.mp3,.wav,audio/*"
            className="block w-full text-sm text-muted-foreground"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} disabled={isUploading}>
              {isUploading ? "Uploading..." : "Add language"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsAdding(false)}
              disabled={isUploading}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        available.length > 0 && (
          <Button size="sm" variant="outline" className="mt-3" onClick={() => setIsAdding(true)}>
            Add language
          </Button>
        )
      )}
    </div>
  );
}
