#!/usr/bin/env node

/**
 * StarCanvas CLI — 星轨画布终端控制台
 * ====================================
 *
 * 用法:
 *   node starcanvas-cli.mjs <command> [options]
 *
 * 命令:
 *   server start          启动开发服务器
 *   server stop|restart   停止/重启
 *   server status         查看运行状态
 *   health                检查 AI Provider 连接
 *   provider-smoke        分项检查真实 Provider 可运行性
 *   config                查看当前配置
 *   nodes                 列出所有画布节点
 *   node info <id>        查看节点详情
 *   node run <id>         运行单个节点
 *   workflow run          运行工作流
 *   chat <prompt>         发送聊天消息
 *   image <prompt>        生成图片
 *   dashboard             启动终端仪表盘 (TUI)
 *   logs [--follow]       查看日志
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync, createWriteStream } from 'node:fs'
import { createServer } from 'node:net'
import { spawn, execSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'
import {
  buildProviderSmokeEnv,
  buildProviderSmokePlan,
  parseProviderSmokeEnvFile,
} from './provider-smoke-plan.mjs'
import {
  loadProviderSmokeConfigWithWarmup,
} from './provider-smoke-runtime.mjs'
import {
  probeLocalServerReady,
} from './server-runtime.mjs'
import {
  getApiGetTimeoutMs,
} from './cli-http-runtime.mjs'

// ── 常量 ──
const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const WEB_DIR = join(ROOT, 'apps', 'web')
const LOG_DIR = join(ROOT, '.starcanvas-logs')
const SERVER_LOG = join(LOG_DIR, 'server.log')
const PID_FILE = join(ROOT, '.starcanvas.pid')
const PORT_FILE = join(ROOT, '.starcanvas.port')
const ENV_FILE = join(WEB_DIR, '.env.local')

// ── ANSI 颜色 ──
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
}

// ── 辅助函数 ──

function log(msg, color = '') {
  console.log(`${color}${msg}${C.reset}`)
}

function visualWidth(s) {
  // 中文字符占2个显示宽度
  let w = 0
  for (const ch of s) {
    w += /[\u4e00-\u9fff\u3000-\u30ff\uff00-\uffef]/.test(ch) ? 2 : 1
  }
  return w
}

function padVisual(s, len) {
  const pad = len - visualWidth(s)
  return pad > 0 ? s + ' '.repeat(pad) : s
}

function header(text) {
  const w = 58
  console.log(`\n${C.bold}${C.cyan}╔${'═'.repeat(w)}╗${C.reset}`)
  console.log(`${C.bold}${C.cyan}║ ${padVisual(text, w - 1)}║${C.reset}`)
  console.log(`${C.bold}${C.cyan}╚${'═'.repeat(w)}╝${C.reset}\n`)
}

function error(msg) { log(`✖ ${msg}`, C.red) }
function success(msg) { log(`✔ ${msg}`, C.green) }
function warn(msg) { log(`⚠ ${msg}`, C.yellow) }
function info(msg) { log(`ℹ ${msg}`, C.blue) }

function formatTime(iso) {
  if (!iso) return '-'
  const d = new Date(iso)
  return d.toLocaleTimeString('zh-CN', { hour12: false })
}

// ── 端口检测 ──

function isPortFree(port) {
  return new Promise((resolve) => {
    const s = createServer()
    s.once('error', () => resolve(false))
    s.once('listening', () => s.close(() => resolve(true)))
    s.listen(port, '127.0.0.1')
  })
}

async function findFreePort(start) {
  for (let p = start; p < start + 20; p++) {
    if (await isPortFree(p)) return p
  }
  return null
}

// ── 服务器管理 ──

async function getServerStatus() {
  const pid = existsSync(PID_FILE) ? parseInt(readFileSync(PID_FILE, 'utf-8').trim()) : null
  const port = existsSync(PORT_FILE) ? parseInt(readFileSync(PORT_FILE, 'utf-8').trim()) : null

  if (!pid) return { running: false, pid: null, port: null }

  try {
    process.kill(pid, 0) // 信号 0 = 只检查存在性
    // 进一步确认端口可访问
    if (port) {
      const probe = await probeLocalServerReady({ port, timeoutMs: 3000 })
      return { running: true, pid, port, healthy: probe.ok }
    }
    return { running: true, pid, port, healthy: false }
  } catch {
    // PID 文件存在但进程已死
    return { running: false, pid: null, port: null, stale: true }
  }
}

async function cmdServerStart() {
  header('启动星轨画布开发服务器')

  const status = await getServerStatus()
  if (status.running) {
    warn(`服务器已在运行中 (PID: ${status.pid}, 端口: ${status.port})`)
    return
  }

  const port = await findFreePort(3100)
  if (!port) {
    error('无法找到可用端口 (3100-3119 均被占用)')
    process.exit(1)
  }

  mkdirSync(LOG_DIR, { recursive: true })
  writeFileSync(PORT_FILE, String(port))

  info(`端口: ${port}`)
  info(`启动中...`)

  // Strip NODE_OPTIONS if it contains --use-system-ca (breaks Node.js)
  const cleanEnv = { ...process.env, PORT: String(port) }
  if (cleanEnv.NODE_OPTIONS?.includes?.('--use-system-ca')) {
    delete cleanEnv.NODE_OPTIONS
  }

  const child = spawn('pnpm', ['-C', 'apps/web', 'exec', 'next', 'dev', '--webpack', '-p', String(port)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: cleanEnv,
    detached: true,
  })

  writeFileSync(PID_FILE, String(child.pid))
  child.unref()

  // 管道日志
  const logStream = createWriteSteam(SERVER_LOG)
  child.stdout.pipe(logStream)
  child.stderr.pipe(logStream)

  // 等待服务器就绪
  info('等待服务器就绪...')
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 1000))
    const probe = await probeLocalServerReady({ port, timeoutMs: 2000 })
    if (probe.ok) {
      success(`星轨画布已启动 → http://localhost:${port}/canvas`)
      info(`API 端点: http://localhost:${port}/api/ai/`)
      info(`管理命令: node scripts/starcanvas-cli.mjs dashboard`)
      return
    }
  }

  warn('服务器启动中但响应超时，请稍后手动检查 health')
}

function createWriteSteam(filePath) {
  return createWriteStream(filePath, { flags: 'a' })
}

async function cmdServerStop() {
  header('停止星轨画布服务器')

  const status = await getServerStatus()
  if (!status.running) {
    if (status.stale) {
      warn('发现残留 PID 文件，已清理')
      try { execSync(`rm ${PID_FILE}`) } catch {}
      try { execSync(`rm ${PORT_FILE}`) } catch {}
    } else {
      warn('服务器未运行')
    }
    return
  }

  try {
    process.kill(status.pid, 'SIGTERM')
    info(`已发送 SIGTERM 信号 (PID: ${status.pid})`)

    // 等待进程退出
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 500))
      try {
        process.kill(status.pid, 0)
      } catch {
        success('服务器已停止')
        try { execSync(`rm ${PID_FILE}`) } catch {}
        try { execSync(`rm ${PORT_FILE}`) } catch {}
        return
      }
    }

    warn('进程未响应 SIGTERM，尝试 SIGKILL')
    process.kill(status.pid, 'SIGKILL')
    success('服务器已强制停止')
    try { execSync(`rm ${PID_FILE}`) } catch {}
    try { execSync(`rm ${PORT_FILE}`) } catch {}
  } catch (e) {
    error(`停止失败: ${e.message}`)
  }
}

async function cmdServerStatus() {
  header('星轨画布服务器状态')

  const status = await getServerStatus()

  if (status.running) {
    const healthLabel = status.healthy ? `${C.green}正常${C.reset}` : `${C.yellow}异常${C.reset}`
    log(`  运行状态: ${C.green}● 运行中${C.reset}`)
    log(`  PID:       ${C.bold}${status.pid}${C.reset}`)
    log(`  端口:      ${C.bold}${status.port}${C.reset}`)
    log(`  Health:    ${healthLabel}`)
    log(`  地址:      ${C.cyan}http://localhost:${status.port}/canvas${C.reset}`)
  } else {
    log(`  运行状态: ${C.red}● 已停止${C.reset}`)
    if (existsSync(PID_FILE)) {
      warn('  提示: 存在残留 PID 文件，请执行 "server stop" 清理')
    }
  }
}

// ── API 操作 ──

async function getApiBaseUrl() {
  const portFile = existsSync(PORT_FILE) ? readFileSync(PORT_FILE, 'utf-8').trim() : null
  if (portFile) return `http://127.0.0.1:${portFile}`

  // 尝试从日志中检测
  try {
    const logContent = readFileSync(SERVER_LOG, 'utf-8')
    const match = logContent.match(/http:\/\/localhost:(\d+)/)
    if (match) return `http://127.0.0.1:${match[1]}`
  } catch {}

  return 'http://127.0.0.1:3100'
}

async function apiGet(path) {
  const base = await getApiBaseUrl()
  try {
    const resp = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(getApiGetTimeoutMs(path)) })
    return { ok: resp.ok, data: await resp.json(), status: resp.status }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

async function apiPost(path, body) {
  const base = await getApiBaseUrl()
  try {
    const resp = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    })
    return { ok: resp.ok, data: await resp.json(), status: resp.status }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

async function apiPostWithTimeout(path, body, timeoutMs) {
  const base = await getApiBaseUrl()
  try {
    const resp = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
    const text = await resp.text()
    let data = null
    try { data = JSON.parse(text) } catch {}
    return { ok: resp.ok, data, text, status: resp.status }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

async function apiPostStream(path, body, onChunk) {
  const base = await getApiBaseUrl()
  try {
    const resp = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    })
    if (!resp.ok) {
      const errData = await resp.text()
      return { ok: false, error: errData }
    }

    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6))
            if (onChunk) onChunk(data)
          } catch {}
        }
      }
    }

    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

async function apiPostSseUntil(path, body, options = {}) {
  const base = await getApiBaseUrl()
  const timeoutMs = options.timeoutMs || 180000
  try {
    const resp = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
    const reader = resp.body?.getReader()
    if (!reader) {
      return { ok: false, status: resp.status, error: 'No response stream returned' }
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let eventName = ''
    let result = null
    let progress = null
    let errorEvent = null

    const handleLine = (line) => {
      if (line.startsWith('event: ')) {
        eventName = line.slice(7).trim()
        return
      }
      if (!line.startsWith('data: ')) return
      let data = null
      try { data = JSON.parse(line.slice(6)) } catch { return }
      if (eventName === 'error' || data?.error) errorEvent = data
      if (eventName === 'result' || data?.videoUrl || data?.audioBase64) result = data
      if (eventName === 'progress' || data?.stage) progress = data
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) handleLine(line)
      if (result || errorEvent) break
    }

    try { reader.releaseLock() } catch {}

    if (errorEvent) {
      return { ok: false, status: resp.status, error: errorEvent.message || JSON.stringify(errorEvent), progress }
    }
    if (!resp.ok) return { ok: false, status: resp.status, error: `HTTP ${resp.status}`, progress }
    if (result) return { ok: true, status: resp.status, data: result, progress }
    return { ok: true, status: resp.status, progress }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

// ── 命令实现 ──

async function cmdHealth() {
  header('AI Provider 健康检查')

  const result = await apiGet('/api/ai/health')
  if (!result.ok) {
    error(`无法连接服务器: ${result.error || result.data?.message || '未知错误'}`)
    return
  }

  const { ok, message, config } = result.data
  if (ok) {
    success('AI Provider 连接正常')
  } else {
    error(`连接失败: ${message}`)
  }

  if (config) {
    console.log('')
    log(`  Provider:      ${config.type || '-'}`, C.gray)
    log(`  Base URL:      ${config.baseUrl || '-'}`, C.gray)
    log(`  API Key:       ${config.hasApiKey ? `${C.green}已配置${C.reset}` : `${C.red}未配置${C.reset}`}`)
    log(`  文本模型:      ${config.defaultModel || '-'}`, C.gray)
    log(`  图片模型:      ${config.defaultImageModel || '-'}`, C.gray)
    log(`  视频模型:      ${config.videoModel || '(未配置)'}`, C.gray)
    log(`  超时时间:      ${config.timeoutMs || 120000}ms`, C.gray)
  }
}

async function cmdProviderSmoke() {
  header('Provider 分项 Smoke 检查')

  const configResult = await loadProviderSmokeConfigWithWarmup({
    apiGet,
  })
  let config = null
  if (configResult.ok) {
    config = configResult.config
    if (configResult.usedRetry) {
      info('检测到服务冷启动，已完成一次配置热身重试。')
    }
  } else {
    warn(`无法读取 /api/ai/config: ${configResult.error || configResult.data?.error || '未知错误'}`)
  }

  const envFromFile = existsSync(ENV_FILE)
    ? parseProviderSmokeEnvFile(readFileSync(ENV_FILE, 'utf-8'))
    : {}
  const smokeEnv = buildProviderSmokeEnv(process.env, envFromFile)
  const plan = buildProviderSmokePlan({
    config,
    env: smokeEnv,
  })

  log(`  可运行: ${plan.summary.runnable}  跳过: ${plan.summary.skipped}  阻塞: ${plan.summary.blocked}`, C.gray)
  console.log('')

  const results = []

  for (const check of plan.checks) {
    const prefix = check.status === 'blocked'
      ? `${C.red}●${C.reset}`
      : check.status === 'skipped'
        ? `${C.yellow}●${C.reset}`
        : `${C.green}●${C.reset}`
    log(`  ${prefix} ${check.label}: ${check.reason}`)

    if (check.status !== 'runnable') {
      results.push({ ...check, outcome: check.status })
      continue
    }

    if (check.action === 'health') {
      const result = await apiGet('/api/ai/health')
      if (result.ok && result.data?.ok) {
        success(`    文本连接通过: ${result.data.message}`)
        results.push({ ...check, outcome: 'passed' })
      } else {
        error(`    文本连接失败: ${result.error || result.data?.message || '未知错误'}`)
        results.push({ ...check, outcome: 'failed' })
      }
    }

    if (check.action === 'image') {
      const prompt = 'A small blue star on a plain white background, minimal smoke test.'
      const result = await apiPostWithTimeout('/api/ai/generate-image', {
        prompt,
        model: config?.defaultImageModel,
        size: '1024x1024',
        requestId: `provider-smoke-image-${Date.now()}`,
      }, Number(smokeEnv.STARCANVAS_REAL_IMAGE_SMOKE_TIMEOUT_MS || 180000))
      if (result.ok && result.data?.ok && result.data?.imageUrl) {
        success(`    生图通过: ${String(result.data.imageUrl).slice(0, 32)}...`)
        results.push({ ...check, outcome: 'passed' })
      } else {
        error(`    生图失败: ${result.error || result.data?.error?.message || result.data?.error || result.text || '未知错误'}`)
        results.push({ ...check, outcome: 'failed' })
      }
    }

    if (check.action === 'video') {
      const result = await apiPostSseUntil('/api/ai/generate-video-vidu', {
        mode: 't2v',
        model: config?.videoModel,
        prompt: 'A two second static shot of a small blue star on a plain white background.',
        duration: 1,
        resolution: '540P',
        audio: false,
        watermark: true,
      }, { timeoutMs: Number(smokeEnv.STARCANVAS_REAL_VIDEO_SMOKE_TIMEOUT_MS || 720000) })
      if (result.ok && result.data?.videoUrl) {
        success(`    视频通过: ${result.data.videoUrl}`)
        results.push({ ...check, outcome: 'passed' })
      } else {
        error(`    视频失败: ${result.error || '未返回 videoUrl'}`)
        results.push({ ...check, outcome: 'failed' })
      }
    }

    if (check.action === 'tts') {
      const result = await apiPostSseUntil('/api/ai/tts', {
        text: '星轨画布 provider smoke test.',
        voice: 'default',
        speed: 1,
      }, { timeoutMs: Number(smokeEnv.STARCANVAS_REAL_TTS_SMOKE_TIMEOUT_MS || 180000) })
      if (result.ok && (result.data?.audioBase64 || result.data?.audioUrl)) {
        success('    TTS 通过')
        results.push({ ...check, outcome: 'passed' })
      } else {
        error(`    TTS 失败: ${result.error || '未返回音频结果'}`)
        results.push({ ...check, outcome: 'failed' })
      }
    }
  }

  const failed = results.filter((result) => result.outcome === 'failed').length
  const blocked = results.filter((result) => result.outcome === 'blocked').length
  console.log('')
  if (failed > 0) {
    error(`Smoke 失败: ${failed} 项真实请求失败`)
    process.exitCode = 1
  } else if (blocked > 0) {
    warn(`Smoke 存在阻塞项: ${blocked} 项需要配置后才能验证`)
  } else {
    success('Smoke 检查完成；未启用的真实付费请求已安全跳过。')
  }
}

async function cmdConfig() {
  header('星轨画布配置')

  const result = await apiGet('/api/ai/config')
  if (!result.ok) {
    error(`无法获取配置: ${result.error}`)
    const envContent = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf-8') : null
    if (envContent) {
      console.log('\n本地 .env.local 配置:')
      console.log(envContent.split('\n').filter(l => !l.startsWith('#') && l.trim()).map(l => `  ${C.gray}${l}${C.reset}`).join('\n'))
    }
    return
  }

  const { config } = result.data
  if (config) {
    log(`${C.bold}AI Provider${C.reset}`)
    log(`  Type:        ${config.type || '-'}`)
    log(`  Base URL:    ${config.baseUrl || '-'}`)
    log(`  API Key:     ${config.hasApiKey ? `${C.green}✓ 已配置${C.reset}` : `${C.red}✗ 未配置${C.reset}`}`)
    log(`  Text Model:  ${config.defaultModel || '-'}`)
    log(`  Image Model: ${config.defaultImageModel || '-'}`)
    log(`  Video Model: ${config.videoModel || '(未配置)'}`)
    log(`  Timeout:     ${config.timeoutMs || 120000}ms`)
  }
}

async function cmdChat(prompt) {
  if (!prompt) {
    error('请提供聊天内容，例如: starcanvas chat "你好，介绍一下这个项目"')
    process.exit(1)
  }

  header(`Chat - 发送消息`)

  const payload = {
    message: prompt,
    context: { mode: 'chat' },
  }

  let fullContent = ''
  let usage = null

  log(`${C.bold}${C.blue}>>>${C.reset} ${prompt}\n`)
  process.stdout.write(`${C.green}`)

  const result = await apiPostStream('/api/ai/chat/stream', payload, (data) => {
    if (data.content) {
      fullContent += data.content
      process.stdout.write(data.content)
    }
    if (data.done) {
      usage = data.usage
    }
    if (data.error) {
      process.stdout.write(`${C.red}\n\n错误: ${data.error}${C.reset}`)
    }
  })

  process.stdout.write(C.reset)

  if (!result.ok) {
    error(`\n\n请求失败: ${result.error}`)
    return
  }

  console.log('')
  if (usage) {
    log(`\nToken 用量: 输入 ${usage.promptTokens || '?'} → 输出 ${usage.completionTokens || '?'} (总计 ${usage.totalTokens || '?'})`, C.dim)
  }
}

async function cmdImage(prompt) {
  if (!prompt) {
    error('请提供图片描述，例如: starcanvas image "一只在太空漫步的猫"')
    process.exit(1)
  }

  header(`Image - 生成图片`)
  info(`提示词: ${prompt}`)

  // 先获取配置确定图片模型
  const configResult = await apiGet('/api/ai/config')
  const imageModel = configResult.ok ? configResult.data.config?.defaultImageModel || 'gpt-image-2' : 'gpt-image-2'

  log(`模型: ${imageModel}`, C.gray)
  log(`生成中...\n`)

  // 直接调用 chat/stream 的 image mode
  const payload = {
    message: prompt,
    context: { mode: 'image' },
    model: imageModel,
  }

  let imageUrl = null
  const result = await apiPostStream('/api/ai/chat/stream', payload, (data) => {
    if (data.type === 'image_generated') {
      imageUrl = data.imageUrl
      success(`图片已生成!`)
      log(`模型: ${data.model || '-'}`, C.gray)
      log(`图片长度: ${imageUrl ? imageUrl.length + ' bytes' : '-'}`, C.gray)
    }
    if (data.error) {
      error(`生成失败: ${data.error}`)
    }
  })

  if (!result.ok) {
    error(`请求失败: ${result.error}`)
  }
}

async function cmdNodes() {
  header('画布节点列表')

  // 画布状态存在于前端 Zustand store（localStorage），无法通过 API 直接获取
  // 在这里提示用户可以用 dashboard 模式查看
  warn('节点数据存储在浏览器中，无法通过 API 直接获取。')
  console.log('')
  info('替代方案:')
  log(`  1. ${C.cyan}${C.bold}starcanvas dashboard${C.reset} — 启动交互式终端仪表盘`)
  log(`  2. 在浏览器中打开画布后，按 F12 → Application → LocalStorage → startrails_*`)
  console.log('')
  warn('后续可添加 API 端点来暴露画布状态，届时此命令将自动支持。')
}

async function cmdWorkflowRun() {
  header('工作流执行')

  const payload = {
    message: '运行整个工作流',
    context: {
      mode: 'chat',
      systemOverride: '你是星轨画布的工作流执行引擎。请按顺序执行所有就绪的节点。',
    },
  }

  info('启动工作流...')
  let currentStep = ''

  const result = await apiPostStream('/api/ai/chat/stream', payload, (data) => {
    if (data.content) {
      process.stdout.write(data.content)
    }
    if (data.done) {
      success('工作流执行完成')
    }
    if (data.error) {
      error(`执行错误: ${data.error}`)
    }
  })

  if (!result.ok) {
    error(`工作流启动失败: ${result.error}`)
  }
}

async function cmdLogs(options) {
  header('服务器日志')

  if (!existsSync(SERVER_LOG)) {
    warn('暂无日志文件')
    return
  }

  const content = readFileSync(SERVER_LOG, 'utf-8')
  const lines = content.split('\n').filter(Boolean)

  if (options.follow) {
    // 先显示已有日志
    const lastN = Math.min(50, lines.length)
    for (const line of lines.slice(-lastN)) {
      console.log(`  ${C.gray}${line}${C.reset}`)
    }
    log(`\n${C.dim}正在监听新日志 (Ctrl+C 退出)...${C.reset}`)

    // 使用 fs.watchFile 轮询
    let lastSize = readFileSync(SERVER_LOG).length
    setInterval(() => {
      try {
        const current = readFileSync(SERVER_LOG)
        if (current.length > lastSize) {
          const newContent = current.slice(lastSize).toString()
          process.stdout.write(newContent.split('\n').map(l => `  ${C.gray}${l}${C.reset}`).join('\n') + '\n')
          lastSize = current.length
        }
      } catch {}
    }, 1000)

    // 保持进程运行
    await new Promise(() => {})
  } else {
    const lastN = Math.min(100, lines.length)
    for (const line of lines.slice(-lastN)) {
      console.log(`  ${C.gray}${line}${C.reset}`)
    }
    info(`\n共 ${lines.length} 行，显示最后 ${lastN} 行`)
    info(`使用 --follow 参数实时追踪新日志`)
  }
}

// ── Dashboard (TUI 仪表盘) ──

async function cmdDashboard() {
  header('星轨画布终端仪表盘 (TUI)')
  info('按 Ctrl+C 退出 | 自动刷新每 5 秒')
  console.log('')

  let interval = null

  const render = async () => {
    // 清屏
    process.stdout.write('\x1b[2J\x1b[H')

    const status = await getServerStatus()

    // ── 头部 ──
    console.log(`${C.cyan}${C.bold}╔${'═'.repeat(58)}╗${C.reset}`)
    console.log(`${C.cyan}${C.bold}║${C.reset}  ${C.bold}星轨画布 · StarCanvas 仪表盘${C.reset}${' '.repeat(27)}${C.cyan}║${C.reset}`)
    console.log(`${C.cyan}${C.bold}╠${'═'.repeat(58)}╣${C.reset}`)

    // ── 服务器信息 ──
    if (status.running) {
      const healthIcon = status.healthy ? `${C.green}●${C.reset}` : `${C.yellow}●${C.reset}`
      console.log(`${C.cyan}${C.bold}║${C.reset}  ${healthIcon} Server: ${C.green}Running${C.reset}${' '.repeat(20)}PID: ${status.pid}${' '.repeat(8)}${C.cyan}║${C.reset}`)
      console.log(`${C.cyan}${C.bold}║${C.reset}   Port: ${C.bold}${status.port}${C.reset}${' '.repeat(18)}${C.cyan}http://localhost:${status.port}/canvas${' '.repeat(3)}${C.cyan}║${C.reset}`)
    } else {
      console.log(`${C.cyan}${C.bold}║${C.reset}  ${C.red}●${C.reset} Server: ${C.red}Stopped${C.reset}${' '.repeat(42)}${C.cyan}║${C.reset}`)
    }

    console.log(`${C.cyan}${C.bold}╠${'═'.repeat(58)}╣${C.reset}`)

    // ── 健康检查 ──
    if (status.running) {
      const health = await apiGet('/api/ai/health')
      if (health.ok && health.data?.ok) {
        console.log(`${C.cyan}${C.bold}║${C.reset}  ${C.green}✓${C.reset} AI Provider: ${C.green}Connected${C.reset}  Model: ${health.data.config?.defaultModel || '-'}${' '.repeat(5)}${C.cyan}║${C.reset}`)
      } else {
        console.log(`${C.cyan}${C.bold}║${C.reset}  ${C.red}✗${C.reset} AI Provider: ${C.red}Disconnected${C.reset}${' '.repeat(32)}${C.cyan}║${C.reset}`)
      }
    }

    console.log(`${C.cyan}${C.bold}╚${'═'.repeat(58)}╝${C.reset}`)

    // ── 快捷操作提示 ──
    console.log(`\n${C.dim}快捷键参考:${C.reset}`)
    console.log(`  ${C.gray}server start${C.reset}    启动服务器`)
    console.log(`  ${C.gray}server stop${C.reset}     停止服务器`)
    console.log(`  ${C.gray}health${C.reset}          健康检查`)
    console.log(`  ${C.gray}chat "..."${C.reset}       发送 AI 聊天`)
    console.log(`  ${C.gray}image "..."${C.reset}      生成图片`)
    console.log(`  ${C.gray}config${C.reset}           查看配置`)
    console.log(`  ${C.gray}logs --follow${C.reset}    实时日志`)
    console.log(`  ${C.gray}Ctrl+C${C.reset}           退出`)
  }

  await render()
  interval = setInterval(render, 5000)

  // 等待 Ctrl+C
  process.on('SIGINT', () => {
    clearInterval(interval)
    process.stdout.write('\x1b[2J\x1b[H')
    success('仪表盘已退出')
    process.exit(0)
  })

  await new Promise(() => {})
}

// ── 主入口 ──

async function main() {
  const args = process.argv.slice(2)
  const command = args[0]

  if (!command || command === '--help' || command === '-h') {
    header('星轨画布终端控制台 — StarCanvas CLI')
    console.log(`${C.bold}用法:${C.reset}`)
    console.log(`  node scripts/starcanvas-cli.mjs <command> [options]\n`)
    console.log(`${C.bold}服务器管理:${C.reset}`)
    console.log(`  ${C.cyan}server start${C.reset}        启动开发服务器`)
    console.log(`  ${C.cyan}server stop${C.reset}         停止服务器`)
    console.log(`  ${C.cyan}server restart${C.reset}      重启服务器`)
    console.log(`  ${C.cyan}server status${C.reset}       查看服务器状态\n`)
    console.log(`${C.bold}API 操作:${C.reset}`)
    console.log(`  ${C.cyan}health${C.reset}              检查 AI Provider 连接`)
    console.log(`  ${C.cyan}provider-smoke${C.reset}      分项检查真实 Provider 可运行性`)
    console.log(`  ${C.cyan}config${C.reset}              查看当前配置`)
    console.log(`  ${C.cyan}chat <prompt>${C.reset}       发送 AI 聊天`)
    console.log(`  ${C.cyan}image <prompt>${C.reset}      生成图片\n`)
    console.log(`${C.bold}画布 & 工作流:${C.reset}`)
    console.log(`  ${C.cyan}nodes${C.reset}               列出画布节点`)
    console.log(`  ${C.cyan}node info <id>${C.reset}      查看节点详情`)
    console.log(`  ${C.cyan}node run <id>${C.reset}       运行单个节点`)
    console.log(`  ${C.cyan}workflow run${C.reset}        运行工作流\n`)
    console.log(`${C.bold}监控 & 仪表盘:${C.reset}`)
    console.log(`  ${C.cyan}dashboard${C.reset}           启动终端仪表盘`)
    console.log(`  ${C.cyan}logs${C.reset}                查看日志`)
    console.log(`  ${C.cyan}logs --follow${C.reset}       实时追踪日志\n`)
    process.exit(0)
  }

  switch (command) {
    case 'server':
      switch (args[1]) {
        case 'start': await cmdServerStart(); break
        case 'stop': await cmdServerStop(); break
        case 'restart':
          await cmdServerStop()
          await new Promise(r => setTimeout(r, 1000))
          await cmdServerStart()
          break
        case 'status': await cmdServerStatus(); break
        default:
          error(`未知子命令: ${args[1]}。可用: start|stop|restart|status`)
      }
      break
    case 'health': await cmdHealth(); break
    case 'provider-smoke': await cmdProviderSmoke(); break
    case 'config': await cmdConfig(); break
    case 'nodes': await cmdNodes(); break
    case 'node':
      switch (args[1]) {
        case 'info': await cmdNodeInfo(args[2]); break
        case 'run': await cmdNodeRun(args[2]); break
        default: error('用法: node info <id> | node run <id>')
      }
      break
    case 'workflow':
      switch (args[1]) {
        case 'run': await cmdWorkflowRun(); break
        default: error(`未知子命令: ${args[1]}。可用: run`)
      }
      break
    case 'chat': await cmdChat(args.slice(1).join(' ')); break
    case 'image': await cmdImage(args.slice(1).join(' ')); break
    case 'logs': await cmdLogs({ follow: args.includes('--follow') }); break
    case 'dashboard': await cmdDashboard(); break
    default:
      error(`未知命令: ${command}`)
      info(`查看帮助: node scripts/starcanvas-cli.mjs --help`)
  }
}

// ── 不太关键的辅助命令（占位） ──

async function cmdNodeInfo(id) {
  header('节点详情')
  warn('节点信息存储在浏览器 localStorage 中，终端 API 尚未提供。')
  info('请使用 dashboard 命令或直接在浏览器中查看。')
}

async function cmdNodeRun(id) {
  header('运行节点')
  if (!id) {
    error('请提供节点 ID。用法: node run <id>')
    return
  }
  warn('节点运行需通过前端 Zustand store 触发，终端 API 尚未暴露此能力。')
  info('后续版本将支持通过 API 直接运行节点。')
}

main().catch(e => {
  error(`CLI 运行错误: ${e.message}`)
  process.exit(1)
})
