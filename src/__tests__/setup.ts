import { vi, beforeEach } from "vitest"
import zhMessages from "../../locales/zh_CN/messages.json"

// Vitest 下没有 chrome 全局，这里补齐最小可用 mock。
// 各测试文件可以按需 vi.stubGlobal("chrome", {...}) 覆盖具体行为。

const storageLocal: Record<string, unknown> = {}

export const chromeMock = {
  // 用真实 zh_CN 语言包支撑 getMessage；故意不用 vi.fn，避免被 resetAllMocks 清空
  i18n: {
    getMessage: (key: string) => (zhMessages as Record<string, { message: string }>)[key]?.message ?? "",
    getUILanguage: () => "zh-CN"
  },
  runtime: {
    getManifest: vi.fn(() => ({ content_scripts: [] })),
    sendMessage: vi.fn(),
    getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn()
    },
    onInstalled: {
      addListener: vi.fn()
    }
  },
  tabs: {
    sendMessage: vi.fn(),
    create: vi.fn(),
    query: vi.fn(() => Promise.resolve([{ id: 1, url: "https://example.com", title: "Example" }])),
    getCurrent: vi.fn(() => Promise.resolve({ id: 99 })),
    remove: vi.fn()
  },
  storage: {
    local: {
      get: vi.fn((keys: string | string[] | Record<string, unknown>) => {
        const result: Record<string, unknown> = {}
        const list = Array.isArray(keys) ? keys : typeof keys === "string" ? [keys] : Object.keys(keys)
        list.forEach((k) => {
          if (k in storageLocal) result[k] = storageLocal[k]
        })
        return Promise.resolve(result)
      }),
      set: vi.fn((items: Record<string, unknown>) => {
        Object.assign(storageLocal, items)
        return Promise.resolve()
      }),
      remove: vi.fn((keys: string | string[]) => {
        const list = Array.isArray(keys) ? keys : [keys]
        list.forEach((k) => delete storageLocal[k])
        return Promise.resolve()
      })
    }
  },
  scripting: {
    executeScript: vi.fn()
  },
  windows: {
    create: vi.fn(() => Promise.resolve({ id: 1 })),
    update: vi.fn(() => Promise.resolve())
  },
  downloads: {
    download: vi.fn(() => Promise.resolve(1))
  },
  action: {
    setBadgeText: vi.fn(),
    setBadgeBackgroundColor: vi.fn()
  },
  sidePanel: {
    setPanelBehavior: vi.fn(() => Promise.resolve())
  },
  contextMenus: {
    create: vi.fn(),
    onClicked: {
      addListener: vi.fn()
    }
  }
}

// 在每个测试前重置 mock，避免跨用例污染
beforeEach(() => {
  vi.resetAllMocks()
  Object.keys(storageLocal).forEach((k) => delete storageLocal[k])
})

// 注入全局
vi.stubGlobal("chrome", chromeMock)
