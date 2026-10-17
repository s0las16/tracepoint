import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { env, AutoProcessor, CLIPVisionModelWithProjection, RawImage } from "@huggingface/transformers";

const exec = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const MODEL = "Xenova/clip-vit-base-patch32";
const DTYPE = "q8";

env.cacheDir = path.join(root, ".cache", "huggingface");

function l2(values) {
  let sum = 0;
  for (const value of values) sum += value * value;
  const norm = Math.sqrt(sum) || 1;
  return values.map((value) => Math.round((value / norm) * 1e6) / 1e6);
}

const sources = JSON.parse(fs.readFileSync(path.join(root, "data", "sources.json"), "utf8"));
const thumbRoot = path.join(root, "public", "thumbs");
fs.rmSync(thumbRoot, { recursive: true, force: true });
fs.mkdirSync(thumbRoot, { recursive: true });

console.log(`Loading ${MODEL} (${DTYPE})…`);
const processor = await AutoProcessor.from_pretrained(MODEL);
const vision = await CLIPVisionModelWithProjection.from_pretrained(MODEL, {
  dtype: DTYPE,
  device: "cpu",
});

const frames = [];
for (const source of sources) {
  const video = path.join(root, "public", "samples", source.file);
  const dir = path.join(thumbRoot, source.id);
  fs.mkdirSync(dir, { recursive: true });
  console.log(`Frames ${source.id}`);
  await exec("ffmpeg", [
    "-y",
    "-i",
    video,
    "-vf",
    "fps=1,scale=640:-2",
    "-q:v",
    "3",
    path.join(dir, "%04d.jpg"),
  ]);
  const files = fs.readdirSync(dir).filter((name) => name.endsWith(".jpg")).sort();
  for (const [index, name] of files.entries()) {
    const imagePath = path.join(dir, name);
    const image = await RawImage.read(imagePath);
    const inputs = await processor(image);
    const output = await vision(inputs);
    const row = output.image_embeds?.tolist()?.[0];
    if (!row?.length) throw new Error(`No embedding for ${imagePath}`);
    frames.push({
      sourceId: source.id,
      t: index,
      thumb: `/thumbs/${source.id}/${name}`,
      vector: l2(row.map(Number)),
    });
    process.stdout.write(`  ${source.id} t=${index}s dim=${row.length}\n`);
  }
}

const index = {
  model: MODEL,
  dtype: DTYPE,
  frameIntervalSec: 1,
  frames,
};
fs.writeFileSync(path.join(root, "data", "index.json"), JSON.stringify(index));
console.log(`Indexed ${frames.length} frames → data/index.json`);
