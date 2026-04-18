const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || ''
const BASE_URL = 'https://api.bltcy.ai/v1'

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export async function* chatStream(
  messages: ChatMessage[]
): AsyncGenerator<string, void, unknown> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
      Accept: 'application/json',
    },
    body: JSON.stringify({
      model: 'gemini-3.1-flash-lite-preview',
      messages,
      stream: true,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Gemini API 错误 (${res.status}): ${text.slice(0, 200)}`)
  }

  if (!res.body) throw new Error('无响应体')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data:')) continue
        const data = trimmed.slice(5).trim()
        if (data === '[DONE]') return
        try {
          const json = JSON.parse(data)
          const content = json.choices?.[0]?.delta?.content
          if (content) yield content
        } catch {
          // 忽略解析失败
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

export async function chatOnce(messages: ChatMessage[]): Promise<string> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
      Accept: 'application/json',
    },
    body: JSON.stringify({ model: 'gemini-3.1-flash-lite-preview', messages, stream: false }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Gemini API 错误 (${res.status}): ${text.slice(0, 200)}`)
  }

  const json = await res.json()
  return json.choices?.[0]?.message?.content ?? ''
}
