export type ByteRange =
  | { kind: "range"; start: number; end: number }
  | { kind: "unsatisfiable" };

export function parseByteRange(value: string | null, size: number): ByteRange | null {
  if (!value || !Number.isSafeInteger(size) || size < 0) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return null;
  if (size === 0) return { kind: "unsatisfiable" };

  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return { kind: "unsatisfiable" };
    return {
      kind: "range",
      start: Math.max(0, size - suffixLength),
      end: size - 1,
    };
  }

  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd)) return null;
  if (start >= size) return { kind: "unsatisfiable" };
  if (start > requestedEnd) return null;
  return { kind: "range", start, end: Math.min(requestedEnd, size - 1) };
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export function createMediaResponse(
  request: Request,
  body: Uint8Array,
  baseHeaders: Headers,
): Response {
  baseHeaders.set("Accept-Ranges", "bytes");
  baseHeaders.set("Content-Length", String(body.byteLength));
  if (request.method === "HEAD") return new Response(null, { headers: baseHeaders });

  const ifRange = request.headers.get("if-range");
  const rangeHeader = ifRange && ifRange !== baseHeaders.get("ETag")
    ? null
    : request.headers.get("range");
  const range = parseByteRange(rangeHeader, body.byteLength);
  if (range?.kind === "unsatisfiable") {
    baseHeaders.set("Content-Range", `bytes */${body.byteLength}`);
    baseHeaders.delete("Content-Length");
    return new Response(null, { status: 416, headers: baseHeaders });
  }
  if (!range) return new Response(toArrayBuffer(body), { headers: baseHeaders });

  const selected = body.subarray(range.start, range.end + 1);
  baseHeaders.set("Content-Range", `bytes ${range.start}-${range.end}/${body.byteLength}`);
  baseHeaders.set("Content-Length", String(selected.byteLength));
  return new Response(toArrayBuffer(selected), { status: 206, headers: baseHeaders });
}
