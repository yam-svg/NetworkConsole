import React from 'react'
import ReactDOM from 'react-dom/client'
import NetworkConsole from './NetworkConsole.jsx'
import './devtools.css'

// 检测当前环境
const isDevToolsPanel = window.location.search.includes('devtools') || 
                       window.chrome?.devtools?.inspectedWindow

console.log('🔍 网络控制台环境:', isDevToolsPanel ? 'DevTools面板' : '独立标签页')

// 安全的初始化方式 - 避免跨域问题
try {
  console.log('🚀 开始初始化网络控制台...')
  
  // DevTools面板入口
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <NetworkConsole isDevToolsPanel={isDevToolsPanel} />
    </React.StrictMode>,
  )
  
  console.log('✅ 网络控制台初始化成功')
} catch (error) {
  console.error('❌ 网络控制台初始化失败:', error)
}