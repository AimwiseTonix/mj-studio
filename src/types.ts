export interface MJTask {
  id: string
  action: string
  prompt?: string
  promptEn?: string
  description?: string
  state?: string
  submitTime?: number
  startTime?: number
  finishTime?: number
  imageUrl?: string
  status: 'NOT_START' | 'SUBMITTED' | 'IN_PROGRESS' | 'FAILURE' | 'SUCCESS' | 'CANCEL'
  progress?: string
  failReason?: string
  buttons?: MJButton[]
}

export interface MJButton {
  customId: string
  emoji: string
  label: string
  style: number
  type: number
}

export interface MJSubmitResponse {
  code: number
  description: string
  result?: string // task id
  properties?: Record<string, unknown>
}
