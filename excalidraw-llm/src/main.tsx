import './utils/stdioLogger'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './services/webMcpService'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
