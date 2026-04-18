import { useState } from 'react'
import type { MJTask } from '../types'
import { submitAction } from '../api'
import type { SpeedMode } from '../api'

interface TaskCardProps {
  task: MJTask
  mode: SpeedMode
  onRefresh: () => void
  onNewTask: (taskId: string) => void
}

const STATUS_COLOR: Record<string, string> = {
  NOT_START: 'bg-gray-500',
  SUBMITTED: 'bg-blue-500',
  IN_PROGRESS: 'bg-yellow-500',
  SUCCESS: 'bg-green-500',
  FAILURE: 'bg-red-500',
  CANCEL: 'bg-gray-400',
}

const STATUS_LABEL: Record<string, string> = {
  NOT_START: '等待中',
  SUBMITTED: '已提交',
  IN_PROGRESS: '生成中',
  SUCCESS: '已完成',
  FAILURE: '失败',
  CANCEL: '已取消',
}

export default function TaskCard({ task, mode, onRefresh, onNewTask }: TaskCardProps) {
  const [loading, setLoading] = useState<string | null>(null)
  const [copyTip, setCopyTip] = useState(false)

  async function handleAction(customId: string, label: string) {
    setLoading(customId)
    try {
      const res = await submitAction(task.id, customId, undefined, mode)
      console.log(`[MJ Action] ${label} 响应:`, JSON.stringify(res))
      // submit/action 返回新任务的 ID，开始轮询新任务
      if (res.result) {
        onNewTask(res.result)
      } else {
        setTimeout(onRefresh, 2000)
      }
    } catch (e) {
      console.error(`[MJ Action] ${label} 失败:`, e)
    } finally {
      setLoading(null)
    }
  }

  function copyId() {
    navigator.clipboard.writeText(task.id)
    setCopyTip(true)
    setTimeout(() => setCopyTip(false), 1500)
  }

  const isImg = task.status === 'SUCCESS' && task.imageUrl

  return (
    <div className="bg-white rounded-2xl shadow-md overflow-hidden border border-gray-100 flex flex-col">
      {/* 图片区 */}
      {isImg ? (
        <div className="relative group">
          <img
            src={task.imageUrl}
            alt={task.prompt ?? 'MJ Image'}
            className="w-full object-cover max-h-72"
          />
          <a
            href={task.imageUrl}
            target="_blank"
            rel="noreferrer"
            className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity text-white text-sm font-medium"
          >
            🔍 查看原图
          </a>
        </div>
      ) : (
        <div className="w-full h-40 flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
          {task.status === 'IN_PROGRESS' ? (
            <div className="text-center">
              <div className="w-10 h-10 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <span className="text-sm text-slate-500">{task.progress ?? '生成中…'}</span>
            </div>
          ) : task.status === 'FAILURE' ? (
            <span className="text-red-400 text-sm px-4 text-center">{task.failReason ?? '生成失败'}</span>
          ) : (
            <span className="text-slate-400 text-sm">
              {STATUS_LABEL[task.status] ?? task.status}
            </span>
          )}
        </div>
      )}

      {/* 信息区 */}
      <div className="p-3 flex flex-col gap-2 flex-1">
        <div className="flex items-center gap-2">
          <span className={`text-xs text-white px-2 py-0.5 rounded-full ${STATUS_COLOR[task.status] ?? 'bg-gray-400'}`}>
            {STATUS_LABEL[task.status] ?? task.status}
          </span>
          <span className="text-xs text-slate-400 truncate flex-1">{task.action}</span>
          <button
            onClick={copyId}
            className="text-xs text-slate-400 hover:text-indigo-500 transition-colors shrink-0"
            title="复制任务 ID"
          >
            {copyTip ? '✅' : '📋'} ID
          </button>
        </div>

        {task.prompt && (
          <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">{task.prompt}</p>
        )}

        {/* 操作按钮 */}
        {task.buttons && task.buttons.length > 0 && task.status === 'SUCCESS' && (
          <div className="flex flex-wrap gap-1 mt-1">
            {task.buttons.map((btn) => (
              <button
                key={btn.customId}
                onClick={() => handleAction(btn.customId, btn.label)}
                disabled={loading === btn.customId}
                className="text-xs px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 disabled:opacity-50 transition-colors"
              >
                {loading === btn.customId ? '⏳' : btn.emoji} {btn.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
