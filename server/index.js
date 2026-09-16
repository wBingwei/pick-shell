const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const bodyParser = require('body-parser');

const path = require('path');

const app = express();
const port = process.env.PORT || 5010;

const PUPPETEER_CACHE_DIR = path.join(__dirname, 'temp', 'puppeteer');

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' })); // 支持大体积 Base64

// 核心转换函数 - 易于迁移至云函数
async function generatePdf(html, css, title) {
    const browser = await puppeteer.launch({
        headless: "new",
        userDataDir: path.join(PUPPETEER_CACHE_DIR, 'user-data'),
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            `--disk-cache-dir=${path.join(PUPPETEER_CACHE_DIR, 'disk-cache')}`
        ]
    });

    const page = await browser.newPage();
    
    const fullHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>${title}</title>
            <style>${css}</style>
        </head>
        <body class="markdown-body">
            <h1>${title}</h1>
            ${html}
        </body>
        </html>
    `;

    await page.setContent(fullHtml, { waitUntil: 'networkidle0', timeout: 60000 });
    
    // 强制等待一下，确保所有 Base64 图片渲染完成
    await new Promise(r => setTimeout(r, 1000));

    // 模拟打印媒体类型
    await page.emulateMediaType('screen'); 
    
    // 注入 Google Fonts 和基础打印样式
    await page.addStyleTag({
        url: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Noto+Serif+SC:wght@400;700&display=swap'
    });

    const pdf = await page.pdf({
        format: 'A4',
        margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
        printBackground: true,
        timeout: 0 // 禁用超时，处理超长 PDF
    });

    await browser.close();
    return pdf;
}

app.post('/convert', async (req, res) => {
    const { html, css, title, format } = req.body;

    if (!html) {
        return res.status(400).send('Missing content (html)');
    }
    const finalTitle = title || 'Untitled';

    // Markdown 已改为插件前端本地转换（lib/markdown-engine.ts），后端只负责 PDF
    if (format && format !== 'pdf') {
        return res.status(400).send(`Unsupported format: backend only handles "pdf" (got "${format}")`);
    }

    try {
        const pdfBuffer = await generatePdf(html, css, finalTitle);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Length', pdfBuffer.length);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(finalTitle)}.pdf"`);
        return res.end(pdfBuffer, 'binary');
    } catch (error) {
        console.error('Conversion error:', error);
        res.status(500).send('Internal Server Error: ' + error.message);
    }
});

app.listen(port, () => {
    console.log(`WebScribe Backend running at http://localhost:${port}`);
});
