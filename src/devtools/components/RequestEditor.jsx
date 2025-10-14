import { useState, useEffect, useRef } from 'react'
import PropTypes from 'prop-types'
import BodyEditor from './BodyEditor'
import { parseRequestText, exampleTexts } from '../utils/requestParser'

const RequestEditor = ({ request, onSendRequest, onResponse }) => {
  const [editedRequest, setEditedRequest] = useState(null)
  const [activeBodyType, setActiveBodyType] = useState('raw')
  const [isLoading, setIsLoading] = useState(false)
  const [requestCount, setRequestCount] = useState(1) // 新增：请求次数
  const [showImportModal, setShowImportModal] = useState(false) // 导入模态框状态
  const [importText, setImportText] = useState('') // 导入文本
  const [importError, setImportError] = useState('') // 导入错误信息
  const cancelRef = useRef(false) // 发送中止标记

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
    
    // 过滤掉标记文本
    if (typeof actualBody === 'string') {
      if (actualBody === '[空请求体]' || actualBody === '[无法解析的请求体]') {
        return ''
      }
      
      // 尝试解析并格式化JSON
      try {
        const parsed = JSON.parse(actualBody)
        // 默认格式化JSON，每一行显示一个参数，提升可读性
        return JSON.stringify(parsed, null, 2)
      } catch {
        // 如果不是JSON，检查是否是压缩的JSON（去掉空格的JSON）
        const trimmed = actualBody.trim()
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
            (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
          try {
            const parsed = JSON.parse(trimmed)
            return JSON.stringify(parsed, null, 2)
          } catch {
            // 解析失败，返回原始内容
            return actualBody
          }
        }
        return actualBody
      }
    }
    
    // 如果是对象，格式化为JSON
    return JSON.stringify(actualBody, null, 2)
  }

  const detectBodyType = (body, requestBody) => {
    const actualBody = body || requestBody
    if (!actualBody || actualBody === '[空请求体]' || actualBody === '[无法解析的请求体]') {
      return 'none'
    }
    
    if (typeof actualBody === 'string') {
      const trimmed = actualBody.trim()
      
      // 优先检查JSON格式（包括压缩的JSON）
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
          (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try {
          JSON.parse(trimmed)
          return 'json'
        } catch {
          // 解析失败，继续其他检查
        }
      }
      
      // 检查是否为URL编码格式
      if (trimmed.includes('=') && trimmed.includes('&')) {
        return 'form'
      }
      
      // 尝试解析其他可能的JSON格式
      try {
        JSON.parse(trimmed)
        return 'json'
      } catch {
        return 'raw'
      }
    }
    
    // 如果是对象，返回JSON类型
    return 'json'
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
      cancelRef.current = false
      
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

        // 批量发送请求（支持中途停止）
        const results = []
        for (let i = 0; i < requestCount; i++) {
          if (cancelRef.current) {
            break
          }
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
            if (!cancelRef.current) {
              results.push(result)
            }
            
            // 如果是多次请求，稍微延迟避免请求过于密集
            if (requestCount > 1 && i < requestCount - 1) {
              await new Promise(resolve => setTimeout(resolve, 100))
            }
          } catch (error) {
            if (!cancelRef.current) {
              results.push({
                success: false,
                error: error.message,
                status: 'error',
                response: error.message
              })
            }
          }
        }
        
        if (!cancelRef.current) {
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
          

        } else {
          // 用户中止
          if (onResponse) {
            onResponse({
              success: false,
              status: 'cancelled',
              error: '已停止发送',
              response: '已停止发送',
              batchResults: results,
              totalRequests: results.length
            })
          }
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

  const handleCancelSend = () => {
    cancelRef.current = true
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

  const handleBodyTypeChange = (type) => {
    setActiveBodyType(type)
    setEditedRequest({ ...editedRequest, bodyType: type })
  }

  // 处理导入请求
  const handleImportRequest = () => {
    setShowImportModal(true)
    setImportText('')
    setImportError('')
  }

  // 关闭导入模态框
  const handleCloseImport = () => {
    setShowImportModal(false)
    setImportText('')
    setImportError('')
  }

  // 执行导入
  const handleDoImport = () => {
    try {
      setImportError('')
      const parsed = parseRequestText(importText)
      
      // 转换headers为编辑器格式
      const headers = Object.entries(parsed.headers || {}).map(([key, value]) => ({
        key,
        value: String(value),
        enabled: true
      }))
      
      // 检测body类型
      let bodyType = 'raw'
      if (!parsed.body) {
        bodyType = 'none'
      } else {
        try {
          JSON.parse(parsed.body)
          bodyType = 'json'
        } catch {
          if (parsed.body.includes('=') && parsed.body.includes('&')) {
            bodyType = 'form'
          }
        }
      }
      
      // 更新请求数据
      setEditedRequest({
        url: parsed.url || '',
        method: parsed.method || 'GET',
        headers,
        body: parsed.body || '',
        bodyType
      })
      
      setActiveBodyType(bodyType)
      setShowImportModal(false)
      setImportText('')
      
    } catch (error) {
      setImportError(error.message || '解析失败，请检查格式是否正确')
    }
  }

  // 插入示例
  const handleInsertExample = (type) => {
    setImportText(exampleTexts[type])
    setImportError('')
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
          <button 
            onClick={handleImportRequest}
            className="import-button"
            title="导入cURL或fetch请求"
          >
            导入请求
          </button>
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
            {isLoading ? (
              <button onClick={handleCancelSend} className="send-button danger">
                停止
              </button>
            ) : (
              <button onClick={handleSend} className="send-button">
                发送请求
              </button>
            )}
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
              onClick={() => handleBodyTypeChange('raw')}
            >
              Raw
            </button>
            <button
              className={`tab-button ${activeBodyType === 'json' ? 'active' : ''}`}
              onClick={() => handleBodyTypeChange('json')}
            >
              JSON
            </button>
            <button
              className={`tab-button ${activeBodyType === 'form' ? 'active' : ''}`}
              onClick={() => handleBodyTypeChange('form')}
            >
              表单
            </button>
          </div>
        </div>
        
        {activeBodyType !== 'none' && (
          <BodyEditor 
            body={editedRequest.body}
            bodyType={activeBodyType}
            onBodyChange={(newBody) => setEditedRequest({ ...editedRequest, body: newBody })}
            onBodyTypeChange={handleBodyTypeChange}
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
        {isLoading ? (
          <button onClick={handleCancelSend} className="send-button danger">
            停止
          </button>
        ) : (
          <button onClick={handleSend} className="send-button primary">
            发送请求
          </button>
        )}
      </div>

      {/* 导入请求模态框 */}
      {showImportModal && (
        <div className="import-modal-overlay" onClick={handleCloseImport}>
          <div className="import-modal" onClick={(e) => e.stopPropagation()}>
            <div className="import-modal-header">
              <h3>导入请求</h3>
              <button className="close-button" onClick={handleCloseImport}>×</button>
            </div>
            
            <div className="import-modal-body">
              <p className="import-description">
                粘贴cURL命令或JSON配置，自动解析为请求参数：
              </p>
              
              <div className="example-buttons">
                <button 
                  className="example-btn"
                  onClick={() => handleInsertExample('curl')}
                >
                  cURL示例
                </button>
                <button 
                  className="example-btn"
                  onClick={() => handleInsertExample('json')}
                >
                  JSON示例
                </button>
              </div>
              
              <textarea
                className="import-textarea"
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="在此粘贴cURL命令或JSON配置..."
                rows={12}
              />
              
              {importError && (
                <div className="import-error">
                  {importError}
                </div>
              )}
            </div>
            
            <div className="import-modal-footer">
              <button className="cancel-button" onClick={handleCloseImport}>
                取消
              </button>
              <button 
                className="import-button-confirm"
                onClick={handleDoImport}
                disabled={!importText.trim()}
              >
                导入
              </button>
            </div>
          </div>
        </div>
      )}
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