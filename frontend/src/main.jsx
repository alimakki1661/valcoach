import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// index.css intentionally removed; styles live in App.css
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
