// 响应编辑器脚本
console.log('🎭 响应编辑器脚本开始加载')

class ResponseEditor {
  constructor() {
    this.interceptData = null
    this.originalResponse = null
    this.isModified = false
    this.init()
  }

  init() {
    this.initUI()
    this.bindEvents()
    this.loadResponseData()
  }

  initUI() {
    // 初始化标签页切换
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

  bindEvents() {
    // 绑定按钮事件
    document.getElementById('btn-apply').addEventListener('click', () => this.applyModifications())
    document.getElementById('btn-reset').addEventListener('click', () => this.resetToOriginal())
    document.getElementById('btn-cancel').addEventListener('click', () => this.cancelInterception())

    // 监听内容变化
    document.getElementById('response-body').addEventListener('input', () => {
      this.isModified = true
      this.updateUI()
    })

    document.getElementById('response-status').addEventListener('input', () => {
      this.isModified = true
      this.updateUI()
    })

    // 监听来自 background script 的消息
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'LOAD_RESPONSE_DATA') {
        console.log('📥 收到响应数据:', message.data)
        this.loadInterceptData(message.data)
        sendResponse({ success: true })
      }
    })

    // 监听窗口关闭
    window.addEventListener('beforeunload', (e) => {
      if (this.isModified) {
        e.preventDefault()
        e.returnValue = '您有未保存的修改，确定要关闭吗？'
        return e.returnValue
      }
    })
  }

  async loadResponseData() {
    // 等待从 background script 接收数据
    console.log('⏳ 等待响应数据...')
    
    // 设置超时，如果 5 秒内没有收到数据，显示错误
    setTimeout(() => {
      if (!this.interceptData) {
        this.showError('加载响应数据超时，请重试')
      }
    }, 5000)
  }

  loadInterceptData(data) {
    try {
      this.interceptData = data
      this.originalResponse = { ...data.response }
      
      console.log('📊 解析响应数据:', data)
      
      // 更新 UI
      this.updateBasicInfo()
      this.updateResponseContent()
      this.updateResponseHeaders()
      this.updateSettings()
      
      this.showSuccess('响应数据加载完成')
    } catch (error) {
      console.error('❌ 加载响应数据失败:', error)
      this.showError('加载响应数据失败: ' + error.message)
    }
  }

  updateBasicInfo() {
    if (!this.interceptData) return

    const { request, response } = this.interceptData
    
    // 更新标题
    document.getElementById('response-url').textContent = response.url || request.url || '未知 URL'
    
    // 更新请求信息
    const requestInfo = `${request.method || 'GET'} ${request.url || ''}`
    document.getElementById('request-info').textContent = requestInfo
  }

  updateResponseContent() {
    if (!this.interceptData) return

    const { response } = this.interceptData
    
    // 设置状态码
    document.getElementById('response-status').value = response.status || 200
    
    // 处理响应体
    let responseBody = ''
    let isCompressed = false
    
    if (response.body) {
      const bodyData = response.body
      
      if (bodyData.isCompressed) {
        isCompressed = true
        // 使用已解压缩的内容
        responseBody = bodyData.content || bodyData.originalContent || ''
      } else if (bodyData.isBase64 && bodyData.isText) {
        // 使用已解码的文本内容
        responseBody = bodyData.content || ''
      } else {
        // 直接使用内容
        responseBody = bodyData.content || bodyData.originalContent || ''
      }
      
      // 显示编码信息
      if (bodyData.encoding && bodyData.encoding !== 'identity') {
        console.log(`🗜️ 检测到响应编码: ${bodyData.encoding}`)
      }
      
      // 显示错误信息
      if (bodyData.error) {
        console.warn(`⚠️ 处理响应内容时出错: ${bodyData.error}`)
        this.showError(`处理响应内容失败: ${bodyData.error}`)
      }
    }
    
    // 尝试格式化 JSON
    responseBody = this.formatResponseBody(responseBody)
    
    // 设置到编辑器
    document.getElementById('response-body').value = responseBody
    
    // 显示压缩提示
    if (isCompressed) {
      document.getElementById('compression-warning').style.display = 'block'
    }
    
    // 更新大小信息
    this.updateResponseSize(responseBody)
    
    // 更新内容类型
    this.updateContentType()
  }

  formatResponseBody(body) {
    if (!body) return ''
    
    // 尝试格式化 JSON
    try {
      const parsed = JSON.parse(body)
      return JSON.stringify(parsed, null, 2)
    } catch {
      // 不是 JSON，返回原内容
      return body
    }
  }

  updateResponseHeaders() {
    if (!this.interceptData) return

    const { response } = this.interceptData
    const headersList = document.getElementById('headers-list')
    
    if (!response.headers) {
      headersList.innerHTML = '<div class="header-item">没有响应头信息</div>'
      return
    }
    
    let headersHtml = ''
    
    if (Array.isArray(response.headers)) {
      // webRequest API 格式
      response.headers.forEach(header => {
        headersHtml += `
          <div class="header-item">
            <span class="header-name">${this.escapeHtml(header.name)}:</span>
            <span class="header-value">${this.escapeHtml(header.value)}</span>
          </div>
        `
      })
    } else {
      // 对象格式
      Object.entries(response.headers).forEach(([name, value]) => {
        headersHtml += `
          <div class="header-item">
            <span class="header-name">${this.escapeHtml(name)}:</span>
            <span class="header-value">${this.escapeHtml(value)}</span>
          </div>
        `
      })
    }
    
    headersList.innerHTML = headersHtml
  }

  updateSettings() {
    // 更新设置面板的信息
    this.updateResponseSize()
    this.updateContentType()
  }

  updateResponseSize(content = null) {
    const body = content || document.getElementById('response-body').value
    const sizeBytes = new Blob([body]).size
    const sizeKB = (sizeBytes / 1024).toFixed(2)
    const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2)
    
    let sizeText = `${sizeBytes} 字节`
    if (sizeBytes > 1024) {
      sizeText += ` (${sizeKB} KB)`
    }
    if (sizeBytes > 1024 * 1024) {
      sizeText += ` (${sizeMB} MB)`
    }
    
    document.getElementById('response-size').textContent = sizeText
  }

  updateContentType() {
    if (!this.interceptData) return

    const { response } = this.interceptData
    const contentType = this.getHeaderValue(response.headers, 'content-type') || '未知'
    document.getElementById('content-type').textContent = contentType
  }

  getHeaderValue(headers, name) {
    if (!headers) return null
    
    const lowerName = name.toLowerCase()
    
    if (Array.isArray(headers)) {
      const header = headers.find(h => h.name.toLowerCase() === lowerName)
      return header?.value
    } else {
      // 对象格式
      for (const [key, value] of Object.entries(headers)) {
        if (key.toLowerCase() === lowerName) {
          return value
        }
      }
    }
    
    return null
  }

  async applyModifications() {
    if (!this.interceptData) {
      this.showError('没有可修改的响应数据')
      return
    }

    try {
      this.showLoading(true)
      
      // 收集修改后的数据
      const modifiedResponse = {
        status: parseInt(document.getElementById('response-status').value) || 200,
        body: document.getElementById('response-body').value,
        headers: this.originalResponse.headers, // 保持原有响应头
        originalBody: this.originalResponse.body // 保留原始响应体信息
      }
      
      console.log('📤 提交修改后的响应:', modifiedResponse)
      
      // 发送到 background script
      chrome.runtime.sendMessage({
        type: 'SUBMIT_MODIFIED_RESPONSE',
        requestId: this.interceptData.requestId,
        modifiedResponse: modifiedResponse
      }, (response) => {
        this.showLoading(false)
        
        if (response && response.success) {
          this.showSuccess('响应修改已应用到页面')
          this.isModified = false
          
          // 3 秒后自动关闭窗口
          setTimeout(() => {
            window.close()
          }, 3000)
        } else {
          // this.showError('应用修改失败: ' + (response?.error || '未知错误'))
        }
      })
      
    } catch (error) {
      this.showLoading(false)
      console.error('❌ 应用修改失败:', error)
      this.showError('应用修改失败: ' + error.message)
    }
  }

  resetToOriginal() {
    if (!this.originalResponse) return
    
    // 重置到原始内容
    document.getElementById('response-status').value = this.originalResponse.status || 200
    
    const originalBody = this.originalResponse.body?.content || ''
    document.getElementById('response-body').value = this.formatResponseBody(originalBody)
    
    this.isModified = false
    this.updateUI()
    this.showSuccess('已重置到原始内容')
  }

  cancelInterception() {
    if (this.isModified) {
      if (!confirm('您有未保存的修改，确定要取消拦截吗？')) {
        return
      }
    }
    
    console.log('❌ 取消响应拦截')
    this.showSuccess('已取消拦截，响应将使用原始内容')
    
    // 2 秒后关闭窗口
    setTimeout(() => {
      window.close()
    }, 2000)
  }

  updateUI() {
    // 更新 UI 状态
    const applyBtn = document.getElementById('btn-apply')
    const resetBtn = document.getElementById('btn-reset')
    
    if (this.isModified) {
      applyBtn.style.background = '#e53e3e' // 高亮显示有修改
      resetBtn.disabled = false
    } else {
      applyBtn.style.background = '#3182ce'
      resetBtn.disabled = false
    }
    
    // 更新响应大小
    this.updateResponseSize()
  }

  showLoading(show) {
    const loading = document.getElementById('loading')
    if (show) {
      loading.classList.add('show')
    } else {
      loading.classList.remove('show')
    }
  }

  showError(message) {
    this.showMessage(message, 'error')
  }

  showSuccess(message) {
    this.showMessage(message, 'success')
  }

  showMessage(message, type) {
    // 移除现有消息
    const existingMessages = document.querySelectorAll('.error-message, .success-message')
    existingMessages.forEach(msg => msg.remove())
    
    // 创建新消息
    const messageDiv = document.createElement('div')
    messageDiv.className = type === 'error' ? 'error-message' : 'success-message'
    messageDiv.textContent = message
    
    // 插入到内容顶部
    const tabContent = document.querySelector('.tab-content')
    tabContent.insertBefore(messageDiv, tabContent.firstChild)
    
    // 5 秒后自动移除
    setTimeout(() => {
      messageDiv.remove()
    }, 5000)
  }

  escapeHtml(text) {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }
}

// 初始化响应编辑器
document.addEventListener('DOMContentLoaded', () => {
  console.log('🎯 响应编辑器 DOM 加载完成')
  new ResponseEditor()
})

console.log('✅ 响应编辑器脚本加载完成')