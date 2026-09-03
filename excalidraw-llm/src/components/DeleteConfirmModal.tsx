export interface DeleteConfirmModalProps {
  sessionId: string | null
  onCancel: () => void
  onConfirm: (sessionId: string) => void
}

export function DeleteConfirmModal({
  sessionId,
  onCancel,
  onConfirm
}: DeleteConfirmModalProps) {
  if (!sessionId) return null

  return (
    <div className="popup-overlay" onClick={onCancel}>
      <div className="popup-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px', textAlign: 'center' }}>
        <div className="popup-header" style={{ justifyContent: 'center' }}>
          <h3 style={{ color: '#ef4444' }}>🗑️ Confirm Deletion</h3>
        </div>
        <div className="popup-body" style={{ padding: '20px 10px', fontSize: '14px', color: 'var(--text-secondary)' }}>
          Are you sure you want to permanently delete this diagram session? This action cannot be undone.
        </div>
        <div className="popup-footer" style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button
            className="popup-done-btn"
            style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="popup-done-btn"
            style={{ background: '#ef4444', color: '#ffffff' }}
            onClick={() => onConfirm(sessionId)}
          >
            Yes, Delete
          </button>
        </div>
      </div>
    </div>
  )
}
