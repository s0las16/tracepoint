import fs from "node:fs";
import path from "node:path";
import type { FrameRecord, Source } from "@/lib/retrieve";

export type IndexFile = {
  model: string;
  dtype: string;
  frameIntervalSec: number;
  frames: FrameRecord[];
};

type Cache = { mtimeMs: number; data: IndexFile };

let indexCache: Cache | null = null;

export function sourcesPath(): string {
  return path.join(process.cwd(), "data", "sources.json");
}

export function indexPath(): string {
  return path.join(process.cwd(), "data", "index.json");
}

export function loadSources(): Source[] {
  return JSON.parse(fs.readFileSync(sourcesPath(), "utf8")) as Source[];
}

export function loadIndex(): IndexFile | null {
  const file = indexPath();
  if (!fs.existsSync(file)) return null;
  const mtimeMs = fs.statSync(file).mtimeMs;
  if (indexCache && indexCache.mtimeMs === mtimeMs) return indexCache.data;
  const data = JSON.parse(fs.readFileSync(file, "utf8")) as IndexFile;
  indexCache = { mtimeMs, data };
  return data;
}
