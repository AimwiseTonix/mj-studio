import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { chatStream, type ChatMessage } from './gemini'
import { submitImagine, getTask, submitAction, type SpeedMode } from './api'

// ============================================================
// 常量
// ============================================================
const ZODIAC_SIGNS = [
  '白羊座','金牛座','双子座','巨蟹座',
  '狮子座','处女座','天秤座','天蝎座',
  '射手座','摩羯座','水瓶座','双鱼座',
]

const ZODIAC_COLORS: [string, string][] = [
  ['#FF3366','#FF6B8A'],
  ['#FF9933','#FFB366'],
  ['#FFCC00','#FFD633'],
  ['#33CC66','#66D98A'],
  ['#33CCFF','#66D9FF'],
  ['#3366FF','#668AFF'],
  ['#6633FF','#8066FF'],
  ['#CC33FF','#D966FF'],
  ['#FF3366','#FF4D94'],
  ['#00CCCC','#33D9D9'],
  ['#33CCFF','#4DD9FF'],
  ['#FF99CC','#FFB3D9'],
]

// ============================================================
// 提示词
// ============================================================
const DESIGN_PROMPT = `你是角色概念设计师，专注于将主题描述转化为详细的视觉设计方案。
输出12星座完整方案，**所有角色必须为女性形象**。
**核心要求：唯美第一，中景/特写为主，避免全景**
格式：
## [星座名] - [角色标题]
**人设概念：** [一句女性角色定位]
**视觉描述：** [中景或特写镜头，女性角色有具体动作/姿态，场景简洁唯美，CG质感]
**服装设计：** [唯美女性服装描述]
**标志性道具：** [女性化道具]
**性格标签：** [3-5个女性角色性格关键词]
**配色方案：** [主色调列表]
---
只输出星座方案，不要额外解释。`

const MJ_PROMPT_PROMPT = `You are an MJ prompt generator. Convert character design descriptions into pure English MJ prompts only. Output nothing else.

## Rules
- Beautiful first: beautiful, ethereal, elegant, graceful, exquisite
- Medium shot or close-up only: medium shot, close-up portrait, bust shot. NO wide shot, NO full body
- Must have action/pose: female character with specific gestures like holding props, turning, looking back, raising hand
- Simple scene: simple background, minimalist setting
- Ethereal lighting: soft lighting, golden hour, rim lighting, ethereal glow

## Format
- Pure English MJ prompt ONLY, no explanation, no quotes, no special characters except the final --
- Structure: female subject with action, medium or close-up shot, ethereal style, soft lighting, simple background, quality params
- Must include: beautiful female, elegant pose, medium shot, close-up portrait, ethereal, soft lighting, cinematic, photorealistic, CG art, realistic
- Parameters: --ar 16:9 --v 7 --style raw
- Use :: for weight emphasis, e.g. elegant posture::1.2

## Example
beautiful female mage with magical staff, elegant pose holding crystal orb, medium close-up portrait, ethereal soft lighting, intricate magical dress, simple mystical background, cinematic, photorealistic, CG art, realistic, 8k --ar 16:9 --v 7 --style raw`

// ============================================================
// 工具函数
// ============================================================
function parseZodiacCards(text: string): { name: string; content: string }[] {
  if (!text || typeof text !== 'string') return []
  const cards: { name: string; content: string }[] = []
  try {
    const signPattern = ZODIAC_SIGNS.join('|')
    const regex = new RegExp(`((?:${signPattern}))`, 'gi')
    const parts = text.split(regex)
    for (let i = 1; i < parts.length; i += 2) {
      const sign = parts[i] || ''
      const content = (parts[i + 1] || '').trim()
      if (sign && content) cards.push({ name: sign, content })
    }
  } catch (e) { /* ignore */ }

  if (cards.length === 0) {
    for (const sign of ZODIAC_SIGNS) {
      const idx = text.indexOf(sign)
      if (idx !== -1) {
        const others = ZODIAC_SIGNS.filter(s => s !== sign).map(s => text.indexOf(s)).filter(i => i !== -1).sort((a, b) => a - b)
        const end = others[0] ?? text.length
        const content = text.slice(idx, end).trim()
        if (content) cards.push({ name: sign, content })
      }
    }
  }
  return cards
}

// ============================================================
// 发光粒子背景
// ============================================================
function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationId: number
    const particles: { x: number; y: number; vx: number; vy: number; size: number; color: string; alpha: number }[] = []

    function resize() {
      if (!canvas) return
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    for (let i = 0; i < 80; i++) {
      if (!canvas) continue
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
        size: Math.random() * 2 + 1,
        color: `hsl(${Math.random() * 360}, 80%, 60%)`,
        alpha: Math.random() * 0.5 + 0.2,
      })
    }

    function animate() {
      if (!canvas || !ctx) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      particles.forEach(p => {
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1

        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 4)
        gradient.addColorStop(0, p.color)
        gradient.addColorStop(1, 'transparent')
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * 4, 0, Math.PI * 2)
        ctx.fillStyle = gradient
        ctx.globalAlpha = p.alpha
        ctx.fill()
      })

      ctx.globalAlpha = 0.1
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 150) {
            ctx.beginPath()
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.strokeStyle = `rgba(150, 100, 255, ${1 - dist / 150})`
            ctx.lineWidth = 0.5
            ctx.stroke()
          }
        }
      }

      ctx.globalAlpha = 1
      animationId = requestAnimationFrame(animate)
    }

    animate()
    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(animationId)
    }
  }, [])

  return <canvas ref={canvasRef} className="fixed inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }} />
}

// ============================================================
// 全屏图片预览
// ============================================================
function ImagePreview({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: '#000' }}
      onClick={onClose}
    >
      {/* 关闭按钮 */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 px-4 py-2 rounded-lg text-white text-sm font-medium transition-all hover:scale-105"
        style={{ background: '#333', border: '1px solid #555' }}
      >
        ✕ 关闭
      </button>
      <img
        src={url}
        alt="全屏预览"
        className="w-full h-full object-contain"
        style={{ cursor: 'pointer' }}
        onClick={e => e.stopPropagation()}
      />
    </div>
  )
}

// ============================================================
// 历史记录条目
// ============================================================
interface HistoryItem {
  id: string
  prompt: string
  imageUrl: string
  taskId: string
  type: 'imagine' | 'upscale' | 'variation'
  label: string
  time: number
}

// ============================================================
// MJ图片生成区 - 支持历史记录
// ============================================================
function MJImageSection({ initialPrompt, initialImageUrl, initialTaskId, mode, color1, color2 }: {
  initialPrompt: string
  initialImageUrl: string
  initialTaskId: string
  mode: SpeedMode
  color1: string
  color2: string
}) {
  const [history, setHistory] = useState<HistoryItem[]>([{
    id: `init-${Date.now()}`,
    prompt: initialPrompt,
    imageUrl: initialImageUrl,
    taskId: initialTaskId,
    type: 'imagine',
    label: '原始',
    time: Date.now(),
  }])
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const currentItem = history[history.length - 1]

  function stop() {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null }
  }

  function clearError() { setErrorMsg(null) }

  async function handleAction(btnId: string, actionType: 'upsample' | 'variation', label: string) {
    if (!currentItem) return
    setLoadingId(btnId)
    try {
      const res = await submitAction(currentItem.taskId, actionType, parseInt(btnId), mode)
      const newId = res.result ?? res.taskId
      if (!newId) { setLoadingId(null); return }
      pollingRef.current = setInterval(async () => {
        try {
          const task = await getTask(newId, mode)
          if (task.status === 'SUCCESS' && task.imageUrl) {
            stop()
            setLoadingId(null)
            const newItem: HistoryItem = {
              id: `${actionType}-${Date.now()}`,
              prompt: currentItem.prompt,
              imageUrl: task.imageUrl,
              taskId: newId,
              type: actionType === 'upsample' ? 'upscale' : 'variation',
              label,
              time: Date.now(),
            }
            setHistory(prev => [...prev, newItem])
          } else if (task.status === 'FAILURE') {
            stop()
            setLoadingId(null)
            setErrorMsg(`❌ ${label}失败${task.failReason ? '：' + task.failReason : ''}`)
          }
        } catch (e) { console.warn(e) }
      }, 3000)
    } catch (e) { console.error(e); setLoadingId(null) }
  }

  async function handleRegenerate() {
    if (!currentItem) return
    setLoadingId('regen')
    try {
      const res = await submitImagine(currentItem.prompt, mode)
      const newId = res.result ?? res.taskId
      if (!newId) { setLoadingId(null); return }
      pollingRef.current = setInterval(async () => {
        try {
          const task = await getTask(newId, mode)
          if (task.status === 'SUCCESS' && task.imageUrl) {
            stop()
            setLoadingId(null)
            setHistory(prev => [...prev, {
              id: `regen-${Date.now()}`,
              prompt: currentItem.prompt,
              imageUrl: task.imageUrl,
              taskId: newId,
              type: 'imagine',
              label: '重新生成',
              time: Date.now(),
            }])
          } else if (task.status === 'FAILURE') {
            stop()
            setLoadingId(null)
            setErrorMsg(`❌ 重新生成失败${task.failReason ? '：' + task.failReason : ''}`)
          }
        } catch (e) { console.warn(e) }
      }, 3000)
    } catch (e) { console.error(e); setLoadingId(null) }
  }

  const quads = [
    { id: '1', label: 'U1' },
    { id: '2', label: 'U2' },
    { id: '3', label: 'U3' },
    { id: '4', label: 'U4' },
  ]

  const variations = [
    { id: '1', label: 'V1' },
    { id: '2', label: 'V2' },
    { id: '3', label: 'V3' },
    { id: '4', label: 'V4' },
  ]

  return (
    <div className="mt-2 space-y-3">
      {/* 当前提示词 */}
      <div
        className="p-2 rounded-lg text-xs font-mono leading-relaxed"
        style={{ background: '#060610', color: '#aaa', border: `1px solid ${color1}25` }}
      >
        {currentItem?.prompt.slice(0, 80)}...
      </div>

      {/* 重新生成 */}
      <button
        onClick={handleRegenerate}
        disabled={!!loadingId}
        className="w-full text-xs py-1.5 rounded-lg font-medium transition-all hover:scale-105 disabled:opacity-50"
        style={{ background: '#1a1a2e', color: '#ccc', border: `1px solid ${color1}40` }}
      >
        {loadingId === 'regen' ? '↻ 生成中...' : '🔄 重新生成'}
      </button>

      {/* 错误提示 */}
      {errorMsg && (
        <div className="flex items-center gap-2 p-2 rounded-lg text-xs" style={{ background: '#FF336615', border: '1px solid #FF336640', color: '#ff6b6b' }}>
          <span>{errorMsg}</span>
          <button onClick={clearError} className="ml-auto px-2 py-0.5 rounded text-white" style={{ background: '#333' }}>✕</button>
        </div>
      )}

      {/* 当前图片 */}
      {currentItem && (
        <div
          className="rounded-lg overflow-hidden cursor-pointer transition-all hover:brightness-110"
          style={{ border: `1px solid ${color1}30` }}
          onClick={() => setPreviewUrl(currentItem.imageUrl)}
        >
          <img src={currentItem.imageUrl} alt="当前" className="w-full block" />
        </div>
      )}

      {/* U1-U4 */}
      <div className="grid grid-cols-4 gap-2">
        {quads.map(q => (
          <button
            key={q.id}
            onClick={() => handleAction(q.id, 'upsample', q.label)}
            disabled={!!loadingId}
            className="text-xs py-1.5 rounded-lg font-bold transition-all hover:scale-105 disabled:opacity-50"
            style={{
              background: loadingId === q.id ? `linear-gradient(135deg, ${color1}, ${color2})` : `linear-gradient(135deg, ${color1}50, ${color2}50)`,
              color: 'white', border: `1px solid ${color1}60`,
              boxShadow: `0 0 10px ${color1}30`,
            }}
          >
            {loadingId === q.id ? '↻' : q.label}
          </button>
        ))}
      </div>

      {/* V1-V4 */}
      <div className="grid grid-cols-4 gap-2">
        {variations.map(v => (
          <button
            key={v.id}
            onClick={() => handleAction(v.id, 'variation', v.label)}
            disabled={!!loadingId}
            className="text-xs py-1.5 rounded-lg font-bold transition-all hover:scale-105 disabled:opacity-50"
            style={{
              background: loadingId === v.id ? `linear-gradient(135deg, ${color1}, ${color2})` : `linear-gradient(135deg, ${color1}30, ${color2}30)`,
              color: 'white', border: `1px solid ${color1}50`,
              boxShadow: `0 0 10px ${color1}20`,
            }}
          >
            {loadingId === v.id ? '↻' : v.label}
          </button>
        ))}
      </div>

      {/* 历史记录 */}
      {history.length > 1 && (
        <div className="pt-2" style={{ borderTop: `1px solid ${color1}20` }}>
          <button
            onClick={() => setShowHistory(v => !v)}
            className="w-full text-xs py-1 mb-2 rounded transition-all"
            style={{ color: color1 }}
          >
            📋 历史 ({history.length}) {showHistory ? '▲' : '▼'}
          </button>
          {showHistory && (
            <div className="grid grid-cols-4 gap-2">
              {history.map((item, idx) => (
                <div
                  key={item.id}
                  className="relative group cursor-pointer rounded-lg overflow-hidden"
                  style={{ border: `1px solid ${idx === history.length - 1 ? color1 : color1 + '30'}` }}
                  onClick={() => setPreviewUrl(item.imageUrl)}
                >
                  <img src={item.imageUrl} alt={item.label} className="w-full aspect-square object-cover" />
                  <div
                    className="absolute bottom-0 left-0 right-0 text-xs py-1 text-center"
                    style={{ background: `linear-gradient(transparent, ${color1}90)`, color: 'white' }}
                  >
                    {item.label}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 全屏预览 */}
      {previewUrl && createPortal(
        <ImagePreview url={previewUrl} onClose={() => setPreviewUrl(null)} />,
        document.body
      )}
    </div>
  )
}

// ============================================================
// 单个星座卡片
// ============================================================
interface CardData { name: string; content: string; index: number }

function ZodiacCard({ card, mode, promptState, onGenPrompt, onGenImage }: {
  card: CardData; mode: SpeedMode
  promptState: { prompt: string; promptState: 'idle' | 'loading' | 'done'; imageUrl?: string; imageLoading?: boolean; taskId?: string }
  onGenPrompt: () => void; onGenImage: () => void
}) {
  const [c1, c2] = ZODIAC_COLORS[card.index % 12]
  const [expanded, setExpanded] = useState(false)

  // 尝试解析各个字段
  const lines = card.content.split('\n').filter(l => l.trim())
  const visualMatch = card.content.match(/视觉描述[：:]\s*([^\n]+|[\s\S]*?)(?=\n\*\*|$)/i)
  const colorMatch = card.content.match(/配色方案[：:]\s*([^\n]+)/i)
  const tagMatch = card.content.match(/性格标签[：:]\s*([^\n]+)/i)
  const clothMatch = card.content.match(/服装设计[：:]\s*([^\n]+)/i)
  const propMatch = card.content.match(/标志性道具[：:]\s*([^\n]+)/i)

  // 获取配色
  const colors = colorMatch
    ? colorMatch[1].split(/[,，、+＋#]/).map(c => c.trim()).filter(Boolean).filter(c => c.length > 0 && c.length < 20).slice(0, 5)
    : []

  // 清理配色
  const cleanColors = colors.map(c => {
    if (c.startsWith('#') || /^[0-9A-Fa-f]{6}$/.test(c)) return c
    return null
  }).filter(Boolean) as string[]

  return (
    <div
      data-zodiac={card.index}
      className="relative group rounded-2xl overflow-hidden transition-all duration-500 cursor-pointer"
      style={{
        background: `linear-gradient(145deg, ${c1}18, ${c2}10)`,
        border: `1.5px solid ${c1}50`,
        boxShadow: `0 0 25px ${c1}25, 0 0 50px ${c1}12, inset 0 0 25px ${c1}08`,
        transform: 'translateY(0) scale(1)',
        transition: 'all 0.5s cubic-bezier(0.23, 1, 0.32, 1)',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget
        el.style.transform = 'translateY(-8px) scale(1.02)'
        el.style.boxShadow = `0 20px 40px ${c1}30, 0 0 60px ${c1}15, inset 0 0 20px ${c1}10`
        el.style.borderColor = `${c1}80`
        el.style.zIndex = '20'
      }}
      onMouseLeave={e => {
        const el = e.currentTarget
        el.style.transform = 'translateY(0) scale(1)'
        el.style.boxShadow = `0 0 25px ${c1}25, 0 0 50px ${c1}12, inset 0 0 25px ${c1}08`
        el.style.borderColor = `${c1}50`
        el.style.zIndex = ''
      }}
    >
      {/* 顶部霓虹条 */}
      <div
        className="h-1"
        style={{
          background: `linear-gradient(90deg, ${c1}, ${c2}, ${c1})`,
          boxShadow: `0 0 15px ${c1}`,
        }}
      />

      <div className="p-4 space-y-3">
        {/* 星座名 */}
        <div className="flex items-center justify-between">
          <span
            className="inline-block text-white text-sm font-bold px-3 py-1 rounded-full"
            style={{
              background: `linear-gradient(135deg, ${c1}, ${c2})`,
              boxShadow: `0 0 12px ${c1}60`,
            }}
          >
            ✨ {card.name}
          </span>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs px-2 py-1 rounded-lg transition-all"
            style={{ color: '#888', background: '#1a1a2e' }}
          >
            {expanded ? '收起' : '展开'}
          </button>
        </div>

        {/* 完整设计内容 */}
        {expanded ? (
          <div
            className="text-xs leading-relaxed whitespace-pre-wrap p-3 rounded-lg"
            style={{ background: '#080812', color: '#ccc', border: `1px solid ${c1}20`, maxHeight: '200px', overflowY: 'auto' }}
          >
            {card.content}
          </div>
        ) : (
          <>
            {/* 视觉描述（主要展示） */}
            {visualMatch && (
              <div className="text-xs text-gray-300 leading-relaxed">
                🎨 {visualMatch[1].trim().slice(0, 100)}
                {visualMatch[1].length > 100 && '...'}
              </div>
            )}

            {/* 服装 */}
            {clothMatch && (
              <div className="text-xs" style={{ color: `${c1}dd` }}>
                👗 {clothMatch[1].trim().slice(0, 60)}
              </div>
            )}

            {/* 道具 */}
            {propMatch && (
              <div className="text-xs" style={{ color: `${c2}dd` }}>
                🔮 {propMatch[1].trim().slice(0, 60)}
              </div>
            )}

            {/* 性格标签 */}
            {tagMatch && (
              <div className="flex flex-wrap gap-1">
                {tagMatch[1].split(/[,，、/]/).map((t, i) => t.trim()).filter(Boolean).slice(0, 4).map((t, i) => (
                  <span key={i} className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${c1}20`, color: c2, border: `1px solid ${c1}40` }}>
                    {t}
                  </span>
                ))}
              </div>
            )}
          </>
        )}

        {/* 配色条 */}
        {(cleanColors.length > 0 || colors.length > 0) && (
          <div className="flex gap-1">
            {(cleanColors.length > 0 ? cleanColors : colors.slice(0, 4)).map((color, i) => (
              <div
                key={i}
                className="h-5 flex-1 rounded border border-white/10"
                style={{ backgroundColor: color.startsWith('#') ? color : '#1a1a2e' }}
                title={color}
              />
            ))}
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={onGenPrompt}
            disabled={promptState.promptState === 'loading'}
            className="flex-1 text-xs py-2 rounded-xl font-bold transition-all hover:scale-105 disabled:opacity-50"
            style={{
              background: `linear-gradient(135deg, ${c1}, ${c2})`,
              color: 'white',
              boxShadow: `0 0 12px ${c1}40`,
            }}
          >
            {promptState.promptState === 'loading' ? '生成中...' : '✨ 生成MJ提示词'}
          </button>
          {promptState.promptState === 'done' && (
            <button
              onClick={onGenImage}
              disabled={promptState.imageLoading}
              className="flex-1 text-xs py-2 rounded-xl font-bold transition-all hover:scale-105 disabled:opacity-50"
              style={{
                background: '#1a1a2e',
                color: 'white',
                border: `1px solid ${c1}50`,
                boxShadow: `0 0 8px ${c1}20`,
              }}
            >
              {promptState.imageLoading ? '生成中...' : '🎨 生成图片'}
            </button>
          )}
        </div>

        {/* MJ提示词 - 固定高度5行 */}
        {promptState.promptState === 'done' && promptState.prompt && (
          <div
            className="p-2 rounded-lg text-xs font-mono leading-relaxed overflow-hidden"
            style={{
              background: '#060610',
              color: '#00ff88',
              border: `1px solid ${c1}30`,
              maxHeight: '6em',
              overflowY: 'auto',
            }}
          >
            {promptState.prompt}
          </div>
        )}

        {/* MJ图片区 - 带历史记录 */}
        {promptState.imageUrl && promptState.taskId && (
          <MJImageSection
            initialPrompt={promptState.prompt}
            initialImageUrl={promptState.imageUrl}
            initialTaskId={promptState.taskId}
            mode={mode}
            color1={c1}
            color2={c2}
          />
        )}

        {promptState.imageLoading && (
          <div className="flex items-center gap-2 text-xs" style={{ color: '#888' }}>
            <span className="animate-pulse">⏳</span> 图片生成中...
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================
// 主应用
// ============================================================
export default function App() {
  const [theme, setTheme] = useState('')
  const [loading, setLoading] = useState(false)
  const [cards, setCards] = useState<CardData[]>([])
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<SpeedMode>('fast')
  const [promptStates, setPromptStates] = useState<Record<string, {
    prompt: string; promptState: 'idle' | 'loading' | 'done'
    imageUrl?: string; imageLoading?: boolean; taskId?: string
  }>>({})
  const cardsContainerRef = useRef<HTMLDivElement>(null)

  const MODE_OPTIONS: { value: SpeedMode; label: string }[] = [
    { value: 'fast', label: '⚡ Fast' },
    { value: 'turbo', label: '🚀 Turbo' },
    { value: 'relax', label: '🌿 Relax' },
  ]

  async function generateAll() {
    const text = theme.trim()
    if (!text || loading) return
    setLoading(true)
    setError(null)
    setCards([])
    setPromptStates({})
    try {
      const messages: ChatMessage[] = [
        { role: 'system', content: DESIGN_PROMPT },
        { role: 'user', content: text },
      ]
      let response = ''
      const stream = chatStream(messages)
      for await (const chunk of stream) { response += chunk }
      const parsed = parseZodiacCards(response)
      if (parsed.length === 0) { setError('未能解析出星座方案'); return }
      setCards(parsed.map((p, i) => ({ name: p.name, content: p.content, index: i })))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  async function handleGenPrompt(name: string, content: string) {
    setPromptStates(prev => ({ ...prev, [name]: { ...prev[name], promptState: 'loading', prompt: '' } }))
    try {
      const messages: ChatMessage[] = [
        { role: 'system', content: MJ_PROMPT_PROMPT },
        { role: 'user', content: `转化：\n\n${content}` },
      ]
      let text = ''
      const stream = chatStream(messages)
      for await (const chunk of stream) { text += chunk }
      setPromptStates(prev => ({ ...prev, [name]: { ...prev[name], promptState: 'done', prompt: text.trim() } }))
    } catch (e) { console.error(e) }
  }

  async function handleGenImage(name: string, prompt: string) {
    setPromptStates(prev => ({ ...prev, [name]: { ...prev[name], imageLoading: true } }))
    try {
      const res = await submitImagine(prompt, mode)
      const taskId = res.result ?? res.taskId
      if (!taskId) return
      setPromptStates(prev => ({ ...prev, [name]: { ...prev[name], imageLoading: true, taskId } }))
      const poll = setInterval(async () => {
        try {
          const task = await getTask(taskId, mode)
          if (task.status === 'SUCCESS' && task.imageUrl) {
            clearInterval(poll)
            setPromptStates(prev => ({ ...prev, [name]: { ...prev[name], imageLoading: false, imageUrl: task.imageUrl } }))
          }
        } catch (e) { /* ignore */ }
      }, 3000)
    } catch (e) { console.error(e) }
  }

  return (
    <div className="min-h-screen relative" style={{ background: 'linear-gradient(135deg, #050508 0%, #0a0a15 50%, #050510 100%)' }}>
      <ParticleBackground />

      {/* 顶部导航 */}
      <div className="relative z-10 px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #1a1a2e' }}>
        <div className="flex items-center gap-3">
          <span className="text-3xl">🎨</span>
          <div>
            <div className="text-white font-bold text-xl tracking-wider">MJ Studio</div>
            <div className="text-xs" style={{ color: '#666' }}>12星座角色设计</div>
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: '#0a0a15', border: '1px solid #222' }}>
          {MODE_OPTIONS.map(m => (
            <button
              key={m.value}
              onClick={() => setMode(m.value)}
              className="text-xs px-4 py-1.5 rounded-lg font-medium transition-all"
              style={{
                color: mode === m.value ? 'white' : '#555',
                background: mode === m.value ? '#1a1a2e' : 'transparent',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* 主输入区 */}
      <div className="relative z-10 max-w-4xl mx-auto px-6 py-8">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white mb-2">星座角色设计</h1>
          <p className="text-sm" style={{ color: '#666' }}>输入主题，生成12星座女性角色设计方案</p>
        </div>

        <div className="flex gap-3">
          <textarea
            value={theme}
            onChange={e => setTheme(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); generateAll() } }}
            placeholder="输入设计主题，如：赛博朋克机甲战士、玄幻修仙仙女..."
            className="flex-1 rounded-2xl px-4 py-3 text-sm resize-none focus:outline-none"
            style={{
              background: 'linear-gradient(135deg, #0a0a15, #0f0f1a)',
              color: '#eee',
              border: '1px solid #2a2a3e',
              boxShadow: '0 0 30px #6633FF15, inset 0 0 30px #00000030',
            }}
            rows={3}
          />
          <button
            onClick={generateAll}
            disabled={!theme.trim() || loading}
            className="px-8 py-3 rounded-2xl text-white font-bold text-sm transition-all hover:scale-105 disabled:opacity-40 self-start"
            style={{
              background: 'linear-gradient(135deg, #6633FF, #CC33FF, #FF3366)',
              boxShadow: '0 0 30px #6633FF40',
            }}
          >
            {loading ? '✨ 生成中...' : '🚀 生成12星座'}
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-xl text-sm text-red-400 text-center" style={{ background: '#FF336610', border: '1px solid #FF336630' }}>
            {error}
          </div>
        )}
      </div>

      {/* 星座卡片区域 */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 pb-12">
        {cards.length === 0 && !loading && (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">🌟</div>
            <div className="text-sm" style={{ color: '#444' }}>输入主题开始生成</div>
          </div>
        )}

        {cards.length > 0 && (
          <div ref={cardsContainerRef} className="relative">
            {/* 卡片网格 */}
            <div
              className="grid gap-6 relative"
              style={{
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                zIndex: 20,
              }}
            >
              {cards.map(card => (
                <ZodiacCard
                  key={card.name}
                  card={card}
                  mode={mode}
                  promptState={promptStates[card.name] || { prompt: '', promptState: 'idle' }}
                  onGenPrompt={() => handleGenPrompt(card.name, card.content)}
                  onGenImage={() => {
                    const ps = promptStates[card.name]
                    if (ps?.prompt) handleGenImage(card.name, ps.prompt)
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <style>{`
        body { overflow-x: hidden; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #0a0a0f; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #444; }
      `}</style>
    </div>
  )
}