"""Extracts plain text from a PDF so the script writer can read your notes.

    python engine/pdftext.py <input.pdf>

Prints JSON on stdout:
    {
      "pages": [{"n": 1, "text": "..."}],
      "text": "all pages joined",
      "chars": 12345,
      "pageCount": 12,
      "hasText": true,
      "truncated": false
    }

Scanned/image-only PDFs have no text layer; `hasText: false` lets the app say
so instead of silently writing a video about nothing.

Errors are reported as {"error": "..."} with exit code 3.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

# The writer only needs a few thousand words of context; more than this just
# slows the model down and rarely improves the script.
MAX_CHARS = 60_000


def clean(text: str) -> str:
    """Tidy up the ragged whitespace PDF extraction produces."""
    lines = []
    for raw in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        line = raw.strip()
        # Drop the page-number and footer noise that leaks into most textbooks.
        if line.isdigit():
            continue
        lines.append(line)

    out: list[str] = []
    blank = True
    for line in lines:
        if not line:
            if not blank:
                out.append("")
            blank = True
            continue
        out.append(line)
        blank = False

    text = "\n".join(out).strip()
    # Re-join words broken across a line by hyphenation.
    while True:
        fixed = _dehyphenate(text)
        if fixed == text:
            break
        text = fixed
    return text


def _dehyphenate(text: str) -> str:
    import re

    return re.sub(r"(\w)-\n(\w)", r"\1\2", text)


def read_pdf(path: Path) -> dict:
    try:
        from pypdf import PdfReader
    except ImportError:
        return {"error": "pypdf is not installed. Run: pip install pypdf"}

    try:
        reader = PdfReader(str(path))
    except Exception as err:  # noqa: BLE001 - surfaced to the user
        return {"error": f"could not open the PDF: {err}"}

    if getattr(reader, "is_encrypted", False):
        try:
            reader.decrypt("")
        except Exception:
            return {"error": "the PDF is password-protected"}

    try:
        page_count = len(reader.pages)
    except Exception as err:  # noqa: BLE001
        return {"error": f"could not count pages: {err}"}

    pages = []
    for i, page in enumerate(reader.pages):
        try:
            raw = page.extract_text() or ""
        except Exception:  # noqa: BLE001 - one bad page must not kill the import
            raw = ""
        text = clean(raw)
        if text:
            pages.append({"n": i + 1, "text": text})

    joined = "\n\n".join(p["text"] for p in pages)
    truncated = len(joined) > MAX_CHARS
    return {
        "pages": pages,
        "text": joined[:MAX_CHARS],
        "chars": len(joined),
        "pageCount": page_count,
        "pagesWithText": len(pages),
        "hasText": bool(joined.strip()),
        "truncated": truncated,
    }


def main() -> int:
    if len(sys.argv) < 2:
        print(json.dumps({"error": "usage: python engine/pdftext.py <input.pdf>"}))
        return 2

    path = Path(sys.argv[1])
    if not path.exists():
        print(json.dumps({"error": f"file not found: {path}"}))
        return 2
    if path.suffix.lower() != ".pdf":
        print(json.dumps({"error": f"not a pdf: {path.name}"}))
        return 2

    result = read_pdf(path)
    print(json.dumps(result))
    return 3 if "error" in result else 0


if __name__ == "__main__":
    sys.exit(main())
