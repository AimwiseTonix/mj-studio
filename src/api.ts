import type { MJTask } from './types'

// API 基础配置
export const API_KEY = import.meta.env.VITE_MJ_API_KEY || ''
export const BASE_URL = '/api' // 通过 vite 代理转发到 https://api.avman.ai

// 速度模式
export type SpeedMode = 'fast' | 'turbo' | 'relax'

const MODE_PREFIX: Record<SpeedMode, string> = {
  fast: '/mj',
  turbo: '/mj-turbo/mj',
  relax: '/mj-relax/mj',
}

function getHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${API_KEY}`,
  }
}

function getBaseUrl(mode: SpeedMode) {
  return `${BASE_URL}${MODE_PREFIX[mode]}`
}

/**
 * 安全解析响应（用于提交类 API）——严格模式，非 JSON 直接抛错
 */
async function safeJson(res: Response) {
  const text = await res.text()
  if (!text || text.trim() === '') {
    return {
      code: res.ok ? 1 : res.status,
      description: res.ok ? 'ok' : `HTTP ${res.status} ${res.statusText}`,
    }
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`服务器返回了非 JSON 响应 (HTTP ${res.status})：${text.slice(0, 200)}`)
  }
}

/**
 * 宽松解析响应（用于查询类 API）——遇到任何问题都降级，不抛错
 */
async function looseJson<T = unknown>(res: Response, fallback: T): Promise<T> {
  const text = await res.text()
  if (!text || text.trim() === '') return fallback
  // HTML → 降级
  if (text.trim().startsWith('<')) return fallback
  try {
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

// ==================== 任务提交 ====================

export async function submitImagine(
  prompt: string,
  mode: SpeedMode = 'fast',
  notifyHook?: string,
  state?: string
) {
  console.log('[MJ Submit] 发送请求:', { prompt, mode })
  const res = await fetch(`${getBaseUrl(mode)}/submit/imagine`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ prompt, notifyHook, state }),
  })
  const raw = await res.text()
  console.log('[MJ Submit] 原始响应:', raw.slice(0, 300))
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error(`提交失败 (HTTP ${res.status})：${raw.slice(0, 200)}`)
  }
}

export async function submitBlend(
  imageUrls: string[],
  mode: SpeedMode = 'fast',
  dimensions?: string
) {
  const res = await fetch(`${getBaseUrl(mode)}/submit/blend`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ imageUrls, dimensions }),
  })
  return safeJson(res)
}

export async function submitDescribe(
  imageUrl: string,
  mode: SpeedMode = 'fast'
) {
  const res = await fetch(`${getBaseUrl(mode)}/submit/describe`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ imageUrl }),
  })
  return safeJson(res)
}

export async function submitShorten(
  prompt: string,
  mode: SpeedMode = 'fast'
) {
  const res = await fetch(`${getBaseUrl(mode)}/submit/shorten`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ prompt }),
  })
  return safeJson(res)
}

export async function submitAction(
  taskId: string,
  action: string,
  index?: number,
  mode: SpeedMode = 'fast',
  imageId?: string
) {
  // 根据文档: customId = MJ::JOB::{action}::{index}::{imageId}
  // action: upsample(放大) / variation(变体)
  const customId = imageId
    ? `MJ::JOB::${action}::${index}::${imageId}`
    : `MJ::JOB::${action}::${index}`

  console.log('[MJ submitAction]', { taskId, action, index, imageId, customId })
  const res = await fetch(`${getBaseUrl(mode)}/submit/action`, {
    method: 'POST',
    headers: getHeaders(),
    // 只传 customId，Avman API 期望这个字段
    body: JSON.stringify({ taskId, customId }),
  })
  return safeJson(res)
}

// ==================== 任务查询 ====================

// 任务详情：通过批量条件查询 POST /mj/task/list-by-condition
// ✅ 官方 API，返回 JSON 格式的完整任务对象
export async function getTask(taskId: string, mode: SpeedMode = 'fast'): Promise<MJTask> {
  try {
    const res = await fetch(`${getBaseUrl(mode)}/task/list-by-condition`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ ids: [taskId] }),
    })
    const text = await res.text()
    console.log(`[MJ getTask] id=${taskId} HTTP ${res.status} | ${text.slice(0, 200)}`)

    // 非 JSON（HTML 或空）→ 还在处理中，继续轮询
    if (!text.trim().startsWith('[') && !text.trim().startsWith('{')) {
      return { id: taskId, status: 'IN_PROGRESS', action: 'IMAGINE' }
    }

    const data = JSON.parse(text)
    // 返回的是任务数组，从中找到对应 ID 的任务
    const tasks: MJTask[] = Array.isArray(data) ? data : [data]
    const task = tasks.find((t) => String(t.id) === String(taskId)) || tasks[0]
    if (!task) return { id: taskId, status: 'IN_PROGRESS', action: 'IMAGINE' }
    console.log(`[MJ getTask] id=${taskId} parsed:`, JSON.stringify(task).slice(0, 300))
    return task
  } catch (e) {
    console.warn(`[MJ getTask] id=${taskId} error:`, e)
    return { id: taskId, status: 'IN_PROGRESS', action: 'IMAGINE' }
  }
}

// 获取全部任务列表：/mj/tasks（不是 /list）
export async function getTaskList(mode: SpeedMode = 'fast'): Promise<unknown[]> {
  const res = await fetch(`${getBaseUrl(mode)}/tasks`, {
    headers: getHeaders(),
  })
  const text = await res.text()
  if (!text || text.trim() === '') return []
  // 如果是 HTML，说明此端点不可用，静默返回空列表
  if (text.trim().startsWith('<!') || text.trim().startsWith('<html')) {
    console.warn('[MJ API] /tasks 端点返回 HTML，可能不支持任务列表功能')
    return []
  }
  try {
    return JSON.parse(text)
  } catch {
    console.warn('[MJ API] 解析任务列表失败:', text.slice(0, 200))
    return []
  }
}

// 获取任务队列：/mj/queue
export async function getTaskQueue(mode: SpeedMode = 'fast'): Promise<unknown[]> {
  const res = await fetch(`${getBaseUrl(mode)}/queue`, {
    headers: getHeaders(),
  })
  const text = await res.text()
  if (!text || text.trim() === '') return []
  if (text.trim().startsWith('<!') || text.trim().startsWith('<html')) {
    console.warn('[MJ API] /queue 端点返回 HTML，可能不支持队列查询功能')
    return []
  }
  try {
    return JSON.parse(text)
  } catch {
    console.warn('[MJ API] 解析队列失败:', text.slice(0, 200))
    return []
  }
}

// 取消任务：POST /mj/cancel  body: { id }
export async function cancelTask(taskId: string, mode: SpeedMode = 'fast') {
  const res = await fetch(`${getBaseUrl(mode)}/cancel`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ id: taskId }),
  })
  return safeJson(res)
}

// 提交视频生成：POST /mj/submit/video
export async function submitVideo(
  imageUrl: string,
  mode: SpeedMode = 'fast'
) {
  console.log('[MJ submitVideo]', { imageUrl, mode })
  const res = await fetch(`${getBaseUrl(mode)}/submit/video`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ imageUrl }),
  })
  return safeJson(res)
}
