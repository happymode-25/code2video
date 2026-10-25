import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { paths } from "@/lib/engine/paths";
import { slugify } from "@/lib/engine/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Upload a PDF of notes and get its text back.
 *
 * The file is kept on disk (data/uploads) so the same notes can be re-written
 * into a script later without re-uploading. Extraction runs through
 * engine/pdftext.py, which is also used by the CLI.
 */

export const MAX_BYTES = 40 * 1024 * 1024;

type Extracted = {
  text: string;
  chars: number;
  pageCount: number;
  pagesWithText: number;
  hasText: boolean;
  truncated: boolean;
  file: string;
  bytes: number;
  error?: string;
};

function runExtractor(file: string): Promise<Extracted> {
  return new Promise((resolve, reject) => {
    // Imported lazily so a broken child_process import never affects the page.
    import("node:child_process").then(({ spawn }) => {
      const child = spawn(paths.python, [paths.pdfScript, file], {
        cwd: paths.projectRoot,
        windowsHide: true,
      });
      let out = "";
      let err = "";
      child.stdout.setEncoding("utf-8");
      child.stdout.on("data", (c: string) => {
        out += c;
      });
      child.stderr.setEncoding("utf-8");
      child.stderr.on("data", (c: string) => {
        err += c;
      });
      child.on("error", reject);
      child.on("close", () => {
        const line = out.trim().split(/\r?\n/).filter(Boolean).pop();
        if (!line) {
          reject(new Error(err.trim() || "the PDF reader returned nothing"));
          return;
        }
        try {
          resolve(JSON.parse(line) as Extracted);
        } catch {
          reject(new Error(`could not read the PDF reader's output: ${line.slice(0, 200)}`));
        }
      });
    });
  });
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "expected a multipart form with a `file` field" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no file was uploaded" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "the uploaded file is empty" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `that PDF is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is ${MAX_BYTES / 1024 / 1024} MB` },
      { status: 413 },
    );
  }
  if (!/\.pdf$/i.test(file.name)) {
    return NextResponse.json(
      { error: `expected a .pdf file, got "${file.name}". Save your notes as a PDF and try again.` },
      { status: 400 },
    );
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const base = slugify(file.name.replace(/\.pdf$/i, "")) || "notes";
  const stored = path.join(paths.uploadsDir, `${base}-${stamp}.pdf`);

  try {
    fs.mkdirSync(paths.uploadsDir, { recursive: true });
    fs.writeFileSync(stored, Buffer.from(await file.arrayBuffer()));
  } catch (err) {
    return NextResponse.json(
      { error: `could not save the upload: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }

  try {
    const result = await runExtractor(stored);
    if (result.error) {
      return NextResponse.json({ error: result.error, file: stored }, { status: 422 });
    }
    if (!result.hasText) {
      return NextResponse.json(
        {
          error:
            "that PDF has no text layer - it looks like a scan or photos of pages. Paste the text instead, or run it through OCR first.",
          file: stored,
          pageCount: result.pageCount,
        },
        { status: 422 },
      );
    }
    return NextResponse.json({
      ...result,
      file: stored,
      bytes: file.size,
      name: file.name,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
