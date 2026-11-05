import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { App } from './App'
import { bootstrap } from './store'

async function start(): Promise<void> {
  // Outside Electron (plain browser preview during development) use an in-memory mock.
  if (!window.typeshelf) {
    const { installMock } = await import('./mock')
    installMock()
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
  await bootstrap()
}

void start()
