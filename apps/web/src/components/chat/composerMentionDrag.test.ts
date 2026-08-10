import { describe, expect, it } from "@effect/vitest";

import {
  COMPOSER_MENTION_DRAG_TYPE,
  type ComposerMentionDropHost,
  composerMentionFromTreePath,
  dataTransferHasComposerMention,
  desktopHostCanReadEnvironmentPaths,
  makeComposerMentionDragHandlers,
  partitionComposerFileDrop,
} from "./composerMentionDrag.ts";

const makeDragEvent = (options?: { mention?: string; types?: ReadonlyArray<string> }) => {
  const mention = options?.mention ?? "[index.md](docs/index.md)";
  const calls: Array<string> = [];
  const event = {
    dataTransfer: {
      types: options?.types ?? [COMPOSER_MENTION_DRAG_TYPE, "text/plain"],
      getData: (format: string) => (format === COMPOSER_MENTION_DRAG_TYPE ? mention : ""),
      dropEffect: "none",
    },
    nativeEvent: {
      stopPropagation: () => void calls.push("nativeStopPropagation"),
    },
    preventDefault: () => void calls.push("preventDefault"),
    stopPropagation: () => void calls.push("stopPropagation"),
  };
  return { event, calls };
};

const makeHost = (insertResult = true) => {
  const log: Array<string> = [];
  const host: ComposerMentionDropHost = {
    insertMentionAtEnd: (text) => {
      log.push(`insert:${text}`);
      return insertResult;
    },
    setDragActive: (active) => void log.push(`active:${active}`),
    onInsertRejected: () => void log.push("rejected"),
  };
  return { host, log };
};

describe("composerMentionFromTreePath", () => {
  it("serializes a file path into a mention", () => {
    expect(composerMentionFromTreePath("docs/index.md")).toBe("[index.md](docs/index.md)");
  });

  it("strips the trailing slash directory rows carry", () => {
    expect(composerMentionFromTreePath("docs/architecture/")).toBe(
      "[architecture](docs/architecture)",
    );
  });

  it("rejects drags that carry no path", () => {
    expect(composerMentionFromTreePath("")).toBeNull();
    expect(composerMentionFromTreePath("/")).toBeNull();
  });
});

describe("dataTransferHasComposerMention", () => {
  it("detects the mention payload among drag types", () => {
    expect(dataTransferHasComposerMention([COMPOSER_MENTION_DRAG_TYPE, "text/plain"])).toBe(true);
    expect(dataTransferHasComposerMention(["Files"])).toBe(false);
    expect(dataTransferHasComposerMention([])).toBe(false);
  });
});

describe("desktopHostCanReadEnvironmentPaths", () => {
  it.each([
    ["darwin", "MacIntel", true],
    ["windows", "Win32", true],
    ["linux", "Linux x86_64", true],
    ["linux", "Win32", false],
    ["unknown", "MacIntel", false],
    [null, "MacIntel", false],
  ] as const)("maps %s on %s to %s", (environmentOs, desktopPlatform, expected) => {
    expect(desktopHostCanReadEnvironmentPaths(environmentOs, desktopPlatform)).toBe(expected);
  });
});

describe("partitionComposerFileDrop", () => {
  const image = { name: "reference.png", type: "image/png" };
  const file = { name: "notes.txt", type: "text/plain" };
  const directory = { name: "家教", type: "" };

  it("keeps images on the attachment path and turns Finder paths into mentions", () => {
    const paths = new Map([
      [file, "/Users/test/notes.txt"],
      [directory, "/Users/test/家教/"],
    ]);

    const result = partitionComposerFileDrop(
      [image, file, directory],
      (item) => paths.get(item) ?? null,
    );

    expect(result.attachmentFiles).toEqual([image]);
    expect(result.mentionText).toBe(
      "[notes.txt](/Users/test/notes.txt) [家教](/Users/test/%E5%AE%B6%E6%95%99) ",
    );
  });

  it("leaves unresolved files on the existing unsupported-file path", () => {
    const result = partitionComposerFileDrop([file], () => null);

    expect(result.attachmentFiles).toEqual([file]);
    expect(result.mentionText).toBe("");
  });

  it("does not let a host path lookup failure break the drop", () => {
    const result = partitionComposerFileDrop([file], () => {
      throw new Error("not backed by a host file");
    });

    expect(result.attachmentFiles).toEqual([file]);
    expect(result.mentionText).toBe("");
  });

  it("deduplicates host paths while preserving their first-seen order", () => {
    const duplicate = { name: "notes.txt", type: "text/plain" };
    const result = partitionComposerFileDrop([file, directory, duplicate], (item) =>
      item === directory ? "/Users/test/家教" : "/Users/test/notes.txt",
    );

    expect(result.attachmentFiles).toEqual([]);
    expect(result.mentionText).toBe(
      "[notes.txt](/Users/test/notes.txt) [家教](/Users/test/%E5%AE%B6%E6%95%99) ",
    );
  });
});

describe("makeComposerMentionDragHandlers", () => {
  it("leaves drags without the mention payload alone", () => {
    const { host, log } = makeHost();
    const handlers = makeComposerMentionDragHandlers(host);
    const { event, calls } = makeDragEvent({ types: ["Files"] });
    handlers.onDragEnter(event);
    handlers.onDragOver(event);
    handlers.onDrop(event);
    expect(calls).toEqual([]);
    expect(log).toEqual([]);
  });

  it("stops the native event too, not just the synthetic one", () => {
    // React's stopPropagation only halts synthetic dispatch; without the
    // native stop, the editor's own DOM listeners process the drop and sync
    // their stale state back over the inserted mention.
    const { host } = makeHost();
    const handlers = makeComposerMentionDragHandlers(host);
    const { event, calls } = makeDragEvent();
    handlers.onDrop(event);
    expect(calls).toContain("preventDefault");
    expect(calls).toContain("stopPropagation");
    expect(calls).toContain("nativeStopPropagation");
  });

  it('answers dragover with the "move" effect the tree allows', () => {
    // Naming an effect outside the source's effectAllowed makes the browser
    // cancel the drop without ever firing it.
    const { host } = makeHost();
    const handlers = makeComposerMentionDragHandlers(host);
    const { event } = makeDragEvent();
    handlers.onDragOver(event);
    expect(event.dataTransfer.dropEffect).toBe("move");
  });

  it("inserts the mention with its trailing space and clears the highlight", () => {
    const { host, log } = makeHost();
    const handlers = makeComposerMentionDragHandlers(host);
    handlers.onDragEnter(makeDragEvent().event);
    handlers.onDrop(makeDragEvent().event);
    expect(log).toEqual(["active:true", "active:false", "insert:[index.md](docs/index.md) "]);
  });

  it("reports a rejected insert instead of failing silently", () => {
    const { host, log } = makeHost(false);
    const handlers = makeComposerMentionDragHandlers(host);
    handlers.onDrop(makeDragEvent().event);
    expect(log).toContain("rejected");
  });

  it("ignores a drop whose payload is empty", () => {
    const { host, log } = makeHost();
    const handlers = makeComposerMentionDragHandlers(host);
    handlers.onDrop(makeDragEvent({ mention: "" }).event);
    expect(log).toEqual(["active:false"]);
  });
});
