"""
Write a small but *real* multi-page PDF with a proper text layer, so the
/api/pdf route can be tested against something genuine.

Uses pypdf's writer only - no reportlab - by assembling the page content
streams by hand. Enough structure for a valid PDF 1.4 file.
"""

from pathlib import Path
import sys

# Content stream: uncompressed text so the extractor definitely sees it.
def page_stream(lines):
    parts = ["BT", "/F1 12 Tf", "72 720 Td", "16 TL"]
    for line in lines:
        safe = line.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")
        parts.append(f"({safe}) Tj T*")
    parts.append("ET")
    return "\n".join(parts).encode("latin-1", "replace")


PAGES = [
    [
        "Chapter 1: The OSI Model",
        "",
        "The OSI model splits networking into seven layers.",
        "Each layer only talks to the layer above and below it.",
        "",
        "Physical: moves raw bits over a medium.",
        "Data Link: frames and MAC addressing.",
        "Network: routing and IP addresses.",
        "Transport: TCP, UDP, and port numbers.",
        "Session: keeps a conversation alive.",
        "Presentation: encoding and encryption.",
        "Application: HTTP, FTP, SMTP, and DNS.",
    ],
    [
        "Chapter 2: Why Layers Help",
        "",
        "First you change one layer without touching the others.",
        "Then you test that layer in isolation.",
        "Finally you swap a whole implementation out.",
        "",
        "Roughly 60 percent of outages trace back to one layer.",
        "In 1984 the reference model was published.",
        "By 1994 the internet had made it universal.",
    ],
]


def build(path: Path) -> None:
    objects: list[bytes] = []

    def add(body: bytes) -> int:
        objects.append(body)
        return len(objects)

    # font
    font_id = add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")

    page_ids = []
    content_ids = []
    for lines in PAGES:
        stream = page_stream(lines)
        cid = add(
            b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream"
        )
        content_ids.append(cid)
        # /Pages reference patched after we know the parent id; reserve placeholder.
        pid = add(b"")  # placeholder, filled below
        page_ids.append(pid)

    pages_id = len(objects) + 1  # the /Pages object will be added next
    for i, pid in enumerate(page_ids):
        objects[pid - 1] = (
            b"<< /Type /Page /Parent " + str(pages_id).encode() + b" 0 R "
            b"/MediaBox [0 0 612 792] "
            b"/Resources << /Font << /F1 " + str(font_id).encode() + b" 0 R >> >> "
            b"/Contents " + str(content_ids[i]).encode() + b" 0 R >>"
        )

    kids = b" ".join(str(p).encode() + b" 0 R" for p in page_ids)
    add(b"<< /Type /Pages /Count " + str(len(page_ids)).encode() + b" /Kids [" + kids + b"] >>")

    catalog_id = add(b"<< /Type /Catalog /Pages " + str(pages_id).encode() + b" 0 R >>")

    out = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for i, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += str(i).encode() + b" 0 obj\n" + body + b"\nendobj\n"

    xref_at = len(out)
    out += b"xref\n0 " + str(len(objects) + 1).encode() + b"\n"
    out += b"0000000000 65535 f \n"
    for off in offsets[1:]:
        out += f"{off:010d} 00000 n \n".encode()
    out += (
        b"trailer\n<< /Size " + str(len(objects) + 1).encode() + b" /Root "
        + str(catalog_id).encode() + b" 0 R >>\nstartxref\n"
        + str(xref_at).encode() + b"\n%%EOF\n"
    )
    path.write_bytes(bytes(out))


if __name__ == "__main__":
    dest = Path(sys.argv[1] if len(sys.argv) > 1 else "_sample_notes.pdf")
    build(dest)
    print(f"wrote {dest} ({dest.stat().st_size} bytes)")
