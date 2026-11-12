import type { RisultatoGeocoding } from "@/types/routing";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "mappa-area-milano/0.1 (open data viewer, uso non commerciale)";
// area metropolitana di Milano: i risultati qui dentro hanno la precedenza
const VIEWBOX = "8.95,45.62,9.45,45.33";

type NominatimResult = { lat: string; lon: string; display_name: string };

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q || q.length < 3) return Response.json([] satisfies RisultatoGeocoding[]);

  const url = new URL(NOMINATIM);
  url.search = new URLSearchParams({
    q,
    format: "jsonv2",
    limit: "5",
    countrycodes: "it",
    viewbox: VIEWBOX,
    bounded: "1",
    "accept-language": "it",
  }).toString();

  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as NominatimResult[];
    return Response.json(
      json.map((r) => ({
        lat: Number(r.lat),
        lng: Number(r.lon),
        // "Via Roma, 10, Municipio 1, Milano, Lombardia, 20121, Italia" -> prime 3 parti
        label: r.display_name.split(", ").slice(0, 3).join(", "),
      })) satisfies RisultatoGeocoding[],
    );
  } catch {
    return Response.json({ errore: "Ricerca indirizzi non disponibile." }, { status: 502 });
  }
}
