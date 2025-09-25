import { useState, useEffect } from 'react'

function OptionsApp() {
  const [settings, setSettings] = useState({
    autoEnable: true,
    theme: 'auto',
    notifications: true
  })
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
    // 从存储中读取设置
    chrome.storage.sync.get(['settings'], (result) => {
      if (result.settings) {
        setSettings(result.settings)
      }
    })
  }, [])

  const handleSettingChange = (key, value) => {
    const newSettings = { ...settings, [key]: value }
    setSettings(newSettings)
    chrome.storage.sync.set({ settings: newSettings })
  }

  const handleSave = () => {
    chrome.storage.sync.set({ settings }, () => {
      showNotification('设置已保存！', 'success')
    })
  }

  return (
    <div className="options-container">
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
      
      <h1>插件设置</h1>
      
      <div className="settings-section">
        <h2>基本设置</h2>
        
        <div className="setting-item">
          <label>
            <input
              type="checkbox"
              checked={settings.autoEnable}
              onChange={(e) => handleSettingChange('autoEnable', e.target.checked)}
            />
            自动启用插件
          </label>
        </div>

        <div className="setting-item">
          <label>
            主题：
            <select
              value={settings.theme}
              onChange={(e) => handleSettingChange('theme', e.target.value)}
            >
              <option value="auto">自动</option>
              <option value="light">浅色</option>
              <option value="dark">深色</option>
            </select>
          </label>
        </div>

        <div className="setting-item">
          <label>
            <input
              type="checkbox"
              checked={settings.notifications}
              onChange={(e) => handleSettingChange('notifications', e.target.checked)}
            />
            启用通知
          </label>
        </div>
      </div>

      <div className="actions">
        <button onClick={handleSave}>保存设置</button>
      </div>
    </div>
  )
}

export default OptionsApp