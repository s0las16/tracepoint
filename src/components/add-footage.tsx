"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AddFootage({ onAdded }: { onAdded: () => void }) {
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [liveMessage, setLiveMessage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"upload" | "live" | null>(null);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy("upload");
    setUploadError(null);
    setUploadMessage("Sampling the file and embedding frames. This can take a minute.");
    try {
      const response = await fetch("/api/ingest/upload", { method: "POST", body: data });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Upload failed.");
      setUploadMessage(`Added ${body.source.cameraId}. It is in the source list and in search.`);
      form.reset();
      onAdded();
    } catch (error) {
      setUploadMessage(null);
      setUploadError(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setBusy(null);
    }
  }

  async function live(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy("live");
    setLiveError(null);
    setLiveMessage("Opening the stream and taking one frame.");
    try {
      const response = await fetch("/api/ingest/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: String(data.get("url") ?? ""),
          label: String(data.get("label") ?? ""),
          cameraId: String(data.get("cameraId") ?? ""),
          lat: optionalNumber(data.get("lat")),
          lon: optionalNumber(data.get("lon")),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "The camera could not be opened.");
      setLiveMessage(`Connected ${body.source.cameraId}. New frames are sampled every 5 seconds.`);
      form.reset();
      onAdded();
    } catch (error) {
      setLiveMessage(null);
      setLiveError(error instanceof Error ? error.message : "The camera could not be opened.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4 px-2 py-2 text-xs">
      <p className="leading-5 text-muted-foreground">
        Files and camera URLs stay on this machine. A stream address is not a place. The map gets a pin only if you type
        coordinates, and those pins are labeled as operator-entered.
      </p>
      <form className="space-y-2" onSubmit={upload}>
        <p className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase">Add a recording</p>
        <Input name="label" required placeholder="Label" className="h-8" />
        <Input name="file" required type="file" accept="video/mp4,video/webm,video/quicktime,.mkv" className="h-8" />
        <Input name="cameraId" placeholder="Camera id, optional" className="h-8" />
        <Input name="capturedAt" placeholder="Capture clock, optional" className="h-8" />
        <div className="grid grid-cols-2 gap-2">
          <Input name="lat" placeholder="Lat, optional" className="h-8" />
          <Input name="lon" placeholder="Lon, optional" className="h-8" />
        </div>
        <Button type="submit" size="sm" disabled={busy !== null}>
          {busy === "upload" ? "Indexing" : "Index file"}
        </Button>
        {uploadMessage && <p className="leading-5 text-muted-foreground">{uploadMessage}</p>}
        {uploadError && <p className="leading-5 text-destructive">{uploadError}</p>}
      </form>
      <form className="space-y-2" onSubmit={live}>
        <p className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase">Add a live camera</p>
        <Input name="label" required placeholder="Label, such as NVR channel 3" className="h-8" />
        <Input name="url" required placeholder="rtsp://nvr.local/cam/3" className="h-8" />
        <Input name="cameraId" placeholder="Camera id, optional" className="h-8" />
        <div className="grid grid-cols-2 gap-2">
          <Input name="lat" placeholder="Lat, optional" className="h-8" />
          <Input name="lon" placeholder="Lon, optional" className="h-8" />
        </div>
        <Button type="submit" size="sm" variant="outline" disabled={busy !== null}>
          {busy === "live" ? "Connecting" : "Connect stream"}
        </Button>
        {liveMessage && <p className="leading-5 text-muted-foreground">{liveMessage}</p>}
        {liveError && <p className="leading-5 text-destructive">{liveError}</p>}
      </form>
    </div>
  );
}

function optionalNumber(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}
