/**
 * qvl-vision — Host half (bundled plugin).
 *
 * Migrated from the dynamic Cordis plugin:
 *   - harness.defineTool / harness.registerTool  -> ctx.tools.register(defineTool(...))
 *   - harness.handle (RPC)                        -> webServer.register route + browser fetch
 *   - ctx.get('fs') / ctx.get('subprocess')       -> node:fs / node:child_process (full Node ESM)
 *   - ctx.get('credentials')                      -> config file under $DSH_HOME
 *
 * Surface:
 *   - agent tool `vision_recognize` (local llama.cpp/Qwen3VL or online OpenAI-compatible API)
 *   - GET/POST /api/qvl-vision/config for the settings page
 *   - auto-starts llama-server on first local-mode call; stops it on plugin teardown
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import http from 'node:http'
import https from 'node:https'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'qvl-vision'

export const inject = ['timer', 'tools', 'webServer']

const SERVER_EXE = 'F:\\llama\\llama.cpp-installer\\vendor\\llama.cpp\\build\\bin\\llama-server.exe'
const MODEL = 'F:\\llama\\qwen3vl\\Qwen3VL-2B-Instruct-Q4_K_M.gguf'
const MMPROJ = 'F:\\llama\\qwen3vl\\mmproj-Qwen3VL-2B-Instruct-F16.gguf'
const WORKDIR = 'F:\\llama'

const DEFAULTS = {
  mode: 'local',
  local: { port: 8090 },
  online: { baseUrl: '', apiKey: '', model: '' },
  temperature: '',
  maxTokens: '',
  topP: '',
  extra: '',
  thinkingDefault: 'auto',
  thinkingOn: '',
  thinkingOff: '',
}

function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

function configFile() {
  return join(dshHome(), 'qvl-vision.json')
}

let config = structuredClone(DEFAULTS)
let serverProc = null
let readyPromise = null

function base() {
  return 'http://127.0.0.1:' + config.local.port
}

function loadConfig() {
  try {
    if (!existsSync(configFile())) return
    const parsed = JSON.parse(readFileSync(configFile(), 'utf8'))
    config = {
      ...structuredClone(DEFAULTS),
      ...(parsed && typeof parsed === 'object' ? parsed : {}),
      local: { ...DEFAULTS.local, ...(parsed?.local ?? {}) },
      online: { ...DEFAULTS.online, ...(parsed?.online ?? {}) },
    }
  } catch (error) {
    console.log('[qvl] config load failed: ' + String(error))
  }
}

function persistConfig() {
  try {
    const dir = dshHome()
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(configFile(), JSON.stringify(config, null, 2), { mode: 0o600 })
    return true
  } catch (error) {
    console.error('[qvl] config save failed: ' + String(error))
    return false
  }
}

/** Minimal JSON GET (used for the llama-server health probe). */
function getJson(url, signal) {
  return new Promise((resolve, reject) => {
    let u
    try {
      u = new URL(url)
    } catch (error) {
      reject(error)
      return
    }
    const lib = u.protocol === 'https:' ? https : http
    const req = lib.request(u, { method: 'GET', signal }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        resolve({ status: res.statusCode || 0, text: Buffer.concat(chunks).toString('utf8') })
      })
    })
    req.on('error', reject)
    req.end()
  })
}

/** Minimal JSON POST returning { status, text }. */
function postJson(url, body, headers = {}, signal) {
  return new Promise((resolve, reject) => {
    let u
    try {
      u = new URL(url)
    } catch (error) {
      reject(error)
      return
    }
    const lib = u.protocol === 'https:' ? https : http
    const payload = JSON.stringify(body)
    const req = lib.request(u, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      signal,
    }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        resolve({ status: res.statusCode || 0, text: Buffer.concat(chunks).toString('utf8') })
      })
    })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

async function healthOk() {
  try {
    const r = await getJson(base() + '/health')
    return r.status === 200 && r.text.indexOf('"ok"') >= 0
  } catch {
    return false
  }
}

function ensureServer() {
  if (serverProc !== null) return
  const proc = spawn(SERVER_EXE, [
    '--model', MODEL,
    '--mmproj', MMPROJ,
    '--host', '127.0.0.1',
    '--port', String(config.local.port),
    '--jinja',
    '--flash-attn', 'on',
    '-c', '8192',
    '--no-webui',
  ], {
    cwd: WORKDIR,
    env: { ...process.env, LLAMA_SET_ROWS: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let log = ''
  proc.stdout.on('data', (c) => { log = (log + String(c)).slice(-16384) })
  proc.stderr.on('data', (c) => { log = (log + String(c)).slice(-16384) })
  proc.on('error', (error) => {
    console.error('[qvl] llama-server spawn failed: ' + String(error))
    if (serverProc === proc) serverProc = null
  })
  proc.on('exit', (code, signal) => {
    console.log('[qvl] llama-server exited code=' + String(code) + ' signal=' + String(signal))
    if (serverProc === proc) serverProc = null
    readyPromise = null
  })
  serverProc = proc
}

function stopServer() {
  if (serverProc !== null) {
    serverProc.kill()
    serverProc = null
  }
  readyPromise = null
}

async function waitReady() {
  if (readyPromise !== null) return readyPromise
  readyPromise = (async () => {
    ensureServer()
    const deadline = Date.now() + 120000
    while (Date.now() < deadline) {
      if (await healthOk()) return
      await new Promise((r) => setTimeout(r, 1000))
    }
    throw new Error('llama-server (Qwen3VL) 在 ' + base() + ' 未在 120 秒内就绪，请检查服务器日志')
  })()
  return readyPromise
}

/** Parse a JSON field text; null when blank, throws on malformed input. */
function parseJsonField(text, label) {
  const s = (typeof text === 'string' ? text : '').trim()
  if (s.length === 0) return null
  let obj
  try {
    obj = JSON.parse(s)
  } catch {
    throw new Error('设置中的' + label + '不是合法 JSON: ' + s.slice(0, 100))
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error('设置中的' + label + '必须是 JSON 对象')
  }
  return obj
}

function parseNum(v) {
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (s.length === 0) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Assemble the chat-completions body: generation params + thinking + extra JSON. */
function buildBody(modelName, dataUrl, prompt, thinkingChoice) {
  const body = {
    model: modelName,
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: dataUrl } },
        { type: 'text', text: prompt },
      ],
    }],
  }
  const t = parseNum(config.temperature)
  if (t !== null) body.temperature = t
  const m = parseNum(config.maxTokens)
  if (m !== null) body.max_tokens = m
  const p = parseNum(config.topP)
  if (p !== null) body.top_p = p
  const choice = (thinkingChoice === 'on' || thinkingChoice === 'off') ? thinkingChoice : config.thinkingDefault
  if (choice === 'on') {
    const obj = parseJsonField(config.thinkingOn, '“Thinking 开启时附加参数”')
    if (obj !== null) for (const k of Object.keys(obj)) body[k] = obj[k]
  } else if (choice === 'off') {
    const obj = parseJsonField(config.thinkingOff, '“Thinking 关闭时附加参数”')
    if (obj !== null) for (const k of Object.keys(obj)) body[k] = obj[k]
  }
  const extraObj = parseJsonField(config.extra, '“额外参数”')
  if (extraObj !== null) for (const k of Object.keys(extraObj)) body[k] = extraObj[k]
  return body
}

/** Validate one chat-completions response and return the assistant text. */
function parseChatResponse(r) {
  if (r.status < 200 || r.status >= 300) {
    throw new Error('识别服务错误 (HTTP ' + r.status + '): ' + r.text.slice(0, 300))
  }
  let parsed
  try {
    parsed = JSON.parse(r.text)
  } catch {
    throw new Error('识别服务返回了非 JSON 响应: ' + r.text.slice(0, 300))
  }
  if (parsed && parsed.error) {
    const em = parsed.error.message || JSON.stringify(parsed.error)
    throw new Error('识别服务错误: ' + String(em).slice(0, 300))
  }
  const content = parsed?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || content.length === 0) {
    throw new Error('识别无输出: ' + r.text.slice(0, 300))
  }
  return content
}

function applyConfigPatch(patch) {
  const a = (patch && typeof patch === 'object') ? patch : {}
  if (typeof a.mode === 'string' && (a.mode === 'local' || a.mode === 'online')) {
    if (a.mode === 'online' && config.mode === 'local') stopServer()
    config.mode = a.mode
  }
  const p = Number(a.localPort)
  if (Number.isFinite(p) && p >= 1 && p <= 65535) config.local.port = Math.floor(p)
  if (typeof a.onlineBaseUrl === 'string') config.online.baseUrl = a.onlineBaseUrl.trim()
  if (typeof a.onlineModel === 'string') config.online.model = a.onlineModel.trim()
  if (typeof a.onlineApiKey === 'string' && a.onlineApiKey.length > 0) config.online.apiKey = a.onlineApiKey
  if (typeof a.temperature === 'string') config.temperature = a.temperature
  if (typeof a.maxTokens === 'string') config.maxTokens = a.maxTokens
  if (typeof a.topP === 'string') config.topP = a.topP
  if (typeof a.extra === 'string') config.extra = a.extra
  if (a.thinkingDefault === 'on' || a.thinkingDefault === 'off') config.thinkingDefault = a.thinkingDefault
  else if (a.thinkingDefault === 'auto') config.thinkingDefault = 'auto'
  if (typeof a.thinkingOn === 'string') config.thinkingOn = a.thinkingOn
  if (typeof a.thinkingOff === 'string') config.thinkingOff = a.thinkingOff
}

const tool = defineTool({
  name: 'vision_recognize',
  description: '用视觉模型识别本地图片文件（描述 / OCR / 问答）。当需要查看、描述、提取文字或分析本地图片（截图、照片、图表、扫描件等）时调用。',
  parameters: {
    image_path: { type: 'string', required: true, description: '本地图片文件的绝对路径，如 F:\\shots\\a.png。' },
    prompt: { type: 'string', description: '可选识别指令，如提取图中所有文字、描述这张图表、图中有什么。缺省为详细描述图片内容。' },
    thinking: { type: 'string', enum: ['auto', 'on', 'off'], description: '是否开启模型的思考模式：on 开启 thinking（更深入分析、适合复杂图表/推理），off 关闭（更快更省），auto 使用设置中的默认值。用户明确要求“仔细思考/深入分析”时用 on，要求“快速/直接回答”时用 off。缺省为 auto。' },
  },
  output: {
    schema: { type: 'string' },
    render: (_args, value) => [{ type: 'text', text: String(value) }],
  },
  async execute(args, exec) {
    const imagePath = String(args.image_path)
    const prompt = typeof args.prompt === 'string' && args.prompt.length > 0 ? args.prompt : '请详细描述这张图片的内容。'
    const thinking = args.thinking === 'on' || args.thinking === 'off' ? args.thinking : 'auto'
    const data = await readFile(imagePath)
    const ext = (imagePath.toLowerCase().split('.').pop() || '')
    const mime = ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp' })[ext] || 'image/png'
    const dataUrl = 'data:' + mime + ';base64,' + data.toString('base64')

    if (config.mode === 'online') {
      if (config.online.apiKey.length === 0) throw new Error('未配置在线 API Key，请在设置（视觉识别）中填写')
      let baseUrl = config.online.baseUrl.replace(/\/+$/, '')
      if (baseUrl.length === 0) throw new Error('未配置在线 API Base URL，请在设置（视觉识别）中填写')
      if (!/chat\/completions$/.test(baseUrl)) baseUrl = baseUrl + '/chat/completions'
      const modelName = config.online.model.trim()
      if (modelName.length === 0) throw new Error('未配置在线模型名，请在设置（视觉识别）中填写')
      const body = buildBody(modelName, dataUrl, prompt, thinking)
      const r = await postJson(baseUrl, body, { authorization: 'Bearer ' + config.online.apiKey }, exec.signal)
      return parseChatResponse(r)
    }

    await waitReady()
    const body = buildBody('qwen3vl', dataUrl, prompt, thinking)
    const r = await postJson(base() + '/v1/chat/completions', body, {}, exec.signal)
    return parseChatResponse(r)
  },
})

export function apply(ctx) {
  loadConfig()

  ctx.effect(() => ctx.tools.register(tool), 'qvl-vision: tool')

  ctx.effect(() => {
    const route = ctx.webServer.register({
      kind: 'prefix',
      path: '/api/qvl-vision',
      handler: async (req, res) => {
        const json = (status, body) => {
          res.statusCode = status
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.end(JSON.stringify(body))
        }
        const url = new URL(req?.url ?? '/', 'http://localhost')
        const path = url.pathname
        const method = req?.method ?? 'GET'
        if (method === 'GET' && (path === '/api/qvl-vision/config' || path === '/api/qvl-vision/config/')) {
          return json(200, {
            mode: config.mode,
            localPort: config.local.port,
            onlineBaseUrl: config.online.baseUrl,
            onlineModel: config.online.model,
            hasApiKey: config.online.apiKey.length > 0,
            temperature: config.temperature,
            maxTokens: config.maxTokens,
            topP: config.topP,
            extra: config.extra,
            thinkingDefault: config.thinkingDefault,
            thinkingOn: config.thinkingOn,
            thinkingOff: config.thinkingOff,
          })
        }
        if (method === 'POST' && (path === '/api/qvl-vision/config' || path === '/api/qvl-vision/config/')) {
          let body = ''
          for await (const chunk of req) body += chunk.toString('utf8')
          let patch
          try {
            patch = JSON.parse(body)
          } catch {
            return json(400, { ok: false, error: 'invalid JSON body' })
          }
          try {
            applyConfigPatch(patch)
            const persisted = persistConfig()
            return json(200, { ok: true, persisted })
          } catch (error) {
            return json(400, { ok: false, error: error instanceof Error ? error.message : String(error) })
          }
        }
        json(404, { ok: false })
      },
    })
    return () => route()
  }, 'qvl-vision: routes')

  ctx.effect(() => () => {
    stopServer()
  }, 'qvl-vision: server')
}
