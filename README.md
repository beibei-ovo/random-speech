# 言之有物 · 随机演讲训练器

基于费曼学习法的 Windows Electron 桌面应用。随机选题，查资料 10 分钟、整理 5 分钟，再录制最多 2 分钟的演讲，通过转写和反馈复盘。

## 开发与运行

使用 Node.js 24 与 npm，Windows x64。依赖的精确版本保存在 `package-lock.json`。

```powershell
npm ci
npm run dev
```

Electron 下载连接失败时，可以为安装命令配置镜像：

```powershell
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
$env:npm_config_better_sqlite3_binary_host_mirror='https://npmmirror.com/mirrors/better-sqlite3'
npm ci
```

SQLite 为 Electron 原生模块。更新 Electron 后执行 `npx electron-builder install-app-deps`；不要用普通 Node 直接加载已为 Electron 重建的 SQLite 模块。

## 使用方式

1. 首页抽取并锁定主题，自动开始准备计时。提纲自动保存，悬浮窗跨应用置顶。
2. 两个准备阶段可暂停、继续或提前完成。准备完成后，点击录音才请求麦克风。
3. 回听录音后确认提交。默认离线演示不上传内容；演示转写与反馈不是实际评价。
4. 需要真实 AI 时，在“服务与设置”中选择云端服务，填写支持 WebM/Opus 的转写服务及 JSON 文字分析兼容接口、模型、接收方和留存说明，再配置自己的 API Key。
5. 可校正转写并重新分析，也可补充提纲后同题再讲。历史保留各次演讲及所有转写、反馈版本。

| 功能 | 保存与行为 |
| --- | --- |
| 计时 | 主进程单调时钟；休眠暂停；重启恢复为暂停，快照误差约 5 秒以内 |
| 录音 | WebM/Opus 顺序分块写入本地；结束落盘后才显示可提交 |
| AI | 默认离线演示；云端必须由用户配置，提交前确认上传；格式修复最多一次 |
| 密钥 | 主进程使用系统加密，无法加密时只保存在会话内 |
| 数据 | Electron userData 下的 training 目录；SQLite 元数据和独立音频文件 |
| 删除 | 清除本机记录、音频、版本、任务、关联事件；不代表第三方删除留存 |

活跃训练时关闭主窗口会隐藏到托盘；从托盘恢复或选择退出。系统静音、独占全屏、安全桌面不保证提醒声音和悬浮显示。

## 检查与打包

```powershell
npm test
npm run test:integration
npm run test:docs
npm run test:e2e
npm run package
```

单测使用可注入时钟；集成测试在 Electron 自带 Node 中实际访问 SQLite；桌面测试使用隔离临时数据、Chromium 测试音频和明确标注的演示 Provider，不发送付费请求。

NSIS 安装包输出到 `release/`。当前属于个人验证版本，未配置公共服务额度和代码签名。真实中文识别效果、所选服务的费用与留存，以及真机休眠、拔出设备和新机器安装仍需要专项验收。

产品依据见 [产品设计](docs/product-design.md) 和 [技术方案](docs/technical-design.md)，实现与验证说明见 [实施记录](docs/implementation.md)。
