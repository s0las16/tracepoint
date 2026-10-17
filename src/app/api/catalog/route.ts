import { connection } from "next/server";
import { loadIndex, loadSources } from "@/lib/archive";
import { ensureLiveLoops } from "@/lib/ingest";

export async function GET() {
  await connection();
  ensureLiveLoops();
  const sources = loadSources();
  const index = loadIndex();
  const first = new Map<string, string>();
  const last = new Map<string, string>();
  const counts = new Map<string, number>();
  for (const frame of index?.frames ?? []) {
    counts.set(frame.sourceId, (counts.get(frame.sourceId) ?? 0) + 1);
    if (!first.has(frame.sourceId)) first.set(frame.sourceId, frame.thumb);
    last.set(frame.sourceId, frame.thumb);
  }

  return Response.json({
    investigation: {
      id: "road-archive",
      name: "Road archive",
      summary:
        "Search ranks sampled frames with a local CLIP model. Add a file or an NVR stream from this machine. Coordinates appear only when a file record or the operator supplied them.",
    },
    indexed: Boolean(index),
    model: index
      ? {
          id: index.model,
          dtype: index.dtype,
          method: "CLIP cosine similarity over sampled frames",
        }
      : null,
    frameCount: index?.frames.length ?? 0,
    sources: sources.map((source) => {
      const { streamUrl: _hidden, ...rest } = source;
      return {
        ...rest,
        videoUrl: source.videoUrl ?? (source.file ? `/samples/${source.file}` : null),
        poster: (source.origin === "live" ? last.get(source.id) : first.get(source.id)) ?? null,
        frameCount: counts.get(source.id) ?? 0,
      };
    }),
  });
}
