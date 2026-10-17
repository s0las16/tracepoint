import { connection } from "next/server";
import { loadIndex, loadSources } from "@/lib/archive";
import { embedQuery } from "@/lib/clip";
import {
  WEAK_SCORE,
  clusterObservations,
  dot,
  frameClock,
  inTimeWindow,
  parseTimeFilter,
  parseWall,
  routeNotes,
  textForClip,
} from "@/lib/retrieve";

export async function POST(request: Request) {
  await connection();
  let body: { query?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send a JSON body with a query." }, { status: 400 });
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) return Response.json({ error: "Enter a query." }, { status: 400 });
  if (query.length > 400) return Response.json({ error: "Query is too long." }, { status: 400 });

  const index = loadIndex();
  if (!index) {
    return Response.json(
      { error: "Archive index is missing. From the project directory, run npm run index." },
      { status: 503 },
    );
  }

  const sources = loadSources();
  const filter = parseTimeFilter(query);
  const residual = (filter?.residual ?? query).trim();
  if (!residual) {
    return Response.json(
      { error: "Add what to look for. A time window alone does not describe a visible scene." },
      { status: 400 },
    );
  }

  try {
    const embeddedText = textForClip(residual);
    const vector = await embedQuery(embeddedText);
    if (vector.length !== index.frames[0]?.vector.length) {
      throw new Error("The saved frame index does not match this CLIP model. Run npm run index again.");
    }

    let pool = index.frames.map((frame) => ({
      ...frame,
      score: dot(vector, frame.vector),
    }));
    const examinedFrames = pool.length;
    let sourcesWithClock = 0;
    let sourcesExcluded = 0;

    if (filter) {
      const clockIds = new Set(
        sources.filter((source) => parseWall(source.capturedAt)?.hasClock).map((source) => source.id),
      );
      sourcesWithClock = clockIds.size;
      sourcesExcluded = sources.length - sourcesWithClock;
      pool = pool.filter((frame) => {
        const source = sources.find((item) => item.id === frame.sourceId);
        if (!source) return false;
        const clock = frameClock(source, frame.t);
        if (!clock) return false;
        return inTimeWindow(clock.minuteOfDay, filter.startMinute, filter.endMinute);
      });
    }

    const observations = clusterObservations(pool, sources, embeddedText);
    const topScore = observations[0]?.score ?? 0;

    return Response.json({
      query,
      embeddedText,
      model: {
        id: index.model,
        dtype: index.dtype,
        method: "CLIP cosine similarity over sampled frames",
      },
      examinedFrames,
      framesAfterFilter: pool.length,
      sourceCount: sources.length,
      timeFilter: filter
        ? {
            label: filter.label,
            startMinute: filter.startMinute,
            endMinute: filter.endMinute,
            sourcesWithClock,
            sourcesExcluded,
            framesKept: pool.length,
            excludedReason:
              "Sources with a date only, or with no capture time, were left out of this window.",
          }
        : null,
      weak: observations.length === 0 || topScore < WEAK_SCORE,
      topScore,
      weakThreshold: WEAK_SCORE,
      observations,
      routeNotes: routeNotes(observations),
      disclaimer:
        "Tracepoint ranks frames from this archive. A score is not a detection, an identification, or an allegation. VAST DataEngine and NVIDIA VSS are not connected.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed.";
    return Response.json({ error: message }, { status: 500 });
  }
}
