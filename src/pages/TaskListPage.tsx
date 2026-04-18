import { useState } from 'react'
import { getTaskList, getTaskQueue, cancelTask } from '../api'
import type { SpeedMode } from '../api'
import type { MJTask } from '../types'
import TaskCard from '../components/TaskCard'

interface TaskListPageProps { mode: SpeedMode }

const STATUS_COLOR: Record<string, string> = {
  NOT_START: 'bg-gray-500', SUBMITTED: 'bg-blue-500',
  IN_PROGRESS: 'bg-yellow-500', SUCCESS: 'bg-green-500',
  FAILURE: 'bg-red-500', CANCEL: 'bg-gray-400',
}

export default function TaskListPage({ mode }: TaskListPageProps) {
  const [tasks, setTasks] = useState<MJTask[]>([])
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'list' | 'queue'>('list')
  const [error, setError] = useState<string | null>(null)
  const [cancelLoading, setCancelLoading] = useState<string | null>(null)

  async function fetchTasks() {
    setLoading(true); setError(null)
    try {
      const res = tab === 'list' ? await getTaskList(mode) : await getTaskQueue(mode)
      setTasks(Array.isArray(res) ? res : [])
    } catch (e: any) {
      setError(e.message ?? '查询失败')
    } finally {
      setLoading(false)
    }
  }

  async function handleCancel(id: string) {
    setCancelLoading(id)
    try {
      await cancelTask(id, mode)
      setTasks((prev) => prev.map((t) => t.id === id ? { ...t, status: 'CANCEL' } : t))
    } catch (e) {
      console.error(e)
    } finally {
      setCancelLoading(null)
    }
  }

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
        <h2 className="text-lg font-semibold text-slate-700">📋 任务管理</h2>

        <div className="flex gap-2">
          {(['list', 'queue'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-sm px-4 py-1.5 rounded-lg border transition-colors ${
                tab === t ? 'bg-indigo-500 text-white border-indigo-500' : 'border-gray-200 text-slate-600 hover:border-indigo-300'
              }`}
            >
              {t === 'list' ? '全部任务' : '队列中'}
            </button>
          ))}
          <button
            onClick={fetchTasks}
            disabled={loading}
            className="ml-auto text-sm px-4 py-1.5 rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-50"
          >
            {loading ? '加载中…' : '🔄 刷新'}
          </button>
        </div>

        {error && <div className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-xl p-3">{error}</div>}

        {tasks.length === 0 && !loading && (
          <p className="text-sm text-slate-400 text-center py-6">暂无数据，点击刷新按钮加载</p>
        )}

        {tasks.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500">
                  <th className="px-3 py-2 text-left rounded-l-lg">任务 ID</th>
                  <th className="px-3 py-2 text-left">类型</th>
                  <th className="px-3 py-2 text-left">状态</th>
                  <th className="px-3 py-2 text-left">进度</th>
                  <th className="px-3 py-2 text-left">Prompt</th>
                  <th className="px-3 py-2 text-left rounded-r-lg">操作</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id} className="border-t border-gray-50 hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-2 font-mono text-slate-400 max-w-24 truncate">{t.id.slice(0, 8)}…</td>
                    <td className="px-3 py-2 text-slate-600">{t.action}</td>
                    <td className="px-3 py-2">
                      <span className={`text-white px-2 py-0.5 rounded-full text-xs ${STATUS_COLOR[t.status] ?? 'bg-gray-400'}`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-500">{t.progress ?? '-'}</td>
                    <td className="px-3 py-2 text-slate-600 max-w-36 truncate">{t.prompt ?? '-'}</td>
                    <td className="px-3 py-2 flex gap-1">
                      {t.imageUrl && (
                        <a href={t.imageUrl} target="_blank" rel="noreferrer"
                          className="text-indigo-500 hover:text-indigo-700 px-2 py-0.5 rounded border border-indigo-200 hover:bg-indigo-50">
                          查看
                        </a>
                      )}
                      {(t.status === 'SUBMITTED' || t.status === 'IN_PROGRESS' || t.status === 'NOT_START') && (
                        <button
                          onClick={() => handleCancel(t.id)}
                          disabled={cancelLoading === t.id}
                          className="text-red-400 hover:text-red-600 px-2 py-0.5 rounded border border-red-200 hover:bg-red-50 disabled:opacity-50"
                        >
                          取消
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 卡片视图 */}
      {tasks.filter((t) => t.status === 'SUCCESS' && t.imageUrl).length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-slate-500 mb-2">已完成图片</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tasks.filter((t) => t.status === 'SUCCESS' && t.imageUrl).map((t) => (
              <TaskCard key={t.id} task={t} mode={mode} onRefresh={fetchTasks} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
