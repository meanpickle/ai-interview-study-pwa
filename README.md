# AI 面试学习台 · Android / PWA

面向大模型、机器学习与 Agent 面试复习的本地优先学习工具。安卓与桌面浏览器均可使用，支持添加到主屏幕、离线阅读、断点续读、每日签到和学习记录迁移。

**在线入口：[打开学习台](https://meanpickle.github.io/ai-interview-study-pwa/)**

## 在安卓手机上使用

1. 用安卓 Chrome 或 Edge 打开上面的 HTTPS 网页。
2. 在浏览器菜单选择“安装应用”或“添加到主屏幕”。也可在应用“备份与设置”中查看安装入口；具体入口由浏览器决定。
3. 点击资料库中的文章：正文直接从原始 GitHub 获取，成功保存后可离线阅读。
4. 点击顶部“离线”，可以下载某个仓库的正文，或导入自己持有的 `.study-pack.json` 资料包。
5. 第一次联网打开并准备好离线页面后，已缓存的正文、笔记、签到和公式组件均可在断网后继续使用。

这不是 APK，也不要求在手机上运行 Windows EXE、Python 或 Node。它是可安装的 PWA 网页应用。没有安装能力的浏览器仍可作为普通网页使用。

## 功能

- 9 个原始资料仓库的文件目录，可按仓库、标题和路径筛选。
- 在线按需获取正文；IndexedDB 缓存正文与本机学习记录。
- 阅读章节、章节内偏移和滚动比例保存；首页继续上次阅读。
- 每篇笔记、已学状态、学习计时、每日复盘。
- 每日幂等签到、连续签到天数、26 周热力图、学习日历。
- 兼容旧版 Windows 学习台 v1 JSON 记录，支持备份、恢复、撤销导入。
- Markdown、代码高亮与 KaTeX 公式离线组件。
- 手机底部导航与笔记弹窗，支持带子目录的静态托管。

## 资料、隐私与许可证边界

**本仓库不包含第三方面试资料全文、原仓库镜像、私人正文包或个人笔记。**

`web/catalog.json` 仅包含仓库链接、分类及文件路径/文件名索引。文件目录以 2026-10-22 的本地整理为基础，共 918 个可阅读文件；文件数不等于面试题数，原仓库结构之后可能变化。

正文由你的浏览器直接从原始 `raw.githubusercontent.com` 获取，或由你自行导入。GitHub Pages 不接收、不托管你下载的正文或学习记录。学习记录没有账号登录或自动跨设备云同步，迁移通过本地 JSON 文件完成。

第三方资料及其图片、代码仍适用原作者的许可证和使用要求。本应用的 MIT 许可证只覆盖原创应用代码，不为这些资料重新授权。下载功能不代表所有原始内容均可再次分发；请在复用或再分发前查看原仓库说明。

资料缓存可从应用内清除，清除正文不删除笔记和签到。清理浏览器站点数据、重置手机或更换域名会影响本地记录，重要笔记请定期导出。应用提供持久存储申请，但是否批准由浏览器决定。

图片只在在线阅读时按需缓存；正文资料包不包含图片。外部博客、视频和未缓存图片需要联网。安装图标与离线功能需要 HTTPS 或 localhost；不能依赖直接双击 `file://` 文件获得完整 PWA 功能。

## 从 Windows 迁移学习记录

1. 旧版 Windows 学习台 → “备份与设置” → “导出学习记录”。
2. 把生成的 JSON 文件传到手机。
3. 手机学习台 → 顶部齿轮 → “导入记录”。
4. 阅读位置、笔记、签到和每日复盘一起导入；导入前会在设备数据库保留一份旧记录，可用“撤销上次导入”恢复。

**学习记录备份与正文包是两种独立文件**：前者不含正文，后者不修改学习记录。

## 获取自己的离线正文包

先查看原始资料仓库的使用要求，然后在电脑运行：

```bash
python tools/download-content.py --repo wdndev/llm_interview_note
# 或分别下载全部九个资料源：
python tools/download-content.py --repo all
```

生成文件默认放在已被 `.gitignore` 排除的 `content-packs/` 中。脚本只从原始 GitHub 下载公开索引对应的正文，不上传文件，也不使用 GitHub 密钥。原站暂时无法访问时可稍后重试；下载失败清单单独保存。

如果已经持有 Windows 资料目录，也可以生成本地包：

```bash
python tools/prepare_local.py --desktop /path/to/windows-release --output-packs /path/outside/this/repo/packs
```

为了避免误发布，该工具拒绝把私人正文包写入本公开项目目录。

## 资料来源

| 原始仓库 | 方向 |
| --- | --- |
| [wdndev/llm_interview_note](https://github.com/wdndev/llm_interview_note) | 大模型架构、训练、微调、推理、RAG |
| [NLP-LOVE/ML-NLP](https://github.com/NLP-LOVE/ML-NLP) | 机器学习、深度学习与 NLP |
| [bbruceyuan/AI-Interview-Code](https://github.com/bbruceyuan/AI-Interview-Code) | 模型组件手写与分析 |
| [WeThinkIn/AIGC-Interview-Book](https://github.com/WeThinkIn/AIGC-Interview-Book) | AIGC、多模态与综合面试 |
| [datawhalechina/daily-interview](https://github.com/datawhalechina/daily-interview) | 面试知识与面经 |
| [scutan90/DeepLearning-500-questions](https://github.com/scutan90/DeepLearning-500-questions) | 数学与经典深度学习 |
| [wdndev/ai_interview_note](https://github.com/wdndev/ai_interview_note) | 通用算法、搜索与推荐 |
| [adongwanai/AgentGuide](https://github.com/adongwanai/AgentGuide) | Agent 工程与面试 |
| [axiaoquan/llm-interview-handbook](https://github.com/axiaoquan/llm-interview-handbook) | 大模型、代码与常规算法 |

## 本地运行与检查

Node.js 20 或更新版本，无需安装 npm 依赖：

```bash
node tools/serve.mjs
# 打开 http://127.0.0.1:42320/ai-interview-study-pwa/
node --test tests/*.test.mjs
node tools/check-public.mjs
```

纯静态网页位于 `web/`，可以部署到任何 HTTPS 静态托管平台。此仓库包含 GitHub Pages 工作流；在仓库 Settings → Pages 将 Source 设为 GitHub Actions，推送 `main` 后会验证并部署 `web/`。

修改前端、字体或图标后，运行 `python tools/generate-shell.py` 更新离线资源清单与内容版本；该脚本生成图标需要 Pillow。应用自身的运行不依赖 Python。

更多说明见 [迁移与离线](docs/migration.md)、[发布边界](docs/publication.md) 和 [第三方组件](THIRD_PARTY_NOTICES.md)。
