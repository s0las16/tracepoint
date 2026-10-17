"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { Source } from "@/lib/retrieve";

type Pin = Pick<Source, "id" | "cameraId" | "label" | "lat" | "lon">;

export function SourceMap({ sources, activeId }: { sources: Pin[]; activeId: string | null }) {
  const node = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const geo = sources.filter((source) => source.lat != null && source.lon != null);
  const key = geo.map((source) => `${source.id}:${source.lat}:${source.lon}`).join("|") + `|${activeId ?? ""}`;

  useEffect(() => {
    const host = node.current;
    if (!host || geo.length === 0) return;
    let map: { remove: () => void } | null = null;
    let cancelled = false;

    (async () => {
      try {
        const L = await import("leaflet");
        if (cancelled || !node.current) return;
        const next = L.map(node.current, { zoomControl: true, attributionControl: true });
        map = next;
        L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
          {
            attribution: "Tiles &copy; Esri",
            maxZoom: 16,
          },
        ).addTo(next);
        const points: [number, number][] = [];
        for (const source of geo) {
          if (source.lat == null || source.lon == null) continue;
          const active = source.id === activeId;
          L.circleMarker([source.lat, source.lon], {
            radius: active ? 9 : 6,
            color: active ? "#e0b15a" : "#c5d39a",
            weight: 2,
            fillColor: "#141612",
            fillOpacity: 0.92,
          })
            .addTo(next)
            .bindTooltip(`${source.cameraId} — ${source.label}`, { direction: "top" });
          points.push([source.lat, source.lon]);
        }
        if (points.length === 1) next.setView(points[0], 12);
        else next.fitBounds(points, { padding: [28, 28] });
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Map failed to load.");
      }
    })();

    return () => {
      cancelled = true;
      map?.remove();
    };
    // geo is derived from key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (geo.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex items-center justify-between px-3 py-2 text-[11px] tracking-wide text-muted-foreground uppercase">
        <span>File coordinates</span>
        <span>{geo.length} mapped</span>
      </div>
      {error ? (
        <p className="px-3 pb-3 text-sm text-destructive">{error}</p>
      ) : (
        <div ref={node} className="h-64 w-full bg-black" />
      )}
    </div>
  );
}
