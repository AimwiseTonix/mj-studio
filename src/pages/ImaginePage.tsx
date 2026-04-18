import { useState } from 'react'
import { submitImagine } from '../api'
import type { SpeedMode } from '../api'
import { useTaskPolling } from '../hooks/useTaskPolling'
import type { MJTask } from '../types'
import TaskCard from '../components/TaskCard'

interface ImaginePageProps {
  mode: SpeedMode
  history: MJTask[]
  onHistoryUpdate: (task: MJTask) => void
}

// MJ 版本列表（以 API 实际支持为准）
const VERSION_OPTIONS = [
  { label: '默认（API自动）', value: '' },
  { label: '--v 6.2', value: '--v 6.2' },
  { label: '--v 7', value: '--v 7' },
  { label: '--niji 7', value: '--niji 7' },
]

const STYLE_PRESETS = [
  { label: '默认', value: '' },
  { label: '写实摄影', value: '--style raw' },
  { label: '动漫', value: '--niji 7' },
  { label: '油画', value: '--style expressive' },
  { label: '水彩', value: '--style scenic' },
  { label: '极简', value: '--style raw' },
  { label: '原始', value: '--style raw --v 6.2' },
]

const AR_PRESETS = ['1:1', '16:9', '9:16', '4:3', '3:4', '2:1']

export default function ImaginePage({ mode, history, onHistoryUpdate }: ImaginePageProps) {
  const [prompt, setPrompt] = useState('')
  const [ar, setAr] = useState('1:1')
  const [stylePreset, setStylePreset] = useState('')
  const [version, setVersion] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null)
  const [currentTask, setCurrentTask] = useState<MJTask | null>(null)

  useTaskPolling({
    taskId: currentTaskId,
    mode,
    onUpdate: (task) => {
      setCurrentTask(task)
      if (task.status === 'SUCCESS' || task.status === 'FAILURE') {
        onHistoryUpdate(task)
        setCurrentTaskId(null)
      }
    },
  })

  // 处理按钮操作（U1/V1等）提交后返回的新任务
  function handleNewTask(newTaskId: string, actionLabel: string) {
    setCurrentTaskId(newTaskId)
    setCurrentTask({
      id: newTaskId,
      action: actionLabel,
      prompt: currentTask?.prompt,
      status: 'SUBMITTED',
    })
  }

  async function handleSubmit() {
    if (!prompt.trim()) return
    const parts = [prompt.trim()]
    if (ar) parts.push(`--ar ${ar}`)
    if (version) parts.push(version)
    if (stylePreset) parts.push(stylePreset)
    const fullPrompt = parts.join(' ')

    setLoading(true)
    setError(null)
    setCurrentTask(null)
    try {
      const res = await submitImagine(fullPrompt, mode)
      if ((res.code === 1 || res.code === 200) && res.result) {
        setCurrentTaskId(res.result)
        setCurrentTask({ id: res.result, action: 'IMAGINE', prompt: fullPrompt, status: 'SUBMITTED' })
      } else {
        const detail = res.description ?? res.message ?? JSON.stringify(res)
        setError(`提交失败 (code=${res.code})：${detail}`)
      }
    } catch (e: any) {
      setError(`网络/解析错误：${e.message ?? String(e)}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* 输入区 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
        <h2 className="text-lg font-semibold text-slate-700">✨ 文生图 Imagine</h2>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="输入英文或中文描述，例如：a futuristic city at night, neon lights, cinematic..."
          rows={4}
          className="w-full rounded-xl border border-gray-200 p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300 transition"
        />

        <div className="flex flex-wrap gap-3 items-center">
          {/* 宽高比 */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">比例</span>
            <div className="flex gap-1">
              {AR_PRESETS.map((r) => (
                <button
                  key={r}
                  onClick={() => setAr(r)}
                  className={`text-xs px-2 py-1 rounded-lg border transition-colors ${
                    ar === r
                      ? 'bg-indigo-500 text-white border-indigo-500'
                      : 'border-gray-200 text-slate-600 hover:border-indigo-300'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* 版本 */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">版本</span>
            <select
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            >
              {VERSION_OPTIONS.map((v) => (
                <option key={v.label} value={v.value}>{v.label}</option>
              ))}
            </select>
          </div>

          {/* 风格 */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">风格</span>
            <select
              value={stylePreset}
              onChange={(e) => setStylePreset(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            >
              {STYLE_PRESETS.map((s) => (
                <option key={s.label} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-xl p-3">{error}</div>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading || !prompt.trim() || !!currentTaskId}
          className="w-full py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-300 text-white font-medium text-sm transition-colors"
        >
          {loading ? '提交中…' : currentTaskId ? '生成中，请稍候…' : '🚀 开始生成'}
        </button>
      </div>

      {/* 当前任务 */}
      {currentTask && (
        <div>
          <h3 className="text-sm font-medium text-slate-500 mb-2">当前任务</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <TaskCard task={currentTask} mode={mode} onRefresh={() => {}} onNewTask={(id) => handleNewTask(id, currentTask.action)} />
          </div>
        </div>
      )}

      {/* 历史记录 */}
      {history.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-slate-500 mb-2">历史结果</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {history.map((t) => (
              <TaskCard key={t.id} task={t} mode={mode} onRefresh={() => {}} onNewTask={(id) => handleNewTask(id, t.action)} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
