// 响应编辑器脚本 - 项目二的方式
console.log('🎭 响应编辑器脚本开始加载')

let currentData = null;

(async function init() {
  document.getElementById('btn-apply').addEventListener('click', apply)
  document.getElementById('btn-cancel').addEventListener('click', () => window.close())
  
  // 添加复制按钮事件监听（遵循响应内容区域交互规范）
  const copyButton = document.getElementById('btn-copy')
  if (copyButton) {
    copyButton.addEventListener('click', copyResponseContent)
  }
  
  // 初始化标签页切换
  initTabs()
  
  // 监听来自background的数据
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('📥 响应编辑器收到消息:', message.type)
    
    if (message.type === 'LOAD_RESPONSE_DATA') {
      console.log('📊 加载响应数据:', message.data)
      loadResponseData(message.data)
      sendResponse({ success: true })
    }
  })
  
  // 显示等待消息
  document.getElementById('response-url').textContent = '等待加载...'
  document.getElementById('response-body').value = ''
  
  console.log('📋 响应编辑器初始化完成，等待数据...')
})()

// 复制响应内容（遵循响应内容区域交互规范）
function copyResponseContent() {
  const responseBody = document.getElementById('response-body').value
  
  if (!responseBody.trim()) {
    showNotification('没有内容可复制', 'info')
    return
  }
  
  navigator.clipboard.writeText(responseBody).then(() => {
    console.log('✅ 复制成功')
    showNotification('复制成功', 'success')
  }).catch(err => {
    console.error('❌ 复制失败:', err)
    // 降级处理
    try {
      const textArea = document.createElement('textarea')
      textArea.value = responseBody
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      showNotification('复制成功', 'success')
    } catch (fallbackError) {
      console.error('❌ 降级复制也失败:', fallbackError)
      showNotification('复制失败', 'error')
    }
  })
}

// 加载响应数据
function loadResponseData(data) {
  console.log('📦 开始加载响应数据:', data)
  
  currentData = data
  
  // 更新UI
  document.getElementById('response-url').textContent = data.response?.url || data.request?.url || 'unknown'
  document.getElementById('response-status').value = data.response?.status || 200
  
  // 加载响应体内容
  let bodyContent = ''
  if (data.response?.body?.content) {
    bodyContent = data.response.body.content
  } else if (typeof data.response?.body === 'string') {
    bodyContent = data.response.body
  } else if (data.body) {
    bodyContent = data.body
  }
  
  document.getElementById('response-body').value = bodyContent
  
  // 更新设置面板
  document.getElementById('request-info').textContent = data.response?.url || data.request?.url || ''
  document.getElementById('content-type').textContent = 'application/json; charset=utf-8'
  
  // 更新响应头
  const headers = data.response?.headers || data.headers || {}
  updateHeaders(headers)
  
  // 更新大小信息
  updateResponseSize()
  
  console.log('✅ 响应数据加载完成')
}

function initTabs() {
  const tabButtons = document.querySelectorAll('.tab-button')
  const tabPanels = document.querySelectorAll('.tab-panel')

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const targetTab = button.dataset.tab

      // 更新按钮状态
      tabButtons.forEach(btn => btn.classList.remove('active'))
      button.classList.add('active')

      // 更新面板状态
      tabPanels.forEach(panel => panel.classList.remove('active'))
      document.getElementById(`tab-${targetTab}`)?.classList.add('active')
    })
  })
}



function updateHeaders(headers) {
  const headersList = document.getElementById('headers-list')
  
  if (!headers) {
    headersList.innerHTML = '<div class="header-item">没有响应头信息</div>'
    return
  }
  
  let headersHtml = ''
  
  if (Array.isArray(headers)) {
    headers.forEach(header => {
      headersHtml += `
        <div class="header-item">
          <span class="header-name">${escapeHtml(header.name)}:</span>
          <span class="header-value">${escapeHtml(header.value)}</span>
        </div>
      `
    })
  } else {
    Object.entries(headers).forEach(([name, value]) => {
      headersHtml += `
        <div class="header-item">
          <span class="header-name">${escapeHtml(name)}:</span>
          <span class="header-value">${escapeHtml(value)}</span>
        </div>
      `
    })
  }
  
  headersList.innerHTML = headersHtml
}

function updateResponseSize() {
  const body = document.getElementById('response-body').value
  const sizeBytes = new Blob([body]).size
  const sizeKB = (sizeBytes / 1024).toFixed(2)
  
  let sizeText = `${sizeBytes} 字节`
  if (sizeBytes > 1024) {
    sizeText += ` (${sizeKB} KB)`
  }
  
  document.getElementById('response-size').textContent = sizeText
}

function apply() {
  if (!currentData) {
    console.error('❌ 没有选中的响应')
    showNotification('没有选中的响应', 'error')
    return
  }
  
  const body = document.getElementById('response-body').value
  const status = parseInt(document.getElementById('response-status').value) || 200
  
  // 参数验证（遵循错误处理规范）
  if (!currentData.requestId) {
    console.error('❌ 缺少requestId')
    showNotification('缺少请求ID', 'error')
    return
  }
  
  // 根据内容自动设置Content-Type（遵循修改后响应对象创建规范）
  let contentType = 'text/plain; charset=utf-8'
  try {
    // 尝试解析JSON
    JSON.parse(body)
    contentType = 'application/json; charset=utf-8'
  } catch {
    // 不是JSON，使用默认text/plain
    if (body.includes('<html') || body.includes('<div') || body.includes('<body')) {
      contentType = 'text/html; charset=utf-8'
    }
  }
  
  // 完整复制原始响应头（遵循修改后响应对象创建规范）
  const headers = { ...currentData.headers } || {}
  
  // 设置Content-Type和Content-Length
  headers['Content-Type'] = contentType
  headers['Content-Length'] = new TextEncoder().encode(body).length.toString()
  
  const modified = {
    status: status,
    headers: headers,
    body: body
  }
  
  console.log('🚀 提交修改后的响应:', {
    requestId: currentData.requestId,
    modified
  })
  
  // 显示加载状态
  const applyButton = document.getElementById('btn-apply')
  const originalText = applyButton.textContent
  applyButton.textContent = '处理中...'
  applyButton.disabled = true
  
  chrome.runtime.sendMessage({
    type: 'SUBMIT_MODIFIED_RESPONSE',
    requestId: currentData.requestId,
    modifiedResponse: modified
  }, (response) => {
    // 恢复按钮状态
    applyButton.textContent = originalText
    applyButton.disabled = false
    
    console.log('📥 [调试] 收到提交响应结果:')
    console.log('📥 [调试] response 类型:', typeof response)
    console.log('📥 [调试] response 内容:', response)
    console.log('📥 [调试] response === null:', response === null)
    console.log('📥 [调试] response === undefined:', response === undefined)
    
    // 检查chrome.runtime.lastError（遵循Chrome扩展错误处理规范）
    if (chrome.runtime.lastError) {
      const errorMsg = chrome.runtime.lastError.message || 'Chrome runtime 错误'
      console.error('❌ [调试] Chrome runtime 错误:', errorMsg)
      console.error('❌ [调试] chrome.runtime.lastError 完整对象:', chrome.runtime.lastError)
      showNotification('通信错误: ' + errorMsg, 'error')
      return
    }
    
    // 验证响应格式（遵循错误处理规范）
    if (response === undefined) {
      console.error('❌ [调试] 响应为undefined - 可能是background script问题')
      showNotification('响应为空 - background script可能未正确处理', 'error')
      return
    }
    
    if (response === null) {
      console.error('❌ [调试] 响应为null')
      showNotification('响应为null', 'error')
      return
    }
    
    if (typeof response !== 'object') {
      console.error('❌ [调试] 响应数据格式错误:', typeof response)
      console.error('❌ [调试] 响应内容:', response)
      showNotification('响应数据格式错误: ' + typeof response, 'error')
      return
    }
    
    console.log('✅ [调试] 响应格式验证通过')
    console.log('📊 [调试] response.success:', response.success)
    console.log('📊 [调试] response.success === true:', response.success === true)
    console.log('📊 [调试] response.error:', response.error)
    
    // 统一响应数据格式检查（遵循错误处理规范）
    if (response.success === true) {
      console.log('✅ [调试] 成功分支')
      showNotification('应用成功', 'success')
      
      // 延迟关闭窗口，让用户看到成功提示
      setTimeout(() => {
        window.close()
      }, 1500)
    } else {
      // 处理失败情况
      console.log('❌ [调试] 失败分支')
      console.log('❌ [调试] response.success 的值:', response.success)
      console.log('❌ [调试] response 的所有属性:', Object.keys(response))
      
      const errorMsg = response.error || response.message || '未知错误'
      console.error('❌ [调试] 最终错误消息:', errorMsg)
      console.error('❌ [调试] 完整响应数据:', JSON.stringify(response, null, 2))
      
      // 显示详细错误信息
      showNotification('应用失败: ' + errorMsg, 'error')
    }
  })
}

// 显示通知（遵循UI提示显示规范）
function showNotification(message, type = 'info') {
  // 移除旧的通知
  const oldNotification = document.querySelector('.notification')
  if (oldNotification) {
    oldNotification.remove()
  }
  
  // 创建新通知
  const notification = document.createElement('div')
  notification.className = `notification notification-${type}`
  notification.textContent = message
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    border-radius: 4px;
    color: white;
    font-weight: 500;
    z-index: 10000;
    animation: slideIn 0.3s ease-out;
    ${type === 'success' ? 'background-color: #10b981;' : ''}
    ${type === 'error' ? 'background-color: #ef4444;' : ''}
    ${type === 'info' ? 'background-color: #3b82f6;' : ''}
  `
  
  document.body.appendChild(notification)
  
  // 3秒后自动清除（遵循复制反馈时效规范）
  setTimeout(() => {
    if (notification.parentNode) {
      notification.remove()
    }
  }, 3000)
}

// 监听响应体内容变化，更新大小信息
document.getElementById('response-body').addEventListener('input', updateResponseSize)

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

console.log('✅ 响应编辑器脚本加载完成')