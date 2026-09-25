import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
/* 思源宋体(本地打包,OFL 开源许可):正文手稿与标题的质感来源 */
import '@fontsource/noto-serif-sc/400.css'
import '@fontsource/noto-serif-sc/700.css'
import './index.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
