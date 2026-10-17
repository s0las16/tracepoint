import path from "node:path";
import { CLIP_DTYPE, CLIP_MODEL, l2 } from "@/lib/retrieve";

type TextEncoder = {
  tokenizer: (texts: string[], options: { padding: boolean; truncation: boolean }) => unknown;
  model: (inputs: unknown) => Promise<{ text_embeds?: { tolist: () => number[][] } }>;
};

const globalStore = globalThis as typeof globalThis & {
  __tracepointText?: Promise<TextEncoder>;
};

export async function embedQuery(text: string): Promise<number[]> {
  const encoder = await getTextEncoder();
  const inputs = await encoder.tokenizer([text], { padding: true, truncation: true });
  const output = await encoder.model(inputs);
  const row = output.text_embeds?.tolist()?.[0];
  if (!row?.length) throw new Error("CLIP text encoder returned no embedding.");
  return l2(row.map((value) => Number(value)));
}

async function getTextEncoder(): Promise<TextEncoder> {
  if (!globalStore.__tracepointText) {
    globalStore.__tracepointText = loadTextEncoder();
  }
  return globalStore.__tracepointText;
}

async function loadTextEncoder(): Promise<TextEncoder> {
  const { env, AutoTokenizer, CLIPTextModelWithProjection } = await import("@huggingface/transformers");
  env.cacheDir = path.join(process.cwd(), ".cache", "huggingface");
  const tokenizer = await AutoTokenizer.from_pretrained(CLIP_MODEL);
  const model = await CLIPTextModelWithProjection.from_pretrained(CLIP_MODEL, {
    dtype: CLIP_DTYPE,
    device: "cpu",
  });
  return {
    tokenizer: (texts, options) => tokenizer(texts, options),
    model: (inputs) => model(inputs),
  };
}
