import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import {
  readAddedFrames,
  readAddedSources,
  writeAddedFrames,
  writeAddedSources,
} from "@/lib/archive";
import { embedImage } from "@/lib/clip";
import type { FrameRecord, Source } from "@/lib/retrieve";

const exec = promisify(execFile);
const LIVE_KEEP = 36;
const SAMPLE_SECONDS = 5;

let queue: Promise<unknown> = Promise.resolve();
const liveTimers = new Map<string, ReturnType<typeof setInterval>>();

export function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work, work);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function redactStream(url: string): string {
  const parsed = new URL(url);
  parsed.username = "";
  parsed.password = "";
  return `${parsed.protocol}//${parsed.host}${parsed.pathname}${parsed.search}`;
}

export function scrub(message: string, secretUrl: string): string {
  let text = message.split(secretUrl).join("[stream]");
  try {
    const parsed = new URL(secretUrl);
    if (parsed.password) text = text.split(decodeURIComponent(parsed.password)).join("[redacted]");
    if (parsed.username) text = text.split(decodeURIComponent(parsed.username)).join("[redacted]");
  } catch {
    // The URL was already rejected.
  }
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("Command failed") && !line.startsWith("ffmpeg "));
  return (lines.at(-1) || "The stream could not be opened.").slice(0, 300);
}

export function assertStreamUrl(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Enter a full RTSP or HTTP URL from the NVR.");
  }
  if (!["rtsp:", "rtsps:", "http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Live cameras must use rtsp, rtsps, http, or https.");
  }
  if (!parsed.hostname) throw new Error("The stream URL needs a host.");
  return parsed;
}

export function makeSourceId(label: string, existing: Set<string>): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24) || "camera";
  let id = `SRC-${slug}`;
  let n = 2;
  while (existing.has(id)) id = `SRC-${slug}-${n++}`;
  return id;
}

export async function probeVideo(file: string): Promise<{ durationSec: number; creationTime: string | null }> {
  const { stdout } = await exec("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration:format_tags=creation_time",
    "-of",
    "json",
    file,
  ]);
  const parsed = JSON.parse(stdout) as {
    format?: { duration?: string; tags?: { creation_time?: string } };
  };
  const durationSec = Number(parsed.format?.duration ?? 0);
  return {
    durationSec: Number.isFinite(durationSec) ? durationSec : 0,
    creationTime: parsed.format?.tags?.creation_time ?? null,
  };
}

export function clockFromFileTag(raw: string | null): { capturedAt: string; note: string } | null {
  if (!raw) return null;
  const match = raw.trim().match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/);
  if (!match) return null;
  const offset = raw.trim().match(/([+-]\d{2}:?\d{2}|Z)$/)?.[1] ?? "";
  return {
    capturedAt: `${match[1]} ${match[2]}${offset}`,
    note: "Clock taken from the file creation_time tag.",
  };
}

export async function sampleFrames(video: string, thumbDir: string, limit = 24): Promise<string[]> {
  fs.mkdirSync(thumbDir, { recursive: true });
  for (const name of fs.readdirSync(thumbDir)) {
    if (name.endsWith(".jpg")) fs.rmSync(path.join(thumbDir, name));
  }
  await exec("ffmpeg", [
    "-y",
    "-i",
    video,
    "-vf",
    "fps=1,scale=640:-2",
    "-frames:v",
    String(limit),
    "-q:v",
    "3",
    path.join(thumbDir, "%04d.jpg"),
  ]);
  return fs
    .readdirSync(thumbDir)
    .filter((name) => name.endsWith(".jpg"))
    .sort();
}

export async function grabStreamFrame(url: string, dest: string): Promise<void> {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const args = ["-hide_banner", "-loglevel", "error", "-y"];
  if (url.startsWith("rtsp:") || url.startsWith("rtsps:")) args.push("-rtsp_transport", "tcp");
  args.push("-i", url, "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "3", dest);
  await exec("ffmpeg", args, { timeout: 12_000 });
  if (!fs.existsSync(dest) || fs.statSync(dest).size < 500) {
    throw new Error("The stream did not return a frame.");
  }
}

export async function indexImage(sourceId: string, imagePath: string, thumbUrl: string, t: number): Promise<FrameRecord> {
  const vector = await embedImage(imagePath);
  return { sourceId, t, thumb: thumbUrl, vector };
}

export async function ingestUpload(input: {
  bytes: Buffer;
  filename: string;
  label: string;
  cameraId?: string;
  capturedAt?: string;
  description?: string;
  captureNote?: string;
  pageUrl?: string;
  license?: string;
  artist?: string;
  lat?: number | null;
  lon?: number | null;
}): Promise<Source> {
  return enqueue(async () => {
    const existing = new Set([...readAddedSources().map((source) => source.id), ...baseIds()]);
    const id = input.cameraId ? uniqueCameraId(input.cameraId, existing) : makeSourceId(input.label, existing);
    const ext = path.extname(input.filename).toLowerCase();
    const safeExt = [".mp4", ".webm", ".mov", ".mkv"].includes(ext) ? ext : ".mp4";
    const relative = path.join("uploads", `${id}${safeExt}`);
    const absolute = path.join(process.cwd(), "public", relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, input.bytes);

    const probed = await probeVideo(absolute);
    const fileClock = clockFromFileTag(probed.creationTime);
    const givenClock = input.capturedAt?.trim() || null;
    const capturedAt = givenClock || fileClock?.capturedAt || null;
    const capturePrecision = capturedAt && /\d{2}:\d{2}/.test(capturedAt) ? "datetime" : capturedAt ? "date" : "none";
    const thumbDir = path.join(process.cwd(), "public", "added-thumbs", id);
    const names = await sampleFrames(absolute, thumbDir);
    if (names.length === 0) throw new Error("ffmpeg did not extract any frames from that file.");

    const frames: FrameRecord[] = [];
    for (const [index, name] of names.entries()) {
      frames.push(await indexImage(id, path.join(thumbDir, name), `/added-thumbs/${id}/${name}`, index));
    }
    const coords = pair(input.lat, input.lon);
    const source: Source = {
      id,
      cameraId: id,
      label: input.label.trim(),
      title: input.label.trim(),
      description:
        input.description?.trim() ||
        "Uploaded on this machine. Tracepoint sampled frames and embedded them with CLIP.",
      file: relative.split(path.sep).join("/"),
      videoUrl: `/${relative.split(path.sep).join("/")}`,
      pageUrl: input.pageUrl?.trim() || "",
      originalUrl: "",
      originalTitle: path.basename(input.filename),
      license: input.license?.trim() || "Uploaded locally",
      licenseUrl: "",
      artist: input.artist?.trim() || "Uploaded on this machine",
      capturedAt,
      capturePrecision,
      captureNote:
        input.captureNote?.trim() ||
        (givenClock
          ? "Clock supplied with the upload. It was not read from the file."
          : fileClock
            ? fileClock.note
            : "No capture clock was in the file, and none was entered."),
      lat: coords?.lat ?? null,
      lon: coords?.lon ?? null,
      coordinateSource: coords ? "Entered by the operator. Not read from the file." : null,
      trimStartSec: 0,
      durationSec: probed.durationSec || names.length,
      audioRemoved: false,
      origin: "upload",
      streamUrl: undefined,
      streamRedacted: null,
      liveStatus: null,
    };
    writeAddedSources([...readAddedSources(), source]);
    writeAddedFrames([...readAddedFrames(), ...frames]);
    return source;
  });
}

export async function ingestLive(input: {
  url: string;
  label: string;
  cameraId?: string;
  lat?: number | null;
  lon?: number | null;
}): Promise<Source> {
  assertStreamUrl(input.url);
  return enqueue(async () => {
    const existing = new Set([...readAddedSources().map((source) => source.id), ...baseIds()]);
    const id = input.cameraId ? uniqueCameraId(input.cameraId, existing) : makeSourceId(input.label, existing);
    const thumbDir = path.join(process.cwd(), "public", "added-thumbs", id);
    fs.mkdirSync(thumbDir, { recursive: true });
    const first = path.join(thumbDir, "0001.jpg");
    try {
      await grabStreamFrame(input.url, first);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The stream could not be opened.";
      throw new Error(scrub(message, input.url));
    }
    const frame = await indexImage(id, first, `/added-thumbs/${id}/0001.jpg`, 0);
    const coords = pair(input.lat, input.lon);
    const source: Source = {
      id,
      cameraId: id,
      label: input.label.trim(),
      title: input.label.trim(),
      description: "Live stream sampled on this machine. Each frame is the picture ffmpeg pulled at that moment. Tracepoint does not record a continuous copy and does not identify anyone in it.",
      file: "",
      videoUrl: null,
      pageUrl: "",
      originalUrl: "",
      originalTitle: "Live stream",
      license: "Live stream",
      licenseUrl: "",
      artist: "NVR or camera URL entered on this machine",
      capturedAt: stamp(new Date()),
      capturePrecision: "datetime",
      captureNote: "Time this machine sampled the stream. Not a clock burned into the camera.",
      lat: coords?.lat ?? null,
      lon: coords?.lon ?? null,
      coordinateSource: coords ? "Entered by the operator. Not read from the camera." : null,
      trimStartSec: 0,
      durationSec: 0,
      audioRemoved: true,
      origin: "live",
      streamUrl: input.url,
      streamRedacted: redactStream(input.url),
      liveStatus: "Receiving frames.",
    };
    writeAddedSources([...readAddedSources(), source]);
    writeAddedFrames([...readAddedFrames(), frame]);
    startLiveLoop(id);
    return source;
  });
}

export function ensureLiveLoops(): void {
  for (const source of readAddedSources()) {
    if (source.origin === "live" && source.streamUrl) startLiveLoop(source.id);
  }
}

function startLiveLoop(id: string): void {
  if (liveTimers.has(id)) return;
  const timer = setInterval(() => {
    void sampleLive(id).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Sample failed.";
      updateLiveStatus(id, message.slice(0, 240));
    });
  }, SAMPLE_SECONDS * 1000);
  timer.unref?.();
  liveTimers.set(id, timer);
}

async function sampleLive(id: string): Promise<void> {
  const source = readAddedSources().find((item) => item.id === id);
  if (!source?.streamUrl) return;
  const stampDate = new Date();
  const started = source.capturedAt ? Date.parse(source.capturedAt.replace(" ", "T")) : stampDate.getTime();
  const t = Math.max(0, Math.round((stampDate.getTime() - (Number.isFinite(started) ? started : stampDate.getTime())) / 1000));
  const name = `${String(t).padStart(6, "0")}.jpg`;
  const absolute = path.join(process.cwd(), "public", "added-thumbs", id, name);
  try {
    await grabStreamFrame(source.streamUrl, absolute);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sample failed.";
    throw new Error(scrub(message, source.streamUrl));
  }
  const frame = await indexImage(id, absolute, `/added-thumbs/${id}/${name}`, t);
  await enqueue(async () => {
    const frames = readAddedFrames().filter((item) => item.sourceId !== id || item.t !== t);
    const mine = [...frames.filter((item) => item.sourceId === id), frame].slice(-LIVE_KEEP);
    const others = frames.filter((item) => item.sourceId !== id);
    writeAddedFrames([...others, ...mine]);
    const sources = readAddedSources().map((item) =>
      item.id === id
        ? { ...item, durationSec: t, liveStatus: `Last frame ${stamp(stampDate)}.` }
        : item,
    );
    writeAddedSources(sources);
  });
}

function updateLiveStatus(id: string, status: string): void {
  const sources = readAddedSources();
  if (!sources.some((source) => source.id === id)) return;
  writeAddedSources(sources.map((source) => (source.id === id ? { ...source, liveStatus: status } : source)));
}

function uniqueCameraId(requested: string, existing: Set<string>): string {
  const cleaned = requested.trim().replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32);
  if (!cleaned) throw new Error("Camera id can use letters, numbers, dashes, and underscores.");
  if (existing.has(cleaned)) throw new Error("That camera id is already in this archive.");
  return cleaned;
}

function baseIds(): string[] {
  const file = path.join(process.cwd(), "data", "sources.json");
  const sources = JSON.parse(fs.readFileSync(file, "utf8")) as { id: string }[];
  return sources.map((source) => source.id);
}

function pair(lat?: number | null, lon?: number | null): { lat: number; lon: number } | null {
  if ((lat == null) !== (lon == null)) {
    throw new Error("Enter both latitude and longitude, or leave both empty.");
  }
  if (lat == null || lon == null) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error("Coordinates are out of range.");
  return { lat, lon };
}

function stamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}
