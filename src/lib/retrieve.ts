export const CLIP_MODEL = "Xenova/clip-vit-base-patch32";
export const CLIP_DTYPE = "q8";
export const WEAK_SCORE = 0.25;

export type CapturePrecision = "datetime" | "date" | "none";

export type Source = {
  id: string;
  cameraId: string;
  label: string;
  title: string;
  description: string;
  file: string;
  pageUrl: string;
  originalUrl: string;
  originalTitle: string;
  license: string;
  licenseUrl: string;
  artist: string;
  capturedAt: string | null;
  capturePrecision: CapturePrecision;
  captureNote: string;
  lat: number | null;
  lon: number | null;
  coordinateSource: string | null;
  trimStartSec: number;
  durationSec: number;
  audioRemoved: boolean;
};

export type FrameRecord = {
  sourceId: string;
  t: number;
  thumb: string;
  vector: number[];
};

export type TimeFilter = {
  startMinute: number;
  endMinute: number;
  label: string;
  residual: string;
};

export type Observation = {
  id: string;
  sourceId: string;
  cameraId: string;
  label: string;
  title: string;
  fileDescription: string;
  interpretation: string;
  startSec: number;
  endSec: number;
  peakSec: number;
  score: number;
  thumbnail: string;
  videoUrl: string;
  pageUrl: string;
  originalUrl: string;
  artist: string;
  license: string;
  licenseUrl: string;
  capturedAt: string | null;
  capturePrecision: CapturePrecision;
  captureNote: string;
  captureLabel: string | null;
  sortKey: string | null;
  lat: number | null;
  lon: number | null;
  coordinateSource: string | null;
  trimStartSec: number;
};

export type RouteNote = {
  a: string;
  b: string;
  distanceKm: number;
  flag: "implausible" | "not-linked";
  explanation: string;
};

type Wall = {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  se: number;
  offset: string;
  hasClock: boolean;
};

const CLOCK = String.raw`(\d{1,2})(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)`;
const H24 = String.raw`([01]?\d|2[0-3]):([0-5]\d)`;

export function parseTimeFilter(query: string): TimeFilter | null {
  const patterns: RegExp[] = [
    new RegExp(String.raw`\bbetween\s+${CLOCK}\s+and\s+${CLOCK}\b`, "i"),
    new RegExp(String.raw`\bfrom\s+${CLOCK}\s+(?:to|until)\s+${CLOCK}\b`, "i"),
    new RegExp(String.raw`\b${CLOCK}\s*(?:-|–|—|to)\s*${CLOCK}\b`, "i"),
    new RegExp(String.raw`\bbetween\s+${H24}\s+and\s+${H24}\b`, "i"),
    new RegExp(String.raw`\bfrom\s+${H24}\s+(?:to|until)\s+${H24}\b`, "i"),
    new RegExp(String.raw`\b${H24}\s*(?:-|–|—|to)\s*${H24}\b`, "i"),
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(query);
    if (!match) continue;
    const twelveHour = /[ap]\.?m\.?/i.test(match[0]);
    const start = twelveHour
      ? toMinute12(match[1], match[2], match[3])
      : toMinute24(match[1], match[2]);
    const end = twelveHour
      ? toMinute12(match[4], match[5], match[6])
      : toMinute24(match[3], match[4]);
    if (start == null || end == null) continue;
    const residual = query
      .replace(match[0], " ")
      .replace(/\s+/g, " ")
      .trim();
    return {
      startMinute: start,
      endMinute: end,
      label: `${formatMinute(start)}–${formatMinute(end)}`,
      residual,
    };
  }
  return null;
}

function toMinute12(hourText: string, minuteText: string | undefined, marker: string): number | null {
  let hour = Number(hourText);
  const minute = minuteText ? Number(minuteText) : 0;
  if (!Number.isFinite(hour) || minute > 59 || hour < 1 || hour > 12) return null;
  const ap = marker.toLowerCase().replace(/\./g, "");
  if (ap === "pm" && hour < 12) hour += 12;
  if (ap === "am" && hour === 12) hour = 0;
  return hour * 60 + minute;
}

function toMinute24(hourText: string, minuteText: string): number | null {
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

export function formatMinute(minute: number): string {
  const h24 = Math.floor(minute / 60) % 24;
  const m = minute % 60;
  const ap = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ap}`;
}

export function inTimeWindow(minute: number, start: number, end: number): boolean {
  if (end >= start) return minute >= start && minute <= end;
  return minute >= start || minute <= end;
}

export function parseWall(capturedAt: string | null): Wall | null {
  if (!capturedAt) return null;
  const match = capturedAt
    .trim()
    .match(
      /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?(?:\s*([+-]\d{2}:?\d{2}|Z))?$/,
    );
  if (!match) return null;
  return {
    y: Number(match[1]),
    mo: Number(match[2]),
    d: Number(match[3]),
    h: match[4] != null ? Number(match[4]) : 0,
    mi: match[5] != null ? Number(match[5]) : 0,
    se: match[6] != null ? Number(match[6]) : 0,
    offset: match[7] ?? "",
    hasClock: match[4] != null,
  };
}

export function shiftWall(wall: Wall, extraSeconds: number): Wall {
  const utc = Date.UTC(wall.y, wall.mo - 1, wall.d, wall.h, wall.mi, wall.se);
  const next = new Date(utc + extraSeconds * 1000);
  return {
    y: next.getUTCFullYear(),
    mo: next.getUTCMonth() + 1,
    d: next.getUTCDate(),
    h: next.getUTCHours(),
    mi: next.getUTCMinutes(),
    se: next.getUTCSeconds(),
    offset: wall.offset,
    hasClock: wall.hasClock,
  };
}

export function formatWall(wall: Wall, withSeconds = true): string {
  const date = `${wall.y}-${pad(wall.mo)}-${pad(wall.d)}`;
  if (!wall.hasClock) return date;
  const clock = withSeconds
    ? `${pad(wall.h)}:${pad(wall.mi)}:${pad(wall.se)}`
    : `${pad(wall.h)}:${pad(wall.mi)}`;
  return `${date} ${clock}${wall.offset}`;
}

export function frameClock(source: Source, sampleSecond: number): { minuteOfDay: number; label: string; sortKey: string } | null {
  const wall = parseWall(source.capturedAt);
  if (!wall?.hasClock) return null;
  const shifted = shiftWall(wall, source.trimStartSec + sampleSecond);
  return {
    minuteOfDay: shifted.h * 60 + shifted.mi,
    label: formatWall(shifted),
    sortKey: formatWall({ ...shifted, offset: "" }),
  };
}

export function textForClip(residual: string): string {
  const query = residual.trim();
  if (query.split(/\s+/).length <= 4) return `a photo of ${query}`;
  return query;
}

export function formatTimecode(sec: number): string {
  const safe = Math.max(0, sec);
  const minutes = Math.floor(safe / 60);
  const rem = safe - minutes * 60;
  return `${pad(minutes)}:${rem.toFixed(1).padStart(4, "0")}`;
}

export function dot(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += a[i] * b[i];
  return sum;
}

export function l2(values: number[]): number[] {
  let sum = 0;
  for (const value of values) sum += value * value;
  const norm = Math.sqrt(sum) || 1;
  return values.map((value) => value / norm);
}

type Hit = FrameRecord & { score: number };

export function clusterObservations(
  frames: Hit[],
  sources: Source[],
  embeddedText: string,
): Observation[] {
  if (frames.length === 0) return [];
  const bySource = new Map<string, Hit[]>();
  for (const frame of frames) {
    const list = bySource.get(frame.sourceId) ?? [];
    list.push(frame);
    bySource.set(frame.sourceId, list);
  }

  const sourcePeaks = [...bySource.entries()]
    .map(([sourceId, list]) => ({
      sourceId,
      peak: Math.max(...list.map((frame) => frame.score)),
      frames: list,
    }))
    .sort((a, b) => b.peak - a.peak);

  const best = sourcePeaks[0]?.peak ?? 0;
  const kept = sourcePeaks.filter((entry, index) => index < 5 || entry.peak >= best - 0.03);

  const observations: Observation[] = [];
  for (const entry of kept) {
    const source = sources.find((item) => item.id === entry.sourceId);
    if (!source) continue;
    const strong = entry.frames
      .filter((frame) => frame.score >= entry.peak - 0.015)
      .sort((a, b) => a.t - b.t);
    const groups: Hit[][] = [];
    for (const frame of strong) {
      const last = groups[groups.length - 1];
      if (!last || frame.t - last[last.length - 1].t > 2.05) groups.push([frame]);
      else last.push(frame);
    }
    const bestGroup = groups.sort((a, b) => peakOf(b) - peakOf(a))[0];
    if (!bestGroup) continue;
    const peak = bestGroup.reduce((top, frame) => (frame.score > top.score ? frame : top));
    const startSec = bestGroup[0].t;
    const endSec = Math.min(source.durationSec, bestGroup[bestGroup.length - 1].t + 1);
    const clock = frameClock(source, peak.t);
    const score = round(peak.score);
    observations.push({
      id: `${source.id}-${startSec.toFixed(1)}`,
      sourceId: source.id,
      cameraId: source.cameraId,
      label: source.label,
      title: source.title,
      fileDescription: source.description,
      interpretation: `CLIP cosine ${score.toFixed(3)} for “${embeddedText}”. Peak sampled frame at ${formatTimecode(peak.t)} in ${source.cameraId}. This is visual similarity, not an object detection and not an identification.`,
      startSec: round(startSec),
      endSec: round(endSec),
      peakSec: round(peak.t),
      score,
      thumbnail: peak.thumb,
      videoUrl: `/samples/${source.file}`,
      pageUrl: source.pageUrl,
      originalUrl: source.originalUrl,
      artist: source.artist,
      license: source.license,
      licenseUrl: source.licenseUrl,
      capturedAt: source.capturedAt,
      capturePrecision: source.capturePrecision,
      captureNote: source.captureNote,
      captureLabel: clock?.label ?? null,
      sortKey: clock?.sortKey ?? (source.capturedAt ? `${source.capturedAt} 99` : null),
      lat: source.lat,
      lon: source.lon,
      coordinateSource: source.coordinateSource,
      trimStartSec: source.trimStartSec,
    });
  }

  return observations.sort((a, b) => b.score - a.score).slice(0, 6);
}

function peakOf(frames: Hit[]): number {
  return Math.max(...frames.map((frame) => frame.score));
}

export function routeNotes(observations: Observation[]): RouteNote[] {
  const notes: RouteNote[] = [];
  for (let i = 0; i < observations.length; i++) {
    for (let j = i + 1; j < observations.length; j++) {
      const a = observations[i];
      const b = observations[j];
      if (a.lat == null || a.lon == null || b.lat == null || b.lon == null) continue;
      const distanceKm = haversine(a.lat, a.lon, b.lat, b.lon);
      const relation = timeRelation(a, b);
      const implausible =
        distanceKm > 30 &&
        (relation.differentDay || relation.impossibleSpeed || relation.sameInstantFarApart);
      notes.push({
        a: a.cameraId,
        b: b.cameraId,
        distanceKm: Math.round(distanceKm),
        flag: implausible ? "implausible" : "not-linked",
        explanation: `${a.cameraId} (${a.label}) and ${b.cameraId} (${b.label}) are ${Math.round(distanceKm).toLocaleString("en-US")} km apart by the coordinates on their file records. ${relation.sentence} Visual similarity was not used as identity, and no route is drawn between them.`,
      });
    }
  }
  return notes
    .sort((a, b) => Number(b.flag === "implausible") - Number(a.flag === "implausible") || b.distanceKm - a.distanceKm)
    .slice(0, 4);
}

function timeRelation(a: Observation, b: Observation): {
  differentDay: boolean;
  impossibleSpeed: boolean;
  sameInstantFarApart: boolean;
  sentence: string;
} {
  const wa = parseWall(a.capturedAt);
  const wb = parseWall(b.capturedAt);
  if (!wa || !wb) {
    return {
      differentDay: false,
      impossibleSpeed: false,
      sameInstantFarApart: false,
      sentence: "At least one file has no capture date, so no journey time was estimated.",
    };
  }
  const dayA = Date.UTC(wa.y, wa.mo - 1, wa.d);
  const dayB = Date.UTC(wb.y, wb.mo - 1, wb.d);
  const dayGap = Math.abs(dayA - dayB) / 86_400_000;
  if (!wa.hasClock || !wb.hasClock) {
    return {
      differentDay: dayGap >= 1,
      impossibleSpeed: false,
      sameInstantFarApart: false,
      sentence:
        dayGap >= 1
          ? `Capture dates differ by ${Math.round(dayGap).toLocaleString("en-US")} days (${formatWall(wa, false)} and ${formatWall(wb, false)}). They are not one continuous journey. One or both files have no clock, so speed was not calculated.`
          : `Both files are dated ${formatWall(wa, false)}, but at least one has no clock, so speed was not calculated. They are still separate recordings.`,
    };
  }
  const ta = Date.UTC(wa.y, wa.mo - 1, wa.d, wa.h, wa.mi, wa.se);
  const tb = Date.UTC(wb.y, wb.mo - 1, wb.d, wb.h, wb.mi, wb.se);
  const hours = Math.abs(ta - tb) / 3_600_000;
  const distance = haversine(a.lat!, a.lon!, b.lat!, b.lon!);
  const speed = hours > 0 ? distance / hours : Infinity;
  return {
    differentDay: dayGap >= 1,
    impossibleSpeed: hours > 0 && speed > 200 && distance > 5,
    sameInstantFarApart: hours === 0 && distance > 0.2,
    sentence: `File clocks are ${a.captureLabel ?? formatWall(wa)} and ${b.captureLabel ?? formatWall(wb)} (each kept in the offset written on that file; they were not converted to one timezone). ${
      hours === 0
        ? "The clocks match and the places differ."
        : `Implied speed if these were one subject would be about ${Math.round(speed).toLocaleString("en-US")} km/h.`
    }`,
  };
}

export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = 6371;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
