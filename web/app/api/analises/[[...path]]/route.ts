import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

async function forward(request: NextRequest, path: string[] = []) {
  const segments = path.map(decodeURIComponent);
  const valid = segments.length === 0 && request.method === "POST"
    || segments.length === 2 && segments[0] === "exemplo" && request.method === "POST" && /^[a-z]+$/.test(segments[1])
    || segments.length >= 1 && segments.length <= 4 && request.method === "GET"
      && /^[A-Za-z0-9_-]{12}$/.test(segments[0])
      && (segments.length === 1 || segments[1] === "fluxos")
      && (segments.length < 3 || /^\d+$/.test(segments[2]))
      && (segments.length < 4 || segments[3] === "explicar");
  if (!valid) return NextResponse.json({ detail: "Rota inválida" }, { status: 404 });
  const base = process.env.API_URL || "http://127.0.0.1:8000";
  const target = new URL(`/api/analises${segments.length ? `/${segments.map(encodeURIComponent).join("/")}` : ""}${request.nextUrl.search}`, base);
  try {
    const options: RequestInit = { method: request.method, cache: "no-store", signal: request.signal };
    if (request.method === "POST" && segments.length === 0) {
      const contentType = request.headers.get("content-type");
      if (!contentType?.toLowerCase().startsWith("multipart/form-data;") || !contentType.includes("boundary="))
        return NextResponse.json({ detail: "Arquivo obrigatório" }, { status: 400 });
      // Encaminha o multipart em streaming; ZIPs grandes não são carregados na memória do Next.
      options.headers = { "content-type": contentType };
      options.body = request.body;
      (options as RequestInit & { duplex: "half" }).duplex = "half";
    }
    const upstream = await fetch(target, options);
    return new NextResponse(await upstream.text(), { status: upstream.status, headers: { "content-type": upstream.headers.get("content-type") || "application/json", "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ detail: "Serviço indisponível. Tente novamente." }, { status: 503 });
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  return forward(request, (await context.params).path);
}
export async function POST(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  return forward(request, (await context.params).path);
}
