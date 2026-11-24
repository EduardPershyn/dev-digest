/**
 * archive adapter — read-only, in-memory .zip access for skill import (M2).
 *
 * Implements the skills module's `ArchiveReader` port with fflate's streaming
 * `Unzip` (pure JS, no natives):
 *   - `list` walks entry headers and calls `start()` on NONE of them, so no
 *     entry is ever decompressed;
 *   - `readText` inflates exactly one entry and terminates as soon as the
 *     output passes `maxBytes` — it does not trust the declared size, so a
 *     lying header can't turn into a zip bomb.
 * Nothing is written to disk, nothing is executed, symlink entries are just
 * bytes (we never materialise a filesystem).
 */
import { Unzip, UnzipInflate, UnzipPassThrough, strFromU8 } from 'fflate';
import type { ArchiveReader } from '../../modules/skills/ports.js';
import type { ArchiveEntryMeta } from '../../modules/skills/import-parser.js';

function unzipper(): Unzip {
  const u = new Unzip();
  u.register(UnzipInflate);
  u.register(UnzipPassThrough);
  return u;
}

export class FflateZipReader implements ArchiveReader {
  list(bytes: Uint8Array): ArchiveEntryMeta[] {
    const entries: ArchiveEntryMeta[] = [];
    const u = unzipper();
    u.onfile = (file) => {
      entries.push({ path: file.name, size: file.originalSize ?? file.size ?? 0 });
    };
    u.push(bytes, true);
    if (entries.length === 0) throw new Error('not a zip archive, or it is empty');
    return entries;
  }

  readText(bytes: Uint8Array, path: string, maxBytes: number): string {
    const chunks: Uint8Array[] = [];
    let total = 0;
    let found = false;
    let done = false;
    let failure: Error | undefined;

    const u = unzipper();
    u.onfile = (file) => {
      if (found || file.name !== path) return; // never started → never inflated
      found = true;
      file.ondata = (err, chunk, final) => {
        if (failure) return;
        if (err) {
          failure = err;
          return;
        }
        total += chunk.length;
        if (total > maxBytes) {
          failure = new Error(`entry exceeds ${maxBytes} bytes`);
          file.terminate();
          return;
        }
        chunks.push(chunk);
        if (final) done = true;
      };
      file.start();
    };
    u.push(bytes, true);

    if (failure) throw failure;
    if (!found) throw new Error(`entry "${path}" not found`);
    if (!done) throw new Error(`entry "${path}" is truncated`);

    const out = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      out.set(c, off);
      off += c.length;
    }
    return strFromU8(out);
  }
}
