import { connection } from "next/server";
import { loadIndex, loadSources } from "@/lib/archive";
import { CLIP_MODEL } from "@/lib/retrieve";

export async function GET() {
  await connection();
  const index = loadIndex();
  const sources = loadSources();
  return Response.json({
    ok: true,
    indexed: Boolean(index),
    sources: sources.length,
    frames: index?.frames.length ?? 0,
    model: index?.model ?? CLIP_MODEL,
    dtype: index?.dtype ?? null,
  });
}
