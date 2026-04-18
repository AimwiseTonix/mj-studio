import { useState } from 'react'
import { submitShorten } from '../api'
import type { SpeedMode } from '../api'
import { useTaskPolling } from '../hooks/useTaskPolling'
import type { MJTask } from '../types'

interface ShortenPageProps { mode: SpeedMode }

export default function ShortenPage({ mode }: ShortenPageProps) {
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null)
  const [result, setResult] = useState<MJTask | null>(null)

  useTaskPolling({
    taskId: currentTaskId,
    mode,
    onUpdate: (task) => {
      setResult(task)
      if (task.status === 'SUCCESS' || task.status === 'FAILURE') {
        setCurrentTaskId(null)
      }
    },
  })

  async function handleSubmit() {
    if (!prompt.trim()) return
    setLoading(true); setError(null); setResult(null)
    try {
      const res = await submitShorten(prompt.trim(), mode)
      if ((res.code === 1 || res.code === 200) && res.result) {
        setCurrentTaskId(res.result)
        setResult({ id: res.result, action: 'SHORTEN', status: 'SUBMITTED' })
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
        <h2 className="text-lg font-semibold text-slate-700">✂️ Prompt 精简 Shorten</h2>
        <p className="text-xs text-slate-400">输入一段较长的 Prompt，AI 将为你提炼出关键词</p>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="输入需要精简的 Prompt..."
          rows={5}
          className="w-full rounded-xl border border-gray-200 p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />

        {error && <div className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-xl p-3">{error}</div>}

        <button
          onClick={handleSubmit}
          disabled={loading || !prompt.trim() || !!currentTaskId}
          className="w-full py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-300 text-white font-medium text-sm transition-colors"
        >
          {loading ? '提交中…' : currentTaskId ? '分析中，请稍候…' : '✂️ 开始精简'}
        </button>
      </div>

      {result && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className={`text-xs text-white px-2 py-0.5 rounded-full ${
              result.status === 'SUCCESS' ? 'bg-green-500' :
              result.status === 'FAILURE' ? 'bg-red-500' :
              result.status === 'IN_PROGRESS' ? 'bg-yellow-500' : 'bg-blue-500'
            }`}>
              {result.status === 'SUCCESS' ? '已完成' : result.status === 'FAILURE' ? '失败' : result.status === 'IN_PROGRESS' ? '分析中' : '已提交'}
            </span>
            {result.status === 'IN_PROGRESS' && (
              <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            )}
          </div>

          {result.status === 'SUCCESS' && result.prompt && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-500">精简后的 Prompt：</p>
              <div className="bg-slate-50 rounded-xl p-3 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                {result.prompt}
              </div>
              <button
                onClick={() => navigator.clipboard.writeText(result.prompt ?? '')}
                className="text-xs text-indigo-500 hover:text-indigo-700"
              >
                📋 复制结果
              </button>
            </div>
          )}

          {result.status === 'FAILURE' && (
            <p className="text-sm text-red-500">{result.failReason ?? '处理失败'}</p>
          )}
        </div>
      )}
    </div>
  )
}
