import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import BodyEditor from './BodyEditor'

const RequestEditor = ({ request, onSendRequest, onResponse }) => {
  const [editedRequest, setEditedRequest] = useState(null)
  const [activeBodyType, setActiveBodyType] = useState('raw')
  const [isLoading, setIsLoading] = useState(false)
  const [requestCount, setRequestCount] = useState(1) // 新增：请求次数

  useEffect(() => {
    if (request) {
      // 初始化编辑状态
      setEditedRequest({
        url: request.url || '',
        method: request.method || 'GET',
        headers: formatHeadersForEdit(request.headers || request.requestHeaders || {}),
        body: formatBodyForEdit(request.body, request.requestBody),
        bodyType: detectBodyType(request.body, request.requestBody)
      })
    }
  }, [request])

  const formatHeadersForEdit = (headers) => {
    if (Array.isArray(headers)) {
      // webRequest API 格式
      return headers.map(h => ({ key: h.name, value: h.value, enabled: true }))
    } else if (typeof headers === 'object') {
      // 普通对象格式
      return Object.entries(headers).map(([key, value]) => ({ 
        key, 
        value: String(value), 
        enabled: true 
      }))
    }
    return []
  }

  const formatBodyForEdit = (body, requestBody) => {
    // 优先使用解析后的body，其次使用原始的requestBody
    const actualBody = body || requestBody
    if (!actualBody) return ''
    if (typeof actualBody === 'string') {
      // 过滤掉不需要的标记
      if (actualBody === '[空请求体]' || actualBody === '[无法解析的请求体]') {
        return ''
      }
      return actualBody
    }
    return JSON.stringify(actualBody, null, 2)
  }

  const detectBodyType = (body, requestBody) => {
    const actualBody = body || requestBody
    if (!actualBody || actualBody === '[空请求体]' || actualBody === '[无法解析的请求体]') return 'none'
    try {
      JSON.parse(actualBody)
      return 'json'
    } catch {
      return 'raw'
    }
  }

  const handleHeaderChange = (index, field, value) => {
    const newHeaders = [...editedRequest.headers]
    newHeaders[index] = { ...newHeaders[index], [field]: value }
    setEditedRequest({ ...editedRequest, headers: newHeaders })
  }

  const addHeader = () => {
    setEditedRequest({
      ...editedRequest,
      headers: [...editedRequest.headers, { key: '', value: '', enabled: true }]
    })
  }

  const removeHeader = (index) => {
    const newHeaders = editedRequest.headers.filter((_, i) => i !== index)
    setEditedRequest({ ...editedRequest, headers: newHeaders })
  }

  const handleSend = async () => {
    if (onSendRequest && editedRequest) {
      setIsLoading(true)
      
      try {
        // 转换headers格式
        const headers = {}
        editedRequest.headers
          .filter(h => h.enabled && h.key.trim())
          .forEach(h => {
            headers[h.key.trim()] = h.value
          })

        const requestToSend = {
          url: editedRequest.url,
          method: editedRequest.method,
          headers,
          body: editedRequest.bodyType === 'none' ? null : editedRequest.body
        }

        // 批量发送请求
        const results = []
        for (let i = 0; i < requestCount; i++) {
          try {
            const result = await new Promise((resolve, reject) => {
              chrome.runtime.sendMessage({
                type: 'RESEND_REQUEST',
                data: requestToSend
              }, (response) => {
                if (chrome.runtime.lastError) {
                  reject(new Error(chrome.runtime.lastError.message))
                } else {
                  resolve(response)
                }
              })
            })
            results.push(result)
            
            // 如果是多次请求，稍微延迟避免请求过于密集
            if (requestCount > 1 && i < requestCount - 1) {
              await new Promise(resolve => setTimeout(resolve, 100))
            }
          } catch (error) {
            results.push({
              success: false,
              error: error.message,
              status: 'error',
              response: error.message
            })
          }
        }
        
        // 传递最后一个响应结果（或者第一个成功的结果）
        const lastResult = results[results.length - 1]
        const successResult = results.find(r => r.success) || lastResult
        
        if (onResponse) {
          onResponse({
            ...successResult,
            batchResults: results, // 批量结果
            totalRequests: requestCount
          })
        }
        
        // 同时调用原来的onSendRequest
        if (onSendRequest) {
          onSendRequest(requestToSend)
        }
        
      } catch (error) {
        console.error('发送请求失败:', error)
        const errorResponse = {
          success: false,
          error: error.message,
          status: 'error',
          response: error.message
        }
        
        if (onResponse) {
          onResponse(errorResponse)
        }
      } finally {
        setIsLoading(false)
      }
    }
  }

  const resetRequest = () => {
    if (request) {
      setEditedRequest({
        url: request.url || '',
        method: request.method || 'GET',
        headers: formatHeadersForEdit(request.headers || request.requestHeaders || {}),
        body: formatBodyForEdit(request.body, request.requestBody),
        bodyType: detectBodyType(request.body, request.requestBody)
      })
    }
  }

  if (!request) {
    return (
      <div className="request-editor">
        <div className="empty-state">
          <p>选择一个请求以进行编辑</p>
        </div>
      </div>
    )
  }

  if (!editedRequest) {
    return <div className="request-editor">Loading...</div>
  }

  return (
    <div className="request-editor">
      {/* URL和方法 */}
      <div className="editor-section">
        <div className="url-method-row">
          <select 
            value={editedRequest.method}
            onChange={(e) => setEditedRequest({ ...editedRequest, method: e.target.value })}
            className="method-select"
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="DELETE">DELETE</option>
            <option value="PATCH">PATCH</option>
            <option value="HEAD">HEAD</option>
            <option value="OPTIONS">OPTIONS</option>
          </select>
          <input
            type="text"
            value={editedRequest.url}
            onChange={(e) => setEditedRequest({ ...editedRequest, url: e.target.value })}
            placeholder="请求URL"
            className="url-input"
          />
          <div className="send-controls">
            <input
              type="number"
              min="1"
              max="100"
              value={requestCount}
              onChange={(e) => setRequestCount(Math.max(1, parseInt(e.target.value) || 1))}
              className="request-count-input"
              title="请求次数"
            />
            <button onClick={handleSend} className="send-button" disabled={isLoading}>
              {isLoading ? '发送中...' : '发送请求'}
            </button>
          </div>
        </div>
      </div>
      
      {/* 请求体 */}
      <div className="editor-section">
        <div className="section-header">
          <h3>请求体</h3>
          <div className="body-type-tabs">
            <button
              className={`tab-button ${activeBodyType === 'none' ? 'active' : ''}`}
              onClick={() => {
                setActiveBodyType('none')
                setEditedRequest({ ...editedRequest, bodyType: 'none', body: '' })
              }}
            >
              无
            </button>
            <button
              className={`tab-button ${activeBodyType === 'raw' ? 'active' : ''}`}
              onClick={() => setActiveBodyType('raw')}
            >
              Raw
            </button>
            <button
              className={`tab-button ${activeBodyType === 'json' ? 'active' : ''}`}
              onClick={() => setActiveBodyType('json')}
            >
              JSON
            </button>
          </div>
        </div>
        
        {activeBodyType !== 'none' && (
          <BodyEditor 
            body={editedRequest.body}
            bodyType={activeBodyType}
            onBodyChange={(newBody) => setEditedRequest({ ...editedRequest, body: newBody })}
            onBodyTypeChange={setActiveBodyType}
          />
        )}
      </div>

      {/* 请求头 */}
      <div className="editor-section">
        <div className="section-header">
          <h3>请求头</h3>
          <button onClick={addHeader} className="add-button">+ 添加</button>
        </div>
        <div className="headers-editor">
          {editedRequest.headers.map((header, index) => (
            <div key={index} className="header-row">
              <input
                type="checkbox"
                checked={header.enabled}
                onChange={(e) => handleHeaderChange(index, 'enabled', e.target.checked)}
                className="header-checkbox"
              />
              <input
                type="text"
                value={header.key}
                onChange={(e) => handleHeaderChange(index, 'key', e.target.value)}
                placeholder="Key"
                className="header-key"
              />
              <input
                type="text"
                value={header.value}
                onChange={(e) => handleHeaderChange(index, 'value', e.target.value)}
                placeholder="Value"
                className="header-value"
              />
              <button onClick={() => removeHeader(index)} className="remove-button">×</button>
            </div>
          ))}
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="editor-actions">
        <button onClick={resetRequest} className="reset-button">
          重置
        </button>
        <button onClick={handleSend} className="send-button primary" disabled={isLoading}>
          {isLoading ? '发送中...' : '发送请求'}
        </button>
      </div>
    </div>
  )
}

RequestEditor.propTypes = {
  request: PropTypes.shape({
    url: PropTypes.string,
    method: PropTypes.string,
    headers: PropTypes.oneOfType([
      PropTypes.array,
      PropTypes.object
    ]),
    requestHeaders: PropTypes.oneOfType([
      PropTypes.array,
      PropTypes.object
    ]),
    body: PropTypes.string,
    requestBody: PropTypes.any
  }),
  onSendRequest: PropTypes.func,
  onResponse: PropTypes.func
}

export default RequestEditor