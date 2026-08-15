# dsh-vision

DeepSeek Harness (DSH) 视觉识别插件：用**本地 llama.cpp + Qwen3VL** 或**在线 OpenAI 兼容 API** 识别图片。

- **工具**：`vision_recognize`（描述 / OCR / 问答），模型在需要看图时自动调用
- **设置页**：侧边栏「设置 → 视觉识别」——本地/在线切换、API Key、生成参数、thinking 模式
- **自启动**：打包为 DSH bundle 插件，随 DSH web 启动自动加载
- **配置**：`~/.dsh/qvl-vision.json`（0600），API Key 不落明文配置以外的位置

## 功能

| 能力 | 说明 |
|---|---|
| 识别后端 | 本地 llama.cpp（Qwen3VL-2B）/ 在线 API（OpenAI 兼容）可切换 |
| 图片来源 | 本地文件路径（模型在工作时遇到的截图、素材、图表等） |
| Thinking | 调用时可选 `auto` / `on` / `off`，附加参数可配置（适配各服务商格式） |
| 生成参数 | temperature / max_tokens / top_p 可配置，留空不发送；额外 JSON 参数兜底 |
| 服务管理 | 本地模式自动拉起/关闭 llama-server（默认端口 8090，可改） |
| API Key | 存配置文件（0600），设置页不回显、留空不改 |

## 安装

### 1. 准备本地模型（本地模式）

- 安装 llama.cpp（含 `llama-server.exe`）
- 下载 Qwen3VL GGUF 模型 + mmproj：

```
F:\llama\qwen3vl\
  ├── Qwen3VL-2B-Instruct-Q4_K_M.gguf
  └── mmproj-Qwen3VL-2B-Instruct-F16.gguf
```

模型路径在 `lib/index.mjs` 顶部常量中（`SERVER_EXE` / `MODEL` / `MMPROJ`），按需修改。

### 2. 安装插件到 DSH web profile

```powershell
# 1. clone 到本地（或使用 link 指向你自己的开发目录）
git clone https://github.com/Eicbro3ding/dsh-vision.git
cd dsh-vision
pnpm add '@deepseek-ai/dsh-tools@^0.1.0-rc.6'

# 2. 注册进 web profile
#    编辑 $DSH_HOME/profiles/web/package.json：
#    dependencies:   "@dsh-external/qvl-vision": "link:C:/<你的路径>/dsh-vision"
#    dsh.profile.bundles 数组末尾追加: "@dsh-external/qvl-vision"

# 3. 安装
cd $DSH_HOME/profiles/web
pnpm install

# 4. 重启 DSH web
```

重启后：
- `vision_recognize` 工具自动对所有会话可用
- 设置 → 视觉识别 页面出现

## 使用

在对话中让模型查看某张本地图片即可，例如：

> 看看 F:\shots\a.png 里写了什么
> 提取这张截图的文字（OCR）
> 仔细分析这张图表的趋势（会以 thinking 模式调用）

模型会调用 `vision_recognize` 工具，传入图片路径（+ 可选识别指令 + thinking 模式）。

## 配置说明

| 配置项 | 说明 |
|---|---|
| 识别后端 | 本地 llama.cpp / 在线 API |
| 本地端口 | 默认 8090；切到在线模式时自动关闭本地服务 |
| API Base URL | 如 `https://api.siliconflow.cn/v1`（自动补 `/chat/completions`） |
| 模型名 | 在线模型 ID，如 `Qwen/Qwen2.5-VL-7B-Instruct` |
| API Key | 留空表示不修改已保存的 Key |
| Temperature | 留空不发送（部分推理模型仅允许 1） |
| Max Tokens / Top P | 留空不发送 |
| Thinking 默认 | 工具未指定时：跟随模型 / 开 / 关 |
| Thinking 开/关附加参数 | JSON，如 `{"chat_template_kwargs":{"enable_thinking":true}}`，按服务商格式填写 |
| 额外参数 | JSON 合并进请求体，覆盖同名项 |

请求体组装优先级：调用参数 `thinking` → 配置默认 → auto（不附加）；thinking 附加参数先生效，「额外参数」最后合并可覆盖。

## 开发

- Host 半部：`lib/index.mjs`（`ctx.tools.register(defineTool(...))` + `webServer` 路由 + `node:fs`/`node:http`）
- Client 半部：`lib/index.js`（`__ModuleLoader__.load` 格式，`settings.section` 设置页，`fetch('/api/qvl-vision/config')`）
- 配置持久化：`~/.dsh/qvl-vision.json`
- 验证：`node --check lib/index.mjs lib/index.js`；profile 目录 `node -e "import('@dsh-external/qvl-vision').then(m => console.log(m.name))"`

## License

MIT
