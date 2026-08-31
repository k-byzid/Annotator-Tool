import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zip, crc32 } from "../assets/zip.js";

const bytes = (text) => new TextEncoder().encode(text);
const u32 = (b, at) => new DataView(b.buffer, b.byteOffset).getUint32(at, true);

test("crc32 matches the known check value for \"123456789\"", () => {
  // The standard CRC-32/ISO-HDLC check value every implementation agrees on.
  assert.equal(crc32(bytes("123456789")), 0xcbf43926);
});

test("crc32 of nothing is zero", () => {
  assert.equal(crc32(new Uint8Array(0)), 0);
});

test("an archive starts with a local header and ends with the directory", () => {
  const out = zip([{ name: "a.txt", data: bytes("hello") }]);
  assert.equal(u32(out, 0), 0x04034b50);

  const eocd = out.length - 22;
  assert.equal(u32(out, eocd), 0x06054b50);

  const directoryAt = u32(out, eocd + 16);
  const directorySize = u32(out, eocd + 12);
  assert.equal(u32(out, directoryAt), 0x02014b50);
  // The directory must end exactly where the closing record begins.
  assert.equal(directoryAt + directorySize, eocd);
});

test("each entry's directory record points back at its local header", () => {
  const out = zip([
    { name: "crops/0001.png", data: bytes("first") },
    { name: "crops/0002.png", data: bytes("second one") },
    { name: "labels.txt", data: bytes("0001.png\thello") },
  ]);

  const eocd = out.length - 22;
  assert.equal(out[eocd + 8], 3, "records this disk");
  assert.equal(out[eocd + 10], 3, "records in total");

  let at = u32(out, eocd + 16);
  for (let i = 0; i < 3; i += 1) {
    assert.equal(u32(out, at), 0x02014b50);
    const nameLength = new DataView(out.buffer, out.byteOffset).getUint16(at + 28, true);
    const offset = u32(out, at + 42);
    assert.equal(u32(out, offset), 0x04034b50, "offset lands on a local header");
    at += 46 + nameLength;
  }
});

test("the sizes and crc in the header describe the stored bytes", () => {
  const payload = bytes("some label text");
  const out = zip([{ name: "labels.txt", data: payload }]);

  assert.equal(u32(out, 14), crc32(payload));
  assert.equal(u32(out, 18), payload.length, "compressed size");
  assert.equal(u32(out, 22), payload.length, "uncompressed size");
});

/* The only test that proves the format is right rather than self-consistent:
 * hand the bytes to something that did not write them. */
test("a real unzip reads the archive back", (t) => {
  let unzip;
  try {
    unzip = execFileSync("where", ["unzip"], { encoding: "utf8" }).split(/\r?\n/)[0].trim();
  } catch {
    try {
      unzip = execFileSync("which", ["unzip"], { encoding: "utf8" }).trim();
    } catch {
      t.skip("no unzip on this machine");
      return;
    }
  }

  const dir = mkdtempSync(join(tmpdir(), "annotator-zip-"));
  const archive = join(dir, "out.zip");
  writeFileSync(archive, zip([
    { name: "crops/0001.png", data: bytes("not really a png") },
    { name: "labels.txt", data: bytes("crops/0001.png\t12.50\n") },
  ]));

  execFileSync(unzip, ["-q", archive, "-d", dir]);
  assert.deepEqual(readdirSync(join(dir, "crops")), ["0001.png"]);
  assert.equal(readFileSync(join(dir, "labels.txt"), "utf8"), "crops/0001.png\t12.50\n");
});
