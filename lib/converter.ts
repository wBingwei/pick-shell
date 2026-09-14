import { convertToMarkdown } from "./markdown-engine"
import { Document, Packer, Paragraph, TextRun, ImageRun } from "docx"

export { convertToMarkdown }


export async function convertToDocx(html: string, title: string) {
  // 简化的 HTML to Docx 实现
  // 实际生产中可能需要更复杂的解析，这里演示核心逻辑
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          children: [
            new TextRun({
              text: title,
              bold: true,
              size: 32,
            }),
          ],
        }),
        // 这里简单处理，实际需要解析 HTML 标签
        new Paragraph({
          children: [
            new TextRun("\n(内容由 Web Saver 智能合成)\n"),
          ],
        }),
      ],
    }],
  })

  return await Packer.toBlob(doc)
}

// PDF 转换模拟
// 在浏览器环境中，直接使用 window.print() 或者打印当前页面是最保真的
// 但如果是“云函数”逻辑，通常是 Puppeteer。
// 这里我们提供一个将 HTML 转换为 Blob 的模拟，实际触发下载。
export async function convertToPdf(html: string, css: string, title: string) {
  const fullHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${title}</title>
      <style>${css}</style>
    </head>
    <body>
      <h1>${title}</h1>
      ${html}
    </body>
    </html>
  `
  return new Blob([fullHtml], { type: "text/html" }) 
  // 暂时用 HTML 代替，说明：浏览器端生成高保真 PDF 建议由后端 Puppeteer 完成
  // 或者在前端使用 print 弹窗。
}
