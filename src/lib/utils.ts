export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Chrome 永远不会向这些协议注入内容脚本
const RESTRICTED_PROTOCOLS = [
  "chrome:",
  "chrome-extension:",
  "chrome-untrusted:",
  "chrome-search:",
  "devtools:",
  "about:",
  "edge:",
  "view-source:"
]

// 扩展商店页面同样被 Chrome 屏蔽注入
const RESTRICTED_HOSTS = [
  "chrome.google.com/webstore",
  "chromewebstore.google.com"
]

/**
 * 判断当前地址是否属于无法注入内容脚本的页面。
 * 注意：file:// 不在此列，因为它取决于用户是否开启了「允许访问文件网址」。
 */
export function isRestrictedUrl(url?: string | null) {
  if (!url) return true
  if (RESTRICTED_PROTOCOLS.some((protocol) => url.startsWith(protocol))) return true
  return RESTRICTED_HOSTS.some((host) => url.includes(host))
}


export function isScrollable(el: HTMLElement) {
  const style = window.getComputedStyle(el)
  const overflowY = style.overflowY
  const canScroll = (overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight + 20
  return canScroll
}

export function simpleHash(input: string) {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i)
    hash |= 0
  }
  return hash.toString(16)
}
