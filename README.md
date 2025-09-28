# Network Console — Edge 插件（中文说明）

项目简介

Network Console 是一个为 Chromium / Microsoft Edge 浏览器设计的网络请求调试插件。它在浏览器中提供类似于 DevTools 网络面板的功能，支持捕获、查看、重放和导出网络请求；同时提供独立的 DevTools 面板、弹出窗口（popup）和设置页面。

插件地址: https://microsoftedge.microsoft.com/addons/detail/lgkemdinjnjaphnbkmmcnejbefeapkfd

作者：超大只番薯
项目主页：https://gitee.com/bigfanshu/NetworkConsole

主要特性

- 捕获来自页面的网络请求（使用 chrome.webRequest API）。
- 在 DevTools 面板或独立页面查看请求详情。
- 支持重发请求（Resend）。
- 支持按标签页过滤、按类型/状态搜索与筛选。
- 异步存储请求到 chrome.storage.local，并包含自动清理与内存优化策略。
- 插件包含 popup、options、devtools 页面以及 content script 与 background service worker。
- 国际化支持（_locales/en、_locales/zh_CN）。

仓库结构（重要文件）

- `public/manifest.json` - 浏览器扩展清单（用于生产/发布）。
- `NetworkConsole/manifest.json` - 与 `public/manifest.json` 内容类似（历史或输出目录副本）。
- `vite.config.js` - Vite 配置（注意：输出目录配置为 `NetworkConsole`）。
- `src/` - 源代码目录（background、content、devtools、popup、options 等）。
- `src/background/background.js` - 后台 service worker（实现了内存优化和请求管理逻辑）。
- `src/devtools/` - DevTools 面板源码（React + JSX）。
- `start-dev.bat` - 一个辅助脚本，用于在 Windows 上构建并提示如何加载扩展。

快速开始（开发环境）

先决条件

- Node.js（推荐 16+）和 npm 已安装。
- 推荐使用 Windows 下的 cmd 或 PowerShell（仓库提供 `start-dev.bat` 作为辅助脚本）。

安装依赖

```bash
npm install
```

本地开发（热重载）

Vite 提供开发服务器用于 UI 的热重载：

```bash
npm run dev
```

注意：由于浏览器扩展的特性（需要 manifest、service worker、content script 等），很多功能需要打包后作为扩展加载到浏览器中进行完整测试。开发模式下可以优先调试 React 界面与静态页面（popup/options/devtools），但是 webRequest 与 background 相关逻辑需要打包后在 Edge 中调试。

构建与加载扩展（发布 / 手动测试）

1. 运行构建：

```bash
npm run build
```

2. 构建输出目录说明：

- 当前 `vite.config.js` 将构建输出目录设置为 `NetworkConsole`（不是 `dist`）。请以构建后的 `NetworkConsole` 文件夹作为要加载到 Edge 的扩展目录。

3. 在 Edge 中加载扩展：

- 打开 edge://extensions/
- 打开右上角的“开发人员模式”
- 点击“加载已解压的扩展”或“加载扩展程序”
- 选择项目根目录下的 `NetworkConsole` 文件夹（即构建输出）

可用脚本（package.json）

- `npm run dev` - 启动 Vite 开发服务器
- `npm run build` - 生产构建（输出到 `NetworkConsole`）
- `npm run preview` - 预览构建内容（Vite preview）
- `npm run lint` - 运行 ESLint（检查 JS/JSX）

如何使用插件

- 点击工具栏图标打开 popup，从 popup 可以快速打开网络控制台面板。
- 在 DevTools 中会出现“Network Console”面板（manifest 中的 `devtools_page` 指向 `devtools-entry.html`）。
- 常用快捷键：manifest 中定义了一个命令（默认 Ctrl+Shift+N / Mac: Command+Shift+N）用于打开插件行为（取决于平台）。

调试与常见问题

- background/service worker 无法启动或不稳定：在 edge://extensions/ 中打开插件，点击“service worker（后台工作线程）”下的“检查视图”来查看 console 输出和错误。
- 修改了 manifest 或 background 代码后需要重新加载扩展（edge://extensions/ -> 点击刷新按钮）。
- 如果 webRequest 无法捕获请求，确认扩展已正确加载并且权限（`webRequest`, `host_permissions`）已授予。
- 控制台中输出了内存优化相关日志（background.js），用于帮助诊断请求缓存和清理行为。

实现细节与注意事项

- 插件使用 `chrome.webRequest` API 捕获请求，并在后台做了一系列内存和大小限制（例如响应体与请求体会被截断以防止占用过多内存）。
- 请求先缓存在内存（Map）中，到完成/失败时会存储到 `chrome.storage.local` 中并广播给 DevTools 页。
- 重发请求（Resend）功能使用 fetch 来重新发送捕获到的请求（注意跨域/认证等限制）。
- 权限请求较多（activeTab、storage、debugger、webRequest、scripting、tabs、clipboardWrite 等），打包发布到浏览器商店前请根据需求审查并最小化权限。

本地调试建议

- 在开发时，先通过 `npm run dev` 调试 React 组件和 UI，待 UI OK 后再运行 `npm run build` 在浏览器中测试完整功能（webRequest + background）。
- 使用 Edge 的扩展页面查看 service worker 日志和错误信息。

国际化

- 插件使用 `__MSG_*__` 占位符并放置 `_locales` 目录来实现中英文两种语言资源（`zh_CN` 与 `en`）。

许可与贡献

- 欢迎提交 issue 或 PR，描述清楚你的改动或问题。

更多资源

- 原项目/作者主页：https://gitee.com/bigfanshu/NetworkConsole

----

