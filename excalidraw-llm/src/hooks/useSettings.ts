import { useState, useEffect } from 'react'

export type AIProvider = 'ollama' | 'gemini'

export function useSettings() {
  const [provider, setProvider] = useState<AIProvider>(() => 
    (sessionStorage.getItem('AI_PROVIDER') as AIProvider) || 'ollama'
  )
  const [ollamaEndpoint, setOllamaEndpoint] = useState(() => 
    sessionStorage.getItem('OLLAMA_ENDPOINT') || 'https://ollama.com'
  )
  const [ollamaModel, setOllamaModel] = useState(() => 
    sessionStorage.getItem('OLLAMA_MODEL') || 'gemma4:31b-cloud'
  )
  const [ollamaApiKey, setOllamaApiKey] = useState(() => 
    sessionStorage.getItem('OLLAMA_API_KEY') || ''
  )
  const [apiKey, setApiKey] = useState(() => 
    sessionStorage.getItem('GEMINI_API_KEY') || ''
  )
  const [modelName, setModelName] = useState(() => 
    sessionStorage.getItem('GEMINI_MODEL') || 'gemini-3.1-flash-lite'
  )
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    sessionStorage.setItem('AI_PROVIDER', provider)
  }, [provider])

  useEffect(() => {
    sessionStorage.setItem('OLLAMA_ENDPOINT', ollamaEndpoint)
    localStorage.removeItem('OLLAMA_ENDPOINT')
  }, [ollamaEndpoint])

  useEffect(() => {
    sessionStorage.setItem('OLLAMA_MODEL', ollamaModel)
    localStorage.removeItem('OLLAMA_MODEL')
  }, [ollamaModel])

  useEffect(() => {
    if (ollamaApiKey) {
      sessionStorage.setItem('OLLAMA_API_KEY', ollamaApiKey)
    } else {
      sessionStorage.removeItem('OLLAMA_API_KEY')
    }
    localStorage.removeItem('OLLAMA_API_KEY')
  }, [ollamaApiKey])

  useEffect(() => {
    if (apiKey) {
      sessionStorage.setItem('GEMINI_API_KEY', apiKey)
    } else {
      sessionStorage.removeItem('GEMINI_API_KEY')
    }
    localStorage.removeItem('GEMINI_API_KEY')
  }, [apiKey])

  useEffect(() => {
    sessionStorage.setItem('GEMINI_MODEL', modelName)
    localStorage.removeItem('GEMINI_MODEL')
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
