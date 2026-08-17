import type { OrchestrationThread } from "@t3tools/contracts";

type ZipEntry = {
  readonly name: string;
  readonly contents: string;
};

const textEncoder = new TextEncoder();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

function writeUint32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
}

function concatBytes(parts: ReadonlyArray<Uint8Array>): Uint8Array {
  const result = new Uint8Array(parts.reduce((size, part) => size + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

export function buildStoredZip(entries: ReadonlyArray<ZipEntry>): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = textEncoder.encode(entry.name);
    const contents = textEncoder.encode(entry.contents);
    const checksum = crc32(contents);

    const localHeader = new Uint8Array(30);
    const localView = new DataView(localHeader.buffer);
    writeUint32(localView, 0, 0x04034b50);
    writeUint16(localView, 4, 20);
    writeUint16(localView, 6, 0x0800);
    writeUint32(localView, 14, checksum);
    writeUint32(localView, 18, contents.byteLength);
    writeUint32(localView, 22, contents.byteLength);
    writeUint16(localView, 26, name.byteLength);
    localParts.push(localHeader, name, contents);

    const centralHeader = new Uint8Array(46);
    const centralView = new DataView(centralHeader.buffer);
    writeUint32(centralView, 0, 0x02014b50);
    writeUint16(centralView, 4, 20);
    writeUint16(centralView, 6, 20);
    writeUint16(centralView, 8, 0x0800);
    writeUint32(centralView, 16, checksum);
    writeUint32(centralView, 20, contents.byteLength);
    writeUint32(centralView, 24, contents.byteLength);
    writeUint16(centralView, 28, name.byteLength);
    writeUint32(centralView, 42, localOffset);
    centralParts.push(centralHeader, name);

    localOffset += localHeader.byteLength + name.byteLength + contents.byteLength;
  }

  const centralDirectory = concatBytes(centralParts);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  writeUint32(endView, 0, 0x06054b50);
  writeUint16(endView, 8, entries.length);
  writeUint16(endView, 10, entries.length);
  writeUint32(endView, 12, centralDirectory.byteLength);
  writeUint32(endView, 16, localOffset);

  return concatBytes([...localParts, centralDirectory, end]);
}

function escapeMarkdownHeading(text: string): string {
  return text.replace(/[\r\n]+/g, " ").trim();
}

export function buildThreadTranscriptMarkdown(thread: OrchestrationThread): string {
  const sections = [`# ${escapeMarkdownHeading(thread.title) || "T3 Code thread"}`];
  for (const message of thread.messages) {
    const role = message.role === "assistant" ? "Assistant" : "User";
    sections.push(`## ${role}\n\n${message.text.trim()}`);
  }
  return `${sections.join("\n\n")}\n`;
}

export function buildThreadExportArchive(thread: OrchestrationThread): Uint8Array {
  return buildStoredZip([
    { name: "thread.json", contents: `${JSON.stringify(thread, null, 2)}\n` },
    { name: "transcript.md", contents: buildThreadTranscriptMarkdown(thread) },
  ]);
}

export function downloadThreadExport(thread: OrchestrationThread): void {
  const archive = buildThreadExportArchive(thread);
  const bytes = archive.buffer.slice(
    archive.byteOffset,
    archive.byteOffset + archive.byteLength,
  ) as ArrayBuffer;
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `t3-code-thread-${thread.id}.zip`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
