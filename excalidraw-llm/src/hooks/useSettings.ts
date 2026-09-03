import { useState, useEffect } from 'react'
import { setItemEncrypted, getItemEncrypted, removeItem } from '../utils/cryptoStorage'
import { TASK_MODEL_REGISTRY } from '../config/aiModelsConfig'

export type AIProvider = 'ollama' | 'gemini'

export function useSettings() {
  const [provider, setProvider] = useState<AIProvider>(() => 
    (sessionStorage.getItem('AI_PROVIDER') as AIProvider) || 
    (localStorage.getItem('AI_PROVIDER') as AIProvider) || 
    'ollama'
  )
  const [ollamaEndpoint, setOllamaEndpoint] = useState(() => 
    sessionStorage.getItem('OLLAMA_ENDPOINT') || 
    localStorage.getItem('OLLAMA_ENDPOINT') || 
    'https://ollama.com'
  )
  const [ollamaModel, setOllamaModel] = useState(() => 
    sessionStorage.getItem('OLLAMA_MODEL') || 
    localStorage.getItem('OLLAMA_MODEL') || 
    TASK_MODEL_REGISTRY.OLLAMA_CHAT.primaryModel
  )
  const [ollamaApiKey, setOllamaApiKey] = useState(() => {
    const raw = sessionStorage.getItem('OLLAMA_API_KEY') || import.meta.env.VITE_OLLAMA_API_KEY || ''
    return raw.startsWith('__ENC__:v1:') ? '' : raw
  })
  const [apiKey, setApiKey] = useState(() => {
    const raw = sessionStorage.getItem('GEMINI_API_KEY') || import.meta.env.VITE_GEMINI_API_KEY || ''
    return raw.startsWith('__ENC__:v1:') ? '' : raw
  })
  const [modelName, setModelName] = useState(() => 
    sessionStorage.getItem('GEMINI_MODEL') || 
    localStorage.getItem('GEMINI_MODEL') || 
    TASK_MODEL_REGISTRY.CANVAS_MAIN_AGENT.primaryModel
  )
  const [showSettings, setShowSettings] = useState(false)

  // Asynchronously hydrate encrypted keys from localStorage (AES-GCM-256) on initial load
  useEffect(() => {
    let mounted = true
    async function hydrateEncryptedKeys() {
      try {
        const [decryptedGemini, decryptedOllama] = await Promise.all([
          getItemEncrypted('GEMINI_API_KEY'),
          getItemEncrypted('OLLAMA_API_KEY')
        ])
        if (!mounted) return
        if (decryptedGemini) {
          setApiKey(decryptedGemini)
        }
        if (decryptedOllama) {
          setOllamaApiKey(decryptedOllama)
        }
      } catch (err) {
        console.warn('[useSettings] Failed to hydrate encrypted keys:', err)
      }
    }
    hydrateEncryptedKeys()
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    sessionStorage.setItem('AI_PROVIDER', provider)
    localStorage.setItem('AI_PROVIDER', provider)
  }, [provider])

  useEffect(() => {
    sessionStorage.setItem('OLLAMA_ENDPOINT', ollamaEndpoint)
    localStorage.setItem('OLLAMA_ENDPOINT', ollamaEndpoint)
  }, [ollamaEndpoint])

  useEffect(() => {
    sessionStorage.setItem('OLLAMA_MODEL', ollamaModel)
    localStorage.setItem('OLLAMA_MODEL', ollamaModel)
  }, [ollamaModel])

  useEffect(() => {
    if (ollamaApiKey) {
      setItemEncrypted('OLLAMA_API_KEY', ollamaApiKey).catch(() => {})
    } else {
      removeItem('OLLAMA_API_KEY')
    }
  }, [ollamaApiKey])

  useEffect(() => {
    if (apiKey) {
      setItemEncrypted('GEMINI_API_KEY', apiKey).catch(() => {})
    } else {
      removeItem('GEMINI_API_KEY')
    }
  }, [apiKey])

  useEffect(() => {
    sessionStorage.setItem('GEMINI_MODEL', modelName)
    localStorage.setItem('GEMINI_MODEL', modelName)
  }, [modelName])

  return {
    provider,
    setProvider,
    ollamaEndpoint,
    setOllamaEndpoint,
    ollamaModel,
    setOllamaModel,
    ollamaApiKey,
    setOllamaApiKey,
    apiKey,
    setApiKey,
    modelName,
    setModelName,
    showSettings,
    setShowSettings
  }
}
