// 图片转 Base64 并在 Canvas 中压缩
async function imageToBase64(img: HTMLImageElement, maxWidth = 1200): Promise<string> {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    
    let width = img.naturalWidth
    let height = img.naturalHeight

    if (width > maxWidth) {
      height = (maxWidth / width) * height
      width = maxWidth
    }

    canvas.width = width
    canvas.height = height

    ctx.drawImage(img, 0, 0, width, height)
    resolve(canvas.toDataURL("image/jpeg", 0.8))
  })
}

export function hydrateLazyImages(root: HTMLElement | Document) {
  const imgs = root.querySelectorAll("img")
  imgs.forEach((img) => {
    const dataSrc = img.getAttribute("data-src") || img.getAttribute("data-original") || img.getAttribute("data-lazy-src")
    if (!img.getAttribute("src") && dataSrc) img.setAttribute("src", dataSrc)
  })
}

// 处理 HTML 片段中的图片转 Base64
export async function processHtmlImages(html: string): Promise<string> {
  const div = document.createElement("div")
  div.innerHTML = html
  hydrateLazyImages(div)
  const images = div.querySelectorAll("img")
  
  const promises = Array.from(images).map(async (img) => {
    const originalSrc = img.getAttribute("src")
    if (!originalSrc || originalSrc.startsWith("data:")) return

    try {
      const response = await chrome.runtime.sendMessage({
        type: "FETCH_IMAGE_BLOB",
        url: originalSrc
      })

      if (response.error) throw new Error(response.error)

      const tempImg = new Image()
      tempImg.src = response.data
      await new Promise((res, rej) => {
        tempImg.onload = res
        tempImg.onerror = rej
      })
      
      const base64 = await imageToBase64(tempImg)
      img.setAttribute("src", base64)
      img.style.maxWidth = "100%"
      img.style.height = "auto"
    } catch (e) {
      console.warn("Failed to convert image to base64:", originalSrc, e)
    }
  })

  await Promise.all(promises)
  return div.innerHTML
}
