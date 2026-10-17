import { connection } from "next/server";
import { ingestUpload } from "@/lib/ingest";

export const runtime = "nodejs";

export async function POST(request: Request) {
  await connection();
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Upload the video as form data." }, { status: 400 });
  }

  const file = form.get("file");
  const label = String(form.get("label") ?? "").trim();
  if (!(file instanceof File)) return Response.json({ error: "Choose a video file." }, { status: 400 });
  if (!label) return Response.json({ error: "Enter a label for this recording." }, { status: 400 });
  if (file.size > 250 * 1024 * 1024) {
    return Response.json({ error: "That file is over 250 MB." }, { status: 400 });
  }
  const type = file.type || "";
  const name = file.name.toLowerCase();
  const video =
    type.startsWith("video/") || [".mp4", ".webm", ".mov", ".mkv"].some((ext) => name.endsWith(ext));
  if (!video) return Response.json({ error: "Use an mp4, webm, mov, or mkv file." }, { status: 400 });

  try {
    const source = await ingestUpload({
      bytes: Buffer.from(await file.arrayBuffer()),
      filename: file.name,
      label,
      cameraId: String(form.get("cameraId") ?? ""),
      capturedAt: String(form.get("capturedAt") ?? ""),
      description: String(form.get("description") ?? ""),
      captureNote: String(form.get("captureNote") ?? ""),
      pageUrl: String(form.get("pageUrl") ?? ""),
      license: String(form.get("license") ?? ""),
      artist: String(form.get("artist") ?? ""),
      lat: numberOrNull(form.get("lat")),
      lon: numberOrNull(form.get("lon")),
    });
    return Response.json({ ok: true, source: publicSource(source) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed.";
    return Response.json({ error: message }, { status: 500 });
  }
}

function numberOrNull(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function publicSource(source: { streamUrl?: string; [key: string]: unknown }) {
  const { streamUrl: _hidden, ...rest } = source;
  return rest;
}
