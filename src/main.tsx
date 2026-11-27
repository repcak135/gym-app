import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './theme/tokens.css'
import './theme/global.css'
import './theme/motion.css'
import App from './App.tsx'
import { requestPersistentStorage } from './data/storage'
import { seedExercises } from './data/exercises'
import { listenForInstallPrompt } from './data/installGuide'
import { applyTheme } from './theme/themes'
import { getSettings } from './data/settings'
import { presetHasSound, setBreakSilent, setSoundWanted } from './audio/beep'
import { installErrorReporting, setErrorReports } from './errors/reporter'

installErrorReporting()
applyTheme()

void requestPersistentStorage()
void seedExercises()
listenForInstallPrompt()
// Before the first tap: with sound off the app must never start audio (iPhone would pause music).
void getSettings().then((s) => {
  setSoundWanted(presetHasSound(s.restSoundPreset))
  setBreakSilent(!!s.restSoundBreaksSilent)
  setErrorReports(s.errorReports !== false)
}).catch(() => {})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
