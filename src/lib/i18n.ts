/**
 * i18n 统一入口。
 *
 * 语言由浏览器界面语言（chrome.i18n.getUILanguage）自动决定：
 * Chrome 会按 当前语言 → 语言主码 → default_locale 的顺序在 _locales 中查找，
 * 业务代码不需要自己判断语言。
 *
 * 带变量的消息必须在 messages.json 的 placeholders 中声明（$1/$2...），
 * 本函数把命名参数对象按传入顺序转成 getMessage 需要的位置参数数组。
 * 例如消息 "错误: $msg$" + t("action_error_prefix", { MSG: "x" })。
 * 注意：多参数时，对象键的传入顺序要与 placeholders 中 $1、$2 的声明顺序一致。
 */

export function t(key: string, params?: Record<string, string | number>): string {
  const substitutions = params ? Object.values(params).map((v) => String(v)) : undefined
  const message = chrome.i18n.getMessage(key, substitutions)
  // 语言包缺 key 时回退为 key 本身，而不是展示空串
  return message || key
}

/** 当前浏览器界面语言，如 "zh-CN"、"en-US" */
export function currentLocale(): string {
  return chrome.i18n.getUILanguage()
}
