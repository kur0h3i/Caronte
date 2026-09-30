import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { queryClient } from './api/queryClient'
import App from './App'
import './index.css'
import { applyTheme, getStoredTheme } from './theme/theme'
import { ThemeProvider } from './theme/ThemeProvider'

// No hay script inline en index.html (la CSP lo prohíbe): aplicamos el tema aquí.
applyTheme(getStoredTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)
