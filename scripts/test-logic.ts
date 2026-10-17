import assert from "node:assert/strict";
import {
  formatMinute,
  frameClock,
  haversine,
  inTimeWindow,
  parseTimeFilter,
  routeNotes,
  textForClip,
  type Observation,
  type Source,
} from "../src/lib/retrieve.ts";

const between = parseTimeFilter("Find red sedans between 2 PM and 3 PM");
assert.ok(between);
assert.equal(between.startMinute, 14 * 60);
assert.equal(between.endMinute, 15 * 60);
assert.equal(between.residual, "Find red sedans");
assert.equal(formatMinute(between.startMinute), "2:00 PM");

const h24 = parseTimeFilter("street between 14:00 and 15:00");
assert.ok(h24);
assert.equal(h24.startMinute, 14 * 60);
assert.equal(h24.endMinute, 15 * 60);
assert.equal(h24.residual, "street");

assert.equal(parseTimeFilter("route 14 to 61"), null);
assert.equal(parseTimeFilter("city bus at a bus stop"), null);
assert.equal(textForClip("city bus"), "a photo of city bus");

const hedemora = {
  capturedAt: "2020-11-24 14:13:10",
  trimStartSec: 0,
} as Source;
const clock = frameClock(hedemora, 50);
assert.ok(clock);
assert.equal(clock.label.startsWith("2020-11-24 14:14:"), true);
assert.equal(inTimeWindow(clock.minuteOfDay, 14 * 60, 15 * 60), true);

const sjc = frameClock(
  { capturedAt: "2024-10-19 21:22:30-0700", trimStartSec: 0 } as Source,
  0,
);
assert.ok(sjc);
assert.equal(inTimeWindow(sjc.minuteOfDay, 14 * 60, 15 * 60), false);
assert.equal(frameClock({ capturedAt: "2011-08-21", trimStartSec: 2 } as Source, 4), null);

const km = haversine(51.528035, -0.02058, 37.3636, -121.9218);
assert.ok(km > 8000 && km < 9500);

const notes = routeNotes([
  obs("SRC-bow", "Bow Church DLR, London", 51.528035, -0.02058, "2011-08-21", "date"),
  obs("SRC-sjc", "San José airport rental-car exit", 37.3636, -121.9218, "2024-10-19 21:22:30-0700", "datetime"),
]);
assert.equal(notes[0]?.flag, "implausible");
assert.match(notes[0]?.explanation ?? "", /not used as identity/);

console.log("logic ok");

function obs(
  id: string,
  label: string,
  lat: number,
  lon: number,
  capturedAt: string,
  capturePrecision: Observation["capturePrecision"],
): Observation {
  return {
    id,
    sourceId: id,
    cameraId: id,
    label,
    title: label,
    fileDescription: "",
    interpretation: "",
    startSec: 0,
    endSec: 1,
    peakSec: 0,
    score: 0.3,
    thumbnail: "",
    videoUrl: "",
    pageUrl: "",
    originalUrl: "",
    artist: "",
    license: "",
    licenseUrl: "",
    capturedAt,
    capturePrecision,
    captureNote: "",
    captureLabel: capturePrecision === "datetime" ? capturedAt : null,
    sortKey: capturedAt,
    lat,
    lon,
    coordinateSource: "Wikimedia Commons file coordinates",
    trimStartSec: 0,
  };
}
