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
      // 1. Prioritize local IndexedDB summaries first
      const localSummaries = await getAllSessionsSummary()
      if (localSummaries.length > 0 || !user) {
        setHistorySummaries(localSummaries)
      } else {
        // 2. Fallback to Supabase Cloud if local is empty and user is logged in
        const cloudSummaries = await getCloudSessionsSummary(user.id)
        setHistorySummaries(cloudSummaries)
      }
    } catch (e) {
      console.warn('History retrieval error, falling back to local history:', e)
      const localSummaries = await getAllSessionsSummary().catch(() => [])
      setHistorySummaries(localSummaries)
    }
  }

  const handleExportSessionPdf = async (targetSessionId: string) => {
    try {
      console.log(`[PDF] 📄 Generating PDF for session=${targetSessionId}. Checking IndexedDB first...`)
      // 1. Check local IndexedDB first
      let turns: SessionTurnRecord[] = await getSessionTurns(targetSessionId)

      // 2. Fallback to Supabase Cloud if IndexedDB has no turns
      if (turns.length === 0 && user) {
        console.log(`[PDF] ☁️ IndexedDB empty for session=${targetSessionId}. Falling back to Supabase Cloud...`)
        turns = await getCloudSessionTurns(user.id, targetSessionId).catch(() => [])
      }

      if (turns.length === 0) {
        throw new Error('No turns found for this session to export.')
      }

      console.log(`[PDF] 🚀 Exporting PDF with ${turns.length} turns for session=${targetSessionId}`)
      await exportSessionToPdf(targetSessionId, turns)
    } catch (e: unknown) {
      const errorMsg = e instanceof Error ? e.message : 'Unknown error'
      alert(`PDF Export failed: ${errorMsg}`)
    }
  }

  const confirmDeleteSession = async (targetSessionId: string) => {
    try {
      await deleteSessionTurns(targetSessionId)
      if (user) {
        await deleteCloudSession(user.id, targetSessionId).catch(() => {})
      }
      const updatedSummaries = await getAllSessionsSummary().catch(() => [])
      setHistorySummaries(updatedSummaries)
    } catch (e) {
      console.error('Failed to delete session:', e)
    }
  }

  const handleRestoreSession = async (targetSessionId: string) => {
    try {
      // 1. Check local IndexedDB first
      let turns: SessionTurnRecord[] = await getSessionTurns(targetSessionId)

      // 2. Fallback to Supabase Cloud if IndexedDB has no turns
      if (turns.length === 0 && user) {
        turns = await getCloudSessionTurns(user.id, targetSessionId).catch(() => [])
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
