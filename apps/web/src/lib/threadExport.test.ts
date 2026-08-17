import { describe, expect, it } from "vite-plus/test";

import { buildStoredZip } from "./threadExport";

describe("buildStoredZip", () => {
  it("writes a valid stored ZIP directory with UTF-8 entry names", () => {
    const archive = buildStoredZip([
      { name: "thread.json", contents: '{"ok":true}\n' },
      { name: "transcript.md", contents: "# 会话\n" },
    ]);
    const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
    const decoded = new TextDecoder().decode(archive);

    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint32(archive.byteLength - 22, true)).toBe(0x06054b50);
    expect(view.getUint16(archive.byteLength - 12, true)).toBe(2);
    expect(decoded).toContain("thread.json");
    expect(decoded).toContain("transcript.md");
    expect(decoded).toContain("# 会话");
  });
});
