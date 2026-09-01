import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { getSessionTurns, getAllSessionsSummary, deleteSessionTurns } from '../services/sessionDbService'
import type { SessionSummary, SessionTurnRecord } from '../services/sessionDbService'
import { getCloudSessionsSummary, getCloudSessionTurns, deleteCloudSession } from '../services/supabaseDbService'
import { exportSessionToPdf } from '../services/pdfExportService'

export function useSessionHistory(
  user: User | null,
  onSessionReset?: () => void,
  onTurnsRestored?: (turns: SessionTurnRecord[]) => void
) {
  const [sessionId, setSessionId] = useState<string>(() => `sess_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`)
  const [showHistory, setShowHistory] = useState(false)
  const [historySummaries, setHistorySummaries] = useState<SessionSummary[]>([])
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null)

  const handleNewSession = () => {
    const newSid = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
    setSessionId(newSid)
    if (onSessionReset) {
      onSessionReset()
    }
  }

  const handleOpenHistory = async () => {
    setShowHistory(true)
    try {
      if (user) {
        const summaries = await getCloudSessionsSummary(user.id)
        setHistorySummaries(summaries)
      } else {
        const localSummaries = await getAllSessionsSummary()
        setHistorySummaries(localSummaries)
      }
    } catch (e) {
      console.warn('Cloud history unavailable, falling back to local history:', e)
      const localSummaries = await getAllSessionsSummary().catch(() => [])
      setHistorySummaries(localSummaries)
    }
  }

  const handleExportSessionPdf = async (targetSessionId: string) => {
    try {
      let turns: SessionTurnRecord[] = []
      if (user) {
        turns = await getCloudSessionTurns(user.id, targetSessionId).catch(() => getSessionTurns(targetSessionId))
      } else {
        turns = await getSessionTurns(targetSessionId)
      }
      await exportSessionToPdf(targetSessionId, turns)
    } catch (e: unknown) {
      const errorMsg = e instanceof Error ? e.message : 'Unknown error'
      alert(`PDF Export failed: ${errorMsg}`)
    }
  }

  const confirmDeleteSession = async (targetSessionId: string) => {
    try {
      if (user) {
        await deleteCloudSession(user.id, targetSessionId).catch(() => {})
      }
      await deleteSessionTurns(targetSessionId)
      const updatedSummaries = user
        ? await getCloudSessionsSummary(user.id).catch(() => getAllSessionsSummary())
        : await getAllSessionsSummary()
      setHistorySummaries(updatedSummaries)
    } catch (e) {
      console.error('Failed to delete session:', e)
    }
  }

  const handleRestoreSession = async (targetSessionId: string) => {
    try {
      let turns: SessionTurnRecord[] = []
      if (user) {
        turns = await getCloudSessionTurns(user.id, targetSessionId).catch(() => getSessionTurns(targetSessionId))
      } else {
        turns = await getSessionTurns(targetSessionId)
      }
      if (turns.length === 0) return

      setSessionId(targetSessionId)
      setShowHistory(false)

      if (onTurnsRestored) {
        onTurnsRestored(turns)
      }
    } catch (e) {
      console.error('Failed to restore session:', e)
    }
  }

  return {
    sessionId,
    setSessionId,
    showHistory,
    setShowHistory,
    historySummaries,
    setHistorySummaries,
    deletingSessionId,
    setDeletingSessionId,
    handleNewSession,
    handleOpenHistory,
    handleExportSessionPdf,
    confirmDeleteSession,
    handleRestoreSession
  }
}
