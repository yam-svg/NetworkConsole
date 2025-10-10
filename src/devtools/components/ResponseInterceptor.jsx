import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'

const ResponseInterceptor = ({ onNotification, initialState, onStateChange, selectedRequest }) => {
  const [interceptConfig, setInterceptConfig] = useState({
    enabled: false,
    urlPatterns: [''],
    presetResponses: [], // 预设响应体列表
    selectedRequestId: null
  })
  const [interceptStatus, setInterceptStatus] = useState({
    enabled: false,
    attachedDebugger: false,
    interceptedCount: 0,
    pendingCount: 0
  })
  const [isLoading, setIsLoading] = useState(false)
  const [currentTabId, setCurrentTabId] = useState(null)
  
  // 初始化状态
  useEffect(() => {
    if (initialState) {
      setInterceptConfig(prev => ({
        ...prev,
        enabled: initialState.enabled,
        urlPatterns: initialState.urlPatterns.length > 0 ? initialState.urlPatterns : [''],
        presetResponses: initialState.presetResponses || []
      }))
      setInterceptStatus(initialState.status)
    }
  }, [initialState])

  // 当选中请求时自动填充URL模式
  useEffect(() => {
    // 只在未启用拦截时才自动填充，避免在拦截启用时覆盖用户配置
    if (selectedRequest && selectedRequest.url && !interceptConfig.enabled) {
      try {
        const url = new URL(selectedRequest.url)
        const pattern = `${url.origin}${url.pathname}*`
        
        // 新的自动填充逻辑：
        // 1. 如果只有一个规则（无论是否为空），则替换它
        // 2. 如果有多个规则，填充第一个空白的输入框
        // 3. 如果所有输入框都已填满，则不进行任何操作
        const patterns = interceptConfig.urlPatterns;
        
        if (patterns.length === 1) {
          // 只有一个规则时，无论是否为空都替换它
          setInterceptConfig(prev => ({
            ...prev,
            urlPatterns: [pattern]
          }));
        } else {
          // 查找第一个空白的URL模式输入框
          const emptyIndex = patterns.findIndex(p => !p.trim());
          
          if (emptyIndex >= 0) {
            // 填充第一个空白输入框
            setInterceptConfig(prev => ({
              ...prev,
              urlPatterns: prev.urlPatterns.map((p, i) => i === emptyIndex ? pattern : p)
            }));
          } else if (patterns.length === 0 || patterns.every(p => p.trim() !== '')) {
            // 如果所有输入框都已填满，则不进行任何操作
            console.log('所有URL模式输入框都已填满，不自动填充');
          }
        }
        
      } catch (error) {
        console.warn('解析URL失败:', error)
        // 如果解析失败，直接使用原始URL
        const patterns = interceptConfig.urlPatterns;
        
        if (patterns.length === 1) {
          // 只有一个规则时，无论是否为空都替换它
          setInterceptConfig(prev => ({
            ...prev,
            urlPatterns: [selectedRequest.url]
          }));
        } else {
          // 查找第一个空白的URL模式输入框
          const emptyIndex = patterns.findIndex(p => !p.trim());
          
          if (emptyIndex >= 0) {
            // 填充第一个空白输入框
            setInterceptConfig(prev => ({
              ...prev,
              urlPatterns: prev.urlPatterns.map((p, i) => i === emptyIndex ? selectedRequest.url : p)
            }));
          } else if (patterns.length === 0 || patterns.every(p => p.trim() !== '')) {
            // 如果所有输入框都已填满，则不进行任何操作
            console.log('所有URL模式输入框都已填满，不自动填充');
          }
        }
      }
    }
  }, [selectedRequest, interceptConfig.enabled])

  useEffect(() => {
    console.log('🚀 ResponseInterceptor useEffect 初始化开始')
    
    // 获取当前标签页ID
    const tabId = chrome.devtools?.inspectedWindow?.tabId
    console.log('📋 获取到的 tabId:', tabId)
    setCurrentTabId(tabId)
    
    // 如果有有效的tabId，立即加载拦截状态
    if (tabId) {
      console.log('🔄 立即加载拦截状态')
      loadInterceptionStatus(tabId)
    } else {
      console.warn('⚠️ tabId 无效，无法加载拦截状态')
    }
    
    // 监听标签页激活消息（增强标签页切换支持）
    const handleTabActivated = (message) => {
      if (message.type === 'TAB_ACTIVATED' && message.data.tabId === tabId) {
        console.log('🔄 ResponseInterceptor 收到标签页激活消息，刷新状态')
        setTimeout(() => {
          loadInterceptionStatus(tabId)
        }, 500)
      }
    }
    
    chrome.runtime.onMessage.addListener(handleTabActivated)
    
    // 定期更新状态 - 降低频率减少DevTools错误
    const interval = setInterval(() => {
      console.log('⏰ 定期检查拦截状态, currentTabId:', tabId)
      if (tabId) {
        loadInterceptionStatus(tabId)
      }
    }, 8000) // 从5秒改为8秒，进一步降低频率
    
    return () => {
      console.log('🧹 清理定时器和监听器')
      clearInterval(interval)
      chrome.runtime.onMessage.removeListener(handleTabActivated)
    }
  }, []) // 只在组件初始化时运行一次

  const loadInterceptionStatus = async (tabId = currentTabId, forceRefresh = false) => {
    console.log('🔍 loadInterceptionStatus 被调用, tabId:', tabId, 'forceRefresh:', forceRefresh)
    
    if (!tabId) {
      console.warn('⚠️ loadInterceptionStatus: tabId 为空，跳过执行')
      return
    }

    console.log('📤 发送 GET_INTERCEPTION_STATUS 消息, tabId:', tabId)
    
    try {
      chrome.runtime.sendMessage({
        type: 'GET_INTERCEPTION_STATUS',
        tabId: tabId
      }, (response) => {
        console.log('📥 收到 GET_INTERCEPTION_STATUS 响应:', response)
        
        if (chrome.runtime.lastError) {
          console.error('❌ Runtime 错误:', chrome.runtime.lastError)
          return
        }
        
        if (response && response.success) {
          console.log('✅ 拦截状态更新成功:', response.status)
          
          // 强制刷新模式或状态发生变化时才更新
          const currentStatus = interceptStatus
          const newStatus = response.status
          
          if (forceRefresh || 
              currentStatus.enabled !== newStatus.enabled ||
              currentStatus.attachedDebugger !== newStatus.attachedDebugger ||
              currentStatus.interceptedCount !== newStatus.interceptedCount ||
              currentStatus.pendingCount !== newStatus.pendingCount) {
            
            console.log('🔄 状态发生变化，更新UI:', {
              old: currentStatus,
              new: newStatus
            })
            
            setInterceptStatus(newStatus)
            setInterceptConfig(prev => ({
              ...prev,
              enabled: newStatus.enabled
            }))
            
            // 同步父组件状态
            if (onStateChange) {
              onStateChange(prev => ({
                ...prev,
                enabled: newStatus.enabled,
                status: newStatus
              }))
            }
          } else {
            console.log('🔇 状态未变化，跳过更新')
          }
        } else {
          console.warn('⚠️ 拦截状态响应无效:', response)
        }
      })
    } catch (error) {
      console.error('❌ 获取拦截状态失败:', error)
    }
  }

  const toggleInterception = async () => {
    if (!currentTabId) {
      showNotification('无法获取当前标签页信息', 'error')
      return
    }

    setIsLoading(true)

    try {
      if (interceptConfig.enabled) {
        // 禁用拦截
        console.log('🔒 开始禁用拦截, tabId:', currentTabId)
        chrome.runtime.sendMessage({
          type: 'DISABLE_RESPONSE_INTERCEPTION',
          tabId: currentTabId
        }, (response) => {
          setIsLoading(false)
          console.log('📥 禁用拦截响应:', response)
          
          if (chrome.runtime.lastError) {
            console.error('❌ Runtime错误:', chrome.runtime.lastError)
            showNotification('禁用拦截失败: ' + chrome.runtime.lastError.message, 'error')
            return
          }
          
          if (response && response.success) {
            const newConfig = { ...interceptConfig, enabled: false }
            setInterceptConfig(newConfig)
            
            // 通知父组件状态更新
            if (onStateChange) {
              onStateChange(prev => ({ ...prev, enabled: false }))
            }
            
            const message = response.message || response.warning || '响应拦截已禁用'
            showNotification(message, response.warning ? 'warning' : 'success')
            loadInterceptionStatus()
          } else {
            const errorMsg = response?.error || '未知错误'
            console.error('❌ 禁用拦截失败:', errorMsg)
            showNotification('禁用拦截失败: ' + errorMsg, 'error')
            
            // 强制刷新状态
            setTimeout(() => {
              loadInterceptionStatus()
            }, 1000)
          }
        })
      } else {
        // 启用拦截
        console.log('✅ 开始启用拦截, tabId:', currentTabId)
        const patterns = interceptConfig.urlPatterns.filter(p => p.trim())
        
        // 验证 URL 模式
        const validationResult = validateUrlPatterns(patterns)
        if (!validationResult.valid) {
          setIsLoading(false)
          showNotification('拦截规则验证失败: ' + validationResult.error, 'error')
          return
        }
        
        chrome.runtime.sendMessage({
          type: 'ENABLE_RESPONSE_INTERCEPTION',
          tabId: currentTabId,
          urlPatterns: patterns.length > 0 ? patterns : ['*']
        }, (response) => {
          setIsLoading(false)
          console.log('📥 启用拦截响应:', response)
          
          if (chrome.runtime.lastError) {
            console.error('❌ Runtime错误:', chrome.runtime.lastError)
            showNotification('启用拦截失败: ' + chrome.runtime.lastError.message, 'error')
            return
          }
          
          if (response && response.success) {
            const newConfig = { ...interceptConfig, enabled: true }
            setInterceptConfig(newConfig)
            
            // 通知父组件状态更新
            if (onStateChange) {
              onStateChange(prev => ({ ...prev, enabled: true }))
            }
            
            const message = response.message || '响应拦截已启用'
            showNotification(message, 'success')
            loadInterceptionStatus()
          } else {
            const errorMsg = response?.error || '未知错误'
            console.error('❌ 启用拦截失败:', errorMsg)
            
            // 特殊处理已启用的情况
            if (errorMsg.includes('已经启用') || errorMsg.includes('已更新')) {
              showNotification('拦截功能已经在运行中', 'info')
              // 刷新状态获取最新情况
              setTimeout(() => {
                loadInterceptionStatus()
              }, 500)
            } else {
              showNotification('启用拦截失败: ' + errorMsg, 'error')
            }
          }
        })
      }
    } catch (error) {
      setIsLoading(false)
      console.error('切换拦截状态失败:', error)
      showNotification('操作失败: ' + error.message, 'error')
      
      // 刷新状态
      setTimeout(() => {
        loadInterceptionStatus()
      }, 1000)
    }
  }

  const handlePatternChange = (index, value) => {
    const newPatterns = [...interceptConfig.urlPatterns]
    newPatterns[index] = value
    const newConfig = { ...interceptConfig, urlPatterns: newPatterns }
    setInterceptConfig(newConfig)
    
    // 同步更新到父组件
    if (onStateChange) {
      onStateChange(prev => ({ ...prev, urlPatterns: newPatterns }))
    }
    
    // 如果拦截已启用，需要重新设置拦截模式
    if (interceptConfig.enabled && currentTabId) {
      const patterns = newPatterns.filter(p => p.trim())
      chrome.runtime.sendMessage({
        type: 'UPDATE_INTERCEPTION_PATTERNS',
        tabId: currentTabId,
        urlPatterns: patterns.length > 0 ? patterns : ['*']
      }, (response) => {
        if (response && response.success) {
          showNotification('拦截规则已更新', 'success')
        } else {
          showNotification('更新拦截规则失败: ' + (response?.error || '未知错误'), 'error')
        }
      })
    }
  }

  const addPattern = () => {
    const newPatterns = [...interceptConfig.urlPatterns, '']
    setInterceptConfig(prev => ({
      ...prev,
      urlPatterns: newPatterns
    }))
    
    // 同步更新到父组件
    if (onStateChange) {
      onStateChange(prev => ({ ...prev, urlPatterns: newPatterns }))
    }
  }

  const removePattern = (index) => {
    if (interceptConfig.urlPatterns.length <= 1) return
    
    const newPatterns = interceptConfig.urlPatterns.filter((_, i) => i !== index)
    setInterceptConfig(prev => ({ ...prev, urlPatterns: newPatterns }))
    
    // 同步更新到父组件
    if (onStateChange) {
      onStateChange(prev => ({ ...prev, urlPatterns: newPatterns }))
    }
  }

  /*
  const updatePresetResponse = (id, updatedPreset) => {
    const newPresetResponses = interceptConfig.presetResponses.map(preset => 
      preset.id === id ? { ...preset, ...updatedPreset } : preset
    )
    setInterceptConfig(prev => ({
      ...prev,
      presetResponses: newPresetResponses
    }))
    
    // 同步更新到父组件
    if (onStateChange) {
      onStateChange(prev => ({ ...prev, presetResponses: newPresetResponses }))
    }
    
    // 同步到后台
    if (interceptConfig.enabled && currentTabId) {
      chrome.runtime.sendMessage({
        type: 'UPDATE_PRESET_RESPONSES',
        tabId: currentTabId,
        presetResponses: newPresetResponses
      }, (response) => {
        if (response && response.success) {
          showNotification('预设响应体已更新', 'success')
        } else {
          showNotification('更新预设响应体失败: ' + (response?.error || '未知错误'), 'error')
        }
      })
    }
  }
  */

  // 处理预设响应体变化
  const handlePresetResponseChange = (urlPattern, changes) => {
    // 查找是否已存在该URL模式的预设响应体
    const existingPresetIndex = interceptConfig.presetResponses.findIndex(preset => preset.urlPattern === urlPattern);
    
    let newPresetResponses;
    if (existingPresetIndex >= 0) {
      // 更新现有的预设响应体
      const updatedPreset = { ...interceptConfig.presetResponses[existingPresetIndex], ...changes };
      newPresetResponses = [...interceptConfig.presetResponses];
      newPresetResponses[existingPresetIndex] = updatedPreset;
    } else {
      // 创建新的预设响应体
      const newPreset = {
        id: Date.now().toString(),
        urlPattern,
        statusCode: 200,
        responseBody: '',
        createdAt: Date.now(),
        ...changes
      };
      newPresetResponses = [...interceptConfig.presetResponses, newPreset];
    }
    
    setInterceptConfig(prev => ({ ...prev, presetResponses: newPresetResponses }));
    
    // 同步更新到父组件
    if (onStateChange) {
      onStateChange(prev => ({ ...prev, presetResponses: newPresetResponses }));
    }
    
    // 同步到后台
    if (interceptConfig.enabled && currentTabId) {
      chrome.runtime.sendMessage({
        type: 'UPDATE_PRESET_RESPONSES',
        tabId: currentTabId,
        presetResponses: newPresetResponses
      }, (response) => {
        if (response && response.success) {
          showNotification('预设响应体已更新', 'success');
        } else {
          showNotification('更新预设响应体失败: ' + (response?.error || '未知错误'), 'error');
        }
      });
    }
  };

  // 移除指定URL模式的预设响应体
  const removePresetResponseForPattern = (urlPattern) => {
    const newPresetResponses = interceptConfig.presetResponses.filter(preset => preset.urlPattern !== urlPattern);
    setInterceptConfig(prev => ({ ...prev, presetResponses: newPresetResponses }));
    
    // 同步更新到父组件
    if (onStateChange) {
      onStateChange(prev => ({ ...prev, presetResponses: newPresetResponses }));
    }
    
    // 同步到后台
    if (interceptConfig.enabled && currentTabId) {
      chrome.runtime.sendMessage({
        type: 'UPDATE_PRESET_RESPONSES',
        tabId: currentTabId,
        presetResponses: newPresetResponses
      }, (response) => {
        if (response && response.success) {
          showNotification('预设响应体已移除', 'success');
        } else {
          showNotification('移除预设响应体失败: ' + (response?.error || '未知错误'), 'error');
        }
      });
    }
  };

  // 预设模式选项
  const presetPatterns = [
    { name: '所有请求', pattern: '*', description: '拦截所有网络请求' },
    { name: 'API 请求', pattern: '*/api/*', description: '拦截所有包含 /api/ 的请求' },
    { name: 'Ajax 请求', pattern: '*/ajax/*', description: '拦截所有包含 /ajax/ 的请求' },
    { name: 'GraphQL', pattern: '*/graphql*', description: '拦截 GraphQL 接口请求' },
    { name: 'REST API', pattern: '*/v*/api/*', description: '拦截版本化的 REST API' },
    { name: 'JSON 接口', pattern: '*.json', description: '拦截返回 JSON 的接口' },
    { name: '特定域名', pattern: 'https://api.example.com/*', description: '拦截特定域名的请求' },
    { name: '本地开发', pattern: 'http://localhost:*/*', description: '拦截本地开发服务器请求' }
  ]

  // 应用预设模式
  const applyPresetPattern = (pattern) => {
    // 新的自动填充逻辑：
    // 1. 如果只有一个规则（无论是否为空），则替换它
    // 2. 如果有多个规则，填充第一个空白的输入框
    // 3. 如果所有输入框都已填满，则不进行任何操作
    const patterns = interceptConfig.urlPatterns;
    
    if (patterns.length === 1) {
      // 只有一个规则时，无论是否为空都替换它
      const newPatterns = [pattern];
      setInterceptConfig(prev => ({
        ...prev,
        urlPatterns: newPatterns
      }));
      
      // 同步更新到父组件
      if (onStateChange) {
        onStateChange(prev => ({ ...prev, urlPatterns: newPatterns }));
      }
    } else {
      // 查找第一个空白的URL模式输入框
      const emptyIndex = patterns.findIndex(p => !p.trim());
      
      if (emptyIndex >= 0) {
        // 填充第一个空白输入框
        const newPatterns = [...interceptConfig.urlPatterns];
        newPatterns[emptyIndex] = pattern;
        setInterceptConfig(prev => ({
          ...prev,
          urlPatterns: newPatterns
        }));
        
        // 同步更新到父组件
        if (onStateChange) {
          onStateChange(prev => ({ ...prev, urlPatterns: newPatterns }));
        }
      } else if (patterns.length === 0 || patterns.every(p => p.trim() !== '')) {
        // 如果所有输入框都已填满，则不进行任何操作
        console.log('所有URL模式输入框都已填满，不自动填充');
      }
    }
  }

  const showNotification = (message, type) => {
    if (onNotification) {
      onNotification(message, type)
    }
  }

  // URL 模式验证
  const validateUrlPatterns = (patterns) => {
    if (!patterns || patterns.length === 0) {
      return { valid: true }
    }

    for (const pattern of patterns) {
      // 基本格式验证
      if (pattern.trim() === '') {
        continue // 空模式跳过
      }

      // 检查有害模式
      if (pattern.includes('<script') || pattern.includes('javascript:')) {
        return { valid: false, error: '不允许包含脚本代码的模式' }
      }

      // 检查数据 URI
      if (pattern.startsWith('data:')) {
        return { valid: false, error: '不允许使用 data: URI 模式' }
      }

      // 限制模式长度
      if (pattern.length > 1000) {
        return { valid: false, error: 'URL 模式过长（最大 1000 字符）' }
      }
    }

    return { valid: true }
  }

  const getStatusColor = () => {
    if (interceptStatus.enabled && interceptStatus.attachedDebugger) {
      return '#48bb78' // 绿色 - 正常运行
    } else if (interceptStatus.enabled) {
      return '#ed8936' // 橙色 - 启用但未完全就绪
    } else {
      return '#a0aec0' // 灰色 - 禁用
    }
  }

  const getStatusText = () => {
    if (interceptStatus.enabled && interceptStatus.attachedDebugger) {
      return '运行中'
    } else if (interceptStatus.enabled) {
      return '启用中...'
    } else {
      return '已禁用'
    }
  }

  return (
    <div className="response-interceptor">
      <div className="interceptor-header">
        <div className="header-left">
          <h3>响应拦截器</h3>
          <div className="status-indicator">
            <div 
              className="status-dot" 
              style={{ backgroundColor: getStatusColor() }}
            />
            <span className="status-text">{getStatusText()}</span>
            <button 
              className="refresh-status-btn"
              onClick={() => {
                console.log('🔄 手动刷新状态')
                loadInterceptionStatus(currentTabId, true)
              }}
              title="刷新状态"
              style={{
                marginLeft: '8px',
                padding: '2px 6px',
                fontSize: '12px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                borderRadius: '3px'
              }}
            >
              🔄
            </button>
          </div>
        </div>
        
        <div className="header-right">
          <button
            className={`toggle-button ${interceptConfig.enabled ? 'active' : ''}`}
            onClick={toggleInterception}
            disabled={isLoading}
          >
            {isLoading ? '处理中...' : (interceptConfig.enabled ? '禁用拦截' : '启用拦截')}
          </button>
        </div>
      </div>

      <div className="interceptor-content">
        {/* URL 模式配置 */}
        <div className="config-section">
          <div className="section-header">
            <h4>拦截规则</h4>
            <span className="section-description">配置要拦截的 URL 模式（支持通配符 *）</span>
          </div>
          
          {/* 预设模式选择 */}
          {!interceptConfig.enabled && (
            <div className="preset-patterns">
              <div className="preset-header">
                <span className="preset-title">快速选择:</span>
              </div>
              <div className="preset-buttons">
                {presetPatterns.map((preset, index) => (
                  <button
                    key={index}
                    className="preset-button"
                    onClick={() => applyPresetPattern(preset.pattern)}
                    title={preset.description}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          
          <div className="url-patterns">
            {interceptConfig.urlPatterns.map((pattern, index) => (
              <div key={index} className="pattern-row">
                <input
                  type="text"
                  value={pattern}
                  onChange={(e) => handlePatternChange(index, e.target.value)}
                  placeholder="例如：*/api/* 或 https://example.com/* 或者点击左侧列表选择"
                  className="pattern-input"
                  disabled={interceptConfig.enabled}
                />
                {interceptConfig.urlPatterns.length > 1 && (
                  <button
                    className="remove-pattern-button"
                    onClick={() => removePattern(index)}
                    disabled={interceptConfig.enabled}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            
            {!interceptConfig.enabled && (
              <button className="add-pattern-button" onClick={addPattern}>
                + 添加规则
              </button>
            )}
          </div>
        </div>
        
        {/* 预设响应体配置 */}
        {interceptStatus.enabled && (
          <div className="config-section">
            <div className="section-header">
              <h4>预设响应体</h4>
              <span className="section-description">为每个拦截规则配置预设的响应内容 (非必填)</span>
            </div>
            
            {/* 为每个URL模式提供预设响应体配置 */}
            {interceptConfig.urlPatterns.map((pattern, index) => (
              <div key={index} className="preset-response-config">
                <div className="pattern-label">
                  规则 {index + 1}: {pattern || '未设置'}
                </div>
                
                {/* 查找该模式对应的预设响应体 */}
                {(() => {
                  const presetForPattern = interceptConfig.presetResponses.find(preset => preset.urlPattern === pattern);
                  return (
                    <>
                      <div className="form-group">
                        <label className="form-label">状态码</label>
                        <input
                          type="number"
                          value={presetForPattern?.statusCode || 200}
                          onChange={(e) => {
                            const statusCode = parseInt(e.target.value) || 200;
                            handlePresetResponseChange(pattern, { statusCode });
                          }}
                          className="form-input"
                          style={{ width: '120px' }}
                        />
                      </div>
                      
                      <div className="form-group">
                        <label className="form-label">响应体内容 (右下角可控制输入框大小)</label>
                        <textarea
                          placeholder="预设响应体内容（JSON格式）"
                          className="form-textarea"
                          style={{ minHeight: '120px' }}
                          value={presetForPattern?.responseBody || ''}
                          onChange={(e) => {
                            handlePresetResponseChange(pattern, { responseBody: e.target.value });
                          }}
                        />
                      </div>
                      
                      {presetForPattern && (
                        <button 
                          className="btn btn-secondary"
                          onClick={() => removePresetResponseForPattern(pattern)}
                          style={{ marginBottom: '16px' }}
                        >
                          清除预设响应
                        </button>
                      )}
                    </>
                  );
                })()}
              </div>
            ))}
          </div>
        )}

        {/* 拦截统计 */}
        {interceptStatus.enabled && (
          <div className="stats-section">
            <div className="section-header">
              <h4>拦截统计</h4>
            </div>
            
            <div className="stats-grid">
              <div className="stat-item">
                <span className="stat-label">已拦截</span>
                <span className="stat-value">{interceptStatus.interceptedCount}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">待处理</span>
                <span className="stat-value">{interceptStatus.pendingCount}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">调试器</span>
                <span className="stat-value">
                  {interceptStatus.attachedDebugger ? '已连接' : '未连接'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 使用说明 */}
        <div className="help-section">
          <div className="section-header">
            <h4>使用说明</h4>
          </div>
          
          <div className="help-content">
            <ol>
              <li>配置要拦截的 URL 模式，使用 * 作为通配符</li>
              <li>点击&ldquo;启用拦截&rdquo;开始拦截响应</li>
              <li>当匹配的请求完成时，会自动弹出编辑窗口, 注意, 如果匹配到多个请求, 会多开窗口</li>
              <li>在编辑窗口中等待响应体到达之后, 修改响应内容，点击&ldquo;应用修改&rdquo;</li>
              <li>修改后的响应会被注入到页面中</li>
              <li>如果不想修改, 请关闭窗口或者点击取消拦截, 原始响应会发送到页面上</li>
            </ol>
            
            <div className="warning-box">
              <strong>⚠️ 注意事项：</strong>
              <ul>
                <li>作者水平差, 只能实现一个标签页内拦截, 如果多开几个页面的控制台, 会导致异常</li>
                <li>实验性功能, 无法保证所有页面都能正常使用</li>
                <li>响应拦截需要调试器权限，可能会影响页面性能</li>
                <li>某些请求类型（如 CORS、Opaque）可能无法被拦截</li>
                <li>修改响应可能会影响页面功能，请谨慎操作</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

ResponseInterceptor.propTypes = {
  onNotification: PropTypes.func,
  initialState: PropTypes.shape({
    enabled: PropTypes.bool,
    urlPatterns: PropTypes.arrayOf(PropTypes.string),
    presetResponses: PropTypes.arrayOf(PropTypes.shape({
      id: PropTypes.string.isRequired,
      urlPattern: PropTypes.string.isRequired,
      statusCode: PropTypes.number,
      responseBody: PropTypes.string,
      createdAt: PropTypes.number
    })),
    status: PropTypes.shape({
      attachedDebugger: PropTypes.bool,
      interceptedCount: PropTypes.number,
      pendingCount: PropTypes.number
    })
  }),
  onStateChange: PropTypes.func,
  selectedRequest: PropTypes.shape({
    url: PropTypes.string
  })
}

export default ResponseInterceptor