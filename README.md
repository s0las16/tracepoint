# TRACEPOINT

Every observation leaves a trail.

Tracepoint searches a small archive of openly licensed road recordings. A natural-language query is embedded with CLIP and compared with frames sampled once a second. Results show the source id, the interval inside the excerpt, a thumbnail, and the capture clock when the original file published one. Coordinates are mapped only when Wikimedia Commons published them on the file.

This build does **not** call VAST DataEngine, NVIDIA VSS, Cosmos, or YOLO. Those services are not available in this environment, and the interface says so.

## Run

Requirements: Node.js 22+, ffmpeg on `PATH`.

```bash
npm install
npm run index   # first run downloads CLIP ViT-B/32 (~150 MB) into .cache/
npm run dev
```

Open [http://127.0.0.1:43123](http://127.0.0.1:43123).

`npm run index` writes `data/index.json` and `public/thumbs/`. The committed index is enough to search after the text encoder has been downloaded, which happens on the first query. Re-run the indexer if you change `data/sources.json` or the sample files.

## Add footage or a live camera

The sidebar accepts an mp4, webm, mov, or mkv. Tracepoint samples it, embeds the frames with the same CLIP model, and adds it to search. A capture clock or coordinates are stored only when the file tag or the person uploading the file supplies them. Operator-entered coordinates are labeled as such.

A live NVR or street camera uses an `rtsp://`, `rtsps://`, `http://`, or `https://` URL. The first frame has to open before the camera is saved. After that, a frame is sampled every 5 seconds. Passwords in the URL stay in `data/added-sources.json` on this machine and are not shown in the interface. Browsers cannot play RTSP, so inspection shows the latest sampled frame.

```bash
npm test
```

## What a search does

1. Optional clock phrase, such as `between 2 PM and 3 PM` or `between 14:00 and 15:00`, is removed from the text and applied only to sources whose file record has a clock.
2. The remaining words are embedded with `Xenova/clip-vit-base-patch32` (`q8`). Short phrases are prefixed with `a photo of`.
3. Cosine similarity ranks sampled frames. Nearby frames from the same file collapse into one interval.
4. Scores under 0.22 are labeled a weak visual match. The score is not a detection and not an identification.

## Environment

No API key is required. Names only:

| Name | Required | Purpose |
| --- | --- | --- |
| `HF_TOKEN` | no | Hugging Face token if the public CLIP download is rate-limited. Never commit a value. |

Copy `.env.example` to `.env` only if you need that token. The app reads the model through `@huggingface/transformers`, which uses `HF_TOKEN` from the environment when it is set.

## Sample media

Excerpts in `public/samples/` are trimmed, silent derivatives of Wikimedia Commons files. See [ATTRIBUTION.md](ATTRIBUTION.md). Code in this repository is MIT. The media stays under the licenses named there.

## Layout

- `src/app` — investigation UI and `/api/catalog`, `/api/search`, `/api/health`
- `src/lib/retrieve.ts` — clock parsing, clustering, route check
- `scripts/index-archive.mjs` — ffmpeg sampling and the CLIP vision encoder
- `data/sources.json` — file metadata copied from Wikimedia Commons
