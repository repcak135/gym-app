import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './theme/tokens.css'
import './theme/global.css'
import './theme/motion.css'
import App from './App.tsx'
import { requestPersistentStorage } from './data/storage'
import { seedExercises } from './data/exercises'
import { listenForInstallPrompt } from './data/installGuide'

void requestPersistentStorage()
void seedExercises()
listenForInstallPrompt()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
