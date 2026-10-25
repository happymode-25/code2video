import { NextResponse } from "next/server";
import { ollamaStatus } from "@/lib/engine/ollama";
import { estimateWrite, writeScript, type WriteBrief } from "@/lib/engine/writer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Writing on a CPU takes minutes; do not let the platform cut it short. */
export const maxDuration = 3600;

/** Lists the models the writer can use. Cheap - used to build the picker. */
export async function GET() {
  const status = await ollamaStatus();
  return NextResponse.json(status);
}

type Body = WriteBrief & {
  /** Return the script without saving it. The studio writes it in itself. */
  previewOnly?: boolean;
  model?: string;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Partial<Body>;

  if (!body.notes || !body.notes.trim()) {
    return NextResponse.json(
      { error: "there are no notes to write from - paste some text or upload a PDF" },
      { status: 400 },
    );
  }

  const brief: WriteBrief = {
    notes: body.notes,
    topic: body.topic,
    audience: body.audience,
    targetMinutes: body.targetMinutes ?? 3,
    style: body.style,
    language: body.language,
    voices: body.voices,
    partOf: body.partOf,
    technical: body.technical,
  };

  try {
    const result = await writeScript(brief, body.model);
    return NextResponse.json({
      name: result.name,
      yaml: result.yaml,
      scenes: result.scenes.length,
      voice: result.voice,
      model: result.model,
      seconds: Number(result.seconds.toFixed(1)),
      via: result.via,
      notes: result.notes,
      speed: result.speed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/cancelled/i.test(message)) {
      return NextResponse.json({ error: "cancelled" }, { status: 499 });
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/** Exposed so the studio can show the same estimate the CLI does. */
export async function PUT(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Partial<Body>;
  const status = await ollamaStatus();
  return NextResponse.json({
    estimate: estimateWrite(body.notes ?? "", { notes: body.notes ?? "", targetMinutes: body.targetMinutes }, body.model ?? status.writer),
  });
}
