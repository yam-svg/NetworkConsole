import { useState, useEffect } from 'react'

function PopupApp() {
  const [requestCount, setRequestCount] = useState(0)
  const [activeTab, setActiveTab] = useState(null)
  const [notification, setNotification] = useState(null)

  // 显示通知函数
  const showNotification = (message, type = 'info') => {
    setNotification({ message, type })
    // 3秒后自动清除通知
    setTimeout(() => {
      setNotification(null)
    }, 3000)
  }

  useEffect(() => {
    // 获取当前活动标签页信息
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        setActiveTab(tabs[0])
      }
    })

    // 获取网络请求数量
    chrome.storage.local.get(['networkRequests'], (result) => {
      const requests = result.networkRequests || []
      setRequestCount(requests.length)
    })
  }, [])

  const handleOpenDevTools = () => {
    // 指导用户打开DevTools
    showNotification('请按 F12 打开开发者工具，然后点击"网络控制台"标签页来使用功能', 'info')
  }

  return (
    <div className="popup-container">
      {/* 通知提示 */}
      {notification && (
        <div className={`notification ${notification.type}`}>
          {notification.message}
          <button 
            className="notification-close" 
            onClick={() => setNotification(null)}
          >
            ×
          </button>
        </div>
      )}
      
      <h1>📡 网络控制台</h1>
      
      <div className="card">
        <div className="status-section">
          <p><strong>当前页面:</strong></p>
          <p className="tab-title">{activeTab?.title}</p>
          <p className="tab-url">{activeTab?.url}</p>
        </div>
        
        <div className="stats-section">
          <div className="stat-item">
            <span className="stat-label">捕获请求:</span>
            <span className="stat-value">{requestCount} 个</span>
          </div>
        </div>
        
        <div className="main-actions">
          <button 
            className="action-btn primary"
            onClick={handleOpenDevTools}
          >
            🔧 如何使用
          </button>
        </div>
      </div>
      
      <div className="help-section">
        <p className="help-text">
          🔧 按 F12 打开开发者工具，点击“网络控制台”标签页
        </p>
        <p className="help-text">
          📡 在DevTools中查看实时的网络请求监控
        </p>
        <p className="help-text">
          ⚙️ 支持请求编辑、重发和响应分析
        </p>
      </div>
    </div>
  )
}

export default PopupApp