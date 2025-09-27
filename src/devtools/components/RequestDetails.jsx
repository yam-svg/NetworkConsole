import { memo, useState, useMemo, useEffect } from 'react'
import PropTypes from 'prop-types'
import { copyToClipboardInDevTools } from '../utils/clipboard'

const RequestDetails = memo(({ request, onResend }) => {
  const [copyMessage, setCopyMessage] = useState('')
  const [activeSubTab, setActiveSubTab] = useState('basic')

  const copyToClipboard = async (text, type) => {
    const success = await copyToClipboardInDevTools(text, type)
    if (success) {
      setCopyMessage(`${type} 已复制到剪贴板`)
    } else {
      setCopyMessage('请手动复制已选中的内容')
    }
    
    // 3秒后清除消息
    setTimeout(() => {
      setCopyMessage('')
    }, 3000)
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

RequestDetails.propTypes = {
  request: PropTypes.object,
  onResend: PropTypes.func
}

export default RequestDetails