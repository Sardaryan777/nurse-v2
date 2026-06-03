import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// localStorage polyfill for window.storage (used by NameAutocomplete)
if (typeof window !== 'undefined' && !window.storage) {
  window.storage = {
    get: async (key) => ({ value: localStorage.getItem(key) }),
    set: async (key, value) => { localStorage.setItem(key, value) }
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
