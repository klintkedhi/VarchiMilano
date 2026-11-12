import { calcolaPercorso } from "@/lib/routing";
import type { RichiestaPercorso } from "@/types/routing";

const isLatLng = (p: unknown): p is { lat: number; lng: number } =>
  typeof p === "object" &&
  p !== null &&
  Number.isFinite((p as { lat: unknown }).lat) &&
  Number.isFinite((p as { lng: unknown }).lng);

export async function POST(request: Request) {
  let body: Partial<RichiestaPercorso>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ stato: "errore", messaggio: "Richiesta non valida." }, { status: 400 });
  }

  if (!isLatLng(body.from) || !isLatLng(body.to)) {
    return Response.json({ stato: "errore", messaggio: "Partenza e arrivo sono obbligatori." }, { status: 400 });
  }
  const zone = (body.zone ?? []).filter((z) => z === "area-b" || z === "area-c");

  try {
    const risposta = await calcolaPercorso({
      from: body.from,
      to: body.to,
      zone,
      includiPreEsercizio: Boolean(body.includiPreEsercizio),
    });
    return Response.json(risposta);
  } catch (err) {
    console.error(err);
    return Response.json(
      { stato: "errore", messaggio: "Servizio di calcolo percorso non disponibile, riprova tra poco." },
      { status: 502 },
    );
  }
}
