"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Clock, MapPin, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { SourceMap } from "@/components/source-map";
import { formatTimecode, type Observation, type RouteNote, type Source } from "@/lib/retrieve";

type CatalogSource = Source & {
  videoUrl: string;
  poster: string | null;
  frameCount: number;
};

type Catalog = {
  investigation: { id: string; name: string; summary: string };
  indexed: boolean;
  model: { id: string; dtype: string; method: string } | null;
  frameCount: number;
  sources: CatalogSource[];
};

type TimeFilterInfo = {
  label: string;
  sourcesWithClock: number;
  sourcesExcluded: number;
  framesKept: number;
  excludedReason: string;
};

type SearchPayload = {
  query: string;
  embeddedText: string;
  model: { id: string; dtype: string; method: string };
  examinedFrames: number;
  framesAfterFilter: number;
  sourceCount: number;
  timeFilter: TimeFilterInfo | null;
  weak: boolean;
  topScore: number;
  weakThreshold: number;
  observations: Observation[];
  routeNotes: RouteNote[];
  disclaimer: string;
};

const EXAMPLES = [
  "cars in a roundabout",
  "garbage truck",
  "traffic light",
  "city bus at a bus stop",
  "pedestrian crossing the street",
  "red sedan between 2 PM and 3 PM",
];

export function Workspace() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchPayload | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const request = useRef(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/catalog")
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Could not load the archive.");
        if (!cancelled) setCatalog(body);
      })
      .catch((error: unknown) => {
        if (!cancelled) setCatalogError(error instanceof Error ? error.message : "Could not load the archive.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "/" && document.activeElement?.tagName !== "INPUT") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function runSearch(nextQuery = query) {
    const text = nextQuery.trim();
    setQuery(text);
    if (!text) {
      setSearchError("Enter a query.");
      return;
    }
    const id = ++request.current;
    setLoading(true);
    setSearchError(null);
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: text }),
      });
      const body = await response.json();
      if (id !== request.current) return;
      if (!response.ok) throw new Error(body.error || "Search failed.");
      setResult(body);
      const first = body.observations[0] as Observation | undefined;
      setSelectedId(first?.id ?? null);
      setPinnedId(first?.sourceId ?? null);
    } catch (error) {
      if (id !== request.current) return;
      setSearchError(error instanceof Error ? error.message : "Search failed.");
    } finally {
      if (id === request.current) setLoading(false);
    }
  }

  const selected = result?.observations.find((item) => item.id === selectedId) ?? null;
  const active = catalog?.sources.find((source) => source.id === (selected?.sourceId ?? pinnedId)) ?? null;
  const videoSrc = active?.videoUrl ?? null;
  const seekTo = selected && active && selected.sourceId === active.id ? selected.peakSec : 0;
  const timed = (result?.observations ?? [])
    .filter((item) => item.capturePrecision === "datetime")
    .slice()
    .sort((a, b) => (a.sortKey ?? "").localeCompare(b.sortKey ?? ""));
  const undated = (result?.observations ?? []).filter((item) => item.capturePrecision !== "datetime");

  return (
    <div className="min-h-dvh bg-background text-foreground lg:flex lg:h-dvh lg:overflow-hidden">
      <aside className={`${sourcesOpen ? "block" : "hidden"} border-border lg:flex lg:w-[280px] lg:shrink-0 lg:flex-col lg:border-r`}>
        <div className="px-5 pt-6 pb-4">
          <p className="font-display text-[1.65rem] leading-none tracking-tight">TRACEPOINT</p>
          <p className="mt-2 text-sm text-muted-foreground">Every observation leaves a trail.</p>
        </div>
        <Separator />
        <div className="px-5 py-4">
          <p className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase">Investigation</p>
          <p className="mt-2 text-sm font-medium">{catalog?.investigation.name ?? "Loading archive"}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {catalog?.investigation.summary ?? "Reading the local catalog."}
          </p>
        </div>
        <Separator />
        <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
          <p className="px-2 pb-2 text-[11px] tracking-[0.16em] text-muted-foreground uppercase">Video sources</p>
          {catalogError && <p className="px-2 text-sm text-destructive">{catalogError}</p>}
          {!catalog && !catalogError && <p className="px-2 text-sm text-muted-foreground">Loading sources…</p>}
          <ul className="space-y-1">
            {catalog?.sources.map((source) => {
              const on = source.id === active?.id;
              return (
                <li key={source.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setPinnedId(source.id);
                      setSelectedId(result?.observations.find((item) => item.sourceId === source.id)?.id ?? null);
                      setSourcesOpen(false);
                    }}
                    className={`w-full rounded-lg px-2 py-2 text-left ${on ? "bg-secondary" : "hover:bg-secondary/60"}`}
                  >
                    <span className="block font-mono text-[11px] text-primary">{source.cameraId}</span>
                    <span className="mt-0.5 block text-sm leading-5">{source.label}</span>
                    <span className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                      {source.capturePrecision === "datetime" ? (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3" />
                          {source.capturedAt}
                        </span>
                      ) : (
                        <span>{source.capturedAt ?? "No capture date"}</span>
                      )}
                      {source.lat != null && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3" />
                          mapped
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="border-t border-border px-5 py-4 pb-6 text-[11px] leading-5 text-muted-foreground">
          Local CLIP retrieval. VAST DataEngine and NVIDIA VSS are not connected.
          {catalog?.indexed ? ` ${catalog.frameCount} sampled frames indexed.` : " Index not built yet."}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col lg:overflow-hidden">
        <header className="border-b border-border px-4 py-4 md:px-6">
          <div className="mb-3 flex items-center justify-between gap-3 lg:hidden">
            <p className="font-display text-2xl leading-none">TRACEPOINT</p>
            <Button variant="outline" size="sm" onClick={() => setSourcesOpen((open) => !open)}>
              Sources
            </Button>
          </div>
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              void runSearch();
            }}
          >
            <label className="sr-only" htmlFor="query">
              Search recordings
            </label>
            <Input
              id="query"
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="cars in a roundabout"
              className="h-12 flex-1 px-3 text-base md:text-base"
            />
            <Button type="submit" disabled={loading} className="h-12 px-5">
              <Search />
              {loading ? "Searching" : "Search"}
            </Button>
          </form>
          <div className="mt-3 flex flex-wrap gap-2">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => void runSearch(example)}
                className="rounded-full border border-border px-2.5 py-1 text-left text-xs text-muted-foreground hover:text-foreground"
              >
                {example}
              </button>
            ))}
          </div>
        </header>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_400px] lg:overflow-hidden">
          <section className="min-h-0 overflow-auto px-4 py-4 md:px-6">
            {searchError && (
              <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {searchError}
              </div>
            )}
            {loading && (
              <p className="mb-4 text-sm text-muted-foreground">
                Embedding the query with the local CLIP text encoder and comparing it to sampled frames…
              </p>
            )}
            {result && (
              <div className="mb-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{result.observations.length} observations</Badge>
                  <Badge variant="secondary">cosine {result.topScore.toFixed(3)}</Badge>
                  {result.timeFilter && <Badge variant="outline">clock {result.timeFilter.label}</Badge>}
                  {result.weak && (
                    <Badge variant="destructive">
                      <AlertTriangle />
                      weak visual match
                    </Badge>
                  )}
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  Embedded text: <span className="font-mono text-foreground">{result.embeddedText}</span>
                  {" · "}
                  {result.examinedFrames} frames across {result.sourceCount} sources.
                  {result.timeFilter
                    ? ` Clock window ${result.timeFilter.label}. ${result.timeFilter.sourcesWithClock} recordings have a clock; ${result.timeFilter.sourcesExcluded} have no clock and were excluded. ${result.framesAfterFilter} sampled frames fell inside the window.`
                    : " No time-of-day phrase was found, so capture clocks were not used as a filter."}
                  {result.observations.length >= 2 &&
                  result.observations[0].score - result.observations[1].score < 0.02
                    ? " Top scores are within 0.02, so the order among them is not a confident call."
                    : ""}
                </p>
                {result.weak && (
                  <p className="text-sm text-muted-foreground">
                    The best cosine similarity is {result.topScore.toFixed(3)}, under {result.weakThreshold.toFixed(2)}. Treat
                    these as weak leads. Nothing here identifies a vehicle or a person.
                  </p>
                )}
              </div>
            )}

            {!result && !loading && (
              <div>
                <h1 className="text-lg font-medium">Search the recordings</h1>
                <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
                  Ask for something visible. Tracepoint samples each file once a second, embeds the frames, and returns the
                  closest intervals with their source ids and timestamps. A low score stays a low score.
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {catalog?.sources.map((source) => (
                    <button
                      key={source.id}
                      type="button"
                      onClick={() => setPinnedId(source.id)}
                      className="overflow-hidden rounded-lg border border-border text-left"
                    >
                      {source.poster ? (
                        // Posters are local sampled frames.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={source.poster} alt="" className="aspect-video w-full object-cover" />
                      ) : (
                        <div className="aspect-video bg-secondary" />
                      )}
                      <span className="block px-2 py-2">
                        <span className="block font-mono text-[10px] text-primary">{source.cameraId}</span>
                        <span className="block text-xs leading-4">{source.label}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <ul className="space-y-3">
              {result?.observations.map((item) => {
                const on = item.id === selectedId;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(item.id);
                        setPinnedId(item.sourceId);
                      }}
                      className={`grid w-full grid-cols-[148px_minmax(0,1fr)] overflow-hidden rounded-lg border text-left ${on ? "border-primary" : "border-border"}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.thumbnail} alt="" className="h-full w-full object-cover" />
                      <span className="min-w-0 px-3 py-2">
                        <span className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[11px] text-primary">{item.cameraId}</span>
                          <span className="font-mono text-[11px]">{item.score.toFixed(3)}</span>
                        </span>
                        <span className="mt-1 block text-sm font-medium">{item.label}</span>
                        <span className="mt-1 block font-mono text-[11px] text-muted-foreground">
                          {formatTimecode(item.startSec)}–{formatTimecode(item.endSec)}
                          {item.captureLabel ? ` · captured ${item.captureLabel}` : " · no capture clock"}
                        </span>
                        <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted-foreground">
                          {item.fileDescription}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {result && result.observations.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No sampled frame survived the filters. If you set a clock window, only recordings with a capture time inside
                it can appear.
              </p>
            )}
          </section>

          <aside className="border-border px-4 py-4 lg:overflow-auto lg:border-l md:px-5">
            <p className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase">Inspection</p>
            {videoSrc ? (
              <Player src={videoSrc} seekTo={seekTo} />
            ) : (
              <div className="mt-3 flex aspect-video items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                Select a source or a result
              </div>
            )}
            {active && (
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{active.cameraId}</Badge>
                  <Badge variant="secondary">{active.license}</Badge>
                </div>
                <h2 className="text-base font-medium">{active.label}</h2>
                <p className="text-xs leading-5 text-muted-foreground">{active.description}</p>
                <dl className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-y-1 text-xs">
                  <dt className="text-muted-foreground">Recording</dt>
                  <dd className="font-mono">
                    {formatTimecode(0)}–{formatTimecode(active.durationSec)}
                    {selected ? ` · peak ${formatTimecode(selected.peakSec)}` : ""}
                  </dd>
                  <dt className="text-muted-foreground">Excerpt</dt>
                  <dd>
                    Starts {active.trimStartSec}s into the original. {active.audioRemoved ? "Audio removed." : ""}
                  </dd>
                  <dt className="text-muted-foreground">Capture</dt>
                  <dd>
                    {active.capturedAt ?? "None in the file"}
                    <span className="mt-0.5 block text-muted-foreground">{active.captureNote}</span>
                  </dd>
                  <dt className="text-muted-foreground">Coordinates</dt>
                  <dd>
                    {active.lat != null && active.lon != null
                      ? `${active.lat}, ${active.lon} · ${active.coordinateSource}`
                      : "None in the file record. Not placed on the map."}
                  </dd>
                  <dt className="text-muted-foreground">Credit</dt>
                  <dd>
                    {active.artist} · {active.originalTitle}
                  </dd>
                </dl>
                <div className="flex flex-wrap gap-3 text-xs">
                  <a className="underline underline-offset-2" href={active.pageUrl} target="_blank" rel="noreferrer">
                    Original file page
                  </a>
                  <a className="underline underline-offset-2" href={active.videoUrl} target="_blank" rel="noreferrer">
                    Demo excerpt
                  </a>
                </div>
                {selected && (
                  <p className="rounded-lg bg-secondary px-3 py-2 text-xs leading-5 text-muted-foreground">
                    {selected.interpretation}
                  </p>
                )}
              </div>
            )}

            {result && result.routeNotes.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase">Route check</p>
                {result.routeNotes.map((note) => (
                  <p key={`${note.a}-${note.b}`} className="text-xs leading-5 text-muted-foreground">
                    <span className={note.flag === "implausible" ? "text-destructive" : "text-foreground"}>
                      {note.flag === "implausible" ? "Implausible as one journey. " : "Not linked. "}
                    </span>
                    {note.explanation}
                  </p>
                ))}
              </div>
            )}

            {catalog && (
              <div className="mt-4">
                <SourceMap sources={catalog.sources} activeId={active?.id ?? null} />
                <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                  {catalog.sources
                    .filter((source) => source.lat == null)
                    .map((source) => (
                      <li key={source.id}>
                        {source.cameraId}: no coordinates in the file record.
                      </li>
                    ))}
                </ul>
              </div>
            )}

            <Button
              type="button"
              variant="outline"
              className="mt-4"
              disabled={!result}
              onClick={() => setNoteOpen(true)}
            >
              Evidence note
            </Button>
          </aside>
        </div>

        <footer className="border-t border-border px-4 py-3 md:px-6">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <p className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase">Timeline</p>
            <p className="text-[11px] text-muted-foreground">
              Capture clocks where the file has one. Other hits stay in a separate row. Not one subject.
            </p>
          </div>
          {!result && <p className="text-sm text-muted-foreground">Search to place observations in time.</p>}
          {result && <Timeline items={timed} label="File clock" selectedId={selectedId} onSelect={setSelectedId} />}
          {result && undated.length > 0 && (
            <div className="mt-2">
              <Timeline
                items={undated}
                label="No clock in the file"
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </div>
          )}
        </footer>
      </div>

      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent className="max-h-[85dvh] overflow-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Evidence note</DialogTitle>
            <DialogDescription>
              Compiled from this search. It separates the file record from the model score. It is not a legal report.
            </DialogDescription>
          </DialogHeader>
          {result && <EvidenceNote result={result} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Player({ src, seekTo }: { src: string; seekTo: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const apply = () => {
      if (Number.isFinite(seekTo)) element.currentTime = seekTo;
    };
    if (element.readyState >= 1) apply();
    element.addEventListener("loadedmetadata", apply);
    return () => element.removeEventListener("loadedmetadata", apply);
  }, [src, seekTo]);

  return (
    <video
      ref={ref}
      key={src}
      src={src}
      controls
      playsInline
      preload="metadata"
      className="mt-3 aspect-video w-full rounded-lg bg-black"
    />
  );
}

function Timeline({
  items,
  label,
  selectedId,
  onSelect,
}: {
  items: Observation[];
  label: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-[11px] text-muted-foreground">{label}</p>
      <ol className="flex gap-2 overflow-x-auto pb-1">
        {items.map((item) => {
          const on = item.id === selectedId;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                className={`w-40 rounded-lg border px-2 py-2 text-left ${on ? "border-primary" : "border-border"}`}
              >
                <span className="block font-mono text-[10px] text-primary">{item.cameraId}</span>
                <span className="mt-1 block font-mono text-[11px]">
                  {item.captureLabel ?? item.capturedAt ?? formatTimecode(item.peakSec)}
                </span>
                <span className="mt-1 block text-[11px] text-muted-foreground">{item.score.toFixed(3)}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function EvidenceNote({ result }: { result: SearchPayload }) {
  return (
    <div className="space-y-4 text-sm">
      <section>
        <h3 className="font-medium">Query</h3>
        <p className="mt-1 text-muted-foreground">{result.query}</p>
        <p className="mt-1 font-mono text-xs">Embedded: {result.embeddedText}</p>
      </section>
      <section>
        <h3 className="font-medium">How the ranking was made</h3>
        <p className="mt-1 text-muted-foreground">
          {result.model.method}. Model {result.model.id}, dtype {result.model.dtype}. {result.examinedFrames} sampled frames
          were compared
          {result.timeFilter ? `, then limited to the clock window ${result.timeFilter.label}.` : "."}
        </p>
      </section>
      <section>
        <h3 className="font-medium">Recorded in the files</h3>
        <ul className="mt-2 space-y-2">
          {result.observations.map((item) => (
            <li key={item.id} className="text-xs leading-5">
              <span className="font-mono text-primary">{item.cameraId}</span> {item.label}. Excerpt{" "}
              {formatTimecode(item.startSec)}–{formatTimecode(item.endSec)}, peak {formatTimecode(item.peakSec)}. Capture:{" "}
              {item.captureLabel ?? item.capturedAt ?? "no clock"}.{" "}
              <a className="underline" href={item.pageUrl}>
                Source page
              </a>
              .
            </li>
          ))}
          {result.observations.length === 0 && <li className="text-muted-foreground">No observations.</li>}
        </ul>
      </section>
      <section>
        <h3 className="font-medium">Model interpretation</h3>
        <ul className="mt-2 space-y-2 text-xs leading-5 text-muted-foreground">
          {result.observations.map((item) => (
            <li key={`${item.id}-note`}>{item.interpretation}</li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="font-medium">Not established</h3>
        <p className="mt-1 text-muted-foreground">
          These scores do not identify a person or a vehicle across cameras, do not allege a driving offense, and were not
          produced by VAST DataEngine, NVIDIA VSS, Cosmos, or YOLO. Similarity between frames is not proof of identity.
        </p>
      </section>
      {result.routeNotes.length > 0 && (
        <section>
          <h3 className="font-medium">Route check</h3>
          <ul className="mt-2 space-y-2 text-xs leading-5 text-muted-foreground">
            {result.routeNotes.map((note) => (
              <li key={`${note.a}-${note.b}`}>
                {note.flag === "implausible" ? "Implausible as one journey. " : "Not linked. "}
                {note.explanation}
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-xs text-muted-foreground">{result.disclaimer}</p>
    </div>
  );
}
