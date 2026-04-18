import { useState } from 'react'
import { submitBlend } from '../api'
import type { SpeedMode } from '../api'
import { useTaskPolling } from '../hooks/useTaskPolling'
import type { MJTask } from '../types'
import TaskCard from '../components/TaskCard'

interface BlendPageProps { mode: SpeedMode }

export default function BlendPage({ mode }: BlendPageProps) {
  const [urls, setUrls] = useState<string[]>(['', ''])
  const [dimensions, setDimensions] = useState('SQUARE')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null)
  const [currentTask, setCurrentTask] = useState<MJTask | null>(null)
  const [history, setHistory] = useState<MJTask[]>([])

  useTaskPolling({
    taskId: currentTaskId,
    mode,
    onUpdate: (task) => {
      setCurrentTask(task)
      if (task.status === 'SUCCESS' || task.status === 'FAILURE') {
        setHistory((prev) => {
          const exists = prev.find((t) => t.id === task.id)
          return exists ? prev.map((t) => (t.id === task.id ? task : t)) : [task, ...prev]
        })
        setCurrentTaskId(null)
      }
    },
  })

  function updateUrl(i: number, val: string) {
    setUrls((prev) => prev.map((u, idx) => (idx === i ? val : u)))
  }

  function addUrl() { if (urls.length < 5) setUrls((p) => [...p, '']) }
  function removeUrl(i: number) { if (urls.length > 2) setUrls((p) => p.filter((_, idx) => idx !== i)) }

  async function handleSubmit() {
    const validUrls = urls.filter((u) => u.trim())
    if (validUrls.length < 2) { setError('至少需要 2 个图片链接'); return }
    setLoading(true); setError(null)
    try {
      const res = await submitBlend(validUrls, mode, dimensions)
      if ((res.code === 1 || res.code === 200) && res.result) {
        setCurrentTaskId(res.result)
        setCurrentTask({ id: res.result, action: 'BLEND', status: 'SUBMITTED' })
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
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
        <h2 className="text-lg font-semibold text-slate-700">🎨 混图 Blend</h2>
        <p className="text-xs text-slate-400">上传 2-5 张图片的公开 URL，将它们混合成一张新图</p>

        <div className="space-y-2">
          {urls.map((url, i) => (
            <div key={i} className="flex gap-2 items-center">
              <span className="text-xs text-slate-400 w-5">{i + 1}</span>
              <input
                type="text"
                value={url}
                onChange={(e) => updateUrl(i, e.target.value)}
                placeholder={`图片 ${i + 1} URL（https://...）`}
                className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              {urls.length > 2 && (
                <button onClick={() => removeUrl(i)} className="text-red-400 hover:text-red-600 text-sm">✕</button>
              )}
            </div>
          ))}
        </div>

        {urls.length < 5 && (
          <button onClick={addUrl} className="text-xs text-indigo-500 hover:text-indigo-700 font-medium">
            + 添加图片
          </button>
        )}

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium">输出比例</span>
          {['PORTRAIT', 'SQUARE', 'LANDSCAPE'].map((d) => (
            <button
              key={d}
              onClick={() => setDimensions(d)}
              className={`text-xs px-3 py-1 rounded-lg border transition-colors ${
                dimensions === d ? 'bg-indigo-500 text-white border-indigo-500' : 'border-gray-200 text-slate-600 hover:border-indigo-300'
              }`}
            >
              {d === 'PORTRAIT' ? '竖向' : d === 'SQUARE' ? '正方' : '横向'}
            </button>
          ))}
        </div>

        {error && <div className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-xl p-3">{error}</div>}

        <button
          onClick={handleSubmit}
          disabled={loading || !!currentTaskId}
          className="w-full py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-300 text-white font-medium text-sm transition-colors"
        >
          {loading ? '提交中…' : currentTaskId ? '生成中，请稍候…' : '🚀 开始混图'}
        </button>
      </div>

      {currentTask && (
        <div>
          <h3 className="text-sm font-medium text-slate-500 mb-2">当前任务</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <TaskCard task={currentTask} mode={mode} onRefresh={() => {}} />
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-slate-500 mb-2">历史结果</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {history.map((t) => (
              <TaskCard key={t.id} task={t} mode={mode} onRefresh={() => {}} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
