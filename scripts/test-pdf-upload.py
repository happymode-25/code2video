"""POST a PDF to /api/pdf the same way the browser panel does."""
import json
import sys
import urllib.error
import urllib.request
import uuid

path = sys.argv[1] if len(sys.argv) > 1 else "_sample_notes.pdf"
url = sys.argv[2] if len(sys.argv) > 2 else "http://localhost:3000/api/pdf"

data = open(path, "rb").read()
boundary = uuid.uuid4().hex
head = (
    f'--{boundary}\r\n'
    f'Content-Disposition: form-data; name="file"; filename="notes.pdf"\r\n'
    f'Content-Type: application/pdf\r\n\r\n'
).encode()
body = head + data + f"\r\n--{boundary}--\r\n".encode()

req = urllib.request.Request(
    url,
    data=body,
    headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
)
try:
    res = urllib.request.urlopen(req, timeout=300)
    d = json.loads(res.read())
    print("STATUS", res.status)
    print("pages", d["pageCount"], "chars", d["chars"], "hasText", d["hasText"])
    print("first line:", d["text"].splitlines()[0])
    print("stored:", d["file"])
except urllib.error.HTTPError as e:
    print("HTTP", e.code)
    print(e.read().decode("utf-8", "replace")[:500])
