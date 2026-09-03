import './utils/stdioLogger'
import { initDevToolsDeterrents } from './utils/devToolsDeterrent'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './services/webMcpService'
import App from './App.tsx'

initDevToolsDeterrents()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
