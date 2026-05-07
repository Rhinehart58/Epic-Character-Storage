export type UpdateLogEntry = {
  id: string
  date: string
  title: string
  details?: string
}

export type UpdateLogPayload = {
  updatedAt: string
  entries: UpdateLogEntry[]
}
