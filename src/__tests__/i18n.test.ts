import { describe, it, expect } from "vitest"
import { t, currentLocale } from "../lib/i18n"

describe("i18n t()", () => {
  it("普通 key 返回中文文案（测试环境固定 zh_CN）", () => {
    expect(t("btn_export")).toBe("导出")
    expect(t("mode_auto")).toBe("整页提取")
  })

  it("缺失的 key 回退为 key 本身", () => {
    expect(t("not_exist_key_xyz")).toBe("not_exist_key_xyz")
  })

  it("单个占位符被替换", () => {
    expect(t("action_error_prefix", { MSG: "网络断开" })).toBe("错误: 网络断开")
    expect(t("pick_added_notice", { COUNT: 3 })).toBe("已加入暂存（3 个片段）")
  })

  it("数字参数自动转字符串", () => {
    expect(t("composed_title", { DATE: "2026/9/24" })).toBe("拾贝 合成文档 - 2026/9/24")
  })

  it("多个占位符按顺序替换", () => {
    expect(t("editor_char_line", { CHARS: 120, LINES: 8 })).toBe("120 字 · 8 行")
  })

  it("currentLocale 返回浏览器语言码", () => {
    expect(currentLocale()).toBe("zh-CN")
  })
})
