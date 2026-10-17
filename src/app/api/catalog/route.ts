import { connection } from "next/server";
import { loadIndex, loadSources } from "@/lib/archive";

export async function GET() {
  await connection();
  const sources = loadSources();
  const index = loadIndex();
  const posters = new Map<string, string>();
  const counts = new Map<string, number>();
  for (const frame of index?.frames ?? []) {
    counts.set(frame.sourceId, (counts.get(frame.sourceId) ?? 0) + 1);
    if (!posters.has(frame.sourceId)) posters.set(frame.sourceId, frame.thumb);
  }

  return Response.json({
    investigation: {
      id: "road-archive",
      name: "Road archive",
      summary:
        "Ten openly licensed recordings. Search ranks sampled frames with a local CLIP model. Coordinates appear only when the file record has them.",
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
    sources: sources.map((source) => ({
      ...source,
      videoUrl: `/samples/${source.file}`,
      poster: posters.get(source.id) ?? null,
      frameCount: counts.get(source.id) ?? 0,
    })),
  });
}
