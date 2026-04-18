import { useState, useRef, useEffect } from 'react'
import { chatStream, type ChatMessage } from '../gemini'

// ============================================================
// 星座系统提示词
// ============================================================
const SYSTEM_PROMPT = `你是角色概念设计师，专注于将主题描述转化为详细的视觉设计方案。

## 输出格式规范
接收主题指令后，立即生成12星座完整方案。每个星座方案必须包含以下结构：

## [星座名] - [角色标题]
**人设概念：**
[一句话角色定位]

**视觉描述：**
- 整体风格：[整体风格描述]
- 服装设计：[服装描述]
- 配色方案：[主色调列表]
- 标志性道具：[道具描述]
- 特殊效果：[光效/动效描述]

**性格标签：**
[3-5个性格关键词]

---

## 规则
- 视觉描述要具体、可执行，便于后续转化为绘画提示词
- 保持整体主题统一性的同时突出每个星座的个体特色
- 12星座方案需全部输出，不得遗漏
- 响应只输出星座设计方案，不要额外的解释说明`

// ============================================================
// 星座数据
// ============================================================
const ZODIAC_SIGNS = [
  '白羊座', '金牛座', '双子座', '巨蟹座',
  '狮子座', '处女座', '天秤座', '天蝎座',
  '射手座', '摩羯座', '水瓶座', '双鱼座',
]

function parseZodiacCards(text: string): { name: string; content: string }[] {
  const cards: { name: string; content: string }[] = []
  const signPattern = ZODIAC_SIGNS.join('|')
  // 按星座名分割
  const regex = new RegExp(`((?:${signPattern}))[^]*`, 'gi')
  const parts = regex.split(text)

  // parts[0]=前缀, parts[1]=白羊座, parts[2]=白羊内容, parts[3]=金牛座, parts[4]=金牛内容...
  for (let i = 1; i < parts.length; i += 2) {
    const sign = parts[i] || ''
    const content = parts[i + 1] || ''
    if (sign && content.trim()) {
      cards.push({ name: sign, content: content.trim() })
    }
  }

  // 如果没分出来（AI没用##格式），尝试回退：找所有星座名作为锚点重新提取
  if (cards.length === 0) {
    for (const sign of ZODIAC_SIGNS) {
      const idx = text.indexOf(sign)
      if (idx !== -1) {
        const nextSignIdx = ZODIAC_SIGNS.slice(ZODIAC_SIGNS.indexOf(sign) + 1)
          .map(s => text.indexOf(s))
          .filter(idx => idx !== -1)
          .sort((a, b) => a - b)[0]
        const end = nextSignIdx ?? text.length
        cards.push({ name: sign, content: text.slice(idx, end).trim() })
      }
    }
  }

  return cards.filter(c => c.content.trim())
}

function ZodiacCard({ name, content }: { name: string; content: string }) {
  const colorMatch = content.match(/配色方案[：:]\s*([^\n]+)/)
  const colors = colorMatch
    ? colorMatch[1].split(/[,，、+＋]/).map(c => c.trim()).filter(Boolean)
    : []

  const tagMatch = content.match(/性格标签[：:]\s*([^\n]+)/)
  const tags = tagMatch
    ? tagMatch[1].split(/[,，、/]/).map(t => t.trim().replace(/^#/, '')).filter(Boolean)
    : []

  const styleMatch = content.match(/整体风格[：:]\s*([^\n]+)/)
  const clothMatch = content.match(/服装设计[：:]\s*([^\n]+)/)
  const propMatch = content.match(/标志性道具[：:]\s*([^\n]+)/)
  const effectMatch = content.match(/特殊效果[：:]\s*([^\n]+)/)

  const coverColors = [
    ['#FF6B6B', '#FF8E53'], ['#4ECDC4', '#45B7AA'], ['#6C5CE7', '#A29BFE'],
    ['#FDCB6E', '#F39C12'], ['#E17055', '#D63031'], ['#A29BFE', '#6C5CE7'],
    ['#00B894', '#00CEC9'], ['#E84393', '#FD79A8'], ['#00B894', '#55EFC4'],
    ['#636E72', '#2D3436'], ['#74B9FF', '#0984E3'], ['#81ECEC', '#00CEC9'],
  ]
  const signIndex = ZODIAC_SIGNS.findIndex(s => name.includes(s.replace('座', '')))
  const [c1, c2] = coverColors[signIndex] || ['#6C5CE7', '#A29BFE']

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
      <div
        className="h-14 flex items-end px-3 pb-2"
        style={{ background: `linear-gradient(135deg, ${c1}22, ${c2}33)` }}
      >
        <span
          className="text-white text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}
        >
          {name}
        </span>
      </div>
      <div className="p-2.5 space-y-1 text-xs">
        {styleMatch && <div><span className="text-slate-400">风格</span> <span className="text-slate-600 ml-1">{styleMatch[1].trim()}</span></div>}
        {clothMatch && <div><span className="text-slate-400">服装</span> <span className="text-slate-600 ml-1">{clothMatch[1].trim()}</span></div>}
        {propMatch && <div><span className="text-slate-400">道具</span> <span className="text-slate-600 ml-1">{propMatch[1].trim()}</span></div>}
        {effectMatch && <div><span className="text-slate-400">特效</span> <span className="text-slate-600 ml-1">{effectMatch[1].trim()}</span></div>}
        {colors.length > 0 && (
          <div className="flex gap-1 pt-0.5">
            {colors.slice(0, 4).map((color, i) => (
              <div
                key={i}
                className="h-4 flex-1 rounded border border-gray-100"
                style={{ backgroundColor: color.startsWith('#') ? color : '#f5f5f5' }}
                title={color}
              />
            ))}
          </div>
        )}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {tags.slice(0, 4).map((tag, i) => (
              <span
                key={i}
                className="text-xs px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: `${c1}22`, color: c1 }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================
// 主组件
// ============================================================
export default function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [zodiacOpen, setZodiacOpen] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const lastAssistant = messages.filter(m => m.role === 'assistant').at(-1)
  const zodiacCards = lastAssistant?.content ? parseZodiacCards(lastAssistant.content) : []
  const hasZodiac = zodiacCards.length >= 12

  // 检测到12星座时自动打开面板
  useEffect(() => {
    if (hasZodiac) setZodiacOpen(true)
  }, [hasZodiac])

  useEffect(() => {
    const timer = requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    })
    return () => cancelAnimationFrame(timer)
  }, [messages.length])

  async function send() {
    const text = input.trim()
    if (!text || loading) return

    const userMsg: ChatMessage = { role: 'user', content: text }
    const historyWithSystem: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages,
      userMsg,
    ]

    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)
    setError(null)

    const assistantMsg: ChatMessage = { role: 'assistant', content: '' }
    setMessages(prev => [...prev, assistantMsg])

    try {
      const stream = chatStream(historyWithSystem)
      let assistantContent = ''
      for await (const chunk of stream) {
        assistantContent += chunk
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = { ...updated[updated.length - 1], content: assistantContent }
          return updated
        })
      }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e)
      setError(errMsg)
      setMessages(prev => prev.slice(0, -1))
    } finally {
      setLoading(false)
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  function clearChat() {
    setMessages([])
    setError(null)
    setZodiacOpen(false)
  }

  return (
    <div className="flex flex-col h-full">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-lg">🤖</span>
          <div>
            <div className="text-sm font-semibold text-slate-700">Gemini 3.1 Pro</div>
            <div className="text-xs text-slate-400">角色概念设计师</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasZodiac && (
            <button
              onClick={() => setZodiacOpen(v => !v)}
              className="text-xs px-2.5 py-1 rounded-full border border-indigo-300 text-indigo-600 hover:bg-indigo-50 transition-colors"
            >
              {zodiacOpen ? '隐藏卡片' : '查看12星座'}
            </button>
          )}
          <button
            onClick={clearChat}
            className="text-xs text-slate-400 hover:text-red-500 transition-colors px-2 py-1 rounded hover:bg-red-50"
          >
            清空
          </button>
        </div>
      </div>

      {/* 消息区（可滚动） */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && !loading && (
          <div className="text-center text-slate-400 text-sm mt-16">
            <div className="text-3xl mb-3">✨</div>
            <div>发送主题，开始12星座设计</div>
            <div className="text-xs mt-1 text-slate-400">如：赛博朋克机甲战士</div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div
              className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm ${
                msg.role === 'user' ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {msg.role === 'user' ? '你' : 'G'}
            </div>
            <div
              className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-indigo-500 text-white rounded-tr-sm'
                  : 'bg-slate-100 text-slate-700 rounded-tl-sm'
              }`}
            >
              {msg.content || (msg.role === 'assistant' && loading && i === messages.length - 1 ? (
                <span className="inline-flex gap-1">
                  <span className="animate-bounce" style={{ animationDelay: '0ms' }}>·</span>
                  <span className="animate-bounce" style={{ animationDelay: '150ms' }}>·</span>
                  <span className="animate-bounce" style={{ animationDelay: '300ms' }}>·</span>
                </span>
              ) : null)}
            </div>
          </div>
        ))}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-600">
            错误：{error}
          </div>
        )}
      </div>

      {/* 星座卡片浮层面板（右侧叠加，不影响聊天布局） */}
      {zodiacOpen && hasZodiac && (
        <div className="border-t border-gray-100 bg-slate-50 p-3 flex-shrink-0 max-h-72 overflow-y-auto">
          <div className="text-xs text-slate-400 font-medium mb-2">12星座设计方案</div>
          <div className="grid grid-cols-3 gap-2">
            {zodiacCards.slice(0, 12).map((card, i) => (
              <ZodiacCard key={i} name={card.name} content={card.content} />
            ))}
          </div>
        </div>
      )}

      {/* 输入区 */}
      <div className="border-t border-gray-100 p-3 flex-shrink-0">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="描述你的主题..."
            rows={1}
            className="flex-1 resize-none border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent max-h-32 overflow-y-auto"
            style={{ minHeight: '38px' }}
          />
          <button
            onClick={send}
            disabled={!input.trim() || loading}
            className="flex-shrink-0 w-9 h-9 bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-300 text-white rounded-xl transition-colors flex items-center justify-center text-sm"
          >
            {loading ? '↻' : '↑'}
          </button>
        </div>
      </div>

      <div ref={bottomRef} />
    </div>
  )
}
