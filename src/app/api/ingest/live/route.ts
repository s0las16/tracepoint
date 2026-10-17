import { connection } from "next/server";
import { ensureLiveLoops, ingestLive } from "@/lib/ingest";

export const runtime = "nodejs";

export async function POST(request: Request) {
  await connection();
  let body: {
    url?: unknown;
    label?: unknown;
    cameraId?: unknown;
    lat?: unknown;
    lon?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send the camera URL as JSON." }, { status: 400 });
  }

  const url = typeof body.url === "string" ? body.url.trim() : "";
  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!url) return Response.json({ error: "Enter the RTSP or HTTP URL from the NVR." }, { status: 400 });
  if (!label) return Response.json({ error: "Enter a label for this camera." }, { status: 400 });

  try {
    const source = await ingestLive({
      url,
      label,
      cameraId: typeof body.cameraId === "string" ? body.cameraId : "",
      lat: typeof body.lat === "number" ? body.lat : null,
      lon: typeof body.lon === "number" ? body.lon : null,
    });
    ensureLiveLoops();
    const { streamUrl: _hidden, ...safe } = source;
    return Response.json({ ok: true, source: safe });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The camera could not be opened.";
    return Response.json({ error: message }, { status: 400 });
  }
}
