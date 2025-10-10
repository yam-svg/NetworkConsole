import { useState, useEffect } from 'react'
import Split from 'react-split'
import './devtools.css'
import './split.css'
import RequestDetails from './components/RequestDetails'
import RequestEditor from './components/RequestEditor'
import { copyToClipboardInDevTools } from './utils/clipboard'

function NetworkConsole() {
  const MAX_REQUESTS = 50
  const [requests, setRequests] = useState([])
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [filter, setFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('all') // 新增类型筛选
  const [activeTab, setActiveTab] = useState('details') // 详情标签页状态
  const [requestResponse, setRequestResponse] = useState(null) // 存储请求响应结果
  const [notification, setNotification] = useState(null) // 通知状态

  // 显示通知函数
  const showNotification = (message, type = 'info') => {
    setNotification({ message, type })
    // 3秒后自动清除通知
    setTimeout(() => {
      setNotification(null)
    }, 3000)
  }

  useEffect(() => {
    console.log('🚀 NetworkConsole 组件初始化')
    
    // 获取当前检查的标签页ID
    const currentTabId = chrome.devtools?.inspectedWindow?.tabId
    console.log('🏷️ 当前检查标签页ID:', currentTabId)
    
    // 加载存储的请求数据
    loadStoredRequests()
    
    // 监听来自 background script 的消息
    const handleMessage = (message) => {
      // 检查 runtime 是否仍然有效
      if (chrome.runtime.lastError) {
        console.error('Runtime错误:', chrome.runtime.lastError)
        return
      }
      
      if (message.type === 'NETWORK_REQUEST') {
        // 检查是否为当前标签页的请求
        if (message.data.tabId && message.data.tabId !== currentTabId) {
          console.log('🙅 跳过其他标签页的请求:', message.data.tabId, '当前:', currentTabId)
          return
        }
        
        console.log('📨 收到网络请求:', message.data)
        setRequests(prev => {
          // 检查是否已存在（更新或添加）
          const existingIndex = prev.findIndex(req => req.id === message.data.id)
          if (existingIndex >= 0) {
            // 更新已存在的请求
            const updated = [...prev]
            updated[existingIndex] = { ...updated[existingIndex], ...message.data }
            return updated
          } else {
            // 添加新请求
            return [message.data, ...prev].slice(0, MAX_REQUESTS)
          }
        })
      }
    }

    // 监听消息时加入错误处理
    const messageListener = (message, sender, sendResponse) => {
      try {
        handleMessage(message)
        if (sendResponse) sendResponse({ received: true })
      } catch (error) {
        console.error('处理消息时出错:', error)
        if (sendResponse) sendResponse({ error: error.message })
      }
    }

    chrome.runtime.onMessage.addListener(messageListener)
    
    // 监听存储变化（作为备用机制）
    const handleStorageChange = (changes, area) => {
      if (area === 'local' && changes.latestNetworkRequest) {
        const newRequest = changes.latestNetworkRequest.newValue
        if (newRequest) {
          // 检查是否为当前标签页的请求
          if (newRequest.tabId && newRequest.tabId !== currentTabId) {
            console.log('🙅 跳过其他标签页的存储请求:', newRequest.tabId, '当前:', currentTabId)
            return
          }
          
          console.log('💾 从存储收到网络请求:', newRequest)
          handleMessage({ type: 'NETWORK_REQUEST', data: newRequest })
        }
      }
    }
    
    chrome.storage.onChanged.addListener(handleStorageChange)

    return () => {
      try {
        chrome.runtime.onMessage.removeListener(messageListener)
        chrome.storage.onChanged.removeListener(handleStorageChange)
      } catch (error) {
        console.error('清理监听器时出错:', error)
      }
    }
  }, [])

  // 加载存储的请求数据
  const loadStoredRequests = () => {
    try {
      chrome.runtime.sendMessage({
        type: 'GET_REQUESTS',
        tabId: chrome.devtools?.inspectedWindow?.tabId
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Runtime错误:', chrome.runtime.lastError)
          return
        }
        
        if (response && response.success && response.requests) {
          console.log('📚 加载了', response.requests.length, '个存储的请求')
          setRequests(response.requests.slice(0, MAX_REQUESTS))
        } else {
          console.warn('加载存储的请求失败:', response)
        }
      })
    } catch (error) {
      console.error('加载请求时出错:', error)
    }
  }

  // 增强的筛选逻辑
  const filteredRequests = requests.filter(request => {
    // 文本筛选
    const textMatch = request.url.toLowerCase().includes(filter.toLowerCase()) ||
                     request.method.toLowerCase().includes(filter.toLowerCase())
    
    // 类型筛选
    let typeMatch = true
    if (typeFilter !== 'all') {
      switch (typeFilter) {
        case 'fetch':
          typeMatch = request.requestType === 'fetch'
          break
        case 'xhr':
          typeMatch = request.requestType === 'xhr'
          break
        case 'js':
          typeMatch = request.requestType === 'script' || request.url.includes('.js')
          break
        case 'css':
          typeMatch = request.requestType === 'stylesheet' || request.url.includes('.css')
          break
        case 'img':
          typeMatch = request.requestType === 'image' || /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(request.url)
          break
        case 'doc':
          typeMatch = request.requestType === 'document' || request.requestType === 'main_frame'
          break
        default:
          typeMatch = true
      }
    }
    
    return textMatch && typeMatch
  })

  const clearRequests = () => {
    console.log('🧹 清空所有请求')
    
    // 清空本地状态
    setRequests([])
    setSelectedRequest(null)
    setRequestResponse(null) // 同时清空响应数据
    
    // 清空存储
    try {
      chrome.runtime.sendMessage({ type: 'CLEAR_REQUESTS' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Runtime错误:', chrome.runtime.lastError)
          return
        }
        
        if (response && response.success) {
          console.log('✅ 存储已清空')
        } else {
          console.warn('清空存储失败:', response)
        }
      })
    } catch (error) {
      console.error('清空请求时出错:', error)
    }
  }

  const resendRequest = async (request) => {
    try {
      console.log('🔄 重发请求:', request.url)
      
      // 通过 background script 重发请求
      chrome.runtime.sendMessage({
        type: 'RESEND_REQUEST',
        data: {
          url: request.url,
          method: request.method,
          headers: request.headers || request.requestHeaders,
          body: request.body || request.requestBody
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Runtime错误:', chrome.runtime.lastError)
          showNotification('重发请求失败: ' + chrome.runtime.lastError.message, 'error')
          return
        }
        
        if (response && response.success) {
          console.log('✅ 重发成功:', response)
          
          // 创建新的请求记录
          const newRequest = {
            ...request,
            id: 'resend_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            timestamp: Date.now(),
            status: response.status,
            statusText: response.statusText || 'OK',
            responseHeaders: response.responseHeaders,
            response: response.response,
            duration: response.duration,
            source: 'resend'
          }
          
          // 添加到请求列表并限制数量
          setRequests(prev => [newRequest, ...prev].slice(0, MAX_REQUESTS))
          
          // 自动选择新请求
          setSelectedRequest(newRequest)
          
          showNotification('请求重发成功！', 'success')
        } else {
          console.error('重发失败:', response)
          showNotification('重发请求失败: ' + (response?.error || '未知错误'), 'error')
        }
      })
    } catch (error) {
      console.error('重发请求时出错:', error)
      showNotification('重发请求失败: ' + error.message, 'error')
    }
  }

  const formatStatus = (status) => {
    if (!status || status === 'pending') return 'pending'
    if (typeof status === 'number') return status.toString()
    return status
  }

  const getStatusClass = (status) => {
    if (!status || status === 'pending') return 'pending'
    if (typeof status === 'number') {
      if (status >= 200 && status < 300) return 'success'
      if (status >= 400) return 'error'
    }
    return 'pending'
  }

  return (
    <div className="network-console">
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
      
      {/* 头部控制栏 */}
      <div className="console-header">
        <div className="header-controls">
          <input
            type="text"
            placeholder="筛选请求..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="filter-input"
          />
          
          {/* 快速筛选按钮 */}
          <div className="filter-buttons">
            <button 
              className={`filter-btn ${typeFilter === 'all' ? 'active' : ''}`}
              onClick={() => setTypeFilter('all')}
            >
              全部
            </button>
            <button 
              className={`filter-btn ${typeFilter === 'fetch' ? 'active' : ''}`}
              onClick={() => setTypeFilter('fetch')}
            >
              Fetch
            </button>
            <button 
              className={`filter-btn ${typeFilter === 'xhr' ? 'active' : ''}`}
              onClick={() => setTypeFilter('xhr')}
            >
              XHR
            </button>
            <button 
              className={`filter-btn ${typeFilter === 'js' ? 'active' : ''}`}
              onClick={() => setTypeFilter('js')}
            >
              JS
            </button>
            <button 
              className={`filter-btn ${typeFilter === 'css' ? 'active' : ''}`}
              onClick={() => setTypeFilter('css')}
            >
              CSS
            </button>
            <button 
              className={`filter-btn ${typeFilter === 'img' ? 'active' : ''}`}
              onClick={() => setTypeFilter('img')}
            >
              图片
            </button>
            <button 
              className={`filter-btn ${typeFilter === 'doc' ? 'active' : ''}`}
              onClick={() => setTypeFilter('doc')}
            >
              文档
            </button>
          </div>
        </div>
      </div>

      {/* 主要内容区域 */}
      <Split className="console-content" sizes={[40, 60]} minSize={[200, 300]} gutterSize={4}>
        <div className="requests-panel">
          <div className="requests-header">
            网络请求 ({filteredRequests.length})
            <div className="header-right">
              <button className="clear-button" onClick={clearRequests}>
                清空
              </button>
            </div>
          </div>
          
          <div className="requests-table">
            <div className="requests-table-header">
              <div className="header-method">方法</div>
              <div className="header-url">URL</div>
              <div className="header-status">状态</div>
              <div className="header-type">类型</div>
              <div className="header-time">时间</div>
            </div>
            
            <div className="requests-list">
              {filteredRequests.map((request) => (
                <div
                  key={request.id}
                  className={`request-item ${selectedRequest?.id === request.id ? 'selected' : ''}`}
                  onClick={() => setSelectedRequest(request)}
                >
                  <div className={`request-method ${request.method}`}>
                    {request.method}
                  </div>
                  <div className="request-url" title={request.url}>
                    {request.url}
                  </div>
                  <div className={`request-status ${getStatusClass(request.status)}`}>
                    {formatStatus(request.status)}
                  </div>
                  <div className="request-type">{request.requestType || 'unknown'}</div>
                  <div className="request-time">
                    {new Date(request.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              ))}
              {filteredRequests.length === 0 && (
                <div className="empty-state">
                  没有找到网络请求
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="details-panel">
          {selectedRequest ? (
            <div className="details-container">
              {/* 标签页头部 */}
              <div className="details-tabs">
                <button 
                  className={`tab-button ${activeTab === 'details' ? 'active' : ''}`}
                  onClick={() => setActiveTab('details')}
                >
                  请求详情
                </button>
                <button 
                  className={`tab-button ${activeTab === 'editor' ? 'active' : ''}`}
                  onClick={() => setActiveTab('editor')}
                >
                  请求编辑
                </button>
                <button 
                  className={`tab-button ${activeTab === 'response' ? 'active' : ''}`}
                  onClick={() => setActiveTab('response')}
                  disabled={!requestResponse}
                >
                  响应结果
                  {requestResponse && (
                    <span className={`status-indicator ${requestResponse.success ? 'success' : 'error'}`}>
                      {requestResponse.status || 'Error'}
                    </span>
                  )}
                </button>
              </div>
              
              {/* 标签页内容 */}
              <div className="tab-content">
                {activeTab === 'details' && (
                  <RequestDetails 
                    request={selectedRequest} 
                    onResend={resendRequest}
                  />
                )}
                {activeTab === 'editor' && (
                  <RequestEditor 
                    request={selectedRequest} 
                    onSendRequest={resendRequest}
                    onResponse={(response) => {
                      setRequestResponse(response)
                      setActiveTab('response') // 自动切换到响应标签页
                    }}
                  />
                )}
                {activeTab === 'response' && (
                  <div className="response-tab-content">
                    {requestResponse ? (
                      <>
                        <div className="response-header">
                          <h3>响应结果</h3>
                          <div className="response-status">
                            <span className={`status-badge ${requestResponse.success ? 'success' : 'error'}`}>
                              {requestResponse.status || (requestResponse.error ? 'Error' : 'Unknown')}
                            </span>
                            {requestResponse.duration && (
                              <span className="duration">{requestResponse.duration}ms</span>
                            )}
                          </div>
                        </div>
                        
                        {/* 响应内容 */}
                        <div className="response-section">
                          <div className="section-header">
                            <h4>响应内容</h4>
                            <button 
                              className="copy-btn"
                              onClick={async () => {
                                const content = requestResponse.response || '无响应内容'
                                const success = await copyToClipboardInDevTools(content, '响应内容')
                                if (success) {
                                  showNotification('响应内容已复制到剪贴板', 'success')
                                } else {
                                  showNotification('请手动复制已选中的内容', 'info')
                                }
                              }}
                              title="复制响应内容"
                            >
                              复制
                            </button>
                          </div>
                          <div className="response-body">
                            <pre>{requestResponse.response || '无响应内容'}</pre>
                          </div>
                        </div>
                        
                        {/* 响应头 */}
                        {requestResponse.responseHeaders && Object.keys(requestResponse.responseHeaders).length > 0 && (
                          <div className="response-section">
                            <h4>响应头</h4>
                            <div className="headers-display">
                              {Object.entries(requestResponse.responseHeaders).map(([key, value]) => (
                                <div key={key} className="header-item">
                                  <span className="header-key">{key}:</span>
                                  <span className="header-value">{value}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="empty-response">
                        <p>还没有响应数据</p>
                        <p>请在&ldquo;请求编辑&rdquo;标签页中发送请求</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="empty-details">
              选择一个请求以查看详情
            </div>
          )}
        </div>
      </Split>
    </div>
  )
}

export default NetworkConsole