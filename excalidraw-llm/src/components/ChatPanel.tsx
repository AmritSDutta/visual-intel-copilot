import type { RefObject, KeyboardEvent } from 'react'
import type { Message } from '../types/chat'

export interface ChatPanelProps {
  sessionId: string
  messages: Message[]
  input: string
  setInput: (value: string) => void
  isLoading: boolean
  copiedMsgId: string | null
  messagesEndRef: RefObject<HTMLDivElement | null>
  onSend: (textToSend?: string) => void
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void
  onCopy: (msgId: string, text: string) => void
}

export function ChatPanel({
  sessionId,
  messages,
  input,
  setInput,
  isLoading,
  copiedMsgId,
  messagesEndRef,
  onSend,
  onKeyDown,
  onCopy
}: ChatPanelProps) {
  return (
    <div className="chat-container">
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>💬 Visual Intel</h3>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }} title={sessionId}>ID: {sessionId.substring(0, 10)}...</span>
      </div>

      <div className="chat-messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.sender}`}>
            <div className="avatar">
              {msg.sender === 'assistant' ? 'AI' : 'U'}
            </div>
            <div className="message-content">
              <div className="message-bubble" style={{ position: 'relative', whiteSpace: 'pre-wrap' }}>
                {msg.sender === 'assistant' && (
                  <button
                    className="copy-msg-btn"
                    onClick={() => onCopy(msg.id, msg.text)}
                    title="Copy response text"
                  >
                    {copiedMsgId === msg.id ? '✓ Copied' : '📋 Copy'}
                  </button>
                )}
                {msg.text}
              </div>
              {msg.suggestions && msg.suggestions.length > 0 && (
                <div className="quick-prompts">
                  {msg.suggestions.map((suggestion, idx) => (
                    <button
                      key={idx}
                      className="quick-prompt-btn"
                      onClick={() => onSend(suggestion)}
                      disabled={isLoading}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-container">
        <div className="chat-input-wrapper">
          <textarea
            className="chat-input"
            placeholder={isLoading ? 'Generating diagram...' : 'Ask AI to draw or edit...'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={isLoading}
            rows={3}
          />
          <button
            className="send-btn"
            onClick={() => onSend()}
            disabled={isLoading}
            aria-label="Send message"
          >
            {isLoading ? (
              <span className="spinner"></span>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            )}
          </button>
        </div>
        <div className="chat-footer-hint">
          Press Enter to send • Shift+Enter for new line
        </div>
      </div>
    </div>
  )
}
