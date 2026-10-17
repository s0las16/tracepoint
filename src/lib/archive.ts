import fs from "node:fs";
import path from "node:path";
import type { FrameRecord, Source } from "@/lib/retrieve";

export type IndexFile = {
  model: string;
  dtype: string;
  frameIntervalSec: number;
  frames: FrameRecord[];
};

type Cache = { key: string; data: IndexFile };

let indexCache: Cache | null = null;

export function sourcesPath(): string {
  return path.join(process.cwd(), "data", "sources.json");
}

export function indexPath(): string {
  return path.join(process.cwd(), "data", "index.json");
}

export function addedSourcesPath(): string {
  return path.join(process.cwd(), "data", "added-sources.json");
}

export function addedIndexPath(): string {
  return path.join(process.cwd(), "data", "added-index.json");
}

export function loadSources(): Source[] {
  const base = JSON.parse(fs.readFileSync(sourcesPath(), "utf8")) as Source[];
  return [...base, ...readAddedSources()];
}

export function readAddedSources(): Source[] {
  const file = addedSourcesPath();
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, "utf8")) as Source[];
}

export function writeAddedSources(sources: Source[]): void {
  fs.mkdirSync(path.dirname(addedSourcesPath()), { recursive: true });
  fs.writeFileSync(addedSourcesPath(), JSON.stringify(sources, null, 2));
}

export function loadIndex(): IndexFile | null {
  const file = indexPath();
  if (!fs.existsSync(file)) return null;
  const added = addedIndexPath();
  const key = `${fs.statSync(file).mtimeMs}:${fs.existsSync(added) ? fs.statSync(added).mtimeMs : 0}`;
  if (indexCache && indexCache.key === key) return indexCache.data;
  const data = JSON.parse(fs.readFileSync(file, "utf8")) as IndexFile;
  const extra = readAddedFrames();
  const merged = { ...data, frames: [...data.frames, ...extra] };
  indexCache = { key, data: merged };
  return merged;
}

export function readAddedFrames(): FrameRecord[] {
  const file = addedIndexPath();
  if (!fs.existsSync(file)) return [];
  const data = JSON.parse(fs.readFileSync(file, "utf8")) as { frames?: FrameRecord[] };
  return data.frames ?? [];
}

export function writeAddedFrames(frames: FrameRecord[]): void {
  fs.mkdirSync(path.dirname(addedIndexPath()), { recursive: true });
  fs.writeFileSync(addedIndexPath(), JSON.stringify({ frames }));
  indexCache = null;
}

export function publicFile(relative: string): string {
  const root = path.resolve(process.cwd(), "public");
  const target = path.resolve(root, relative);
  if (!target.startsWith(root + path.sep)) throw new Error("Path escapes the public directory.");
  return target;
}
