import { Readability } from "@mozilla/readability"
import { getBestScrollableContainer, deepCaptureContainer } from "./deep-capture"
import { processHtmlImages } from "./image-processor"

export async function extractContent(format: string = "markdown", deepCapture: boolean = false) {
  if (deepCapture) {
    const container = getBestScrollableContainer(document.body)
    if (container) {
      const captured = await deepCaptureContainer(container)
      if (captured) {
        let content = `<div class="fp-deep-capture">${captured}</div>`
        if (format === "pdf") content = await processHtmlImages(content)
        return {
          title: document.title,
          content,
          excerpt: "",
          byline: "",
          siteName: ""
        }
      }
    }
  }

  const body = document.body
  const pre = body.querySelector("pre")
  const pageTitle = document.title || "Untitled Page"
  if (pre && body.children.length <= 3) {
    return {
      title: pageTitle,
      content: `<div>${pre.outerHTML}</div>`,
      excerpt: "",
      byline: "",
      siteName: ""
    }
  }

  let article: any = null
  try {
    const docClone = document.cloneNode(true) as Document
    article = new Readability(docClone).parse()
  } catch (e) {
    console.warn("Readability parsing failed on cloned doc, falling back to direct parse", e)
    try {
      const docElClone = document.documentElement.cloneNode(true) as HTMLElement
      const virtualDoc = document.implementation.createHTMLDocument(pageTitle)
      virtualDoc.replaceChild(virtualDoc.importNode(docElClone, true), virtualDoc.documentElement)
      article = new Readability(virtualDoc).parse()
    } catch (e2) {
      console.error("All extraction methods failed", e2)
    }
  }

  if (!article) {
    return {
      title: pageTitle,
      content: `<div>${document.body.innerHTML}</div>`,
      excerpt: "",
      byline: "",
      siteName: ""
    }
  }

  let content = article.content
  if (format === "pdf") {
    content = await processHtmlImages(content)
  }

  return {
    title: article.title || pageTitle,
    content: content,
    excerpt: article.excerpt || "",
    byline: article.byline || "",
    siteName: article.siteName || ""
  }
}
