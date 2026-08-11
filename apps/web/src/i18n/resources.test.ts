import { describe, expect, it } from "vite-plus/test";

import { i18n } from "./i18n";
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
    expect(zhCN.settings.sourceControl.versionControl).toBe("版本控制");
    expect(zhCN.commandPalette.currentThread).toBe("当前任务");
    expect(zhCN.time.justNow).toBe("刚刚");
    expect(zhCN.providerOptions.reasoning.medium).toBe("中等");
    expect(zhCN.desktopUpdate.whatsChanged).toBe("更新内容");
    expect(zhCN.desktopUpdate.restartToUpdate).toBe("重启并更新");
    expect(zhCN.providerUpdate.dismissNotice).toBe("忽略模型服务更新提示");
    expect(zhCN.providerUpdate.updateFailed).toBe("模型服务更新失败");
  });

  it("formats sidebar counts in both supported languages", () => {
    const tEn = i18n.getFixedT("en");
    const tZh = i18n.getFixedT("zh-CN");

    expect(tEn("sidebar.attachmentCount", { count: 1 })).toBe("1 attachment");
    expect(tEn("sidebar.attachmentCount", { count: 2 })).toBe("2 attachments");
    expect(tZh("sidebar.terminalProcessCount", { count: 2 })).toBe("2 个终端进程正在运行");
  });
});
