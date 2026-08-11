import { describe, expect, it } from "vite-plus/test";

import { en, zhCN } from "./resources";

function resourceKeys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];

  return Object.entries(value).flatMap(([key, child]) =>
    resourceKeys(child, prefix.length > 0 ? `${prefix}.${key}` : key),
  );
}

describe("translation resources", () => {
  it("keeps English and Simplified Chinese keys aligned", () => {
    expect(resourceKeys(zhCN).sort()).toEqual(resourceKeys(en).sort());
  });

  it("contains translated primary actions", () => {
    expect(zhCN.chat.send).toBe("发送");
    expect(zhCN.sidebar.newThread).toBe("新建任务");
    expect(zhCN.settings.sections.general).toBe("通用");
    expect(zhCN.providerOptions.reasoning.medium).toBe("中等");
  });
});
