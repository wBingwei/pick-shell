# 拾贝

一款浏览器扩展，把网页内容保存为 **Markdown** 或 **PDF**。支持跨网页暂存多个片段、手动选区采集、以及虚拟滚动列表的深度抓取。

所有转换在浏览器本地完成，内容不出本机。

## 功能

- **正文自动提取** — 基于 [Readability.js](https://github.com/mozilla/readability) 剔除导航、广告、侧栏
- **手动选区模式** — 鼠标指向 + 键盘快捷键选段，支持连选多个片段
- **虚拟列表深度采集** — 自动检测无限滚动页面，滚动抓取全部条目
- **暂存篮** — 跨页面暂存片段，支持拖拽排序、编辑 Markdown、片段预览
- **Markdown 导出** — Turndown + GFM（表格、任务列表、删除线）、代码块语言识别、YAML Front Matter
- **PDF 导出** — 本地打印页 + 主题 CSS，浏览器原生打印管线渲染（可选中、可搜索）
- **图片处理** — 自动识别懒加载图（`data-src` 等），转 Base64 内联，大图压缩到 1200px
- **右键菜单** — 选中文字后直接导出

## 技术栈

| 层 | 技术 |
|---|---|
| 扩展框架 | [Plasmo](https://www.plasmo.com/) 0.90 |
| UI | React 18 + TypeScript |
| 正文提取 | @mozilla/readability |
| HTML → Markdown | turndown + turndown-plugin-gfm |
| Markdown → HTML | marked |

## 项目结构

```
src/
├── background.ts         # 后台脚本：右键菜单、跨域取图
├── content.ts            # 内容脚本：消息路由
├── sidepanel.tsx         # 侧边栏主界面（暂存篮、导出）
├── tabs/
│   ├── editor.tsx        # 片段 Markdown 编辑器（独立窗口）
│   └── print.tsx         # PDF 打印页
├── lib/
│   ├── extractor.ts      # 正文提取
│   ├── deep-capture.ts   # 虚拟列表检测 & 深度抓取
│   ├── smart-pick.ts     # 手动选区交互
│   ├── image-processor.ts# 图片 Base64 内联
│   ├── markdown-engine.ts# Markdown 转换引擎
│   ├── print-pdf.ts      # PDF 打印页调度
│   ├── messaging.ts      # 带动态注入兜底的消息封装
│   ├── basket.ts         # 暂存篮存储 & 编辑器调度
│   └── utils.ts          # 工具函数
├── popup/hooks/
│   └── useContentAction.ts
├── styles/modern.css     # PDF 主题 CSS（极简风格）
└── assets/               # 图标
```

## 开发 & 构建

```bash
# 安装依赖
npm install

# 开发模式（自动热更新）
npm run dev

# 构建产物
npm run build

# 打包成 zip（可直接上传到 Chrome Web Store）
npm run package
```

开发时，浏览器里需要加载未打包的扩展。`npm run dev` 会在 `.plasmo/dev/` 下生成 `manifest.json`，打开 `chrome://extensions` → 开发者模式 → 加载已解压的扩展 → 选那个目录即可。

## 权限

| 权限 | 用途 |
|---|---|
| `activeTab` | 获取当前标签页 |
| `storage` / `unlimitedStorage` | 暂存篮持久化（大文档含 Base64 图片会超过默认 5MB） |
| `downloads` | Markdown 文件下载 |
| `scripting` | 动态注入内容脚本（扩展更新后页面未刷新时兜底） |
| `contextMenus` | 右键菜单：选中文字导出 |
| `sidePanel` | 侧边栏界面 |
| `<all_urls>` | 在任意网页上运行内容脚本 |
