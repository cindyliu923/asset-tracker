import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import AssetTracker from './AssetTracker'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AssetTracker />
  </StrictMode>
)
