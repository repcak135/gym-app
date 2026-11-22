import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './theme/tokens.css'
import './theme/global.css'
import App from './App.tsx'
import { requestPersistentStorage } from './data/storage'
import { seedExercises } from './data/exercises'

void requestPersistentStorage()
void seedExercises()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
