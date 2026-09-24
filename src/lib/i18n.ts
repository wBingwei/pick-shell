/**
 * i18n 统一入口。
 *
 * 语言由浏览器界面语言（chrome.i18n.getUILanguage）自动决定：
 * Chrome 会按 当前语言 → 语言主码 → default_locale 的顺序在 _locales 中查找，
 * 业务代码不需要自己判断语言。
 *
 * 语言包里的变量占位符统一写成 $NAME$（messages.json 无需再声明 placeholders），
 * 调用方式：t("pick_multi_count", { COUNT: 3 })
 */

export function t(key: string, params?: Record<string, string | number>): string {
  let message = chrome.i18n.getMessage(key)
  if (!message) {
    // 语言包缺 key 时回退为 key 本身，而不是展示空串
    return key
  }
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      message = message.split(`$${name}$`).join(String(value))
    }
  }
  return message
}

/** 当前浏览器界面语言，如 "zh-CN"、"en-US" */
export function currentLocale(): string {
  return chrome.i18n.getUILanguage()
}
