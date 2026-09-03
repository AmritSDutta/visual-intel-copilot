import type { SessionSummary } from '../services/sessionDbService'

export interface HistoryModalProps {
  open: boolean
  onClose: () => void
  sessionId: string
  historySummaries: SessionSummary[]
  onRestoreSession: (sessionId: string) => void
  onExportSessionPdf: (sessionId: string) => void
  onRequestDeleteSession: (sessionId: string) => void
}

export function HistoryModal({
  open,
  onClose,
  sessionId,
  historySummaries,
  onRestoreSession,
  onExportSessionPdf,
  onRequestDeleteSession
}: HistoryModalProps) {
  if (!open) return null

  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup-card history-popup" onClick={(e) => e.stopPropagation()}>
        <div className="popup-header">
          <h3>📁 Saved Diagram History</h3>
          <button className="popup-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="popup-body">
          {historySummaries.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#9ca3af', padding: '30px' }}>
              No saved diagram sessions found.
            </div>
          ) : (
            <div className="history-list">
              {historySummaries.map((summary) => (
                <div
                  key={summary.session_id}
                  className={`history-card ${summary.session_id === sessionId ? 'active-session' : ''}`}
                >
                  <div className="history-info">
                    <div className="history-title">{summary.first_prompt}</div>
                    <div className="history-meta">
                      <span>🔄 {summary.turn_count} {summary.turn_count === 1 ? 'turn' : 'turns'}</span>
                      <span>•</span>
                      <span>🕒 {new Date(summary.latest_created_at || summary.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="history-actions">
                    <button
                      className="history-btn restore-btn"
                      onClick={() => onRestoreSession(summary.session_id)}
                      title="Restore this session to Canvas"
                    >
                      👁️ View
                    </button>
                    <button
                      className="history-btn pdf-btn"
                      onClick={() => onExportSessionPdf(summary.session_id)}
                      title="Export Session as PDF Report"
                    >
                      📄 PDF
                    </button>
                    <button
                      className="history-btn delete-btn"
                      onClick={() => onRequestDeleteSession(summary.session_id)}
                      title="Delete Session"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="popup-footer">
          <button className="popup-done-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
