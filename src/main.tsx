import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import PowerProvider from './PowerProvider.tsx'
import { ThemeProvider, CssBaseline } from '@mui/material'
import theme from './theme.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <PowerProvider>
        <App />
      </PowerProvider>
    </ThemeProvider>
  </StrictMode>
)
