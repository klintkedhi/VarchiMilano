import { MapExplorer } from "@/components/map-explorer";
import { attraversamenti, meta, varchi, zones } from "@/data/zones";

export default function Home() {
  return <MapExplorer zones={zones} varchi={varchi} attraversamenti={attraversamenti} meta={meta} />;
}
