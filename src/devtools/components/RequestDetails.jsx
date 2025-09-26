import { memo, useState, useMemo, useEffect } from 'react'

const RequestDetails = memo(({ request, onResend }) => {
  const [copyMessage, setCopyMessage] = useState('')
  const [activeSubTab, setActiveSubTab] = useState('basic')

  const copyToClipboard = async (text, type) => {
    try {
      // 在插件环境中，优先使用 chrome.scripting API
      if (chrome && chrome.scripting) {
        try {
          // 向当前标签页注入复制脚本
          const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
          if (tabs.length > 0) {
            await chrome.scripting.executeScript({
              target: { tabId: tabs[0].id },
              func: (textToCopy) => {
                navigator.clipboard.writeText(textToCopy).catch(() => {
                  // 备用方案
                  const textarea = document.createElement('textarea')
                  textarea.value = textToCopy
                  document.body.appendChild(textarea)
                  textarea.select()
                  document.execCommand('copy')
                  document.body.removeChild(textarea)
                })
              },
              args: [text]
            })
            setCopyMessage(`${type} 已复制到剪贴板`)
            return
          }
        } catch (err) {
          console.warn('chrome.scripting 复制失败，尝试其他方法:', err)
        }
      }
      
      // 尝试现代 Clipboard API
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text)
        setCopyMessage(`${type} 已复制到剪贴板`)
        return
      }
      
      // 备用方案：使用传统的 execCommand
      const textArea = document.createElement('textarea')
      textArea.value = text
      textArea.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;pointer-events:none;'
      document.body.appendChild(textArea)
      
      textArea.focus()
      textArea.select()
      textArea.setSelectionRange(0, text.length)
      
      const success = document.execCommand('copy')
      document.body.removeChild(textArea)
      
      if (success) {
        setCopyMessage(`${type} 已复制到剪贴板`)
      } else {
        // 最后的备用方案：显示文本供手动复制
        showCopyModal(text, type)
      }
    } catch (err) {
      console.error('复制失败:', err)
      showCopyModal(text, type)
    }
    
    // 3秒后清除消息
    setTimeout(() => {
      setCopyMessage('')
    }, 3000)
  }
  
  const showCopyModal = (text, type) => {
    // 创建模态框供手动复制
    const modal = document.createElement('div')
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `
    
    const content = document.createElement('div')
    content.style.cssText = `
      background: white;
      border-radius: 8px;
      padding: 20px;
      max-width: 80%;
      max-height: 80%;
      overflow: auto;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    `
    
    const closeModal = () => {
      if (modal.parentNode) {
        modal.parentNode.removeChild(modal)
      }
    }
    
    content.innerHTML = `
      <h3 style="margin-top: 0; color: #333; font-size: 16px;">${type} - 手动复制</h3>
      <p style="color: #666; margin: 10px 0; font-size: 14px;">请选中下面的文本并复制 (Ctrl+C)：</p>
      <textarea readonly style="
        width: 100%;
        height: 200px;
        font-family: monospace;
        font-size: 12px;
        border: 1px solid #ddd;
        border-radius: 4px;
        padding: 8px;
        resize: vertical;
        box-sizing: border-box;
      ">${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
      <div style="margin-top: 15px; text-align: right;">
        <button style="
          background: #007acc;
          color: white;
          border: none;
          padding: 10px 16px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        ">关闭</button>
      </div>
    `
    
    const closeBtn = content.querySelector('button')
    const textarea = content.querySelector('textarea')
    
    closeBtn.onclick = closeModal
    modal.onclick = (e) => {
      if (e.target === modal) closeModal()
    }
    
    modal.appendChild(content)
    document.body.appendChild(modal)
    
    // 自动选中文本
    setTimeout(() => {
      textarea.focus()
      textarea.select()
    }, 100)
    
    setCopyMessage('请手动复制文本内容')
  }

  const formatJSON = (obj) => {
    try {
      if (typeof obj === 'string') {
        return obj
      }
      return JSON.stringify(obj, null, 2)
    } catch {
      return String(obj)
    }
  }

  const handleResend = async () => {
    if (!request || !onResend) {
      setCopyMessage('无法重发请求：缺少必要参数')
      return
    }
    
    try {
      console.log('重发请求:', request.url)
      setCopyMessage('正在重发请求...')
      
      await onResend({
        url: request.url,
        method: request.method,
        headers: request.headers || request.requestHeaders || {},
        body: request.body || request.requestBody
      })
      
      setCopyMessage('请求已重新发送')
    } catch (error) {
      console.error('重发请求失败:', error)
      setCopyMessage('重发失败: ' + (error.message || '未知错误'))
    }
    
    setTimeout(() => setCopyMessage(''), 3000)
  }

  const safeGet = (obj, path, defaultValue = '') => {
    try {
      return obj && obj[path] !== undefined ? obj[path] : defaultValue
    } catch {
      return defaultValue
    }
  }

  const renderHeaders = (headers, title) => {
    if (!headers) return null
    
    let headerEntries = []
    try {
      if (Array.isArray(headers)) {
        // webRequest API 格式
        headerEntries = headers.map(h => [h.name, h.value])
      } else if (typeof headers === 'object') {
        // 普通对象格式
        headerEntries = Object.entries(headers)
      }
    } catch (err) {
      console.error('解析请求头失败:', err)
      return null
    }

    if (headerEntries.length === 0) return null

    return (
      <div className="details-section">
        <h3>
          {title}
          <button 
            className="copy-btn"
            onClick={() => copyToClipboard(formatJSON(headers), title)}
            style={{ marginLeft: '8px', fontSize: '10px', padding: '2px 6px' }}
          >
            复制
          </button>
        </h3>
        <div className="headers-list">
          {headerEntries.map(([key, value], index) => (
            <div key={`${key}-${index}`} className="header-item">
              <span className="header-name">{key}:</span>
              <span className="header-value">{String(value)}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // 子标签页配置
  const availableTabs = useMemo(() => {
    const hasReqHeaders = Boolean(request && (request.headers || request.requestHeaders))
    const hasReqBody = Boolean(request && (request.body || request.requestBody))
    const hasResHeaders = Boolean(request && request.responseHeaders)
    const hasResponse = Boolean(request && request.response)
    return [
      { id: 'basic', label: '基本信息', enabled: true },
      { id: 'reqHeaders', label: '请求头', enabled: hasReqHeaders },
      { id: 'reqBody', label: '请求体', enabled: hasReqBody },
      { id: 'resHeaders', label: '响应头', enabled: hasResHeaders },
      { id: 'response', label: '响应内容', enabled: hasResponse }
    ]
  }, [request])

  // 当当前激活的子标签不可用时，自动切换到第一个可用标签
  useEffect(() => {
    const current = availableTabs.find(t => t.id === activeSubTab && t.enabled)
    if (!current) {
      const firstEnabled = availableTabs.find(t => t.enabled)
      if (firstEnabled) setActiveSubTab(firstEnabled.id)
    }
  }, [availableTabs, activeSubTab])

  if (!request) {
    return (
      <div className="request-details">
        <div className="empty-state">
          <p>选择一个请求以查看详情</p>
        </div>
      </div>
    )
  }

  return (
    <div className="request-details">
      {copyMessage && (
        <div className="copy-message" style={{
          position: 'fixed',
          top: '10px',
          right: '10px',
          background: '#4CAF50',
          color: 'white',
          padding: '8px 12px',
          borderRadius: '4px',
          fontSize: '12px',
          zIndex: 1000
        }}>
          {copyMessage}
        </div>
      )}

      {/* 子标签页 */}
      <div className="details-tabs" style={{ marginBottom: '8px', padding: 0 }}>
        {availableTabs.map(tab => (
          <button
            key={tab.id}
            className={`tab-button ${activeSubTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveSubTab(tab.id)}
            style={{ padding: '6px 8px' }}
            disabled={!tab.enabled}
          >
            {tab.label}
          </button>
        ))}
        
        {/* 操作按钮 */}
        <div className="action-buttons" style={{ marginLeft: 'auto' }}>
          <button className="action-btn" onClick={handleResend}>
            重新发送请求
          </button>
          <button
            className="action-btn secondary"
            onClick={() => {
              const headers = request.headers || request.requestHeaders || {}
              const headerString = Array.isArray(headers)
                ? headers.map(h => `-H '${h.name}: ${h.value}'`).join(' ')
                : Object.entries(headers).map(([k,v]) => `-H '${k}: ${v}'`).join(' ')
              
              const body = request.body || request.requestBody
              const bodyString = body ? ` -d '${typeof body === 'string' ? body : JSON.stringify(body)}'` : ''
              
              const curlCommand = `curl -X ${request.method || 'GET'} '${request.url}'${headerString ? ' ' + headerString : ''}${bodyString}`
              copyToClipboard(curlCommand, 'cURL命令')
            }}
          >
            复制为cURL
          </button>
        </div>
      </div>

      {activeSubTab === 'basic' && (
        <div className="details-section">
          <h3>基本信息</h3>
          <div className="details-grid">
            <span className="details-label">URL:</span>
            <span className="details-value">
              {safeGet(request, 'url')}
              <button 
                className="copy-btn"
                onClick={() => copyToClipboard(safeGet(request, 'url'), 'URL')}
                style={{ marginLeft: '8px', fontSize: '10px', padding: '2px 6px' }}
              >
                复制
              </button>
            </span>
            <span className="details-label">方法:</span>
            <span className="details-value">{safeGet(request, 'method')}</span>
            <span className="details-label">状态:</span>
            <span className="details-value">{safeGet(request, 'status') || 'pending'}</span>
            <span className="details-label">类型:</span>
            <span className="details-value">{safeGet(request, 'requestType')}</span>
            <span className="details-label">时间:</span>
            <span className="details-value">
              {request.timestamp ? new Date(request.timestamp).toLocaleString() : ''}
            </span>
            {request.duration && (
              <>
                <span className="details-label">耗时:</span>
                <span className="details-value">{request.duration}ms</span>
              </>
            )}
          </div>
        </div>
      )}

      {activeSubTab === 'reqHeaders' && (
        renderHeaders(request.headers || request.requestHeaders, '请求头')
      )}

      {activeSubTab === 'reqBody' && (
        (request.body || request.requestBody) ? (
          <div className="details-section">
            <h3>
              请求体
              <button 
                className="copy-btn"
                onClick={() => {
                  const body = request.body || request.requestBody
                  const text = typeof body === 'string' ? body : formatJSON(body)
                  copyToClipboard(text, '请求体')
                }}
                style={{ marginLeft: '8px', fontSize: '10px', padding: '2px 6px' }}
              >
                复制
              </button>
            </h3>
            <div className="json-display">
              {(() => {
                const body = request.body || request.requestBody
                if (typeof body === 'string') {
                  return body
                }
                return formatJSON(body)
              })()}
            </div>
          </div>
        ) : null
      )}

      {activeSubTab === 'resHeaders' && (
        renderHeaders(request.responseHeaders, '响应头')
      )}

      {activeSubTab === 'response' && (
        request.response ? (
          <div className="details-section">
            <h3>
              响应内容
              <button 
                className="copy-btn"
                onClick={() => {
                  const text = typeof request.response === 'string' ? request.response : formatJSON(request.response)
                  copyToClipboard(text, '响应内容')
                }}
                style={{ marginLeft: '8px', fontSize: '10px', padding: '2px 6px' }}
              >
                复制
              </button>
            </h3>
            <div className="json-display">
              {typeof request.response === 'string' ? request.response : formatJSON(request.response)}
            </div>
          </div>
        ) : null
      )}
    </div>
  )
})

RequestDetails.displayName = 'RequestDetails'

export default RequestDetails