import { describe, it, expect, afterEach } from "vitest"
import { hydrateLazyImages } from "../lib/image-processor"

afterEach(() => {
  document.body.innerHTML = ""
})

describe("hydrateLazyImages", () => {
  it("把 data-src 回填到 src", () => {
    const root = document.createElement("div")
    root.innerHTML = '<img data-src="https://cdn.test/a.jpg">'
    hydrateLazyImages(root)
    expect(root.querySelector("img")!.getAttribute("src")).toBe("https://cdn.test/a.jpg")
  })

  it("支持 data-original / data-lazy-src 两种懒加载约定", () => {
    const root = document.createElement("div")
    root.innerHTML =
      '<img data-original="o.png"><img data-lazy-src="l.png">'
    hydrateLazyImages(root)
    const imgs = root.querySelectorAll("img")
    expect(imgs[0].getAttribute("src")).toBe("o.png")
    expect(imgs[1].getAttribute("src")).toBe("l.png")
  })

  it("已有 src 的图片不被覆盖（懒加载完成后不回头改）", () => {
    const root = document.createElement("div")
    root.innerHTML = '<img src="real.png" data-src="placeholder.png">'
    hydrateLazyImages(root)
    expect(root.querySelector("img")!.getAttribute("src")).toBe("real.png")
  })

  it("data-src 优先于 data-original", () => {
    const root = document.createElement("div")
    root.innerHTML = '<img data-src="first.png" data-original="second.png">'
    hydrateLazyImages(root)
    expect(root.querySelector("img")!.getAttribute("src")).toBe("first.png")
  })

  it("接受 document 作为根节点", () => {
    document.body.innerHTML = '<img data-src="doc-level.png">'
    hydrateLazyImages(document)
    expect(document.querySelector("img")!.getAttribute("src")).toBe("doc-level.png")
  })

  it("没有图片时安全返回", () => {
    const root = document.createElement("div")
    root.innerHTML = "<p>纯文本</p>"
    expect(() => hydrateLazyImages(root)).not.toThrow()
  })
})
