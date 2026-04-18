import { useEffect, useRef } from 'react'
import { getTask } from '../api'
import type { SpeedMode } from '../api'
import type { MJTask } from '../types'

interface UsePollingOptions {
  taskId: string | null
  mode: SpeedMode
  onUpdate: (task: MJTask) => void
  interval?: number
}

export function useTaskPolling({ taskId, mode, onUpdate, interval = 3000 }: UsePollingOptions) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const activeRef = useRef(true)

  useEffect(() => {
    if (!taskId) return
    activeRef.current = true

    async function poll() {
      if (!taskId || !activeRef.current) return
      try {
        const data: MJTask = await getTask(taskId, mode)
        console.log('[MJ Polling] taskId:', taskId, 'status:', data.status, 'imageUrl:', data.imageUrl || '无', 'progress:', data.progress)
        onUpdate(data)
        if (data.status === 'SUCCESS' || data.status === 'FAILURE' || data.status === 'CANCEL') {
          if (timerRef.current) clearInterval(timerRef.current)
        }
      } catch (e) {
        console.error('Polling error:', e)
      }
    }

    poll()
    timerRef.current = setInterval(poll, interval)

    return () => {
      activeRef.current = false
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [taskId, mode])
}
