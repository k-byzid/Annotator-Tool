/*
 * A very small ZIP writer.
 *
 * Recognition training sets are a folder of cropped lines plus a label file,
 * and a browser can only hand over one file at a time -- so they travel as a
 * zip. Everything going in is already a PNG, which is deflated bitmap data
 * that will not compress twice, so entries are stored rather than deflated.
 * That is the whole of the format we need, and it keeps the app free of any
 * dependency.
 */

const TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/* MS-DOS stamp: seconds have half the resolution, and the epoch is 1980. */
function dosTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) |
               (Math.floor(date.getSeconds() / 2));
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) |
              date.getDate();
  return { time, day };
}

function writer(size) {
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  let at = 0;
  return {
    bytes,
    get at() { return at; },
    u16(value) { view.setUint16(at, value, true); at += 2; },
    u32(value) { view.setUint32(at, value >>> 0, true); at += 4; },
    raw(chunk) { bytes.set(chunk, at); at += chunk.length; },
  };
}

/*
 * files: [{ name, data: Uint8Array }] -> Uint8Array of a zip archive.
 * Names may contain "/" to make folders; nothing else creates one.
 */
export function zip(files, now = new Date()) {
  const stamp = dosTime(now);
  const encoder = new TextEncoder();

  const entries = files.map((file) => {
    const name = encoder.encode(file.name);
    return { name, data: file.data, crc: crc32(file.data), offset: 0 };
  });

  const LOCAL = 30;    // fixed part of a local file header
  const CENTRAL = 46;  // fixed part of a central directory record
  const EOCD = 22;

  const size = entries.reduce(
    (total, e) => total + LOCAL + e.name.length + e.data.length +
                  CENTRAL + e.name.length,
    EOCD,
  );
  const out = writer(size);

  entries.forEach((entry) => {
    entry.offset = out.at;
    out.u32(0x04034b50);
    out.u16(20);              // version needed
    out.u16(0x0800);          // flag: the name is UTF-8
    out.u16(0);               // method: stored
    out.u16(stamp.time);
    out.u16(stamp.day);
    out.u32(entry.crc);
    out.u32(entry.data.length);
    out.u32(entry.data.length);
    out.u16(entry.name.length);
    out.u16(0);               // no extra field
    out.raw(entry.name);
    out.raw(entry.data);
  });

  const directoryAt = out.at;
  entries.forEach((entry) => {
    out.u32(0x02014b50);
    out.u16(20);              // version made by
    out.u16(20);              // version needed
    out.u16(0x0800);
    out.u16(0);
    out.u16(stamp.time);
    out.u16(stamp.day);
    out.u32(entry.crc);
    out.u32(entry.data.length);
    out.u32(entry.data.length);
    out.u16(entry.name.length);
    out.u16(0);               // extra
    out.u16(0);               // comment
    out.u16(0);               // disk number
    out.u16(0);               // internal attributes
    out.u32(0);               // external attributes
    out.u32(entry.offset);
    out.raw(entry.name);
  });

  // Measured before the record below starts, or it counts itself.
  const directorySize = out.at - directoryAt;

  out.u32(0x06054b50);
  out.u16(0);                 // this disk
  out.u16(0);                 // disk the directory starts on
  out.u16(entries.length);
  out.u16(entries.length);
  out.u32(directorySize);
  out.u32(directoryAt);
  out.u16(0);                 // no archive comment

  return out.bytes;
}
