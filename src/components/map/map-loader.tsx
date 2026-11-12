"use client";

import dynamic from "next/dynamic";

// Leaflet usa `window`: la mappa viene renderizzata solo lato client.
const MilanoMap = dynamic(() => import("./milano-map"), {
  ssr: false,
  loading: () => (
    <div className="flex size-full animate-pulse items-center justify-center bg-muted text-sm text-muted-foreground">
      <span className="flex items-center gap-2">
        <span className="size-2 animate-ping rounded-full bg-muted-foreground/60" />
        Caricamento mappa…
      </span>
    </div>
  ),
});

export default MilanoMap;
