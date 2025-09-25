# Edge Browser Plugin

这是一个使用 Vite + React 开发的现代 Edge 浏览器插件模板。

## 功能特性

- ✅ 使用 React 18 + Vite 4 构建
- ✅ Manifest V3 支持
- ✅ 热重载开发环境
- ✅ Popup 弹窗界面
- ✅ Options 设置页面
- ✅ Background Script (Service Worker)
- ✅ Content Script 内容脚本
- ✅ Chrome Storage API 数据存储
- ✅ 响应式设计，支持明暗主题

## 项目结构

```
edge-plugin/
├── public/
│   ├── manifest.json          # 插件清单文件
│   └── icons/                 # 插件图标
├── src/
│   ├── popup/                 # 弹窗组件
│   │   ├── popup.jsx
│   │   ├── PopupApp.jsx
│   │   └── popup.css
│   ├── options/               # 设置页面组件
│   │   ├── options.jsx
│   │   ├── OptionsApp.jsx
│   │   └── options.css
│   ├── background/            # 后台脚本
│   │   └── background.js
│   └── content/               # 内容脚本
│       └── content.js
├── popup.html                 # 弹窗 HTML
├── options.html               # 设置页面 HTML
├── vite.config.js             # Vite 配置
└── package.json
```

## 开发指南

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 构建生产版本

```bash
npm run build
```

构建完成后，`dist` 文件夹将包含可以加载到 Edge 浏览器的插件文件。

### 在 Edge 浏览器中测试

1. 打开 Edge 浏览器
2. 导航到 `edge://extensions/`
3. 开启"开发人员模式"
4. 点击"加载解压缩的扩展"
5. 选择项目的 `dist` 文件夹

## 插件功能说明

### Popup 弹窗
- 显示当前标签页标题
- 计数器功能（使用 Chrome Storage API）
- 响应式界面设计

### Options 设置页面
- 插件基本设置配置
- 主题切换选项
- 通知开关设置

### Background Script
- 插件安装和卸载处理
- 消息监听和处理
- 标签页事件监听

### Content Script
- 在网页中注入浮动按钮
- 与后台脚本通信
- 页面信息收集

## 开发技巧

1. **热重载**: 开发模式下支持热重载，修改代码后自动更新
2. **调试**: 使用 Chrome DevTools 调试各个组件
3. **存储**: 使用 `chrome.storage.sync` API 在不同设备间同步数据
4. **权限**: 在 `manifest.json` 中配置所需权限

## 部署发布

1. 运行 `npm run build` 构建生产版本
2. 将 `dist` 文件夹打包为 ZIP 文件
3. 上传到 Microsoft Edge Add-ons 商店

## 许可证

MIT License