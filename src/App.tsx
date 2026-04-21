import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { chatStream, chatOnce, type ChatMessage } from './gemini'
import { submitImagine, getTask, submitAction, submitVideo, submitActionCustom, type SpeedMode } from './api'

// ============================================================
// 类型
// ============================================================
interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  time: number
}

interface Task {
  id: string
  prompt: string
  imageUrl?: string
  videoUrl?: string
  status: 'pending' | 'loading' | 'success' | 'failed'
  failReason?: string
  action?: string  // imagine, upscale, variation, video
  label?: string   // U1, U2, V1, V2, etc
}

// ============================================================
// 子组件
// ============================================================

// 全屏图片预览
function ImagePreview({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 z-10 px-4 py-2 rounded-lg text-white text-sm font-medium transition-all hover:brightness-110 hover:shadow-lg" style={{ background: '#333', border: '1px solid #555' }}>
        ✕ 关闭
      </button>
      <img src={url} alt="预览" className="w-full h-full object-contain" onClick={e => e.stopPropagation()} />
    </div>,
    document.body
  )
}

// MJ任务卡片
function TaskCard({ task, onAction, onVideo, mode }: {
  task: Task
  onAction: (taskId: string, action: string, label: string) => void
  onVideo: (imageUrl: string) => void
  mode: SpeedMode
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [showUpscale, setShowUpscale] = useState(false)

  // 任务完成后的操作按钮
  const renderActions = () => {
    if (!task.imageUrl || task.status !== 'success') return null

    // 如果是upscale/video结果，显示视频按钮
    if (task.action === 'upscale' && !task.videoUrl) {
      return (
        <div className="mt-1">
          <div className="grid grid-cols-4 gap-1">
            {[1, 2, 3, 4].map(i => (
              <button
                key={`vid-${i}`}
                onClick={() => onVideo(task.imageUrl!)}
                className="text-xs py-1 rounded font-bold transition-all hover:brightness-110"
                style={{ background: 'linear-gradient(135deg, #FF6B6B50, #FFE66D50)', color: 'white', border: '1px solid #FF6B6B60' }}
              >
                Vid{i}
              </button>
            ))}
          </div>
        </div>
      )
    }

    // 视频结果
    if (task.videoUrl) {
      return (
        <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #FF6B6B40' }}>
          <video src={task.videoUrl} controls className="w-full" />
        </div>
      )
    }

    // 正常图片显示U1-U4和V1-V4
    return (
      <div className="mt-1 space-y-1">
        <div className="grid grid-cols-4 gap-1">
          {[1, 2, 3, 4].map(i => (
            <button
              key={`U${i}`}
              onClick={() => onAction(task.id, 'upsample', i)}
              className="text-xs py-1 rounded font-bold transition-all hover:brightness-110"
              style={{ background: 'linear-gradient(135deg, #6633FF50, #CC33FF50)', color: 'white', border: '1px solid #6633FF80' }}
            >
              {`U${i}`}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-1">
          {[1, 2, 3, 4].map(i => (
            <button
              key={`V${i}`}
              onClick={() => onAction(task.id, 'variation', i)}
              className="text-xs py-1 rounded font-bold transition-all hover:brightness-110"
              style={{ background: 'linear-gradient(135deg, #33CCFF50, #33FFCC50)', color: 'white', border: '1px solid #33CCFF80' }}
            >
              {`V${i}`}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg p-2 transition-all" style={{ background: '#1a1a2e', border: '1px solid #2a2a4e' }}>
      {/* 提示词 */}
      <div className="text-xs text-gray-400 mb-1 line-clamp-1">{task.prompt}</div>

      {/* 状态/图片 */}
      {task.status === 'loading' && (
        <div className="flex items-center justify-center h-16 rounded" style={{ background: '#0a0a15' }}>
          <span className="animate-spin text-lg">↻</span>
        </div>
      )}

      {task.status === 'failed' && (
        <div className="p-2 rounded text-red-400 text-xs" style={{ background: '#FF336615' }}>
          ❌ 失败{task.failReason ? `：${task.failReason}` : ''}
        </div>
      )}

      {task.imageUrl && task.status === 'success' && (
        <>
          <div className="rounded overflow-hidden cursor-pointer" onClick={() => setPreviewUrl(task.imageUrl!)}>
            <img src={task.imageUrl} alt="结果" className="w-full" />
          </div>
          {renderActions()}
        </>
      )}

      {/* 预览 */}
      {previewUrl && <ImagePreview url={previewUrl} onClose={() => setPreviewUrl(null)} />}
    </div>
  )
}

// ============================================================
// 主组件
// ============================================================
export default function App() {
  const [mode, setMode] = useState<SpeedMode>('fast')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)

  const [mjPrompt, setMjPrompt] = useState('')
  const [mjPromptLoading, setMjPromptLoading] = useState(false)
  const [tasks, setTasks] = useState<Task[]>([])
  const [genLoading, setGenLoading] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const MODE_OPTIONS: { value: SpeedMode; label: string }[] = [
    { value: 'fast', label: '⚡ Fast' },
    { value: 'turbo', label: '🚀 Turbo' },
    { value: 'relax', label: '💤 Relax' },
  ]

  // 自动滚动到最新消息
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 聊天
  async function handleSend() {
    if (!input.trim() || chatLoading) return
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: input.trim(), time: Date.now() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setChatLoading(true)

    try {
      const assistantMsg: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: '', time: Date.now() }
      setMessages(prev => [...prev, assistantMsg])

      const allMessages: ChatMessage[] = [
        ...messages.filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content
        })),
        { role: 'user', content: userMsg.content }
      ]

      let fullContent = ''
      for await (const chunk of chatStream(allMessages)) {
        fullContent += chunk
        setMessages(prev => prev.map(m => m.id === assistantMsg.id ? { ...m, content: fullContent } : m))
      }
    } catch (e) {
      console.error(e)
    } finally {
      setChatLoading(false)
    }
  }

  // 转换为MJ提示词
  async function handleConvertToMJ() {
    if (!mjPrompt.trim() || mjPromptLoading) return
    setMjPromptLoading(true)
    try {
      const convertPrompt = `将以下内容转化为专业的Midjourney英文提示词。要求：
1. 纯英文输出，无任何特殊符号（除了最后的 --）
2. 使用逗号分隔
3. 包含细节、风格、光线、氛围等
4. 参数：--ar 16:9 --v 7 --style raw

内容：
${mjPrompt}`
      const result = await chatOnce([
        { role: 'user', content: convertPrompt }
      ])
      // 清理结果，移除特殊符号
      const cleaned = result.replace(/[""''【】《》（）()[\]{}【】]/g, '').replace(/--/g, ' --').trim()
      setMjPrompt(cleaned)
    } catch (e) {
      console.error(e)
    } finally {
      setMjPromptLoading(false)
    }
  }

  // 生成MJ图片
  async function handleGenerateMJ() {
    if (!mjPrompt.trim() || genLoading) return
    setGenLoading(true)

    const newTask: Task = {
      id: `task-${Date.now()}`,
      prompt: mjPrompt,
      status: 'loading'
    }
    setTasks(prev => [newTask, ...prev])

    try {
      const res = await submitImagine(mjPrompt, mode)
      const taskId = res.result ?? res.taskId
      if (!taskId) throw new Error('No task ID returned')

      // 轮询
      const poll = setInterval(async () => {
        try {
          const task = await getTask(taskId, mode)
          if (task.status === 'SUCCESS' && task.imageUrl) {
            clearInterval(poll)
            setTasks(prev => prev.map(t => t.id === newTask.id ? {
              ...t,
              status: 'success',
              imageUrl: task.imageUrl
            } : t))
            setGenLoading(false)
          } else if (task.status === 'FAILURE') {
            clearInterval(poll)
            setTasks(prev => prev.map(t => t.id === newTask.id ? {
              ...t,
              status: 'failed',
              failReason: task.failReason
            } : t))
            setGenLoading(false)
          }
        } catch (e) { /* ignore */ }
      }, 3000)
    } catch (e: any) {
      setTasks(prev => prev.map(t => t.id === newTask.id ? { ...t, status: 'failed', failReason: e.message } : t))
      setGenLoading(false)
    }
  }

  // U/V操作
  async function handleAction(taskId: string, action: string, index: number) {
    const parentTask = tasks.find(t => t.id === taskId)
    if (!parentTask?.imageUrl) return

    // 从parentTask的buttons获取完整的customId
    const btn = parentTask.buttons?.[index - 1]
    if (!btn?.customId) {
      console.error('[handleAction] No button customId found', { index, buttons: parentTask.buttons })
      return
    }

    const newTask: Task = {
      id: `task-${Date.now()}`,
      prompt: parentTask.prompt,
      status: 'loading',
      action,
      label: btn.label
    }
    setTasks(prev => [newTask, ...prev])

    try {
      // 使用按钮的完整customId
      const res = await submitActionCustom(parentTask.id, btn.customId, mode)
      const newId = res.result ?? res.taskId
      if (!newId) throw new Error('No task ID')

      const poll = setInterval(async () => {
        try {
          const task = await getTask(newId, mode)
          if (task.status === 'SUCCESS' && task.imageUrl) {
            clearInterval(poll)
            setTasks(prev => prev.map(t => t.id === newTask.id ? {
              ...t,
              status: 'success',
              imageUrl: task.imageUrl,
              action,
              label
            } : t))
          } else if (task.status === 'FAILURE') {
            clearInterval(poll)
            setTasks(prev => prev.map(t => t.id === newTask.id ? {
              ...t,
              status: 'failed',
              failReason: task.failReason
            } : t))
          }
        } catch (e) { /* ignore */ }
      }, 3000)
    } catch (e: any) {
      setTasks(prev => prev.map(t => t.id === newTask.id ? { ...t, status: 'failed', failReason: e.message } : t))
    }
  }

  // 视频生成
  async function handleVideo(imageUrl: string) {
    const newTask: Task = {
      id: `task-${Date.now()}`,
      prompt: 'Video generation',
      status: 'loading',
      action: 'video'
    }
    setTasks(prev => [newTask, ...prev])

    try {
      const res = await submitVideo(imageUrl)
      const videoId = res.result ?? res.taskId
      if (!videoId) throw new Error('No video task ID')

      const poll = setInterval(async () => {
        try {
          const task = await getTask(videoId, mode)
          if (task.status === 'SUCCESS' && (task.videoUrl || task.gifUrl)) {
            clearInterval(poll)
            setTasks(prev => prev.map(t => t.id === newTask.id ? {
              ...t,
              status: 'success',
              videoUrl: task.videoUrl || task.gifUrl
            } : t))
          } else if (task.status === 'FAILURE') {
            clearInterval(poll)
            setTasks(prev => prev.map(t => t.id === newTask.id ? {
              ...t,
              status: 'failed',
              failReason: task.failReason
            } : t))
          }
        } catch (e) { /* ignore */ }
      }, 3000)
    } catch (e: any) {
      setTasks(prev => prev.map(t => t.id === newTask.id ? { ...t, status: 'failed', failReason: e.message } : t))
    }
  }

  return (
    <div className="min-h-screen flex" style={{ background: '#050508' }}>
      {/* 左侧聊天区 */}
      <div className="w-96 flex flex-col border-r" style={{ borderColor: '#1a1a2e', background: 'linear-gradient(180deg, #0a0a15 0%, #050510 100%)' }}>
        {/* 标题 */}
        <div className="px-4 py-3 border-b" style={{ borderColor: '#1a1a2e' }}>
          <h1 className="text-lg font-bold text-white">💬 AI 助手</h1>
          <p className="text-xs text-gray-500">讨论你的创作想法</p>
        </div>

        {/* 消息列表 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-xl px-4 py-2 ${
                msg.role === 'user'
                  ? 'text-white rounded-br-sm'
                  : 'text-gray-300 rounded-bl-sm'
              }`} style={{
                background: msg.role === 'user'
                  ? 'linear-gradient(135deg, #6633FF, #CC33FF)'
                  : '#1a1a2e'
              }}>
                <pre className="whitespace-pre-wrap text-sm font-sans">{msg.content || (msg.role === 'assistant' ? '思考中...' : '')}</pre>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* 输入框 */}
        <div className="p-4 border-t" style={{ borderColor: '#1a1a2e' }}>
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              placeholder="输入你的想法..."
              className="flex-1 bg-[#1a1a2e] text-white text-sm rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
              rows={2}
            />
            <button
              onClick={handleSend}
              disabled={chatLoading || !input.trim()}
              className="px-4 rounded-lg font-medium transition-all hover:brightness-110 hover:shadow-lg disabled:opacity-50 disabled:hover:scale-100"
              style={{ background: 'linear-gradient(135deg, #6633FF, #CC33FF)', color: 'white', border: '1px solid #6633FF40' }}
            >
              {chatLoading ? '↻' : '➤'}
            </button>
          </div>
        </div>
      </div>

      {/* 右侧MJ生成区 */}
      <div className="flex-1 flex flex-col">
        {/* 顶部模式选择 */}
        <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: '#1a1a2e', background: '#0a0a15' }}>
          <h1 className="text-xl font-bold text-white">🎨 MJ Studio</h1>
          <div className="flex gap-2">
            {MODE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setMode(opt.value)}
                className="px-3 py-1 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: mode === opt.value ? 'linear-gradient(135deg, #6633FF, #CC33FF)' : '#1a1a2e',
                  color: mode === opt.value ? 'white' : '#888',
                  border: mode === opt.value ? 'none' : '1px solid #2a2a4e'
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* MJ提示词区 */}
        <div className="p-6 border-b" style={{ borderColor: '#1a1a2e' }}>
          <div className="flex gap-2 mb-3">
            <textarea
              value={mjPrompt}
              onChange={e => setMjPrompt(e.target.value)}
              placeholder="在这里输入想法，AI会帮你转化成MJ提示词..."
              className="flex-1 bg-[#1a1a2e] text-white text-sm rounded-lg px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
              rows={3}
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleConvertToMJ}
              disabled={mjPromptLoading || !mjPrompt.trim()}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all hover:brightness-110 hover:shadow-lg disabled:opacity-50"
              style={{ background: '#1a1a2e', color: '#ccc', border: '1px solid #6633FF60' }}
            >
              {mjPromptLoading ? '↻ 转化中...' : '✨ 转为MJ提示词'}
            </button>
            <button
              onClick={handleGenerateMJ}
              disabled={genLoading || !mjPrompt.trim()}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-bold transition-all hover:brightness-110 hover:shadow-lg disabled:opacity-50"
              style={{ background: genLoading ? '#333' : 'linear-gradient(135deg, #6633FF, #CC33FF)', color: 'white', border: '1px solid #6633FF60' }}
            >
              {genLoading ? '↻ 生成中...' : '🎨 生成图片'}
            </button>
          </div>
        </div>

        {/* 任务列表 */}
        <div className="flex-1 overflow-y-auto p-6">
          <h2 className="text-sm font-medium text-gray-400 mb-4">📋 生成任务 ({tasks.length})</h2>
          {tasks.length === 0 ? (
            <div className="text-center text-gray-500 py-12">
              <p className="text-4xl mb-4">🎨</p>
              <p>输入提示词开始创作</p>
            </div>
          ) : (
            <div className="grid grid-cols-5 gap-3">
              {tasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onAction={handleAction}
                  onVideo={handleVideo}
                  mode={mode}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
