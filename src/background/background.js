// 网络控制台 - 后台服务工作器（内存优化版本）
console.log('🚀 网络控制台 Background Script 已加载')

// 响应拦截管理器
class ResponseInterceptor {
  constructor() {
    this.interceptedRequests = new Map() // 存储被拦截的请求
    this.activeInterceptions = new Map() // 活跃的拦截配置
    this.pendingResponses = new Map() // 等待用户修改的响应
    this.attachedTabs = new Set() // 已附加debugger的标签页
  }

  // 检查扩展上下文是否有效（遵循扩展上下文失效防护措施）
  checkExtensionContext() {
    if (!chrome.runtime?.id) {
      console.error('❌ [扩展上下文] Extension context invalidated - 扩展上下文已失效')
      return false
    }
    return true
  }

  // 启用对指定标签页的响应拦截
  async enableInterception(tabId, urlPatterns = []) {
    try {
      // 首先检查扩展上下文（遵循扩展上下文失效防护措施）
      if (!this.checkExtensionContext()) {
        return { success: false, error: '扩展上下文已失效，请刷新页面重试' }
      }
      
      console.log(`🔍 为标签页 ${tabId} 启用响应拦截，URL模式:`, urlPatterns)
      
      // 安全检查
      const securityCheck = this.performSecurityCheck(tabId, urlPatterns)
      if (!securityCheck.safe) {
        throw new Error(`安全检查失败: ${securityCheck.reason}`)
      }
      
      // 检查是否已经启用
      if (this.activeInterceptions.has(tabId)) {
        console.warn(`⚠️ 标签页 ${tabId} 已经启用了响应拦截`)
        return { success: false, error: '该标签页已经启用了响应拦截' }
      }
      
      // 限制同时拦截的标签页数量
      if (this.activeInterceptions.size >= 3) {
        throw new Error('同时最多只能对 3 个标签页启用响应拦截')
      }
      
      // 限制 URL 模式数量
      if (urlPatterns.length > 10) {
        throw new Error('URL 模式数量不能超过 10 个')
      }
      
      // 附加debugger到目标标签页
      await this.attachDebugger(tabId)
      
      // 启用Fetch域用于响应拦截
      await chrome.debugger.sendCommand({ tabId }, 'Fetch.enable', {
        patterns: [{ requestStage: 'Response' }]
      })
      
      // 启用运行时域（用于执行JavaScript）
      await chrome.debugger.sendCommand({ tabId }, 'Runtime.enable')
      
      // 保存拦截配置
      this.activeInterceptions.set(tabId, {
        urlPatterns: urlPatterns,
        enabled: true,
        timestamp: Date.now(),
        maxInterceptions: 50, // 限制最大拦截数量
        interceptedCount: 0
      })
      
      console.log(`✅ 标签页 ${tabId} 响应拦截已启用`)
      return { success: true }
    } catch (error) {
      console.error(`❌ 启用响应拦截失败:`, error)
      return { success: false, error: error.message }
    }
  }

  // 更新拦截模式
  async updateInterceptionPatterns(tabId, urlPatterns) {
    try {
      console.log(`🔄 更新标签页 ${tabId} 的拦截模式:`, urlPatterns)
      
      const config = this.activeInterceptions.get(tabId)
      if (!config || !config.enabled) {
        throw new Error('该标签页未启用响应拦截')
      }
      
      // 验证 URL 模式
      const securityCheck = this.performSecurityCheck(tabId, urlPatterns)
      if (!securityCheck.safe) {
        throw new Error(`安全检查失败: ${securityCheck.reason}`)
      }
      
      // 更新Fetch拦截模式
      await chrome.debugger.sendCommand({ tabId }, 'Fetch.enable', {
        patterns: [{ requestStage: 'Response' }] // 使用项目二的简化方式
      })
      
      // 更新配置
      config.urlPatterns = urlPatterns
      config.timestamp = Date.now()
      
      console.log(`✅ 标签页 ${tabId} 拦截模式已更新`)
      return { success: true }
    } catch (error) {
      console.error(`❌ 更新拦截模式失败:`, error)
      return { success: false, error: error.message }
    }
  }

  // 禁用响应拦截
  async disableInterception(tabId) {
    try {
      console.log(`🔒 为标签页 ${tabId} 禁用响应拦截`)
      
      // 禁用Fetch拦截
      await chrome.debugger.sendCommand({ tabId }, 'Fetch.disable')
      
      // 分离debugger
      await this.detachDebugger(tabId)
      
      // 清理状态
      this.activeInterceptions.delete(tabId)
      this.clearTabData(tabId)
      
      console.log(`✅ 标签页 ${tabId} 响应拦截已禁用`)
      return { success: true }
    } catch (error) {
      console.error(`❌ 禁用响应拦截失败:`, error)
      return { success: false, error: error.message }
    }
  }

  // 附加debugger（添加扩展上下文检查）
  async attachDebugger(tabId) {
    // 检查扩展上下文是否有效（遵循扩展上下文失效防护措施）
    if (!chrome.runtime?.id) {
      console.error(`❌ [Debugger] 扩展上下文已失效，无法附加debugger到标签页 ${tabId}`)
      throw new Error('扩展上下文已失效，请刷新页面重试')
    }
    
    if (this.attachedTabs.has(tabId)) {
      console.log(`⚠️ [Debugger] 标签页 ${tabId} 已附加debugger`)
      return
    }
    
    try {
      // 先检查标签页是否存在
      const tab = await chrome.tabs.get(tabId)
      if (!tab) {
        throw new Error(`标签页 ${tabId} 不存在`)
      }
      
      console.log(`🔗 [Debugger] 正在附加debugger到标签页 ${tabId}:`, tab.url)
      
      await chrome.debugger.attach({ tabId }, '1.3')
      this.attachedTabs.add(tabId)
      console.log(`✅ [Debugger] 已成功附加debugger到标签页 ${tabId}`)
    } catch (error) {
      console.error(`❌ [Debugger] 附加debugger失败:`, {
        tabId,
        error: error.message,
        errorName: error.name,
        runtimeId: chrome.runtime?.id
      })
      
      // 根据错误类型提供具体的错误信息
      if (error.message.includes('chrome-extension')) {
        throw new Error('扩展权限问题：请重新加载扩展后再试')
      } else if (error.message.includes('Another debugger')) {
        throw new Error('调试器冲突：请关闭其他调试工具后再试')
      } else if (error.message.includes('Target closed')) {
        throw new Error('目标页面已关闭')
      } else {
        throw error
      }
    }
  }

  // 分离debugger（添加扩展上下文检查）
  async detachDebugger(tabId) {
    if (!this.attachedTabs.has(tabId)) {
      console.log(`📌 [Debugger] 标签页 ${tabId} 未附加debugger，跳过分离`)
      return
    }
    
    try {
      // 检查扩展上下文是否有效（遵循扩展上下文失效防护措施）
      if (!chrome.runtime?.id) {
        console.warn(`⚠️ [Debugger] 扩展上下文已失效，无法正常分离debugger，但将清理本地状态`)
        this.attachedTabs.delete(tabId)
        return
      }
      
      console.log(`🔌 [Debugger] 正在分离标签页 ${tabId} 的debugger`)
      await chrome.debugger.detach({ tabId })
      this.attachedTabs.delete(tabId)
      console.log(`✅ [Debugger] 已成功分离标签页 ${tabId} 的debugger`)
    } catch (error) {
      console.error(`❌ [Debugger] 分离debugger失败:`, {
        tabId,
        error: error.message,
        runtimeId: chrome.runtime?.id
      })
      
      // 无论如何都要清理本地状态
      this.attachedTabs.delete(tabId)
      
      // 如果是扩展上下文问题，不抛出错误
      if (!error.message.includes('chrome-extension') && !error.message.includes('context invalidated')) {
        console.warn(`⚠️ [Debugger] 分离失败但已清理本地状态`)
      }
    }
  }

  // 处理Fetch被拦截的请求（项目二的方式）
  async handleFetchRequestPaused(tabId, requestId, request, responseStatusCode, responseHeaders) {
    try {
      console.log(`🎯 [FETCH拦截] 开始处理: tabId=${tabId}, requestId=${requestId}`)
      console.log(`📋 [FETCH拦截] 请求详情:`, {
        method: request?.method,
        url: request?.url,
        responseStatus: responseStatusCode,
        headersCount: responseHeaders?.length || 0
      })
      
      const config = this.activeInterceptions.get(tabId)
      if (!config || !config.enabled) {
        console.log(`⏩ [FETCH拦截] 拦截未启用，继续请求: ${request?.url}`)
        await chrome.debugger.sendCommand({ tabId }, 'Fetch.continueRequest', {
          requestId: requestId
        })
        return
      }

      console.log(`🔍 [FETCH拦截] 检查URL匹配: ${request.url}`)
      
      // 检查是否匹配目标URL模式
      const shouldIntercept = this.shouldInterceptRequest(request.url, config.urlPatterns)
      
      if (shouldIntercept) {
        console.log(`📝 [FETCH拦截] URL匹配成功，开始拦截: ${request.url}`)
        
        // 获取响应体
        let body = '', base64 = false
        try {
          console.log(`📦 [FETCH拦截] 获取响应体: requestId=${requestId}`)
          const res = await chrome.debugger.sendCommand({ tabId }, 'Fetch.getResponseBody', { requestId })
          base64 = res.base64Encoded
          body = res.body || ''
          console.log(`✅ [FETCH拦截] 响应体获取成功:`, {
            base64Encoded: base64,
            bodyLength: body.length,
            preview: body.substring(0, 100) + '...'
          })
        } catch (e) {
          console.error(`❌ [FETCH拦截] 获取响应体失败:`, e)
        }
        
        // 正确处理中文编码（修复中文显示问题）
        let decoded = ''
        try {
          if (base64) {
            // 对于base64编码的内容，需要正确处理UTF-8编码
            const binaryString = atob(body)
            const bytes = new Uint8Array(binaryString.length)
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i)
            }
            decoded = new TextDecoder('utf-8').decode(bytes)
          } else {
            decoded = body
          }
          console.log(`🔤 [FETCH拦截] 内容解码成功，长度: ${decoded.length}`)
        } catch (decodeError) {
          console.warn(`⚠️ [FETCH拦截] 解码失败，使用原始内容:`, decodeError)
          decoded = base64 ? atob(body) : body
        }
        
        // 创建拦截数据
        const interceptData = {
          requestId,
          tabId,
          url: request.url,
          status: responseStatusCode || 200,
          headers: (responseHeaders || []).reduce((a, h) => (a[h.name] = h.value, a), {}),
          body: decoded,
          timestamp: Date.now()
        }
        
        console.log(`💾 [FETCH拦截] 保存拦截数据:`, {
          requestId,
          url: interceptData.url,
          status: interceptData.status,
          bodyLength: interceptData.body.length,
          pendingResponsesCount: this.pendingResponses.size
        })
        
        // 保存到待处理响应
        this.pendingResponses.set(requestId, interceptData)
        
        console.log(`📊 [FETCH拦截] 当前待处理响应列表:`, Array.from(this.pendingResponses.keys()))
        
        // 更新拦截统计
        config.interceptedCount = (config.interceptedCount || 0) + 1
        
        // 打开响应编辑窗口
        console.log(`🪟 [FETCH拦截] 准备打开编辑窗口...`)
        await this.openResponseEditWindow(interceptData)
        
        console.log(`✅ [FETCH拦截] 响应拦截处理完成: ${request.url}`)
      } else {
        // 不拦截，直接继续
        console.log(`⏭️ [FETCH拦截] URL不匹配，继续请求: ${request.url}`)
        await chrome.debugger.sendCommand({ tabId }, 'Fetch.continueRequest', {
          requestId: requestId
        })
      }
    } catch (error) {
      console.error(`❌ [FETCH拦截] 处理失败:`, {
        error: error.message,
        stack: error.stack,
        tabId,
        requestId,
        url: request?.url
      })
      
      // 出错时继续请求，避免页面卡死
      try {
        console.log(`🔄 [FETCH拦截] 尝试继续请求以避免页面卡死...`)
        await chrome.debugger.sendCommand({ tabId }, 'Fetch.continueRequest', {
          requestId: requestId
        })
        console.log(`✅ [FETCH拦截] 请求已继续`)
      } catch (continueError) {
        console.error(`❌ [FETCH拦截] 继续请求也失败了:`, continueError)
      }
    }
  }

  // 检查是否应该拦截请求
  shouldInterceptRequest(url, patterns) {
    if (!patterns || patterns.length === 0) {
      return false // 没有设置模式，不拦截
    }
    
    console.log(`🔍 检查URL匹配: ${url}`);
    console.log(`📋 拦截模式:`, patterns);
    
    return patterns.some(pattern => {
      const trimmedPattern = pattern.trim();
      if (!trimmedPattern) return false;
      
      if (trimmedPattern === '*') {
        console.log(`✅ 通配符匹配: ${url}`);
        return true;
      }
      
      // 处理不同类型的模式匹配
      let matched = false;
      
      try {
        // 1. 完全匹配
        if (url === trimmedPattern) {
          matched = true;
        }
        // 2. 通配符匹配
        else if (trimmedPattern.includes('*')) {
          // 正确处理通配符模式
          let regexPattern = trimmedPattern;
          
          // 先转义所有特殊字符（除了*）
          regexPattern = regexPattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
          
          // 将 * 替换为 .*
          regexPattern = regexPattern.replace(/\*/g, '.*');
          
          const regex = new RegExp('^' + regexPattern + '$');
          matched = regex.test(url);
        }
        // 3. 包含匹配（如果模式不包含协议）
        else if (!trimmedPattern.includes('://')) {
          matched = url.includes(trimmedPattern);
        }
        // 4. 前缀匹配
        else {
          matched = url.startsWith(trimmedPattern);
        }
      } catch (regexError) {
        console.warn(`⚠️ 正则表达式错误:`, regexError);
        // 如果正则表达式失败，使用简单的字符串匹配作为回退
        const cleanPattern = trimmedPattern.replace(/\*/g, '');
        if (cleanPattern) {
          matched = url.includes(cleanPattern);
        } else {
          // 如果模式只包含通配符，则匹配所有
          matched = true;
        }
      }
      
      if (matched) {
        console.log(`✅ 匹配成功: ${url} 匹配模式 ${trimmedPattern}`);
      }
      
      return matched;
    })
  }

  // 打开响应编辑窗口（项目二的方式）
  async openResponseEditWindow(interceptData) {
    try {
      // 检查扩展上下文（遵循扩展上下文失效防护措施）
      if (!this.checkExtensionContext()) {
        console.error('❌ [编辑窗口] 扩展上下文已失效，无法打开编辑窗口')
        // 清理待处理响应
        if (interceptData && interceptData.requestId) {
          this.pendingResponses.delete(interceptData.requestId)
        }
        return
      }
      
      console.log(`🪟 开始打开响应编辑窗口:`, interceptData.url)
      
      // 检查数据有效性
      if (!interceptData) {
        throw new Error('无效的拦截数据')
      }
      
      console.log(`📊 拦截数据详情:`, {
        requestId: interceptData.requestId,
        tabId: interceptData.tabId,
        url: interceptData.url,
        status: interceptData.status,
        hasHeaders: !!interceptData.headers,
        bodyLength: interceptData.body?.length || 0
      })
      
      // 检查 chrome.windows API 是否可用
      if (!chrome.windows) {
        throw new Error('chrome.windows API 不可用')
      }
      
      // 获取编辑窗口URL
      const editorUrl = chrome.runtime.getURL('response-editor.html')
      console.log(`🔗 编辑窗口URL: ${editorUrl}`)
      
      // 创建新窗口
      console.log(`🎆 正在创建编辑窗口...`)
      
      try {
        const window = await chrome.windows.create({
          url: editorUrl,
          type: 'popup',
          width: 900,
          height: 600,
          focused: true
        })
        
        if (!window || !window.tabs || !window.tabs[0]) {
          throw new Error('窗口创建失败或没有有效的标签页')
        }
        
        console.log(`✅ 窗口创建成功:`, {
          windowId: window.id,
          tabId: window.tabs[0].id
        })
        
        // 等待窗口加载完成后传递数据
        const targetTabId = window.tabs[0].id
        
        setTimeout(() => {
          chrome.tabs.sendMessage(targetTabId, {
            type: 'LOAD_RESPONSE_DATA',
            data: {
              requestId: interceptData.requestId,
              tabId: interceptData.tabId,
              request: { url: interceptData.url },
              response: {
                url: interceptData.url,
                status: interceptData.status,
                headers: interceptData.headers,
                body: { content: interceptData.body }
              },
              timestamp: interceptData.timestamp
            }
          }).then(response => {
            console.log(`✅ 数据发送成功:`, response)
          }).catch(err => {
            console.warn(`⚠️ 发送响应数据到编辑窗口失败:`, err)
          })
        }, 1000)
        
      } catch (windowError) {
        console.error(`❌ 创建弹窗失败，尝试在新标签页中打开:`, windowError)
        
        // 备用方案：在新标签页中打开编辑器
        const tab = await chrome.tabs.create({
          url: chrome.runtime.getURL('response-editor.html'),
          active: true
        })
        
        console.log(`✅ 备用标签页创建成功: ${tab.id}`)
        
        // 等待标签页加载完成后发送数据
        setTimeout(() => {
          chrome.tabs.sendMessage(tab.id, {
            type: 'LOAD_RESPONSE_DATA',
            data: {
              requestId: interceptData.requestId,
              tabId: interceptData.tabId,
              request: { url: interceptData.url },
              response: {
                url: interceptData.url,
                status: interceptData.status,
                headers: interceptData.headers,
                body: { content: interceptData.body }
              },
              timestamp: interceptData.timestamp
            }
          }).catch(err => {
            console.warn(`⚠️ 向备用标签页发送数据失败:`, err)
          })
        }, 2000)
      }
      
    } catch (error) {
      console.error(`❌ 打开响应编辑窗口失败:`, error)
      
      // 清理待处理响应
      if (interceptData && interceptData.requestId) {
        this.pendingResponses.delete(interceptData.requestId)
        console.log(`🧹 已清理待处理响应: ${interceptData.requestId}`)
      }
    }
  }

  // 处理用户修改后的响应（项目二的方式）
  async handleModifiedResponse(requestId, modifiedResponse) {
    try {
      console.log(`🔄 [响应修改] 开始处理: requestId=${requestId}`)
      console.log(`📋 [响应修改] 当前待处理响应列表:`, Array.from(this.pendingResponses.keys()))
      
      const interceptData = this.pendingResponses.get(requestId)
      if (!interceptData) {
        console.error(`❌ [响应修改] 找不到对应的拦截数据: requestId=${requestId}`)
        console.error(`❌ [响应修改] 当前存储的所有requestId:`, Array.from(this.pendingResponses.keys()))
        throw new Error('找不到对应的拦截数据')
      }

      console.log(`✅ [响应修改] 找到拦截数据:`, {
        url: interceptData.url,
        originalStatus: interceptData.status,
        newStatus: modifiedResponse.status,
        bodyLength: modifiedResponse.body?.length || 0
      })
      
      // 验证修改后的响应
      const validationResult = this.validateModifiedResponse(modifiedResponse)
      if (!validationResult.valid) {
        console.error(`❌ [响应修改] 验证失败:`, validationResult.reason)
        throw new Error(`响应验证失败: ${validationResult.reason}`)
      }
      
      const { tabId } = interceptData
      
      // 检查拦截配置限制
      const config = this.activeInterceptions.get(tabId)
      if (config) {
        config.interceptedCount = (config.interceptedCount || 0) + 1
        if (config.interceptedCount > config.maxInterceptions) {
          console.error(`❌ [响应修改] 超过最大拦截限制: ${config.maxInterceptions}`)
          throw new Error(`已超过最大拦截数量限制 (${config.maxInterceptions})`)
        }
      }
      
      // 使用项目二的方式完成请求
      console.log(`📦 [响应修改] 编码响应内容...`)
      
      // 正确处理中文编码（修复中文提交问题）
      let bodyToEncode = modifiedResponse.body || ''
      let b64 = ''
      try {
        // 先将字符串转为UTF-8字节数组，再转为base64
        const encoder = new TextEncoder()
        const bytes = encoder.encode(bodyToEncode)
        const binaryString = Array.from(bytes, byte => String.fromCharCode(byte)).join('')
        b64 = btoa(binaryString)
        console.log(`✅ [响应修改] 内容编码成功，原始长度: ${bodyToEncode.length}, base64长度: ${b64.length}`)
      } catch (encodeError) {
        console.warn(`⚠️ [响应修改] UTF-8编码失败，使用简单编码:`, encodeError)
        b64 = btoa(bodyToEncode)
      }
      
      const headers = [
        { 
          name: 'Content-Type', 
          value: modifiedResponse.headers?.['Content-Type'] || modifiedResponse.headers?.['content-type'] || 'application/json; charset=utf-8' 
        }
      ]
      
      // 添加其他响应头
      if (modifiedResponse.headers) {
        for (const [key, value] of Object.entries(modifiedResponse.headers)) {
          if (key.toLowerCase() !== 'content-type') {
            headers.push({ name: key, value: String(value) })
          }
        }
      }
      
      console.log(`🚀 [响应修改] 提交修改后的响应:`, {
        requestId,
        tabId,
        responseCode: modifiedResponse.status || interceptData.status || 200,
        headersCount: headers.length,
        bodySize: b64.length
      })
      
      await chrome.debugger.sendCommand({ tabId }, 'Fetch.fulfillRequest', {
        requestId,
        responseCode: modifiedResponse.status || interceptData.status || 200,
        responseHeaders: headers,
        body: b64
      })
      
      // 清理数据
      this.pendingResponses.delete(requestId)
      console.log(`🧹 [响应修改] 已清理待处理响应: ${requestId}`)
      console.log(`📊 [响应修改] 剩余待处理响应数量: ${this.pendingResponses.size}`)
      
      console.log(`✅ [响应修改] 修改后的响应已提交`)
      return { success: true }
    } catch (error) {
      console.error(`❌ [响应修改] 处理失败:`, {
        error: error.message,
        stack: error.stack,
        requestId,
        pendingResponsesCount: this.pendingResponses.size
      })
      return { success: false, error: error.message }
    }
  }

  // 清理标签页数据
  clearTabData(tabId) {
    // 清理该标签页相关的拦截数据
    for (const [key, value] of this.interceptedRequests.entries()) {
      if (value.tabId === tabId) {
        this.interceptedRequests.delete(key)
      }
    }
    
    for (const [key, value] of this.pendingResponses.entries()) {
      if (value.tabId === tabId) {
        this.pendingResponses.delete(key)
      }
    }
  }

  // 安全检查
  performSecurityCheck(tabId, urlPatterns) {
    try {
      // 检查标签页是否存在
      if (!tabId || typeof tabId !== 'number' || tabId <= 0) {
        return { safe: false, reason: '无效的标签页 ID' }
      }

      // 检查 URL 模式
      if (urlPatterns && Array.isArray(urlPatterns)) {
        for (const pattern of urlPatterns) {
          if (typeof pattern !== 'string') {
            return { safe: false, reason: 'URL 模式必须是字符串' }
          }

          // 检查有害模式
          if (pattern.includes('<script') || 
              pattern.includes('javascript:') || 
              pattern.includes('data:') ||
              pattern.includes('vbscript:') ||
              pattern.includes('file:')) {
            return { safe: false, reason: `不安全的 URL 模式: ${pattern}` }
          }

          // 检查模式长度
          if (pattern.length > 1000) {
            return { safe: false, reason: 'URL 模式过长' }
          }
        }
      }

      return { safe: true }
    } catch (error) {
      return { safe: false, reason: '安全检查异常: ' + error.message }
    }
  }

  // 校验修改后的响应
  validateModifiedResponse(modifiedResponse) {
    try {
      // 检查状态码
      if (modifiedResponse.status && 
          (typeof modifiedResponse.status !== 'number' ||
           modifiedResponse.status < 100 || 
           modifiedResponse.status > 599)) {
        return { valid: false, reason: '无效的 HTTP 状态码' }
      }

      // 检查响应体大小
      if (modifiedResponse.body && 
          typeof modifiedResponse.body === 'string' &&
          modifiedResponse.body.length > 10 * 1024 * 1024) { // 10MB
        return { valid: false, reason: '响应体过大（最大 10MB）' }
      }

      // 检查响应头
      if (modifiedResponse.headers && typeof modifiedResponse.headers === 'object') {
        for (const [key, value] of Object.entries(modifiedResponse.headers)) {
          if (typeof key !== 'string' || typeof value !== 'string') {
            return { valid: false, reason: '无效的响应头格式' }
          }

          // 检查敏感响应头
          const sensitiveHeaders = ['set-cookie', 'authorization', 'cookie']
          if (sensitiveHeaders.includes(key.toLowerCase())) {
            console.warn(`⚠️ 检测到敏感响应头: ${key}`)
          }
        }
      }

      return { valid: true }
    } catch (error) {
      return { valid: false, reason: '响应验证异常: ' + error.message }
    }
  }

  // 获取拦截状态
  getInterceptionStatus(tabId) {
    console.log('🔍 getInterceptionStatus 被调用, tabId:', tabId)
    
    const config = this.activeInterceptions.get(tabId)
    console.log('📊 活跃拦截配置:', config)
    
    const isAttached = this.attachedTabs.has(tabId)
    console.log('🔗 debugger 附加状态:', isAttached)
    
    const pendingResponses = Array.from(this.pendingResponses.values())
      .filter(res => res.tabId === tabId)
    console.log('📋 待处理响应数量:', pendingResponses.length)
    
    const status = {
      enabled: config?.enabled || false,
      urlPatterns: config?.urlPatterns || [],
      attachedDebugger: isAttached,
      interceptedCount: config?.interceptedCount || 0,
      pendingCount: pendingResponses.length
    }
    
    console.log('📊 最终状态结果:', status)
    
    return status
  }
}

// 创建全局响应拦截器实例
const responseInterceptor = new ResponseInterceptor()

// 监听debugger事件
chrome.debugger.onEvent.addListener((source, method, params) => {
  const tabId = source.tabId
  
  console.log(`🔍 [Debugger事件] ${method} (tabId: ${tabId})`)
  
  if (method === 'Fetch.requestPaused') {
    console.log(`🎯 [Debugger事件] 拦截到Fetch请求:`, {
      method: params.request?.method || '未知',
      url: params.request?.url || '未知URL',
      requestId: params.requestId,
      responseStatusCode: params.responseStatusCode,
      responseHeadersCount: params.responseHeaders?.length || 0
    })
    
    // 处理Fetch被拦截的请求（项目二的方式）
    responseInterceptor.handleFetchRequestPaused(
      tabId, 
      params.requestId, 
      params.request, 
      params.responseStatusCode, 
      params.responseHeaders
    )
  }
})

// 监听debugger分离事件
chrome.debugger.onDetach.addListener((source, reason) => {
  const tabId = source.tabId
  console.log(`🔌 Debugger从标签页 ${tabId} 分离，原因: ${reason}`)
  
  // 清理相关数据
  responseInterceptor.attachedTabs.delete(tabId)
  responseInterceptor.activeInterceptions.delete(tabId)
  responseInterceptor.clearTabData(tabId)
})

// 监听标签页关闭事件
chrome.tabs.onRemoved.addListener((tabId) => {
  console.log(`🗑️ 标签页 ${tabId} 已关闭，清理响应拦截数据`)
  responseInterceptor.clearTabData(tabId)
  responseInterceptor.activeInterceptions.delete(tabId)
  responseInterceptor.attachedTabs.delete(tabId)
})

// 内存管理配置
const MEMORY_CONFIG = {
  MAX_REQUESTS_IN_MEMORY: 100,        // 减少内存中最大请求数
  MAX_STORED_REQUESTS: 200,          // 减少存储中最大请求数
  REQUEST_CLEANUP_INTERVAL: 15000,   // 增加清理频率 (15秒)
  REQUEST_TTL: 180000,               // 减少请求生存时间 (3分钟)
  BATCH_CLEANUP_SIZE: 50,            // 减少批量清理大小
  MAX_RESPONSE_SIZE: 50000,          // 最大响应内容大小 (50KB)
  MAX_REQUEST_BODY_SIZE: 10000       // 最大请求体大小 (10KB)
}

// 请求缓存 - 使用Map提高性能
const requestsCache = new Map()
let lastCleanupTime = Date.now()

// 监听插件安装事件
chrome.runtime.onInstalled.addListener((details) => {
  console.log('✅ 网络控制台已安装:', details.reason)
  
  // 初始化存储
  chrome.storage.sync.set({
    networkRequests: [],
    settings: {
      captureEnabled: true,
      maxRequests: 1000,
      autoClean: true
    }
  })
  
  console.log('📋 webRequest监听器将捕获所有网络请求')
})

// 启动时的调试信息
console.log('🔍 webRequest API 可用:', !!chrome.webRequest)
console.log('📦 可用的chrome API:', Object.keys(chrome))

// 监听来自内容脚本和DevTools的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('📥 [后台消息] 收到消息:', message.type, '来自:', sender.tab?.url || sender.url)
  
  // 检查 runtime 是否仍然有效
  if (chrome.runtime.lastError) {
    console.error('❌ [后台消息] Runtime错误:', chrome.runtime.lastError)
    return false
  }

  try {
    switch (message.type) {
      case 'NETWORK_REQUEST':
        handleNetworkRequest(message.data, sender)
        sendResponse({ success: true })
        return true

      case 'RESEND_REQUEST':
        handleResendRequest(message.data, sendResponse)
        return true // 保持消息通道开放

      case 'GET_REQUESTS':
        getStoredRequests(message.tabId, sendResponse)
        return true

      case 'CLEAR_REQUESTS':
        clearStoredRequests(sendResponse)
        return true

      case 'GET_TAB_INFO':
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (chrome.runtime.lastError) {
            sendResponse({ error: chrome.runtime.lastError.message })
          } else {
            sendResponse({ tab: tabs[0] })
          }
        })
        return true

      // 响应拦截相关消息
      case 'ENABLE_RESPONSE_INTERCEPTION':
        responseInterceptor.enableInterception(message.tabId, message.urlPatterns)
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ success: false, error: error.message }))
        return true

      case 'DISABLE_RESPONSE_INTERCEPTION':
        responseInterceptor.disableInterception(message.tabId)
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ success: false, error: error.message }))
        return true

      case 'UPDATE_INTERCEPTION_PATTERNS':
        responseInterceptor.updateInterceptionPatterns(message.tabId, message.urlPatterns)
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ success: false, error: error.message }))
        return true

      case 'GET_INTERCEPTION_STATUS': {
        console.log('📥 后台收到 GET_INTERCEPTION_STATUS 请求, tabId:', message.tabId)
        const status = responseInterceptor.getInterceptionStatus(message.tabId)
        console.log('📋 获取到的拦截状态:', status)
        const result = { success: true, status }
        console.log('📤 返回拦截状态响应:', result)
        sendResponse(result)
        return true
      }

      case 'SUBMIT_MODIFIED_RESPONSE':
        console.log(`📥 [Background消息] 收到SUBMIT_MODIFIED_RESPONSE请求:`, {
          requestId: message.requestId,
          hasModifiedResponse: !!message.modifiedResponse,
          senderTab: sender.tab?.id
        })
        
        // 确保 sendResponse 是一个函数
        if (typeof sendResponse !== 'function') {
          console.error('❌ [Background消息] sendResponse 不是一个函数:', typeof sendResponse)
          return false
        }
        
        responseInterceptor.handleModifiedResponse(message.requestId, message.modifiedResponse)
          .then(result => {
            console.log(`📤 [Background消息] 响应处理结果:`, result)
            console.log(`📤 [Background消息] 即将调用 sendResponse 传递:`, result)
            
            // 确保结果格式正确
            if (result && typeof result === 'object') {
              sendResponse(result)
              console.log(`✅ [Background消息] sendResponse 已调用`)
            } else {
              console.error('❌ [Background消息] 结果格式错误:', result)
              sendResponse({ success: false, error: '结果格式错误', result })
            }
          })
          .catch(error => {
            console.error(`❌ [Background消息] 响应处理异常:`, error)
            const errorResponse = { success: false, error: error.message, status: 'error' }
            console.log(`📤 [Background消息] 返回错误响应:`, errorResponse)
            sendResponse(errorResponse)
          })
        return true

      default:
        console.warn('⚠️ [后台消息] 未知消息类型:', message.type)
        sendResponse({ success: false, error: '未知消息类型: ' + message.type })
        return false
    }
  } catch (error) {
    console.error('❌ [后台消息] 处理消息时出错:', error)
    sendResponse({ success: false, error: error.message })
    return false
  }
})

// 内存优化的请求管理函数
function addRequestToCache(requestId, requestData) {
  // 检查内存使用情况
  if (requestsCache.size >= MEMORY_CONFIG.MAX_REQUESTS_IN_MEMORY) {
    performMemoryCleanup()
  }
  
  // 限制响应内容大小
  if (requestData.response && typeof requestData.response === 'string' && requestData.response.length > MEMORY_CONFIG.MAX_RESPONSE_SIZE) {
    requestData.response = requestData.response.substring(0, MEMORY_CONFIG.MAX_RESPONSE_SIZE) + '...内容过大已截断'
  }
  
  // 限制请求体大小
  if (requestData.body && typeof requestData.body === 'string' && requestData.body.length > MEMORY_CONFIG.MAX_REQUEST_BODY_SIZE) {
    requestData.body = requestData.body.substring(0, MEMORY_CONFIG.MAX_REQUEST_BODY_SIZE) + '...内容过大已截断'
  }
  
  requestsCache.set(requestId, {
    ...requestData,
    createdAt: Date.now()
  })
  
  // 只在必要时输出日志
  if (requestsCache.size % 20 === 0) {
    console.log(`📊 内存中的请求数: ${requestsCache.size}`)
  }
}

function getRequestFromCache(requestId) {
  return requestsCache.get(requestId)
}

function removeRequestFromCache(requestId) {
  return requestsCache.delete(requestId)
}

// 内存清理函数
function performMemoryCleanup() {
  const now = Date.now()
  let cleanedCount = 0
  
  // 清理过期的请求
  for (const [requestId, requestData] of requestsCache.entries()) {
    if (now - requestData.createdAt > MEMORY_CONFIG.REQUEST_TTL) {
      requestsCache.delete(requestId)
      cleanedCount++
      
      if (cleanedCount >= MEMORY_CONFIG.BATCH_CLEANUP_SIZE) {
        break // 批量清理，避免阻塞
      }
    }
  }
  
  // 如果还是超过限制，清理最旧的请求
  if (requestsCache.size >= MEMORY_CONFIG.MAX_REQUESTS_IN_MEMORY) {
    const entries = Array.from(requestsCache.entries())
    entries.sort((a, b) => a[1].createdAt - b[1].createdAt)
    
    const toRemove = entries.slice(0, MEMORY_CONFIG.BATCH_CLEANUP_SIZE)
    toRemove.forEach(([requestId]) => {
      requestsCache.delete(requestId)
      cleanedCount++
    })
  }
  
  lastCleanupTime = now
  console.log(`🧹 内存清理完成，清理了 ${cleanedCount} 个请求，剩余 ${requestsCache.size} 个`)
}

// 定期清理任务和内存监控
setInterval(() => {
  const now = Date.now()
  if (now - lastCleanupTime > MEMORY_CONFIG.REQUEST_CLEANUP_INTERVAL) {
    performMemoryCleanup()
  }
  
  // 内存监控：如果请求数量过多，强制清理
  if (requestsCache.size > MEMORY_CONFIG.MAX_REQUESTS_IN_MEMORY * 1.5) {
    console.warn('⚠️ 内存使用过高，执行强制清理')
    requestsCache.clear()
  }
}, MEMORY_CONFIG.REQUEST_CLEANUP_INTERVAL)

// 监控内存使用，定期输出统计信息
setInterval(() => {
  if (requestsCache.size > 0) {
    console.log(`📋 内存统计: 请求数量=${requestsCache.size}, 限制=${MEMORY_CONFIG.MAX_REQUESTS_IN_MEMORY}`)
  }
}, 60000) // 每分钟输出一次

// 安全地序列化对象，避免循环引用和不可序列化的值
function safeSerialize(obj, depth = 0) {
  // 防止深度过大导致栈溢出
  if (depth > 5) { // 减少最大深度
    return '[对象层级过深]'
  }
  
  if (obj === null || obj === undefined) {
    return obj
  }
  
  // 字符串长度限制
  if (typeof obj === 'string') {
    if (obj.length > 5000) {
      return obj.substring(0, 5000) + '...内容过长已截断'
    }
    return obj
  }
  
  // 如果是FormData，转换为对象
  if (obj instanceof FormData) {
    const formObj = {}
    try {
      let count = 0
      for (const [key, value] of obj.entries()) {
        if (count++ > 20) break // 限制数量
        formObj[key] = String(value).substring(0, 1000) // 限制值的长度
      }
    } catch {
      return '[FormData转换失败]'
    }
    return formObj
  }
  
  // 如果是Headers对象，转换为普通对象
  if (obj instanceof Headers) {
    const headersObj = {}
    try {
      let count = 0
      for (const [key, value] of obj.entries()) {
        if (count++ > 30) break // 限制数量
        headersObj[key] = String(value).substring(0, 1000)
      }
    } catch {
      return '[Headers转换失败]'
    }
    return headersObj
  }
  
  // 如果是数组，处理每个元素
  if (Array.isArray(obj)) {
    return obj.slice(0, 50).map(item => { // 减少数组大小限制
      if (item && typeof item === 'object' && item.name && item.value) {
        // webRequest headers 格式
        return {
          name: String(item.name).substring(0, 200),
          value: String(item.value).substring(0, 1000)
        }
      }
      return safeSerialize(item, depth + 1)
    })
  }
  
  // 如果是普通对象
  if (typeof obj === 'object') {
    const result = {}
    let propCount = 0
    for (const [key, value] of Object.entries(obj)) {
      if (propCount++ > 30) break // 减少属性数量限制
      
      try {
        if (value === null || value === undefined) {
          result[key] = value
        } else if (typeof value === 'string') {
          result[key] = value.length > 2000 ? value.substring(0, 2000) + '...截断' : value
        } else if (typeof value === 'number' || typeof value === 'boolean') {
          result[key] = value
        } else if (typeof value === 'object') {
          result[key] = safeSerialize(value, depth + 1)
        } else {
          result[key] = String(value).substring(0, 500)
        }
      } catch (err) {
        result[key] = '[不可序列化的值]'
      }
    }
    return result
  }
  
  return obj
}

// 解析webRequest API的requestBody
function parseRequestBody(requestBody) {
  if (!requestBody) {
    return null
  }
  
  try {
    // webRequest API的requestBody格式
    if (requestBody.raw && Array.isArray(requestBody.raw)) {
      let combinedBody = ''
      let totalSize = 0
      
      for (const rawData of requestBody.raw) {
        if (totalSize > MEMORY_CONFIG.MAX_REQUEST_BODY_SIZE) {
          combinedBody += '...请求体过大已截断'
          break
        }
        
        if (rawData.bytes) {
          // 将ArrayBuffer转换为字符串
          if (rawData.bytes instanceof ArrayBuffer) {
            const decoder = new TextDecoder('utf-8')
            const decoded = decoder.decode(rawData.bytes)
            combinedBody += decoded.substring(0, MEMORY_CONFIG.MAX_REQUEST_BODY_SIZE - totalSize)
            totalSize += decoded.length
          } else if (typeof rawData.bytes === 'object') {
            // 如果是类似 {0: 123, 1: 34, ...} 的格式
            const byteArray = Object.values(rawData.bytes)
            if (byteArray.length > 0 && typeof byteArray[0] === 'number') {
              const uint8Array = new Uint8Array(byteArray.slice(0, Math.min(byteArray.length, MEMORY_CONFIG.MAX_REQUEST_BODY_SIZE)))
              const decoder = new TextDecoder('utf-8')
              const decoded = decoder.decode(uint8Array)
              combinedBody += decoded
              totalSize += decoded.length
            }
          }
        } else if (rawData.file) {
          combinedBody += '[文件内容]'
          totalSize += 10
        }
      }
      
      return combinedBody || '[空请求体]'
    }
    
    // 如果有formData
    if (requestBody.formData) {
      const formDataObj = {}
      let count = 0
      for (const [key, values] of Object.entries(requestBody.formData)) {
        if (count++ > 20) break // 限制数量
        const value = Array.isArray(values) ? values.join(', ') : values
        formDataObj[key] = String(value).substring(0, 1000) // 限制长度
      }
      const jsonStr = JSON.stringify(formDataObj, null, 2)
      return jsonStr.length > MEMORY_CONFIG.MAX_REQUEST_BODY_SIZE
        ? jsonStr.substring(0, MEMORY_CONFIG.MAX_REQUEST_BODY_SIZE) + '...截断'
        : jsonStr
    }
    
    // 如果是字符串格式
    if (typeof requestBody === 'string') {
      return requestBody.length > MEMORY_CONFIG.MAX_REQUEST_BODY_SIZE
        ? requestBody.substring(0, MEMORY_CONFIG.MAX_REQUEST_BODY_SIZE) + '...截断'
        : requestBody
    }
    
    // 其他格式尝试JSON序列化
    const jsonStr = JSON.stringify(requestBody, null, 2)
    return jsonStr.length > MEMORY_CONFIG.MAX_REQUEST_BODY_SIZE
      ? jsonStr.substring(0, MEMORY_CONFIG.MAX_REQUEST_BODY_SIZE) + '...截断'
      : jsonStr
    
  } catch (error) {
    console.warn('解析请求体失败:', error)
    return '[无法解析的请求体]'
  }
}

function normalizeRequestType(requestType, webRequestType) {
  // 如果有明确的请求类型，使用它
  if (requestType) {
    return requestType
  }
  
  // 根据webRequest类型映射
  const typeMap = {
    'xmlhttprequest': 'xhr',
    'fetch': 'fetch',
    'script': 'script',
    'stylesheet': 'stylesheet',
    'image': 'image',
    'media': 'media',
    'font': 'font',
    'object': 'object',
    'websocket': 'websocket',
    'csp_report': 'csp_report',
    'ping': 'ping',
    'other': 'other'
  }
  
  return typeMap[webRequestType] || webRequestType || 'unknown'
}

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    // 过滤掉不需要的请求类型
    const skipTypes = ['main_frame', 'sub_frame', 'beacon']
    if (skipTypes.includes(details.type)) {
      return
    }
    
    // 过滤掉浏览器内部请求
    if (details.url.startsWith('chrome://') || 
        details.url.startsWith('chrome-extension://') ||
        details.url.startsWith('moz-extension://') ||
        details.url.startsWith('edge://')) {
      return
    }
    
    // 检查tabId是否有效
    const tabId = details.tabId
    if (tabId && tabId < 0) {
      return
    }
    
    const { requestId, url, method, timeStamp, requestBody, type } = details
    const requestData = {
      id: 'webReq_' + requestId, // 添加前缀避免与content script冲突
      url,
      method: method || 'GET',
      requestType: normalizeRequestType(null, type), // 使用规范化后的类型
      timestamp: timeStamp,
      status: 'pending',
      requestBody: safeSerialize(requestBody), // 安全序列化原始格式
      body: parseRequestBody(requestBody), // 解析后的请求体
      source: 'webRequest', // 标记来源
      tabId: tabId > 0 ? tabId : null, // 确保 tabId 有效
      initiator: details.initiator
    }
    
    addRequestToCache(requestId, requestData)
    
    // 减少日志输出，只记录重要信息
    if (requestsCache.size % 50 === 0) {
      console.log(`✅ webRequest 捕获请求: ${method} ${url.substring(0, 100)}...`)
    }
    
    handleNetworkRequest(requestData, { tab: { id: tabId > 0 ? tabId : null } })
  },
  { urls: ['<all_urls>'] },
  ['requestBody']
)

chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    const { requestId, requestHeaders } = details
    const cachedRequest = getRequestFromCache(requestId)
    if (cachedRequest) {
      cachedRequest.requestHeaders = safeSerialize(requestHeaders) // 安全序列化
      cachedRequest.headers = {}
      // 转换请求头格式
      if (requestHeaders) {
        requestHeaders.forEach(header => {
          cachedRequest.headers[header.name.toLowerCase()] = header.value
        })
      }
      
      // 检查tabId有效性
      const tabId = details.tabId
      const validTabId = tabId > 0 ? tabId : null
      handleNetworkRequest(cachedRequest, { tab: { id: validTabId } })
    }
  },
  { urls: ['<all_urls>'] },
  ['requestHeaders']
)

chrome.webRequest.onCompleted.addListener(
  (details) => {
    const { requestId, timeStamp, fromCache, statusCode, responseHeaders } = details
    const cachedRequest = getRequestFromCache(requestId)
    if (cachedRequest) {
      cachedRequest.endTime = timeStamp
      cachedRequest.fromCache = fromCache
      cachedRequest.status = statusCode
      cachedRequest.responseHeaders = safeSerialize(responseHeaders) // 安全序列化
      cachedRequest.duration = cachedRequest.endTime - cachedRequest.timestamp
      
      // 检查tabId有效性
      const tabId = details.tabId
      const validTabId = tabId > 0 ? tabId : null
      handleNetworkRequest(cachedRequest, { tab: { id: validTabId } })
      
      // 立即清理已完成的请求以节省内存
      setTimeout(() => {
        removeRequestFromCache(requestId)
      }, 3000) // 减少延迟时间
    }
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
)

chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    const { requestId, timeStamp, error } = details
    const cachedRequest = getRequestFromCache(requestId)
    if (cachedRequest) {
      cachedRequest.endTime = timeStamp
      cachedRequest.status = 'error'
      cachedRequest.error = error
      cachedRequest.response = `请求错误: ${error}`
      cachedRequest.duration = cachedRequest.endTime - cachedRequest.timestamp
      
      // 检查tabId有效性
      const tabId = details.tabId
      const validTabId = tabId > 0 ? tabId : null
      handleNetworkRequest(cachedRequest, { tab: { id: validTabId } })
      
      // 立即清理出错的请求
      setTimeout(() => {
        removeRequestFromCache(requestId)
      }, 2000)
    }
  },
  { urls: ['<all_urls>'] }
)

// 处理网络请求
function handleNetworkRequest(requestData, sender) {
  // 添加发送者信息并安全序列化
  const enrichedData = safeSerialize({
    ...requestData,
    tabId: sender.tab?.id || requestData.tabId, // 优先使用sender的tabId，否则使用请求数据中的tabId
    frameId: sender.frameId,
    source: requestData.source || 'unknown',
    // 确保请求类型正确
    requestType: requestData.requestType || 'unknown'
  })
  
  // 记录请求的标签页信息（减少日志输出）
  if (enrichedData.tabId && requestsCache.size % 10 === 0) {
    console.log(`🏷️ 处理来自标签页 ${enrichedData.tabId} 的请求: ${enrichedData.method} ${enrichedData.url.substring(0, 50)}...`)
  }
  
  // 只在请求完成或失败时才存储，减少中间状态的存储
  if (enrichedData.status !== 'pending') {
    storeNetworkRequest(enrichedData)
  }
  
  // 转发给DevTools页面（如果开启）
  broadcastToDevTools(enrichedData)
}

// 存储网络请求（内存优化版本）
function storeNetworkRequest(requestData) {
  chrome.storage.local.get(['networkRequests'], (result) => {
    let requests = result.networkRequests || []
    
    // 检查是否已存在（更新或添加）
    const existingIndex = requests.findIndex(req => req.id === requestData.id)
    
    if (existingIndex >= 0) {
      requests[existingIndex] = safeSerialize(requestData) // 安全序列化
    } else {
      requests.unshift(safeSerialize(requestData)) // 安全序列化
      
      // 限制最大数量，防止存储爆炸
      if (requests.length > MEMORY_CONFIG.MAX_STORED_REQUESTS) {
        requests.splice(MEMORY_CONFIG.MAX_STORED_REQUESTS)
      }
    }
    
    chrome.storage.local.set({ networkRequests: requests })
  })
}

// 广播给DevTools
function broadcastToDevTools(requestData) {
  // 检查tabId是否有效（必须是正整数）
  const tabId = requestData.tabId
  if (tabId && typeof tabId === 'number' && tabId > 0 && Number.isInteger(tabId)) {
    chrome.tabs.sendMessage(tabId, {
      type: 'NETWORK_REQUEST_UPDATE',
      data: safeSerialize(requestData) // 安全序列化
    }).catch(() => {
      // 忽略错误，标签页可能没有content script
    })
  }
  
  // 只在重要状态更新时才更新存储
  if (requestData.status !== 'pending') {
    chrome.storage.local.set({
      latestNetworkRequest: safeSerialize({
        ...requestData,
        timestamp: Date.now()
      })
    })
  }
}

// 重新发送请求
async function handleResendRequest(requestData, sendResponse) {
  try {
    const startTime = performance.now()
    
    // 构造fetch参数
    const fetchOptions = {
      method: requestData.method || 'GET',
      headers: requestData.headers || {}
    }
    
    // 添加请求体（如果有）
    if (requestData.body && ['POST', 'PUT', 'PATCH'].includes(fetchOptions.method)) {
      fetchOptions.body = typeof requestData.body === 'string' 
        ? requestData.body 
        : JSON.stringify(requestData.body)
    }
    
    // 发送请求
    const response = await fetch(requestData.url, fetchOptions)
    const endTime = performance.now()
    
    // 读取响应
    let responseText = ''
    let responseHeaders = {}
    
    // 获取响应头
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value
    })
    
    // 读取响应内容
    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      try {
        const jsonData = await response.json()
        responseText = JSON.stringify(jsonData, null, 2)
      } catch {
        responseText = await response.text()
      }
    } else {
      responseText = await response.text()
    }
    
    const result = {
      success: true,
      status: response.status,
      response: responseText,
      responseHeaders: responseHeaders,
      duration: Math.round(endTime - startTime)
    }
    
    sendResponse(result)
    
  } catch (error) {
    console.error('重发请求失败:', error)
    sendResponse({
      success: false,
      error: error.message,
      status: 'error',
      response: error.message
    })
  }
}

// 获取存储的请求
function getStoredRequests(tabId, sendResponse) {
  chrome.storage.local.get(['networkRequests'], (result) => {
    let requests = result.networkRequests || []
    
    // 如果指定了tabId，只返回该标签页的请求
    if (tabId && typeof tabId === 'number' && tabId > 0) {
      requests = requests.filter(req => req.tabId === tabId)
    }
    
    sendResponse({
      success: true,
      requests: requests
    })
  })
}

// 清空存储的请求
function clearStoredRequests(sendResponse) {
  chrome.storage.local.set({ networkRequests: [] }, () => {
    // 同时清空内存缓存
    requestsCache.clear()
    sendResponse({ success: true })
  })
}

// 监听标签页更新
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    console.log('标签页加载完成:', tab.url)
    
    // 可以在这里添加自动清理逻辑
    autoCleanOldRequests()
  }
})

// 自动清理旧请求（存储优化版本）
function autoCleanOldRequests() {
  chrome.storage.sync.get(['settings'], (result) => {
    const settings = result.settings || {}
    
    if (settings.autoClean) {
      const cutoffTime = Date.now() - (24 * 60 * 60 * 1000) // 24小时前
      
      chrome.storage.local.get(['networkRequests'], (result) => {
        const requests = result.networkRequests || []
        const filteredRequests = requests.filter(req => req.timestamp > cutoffTime)
        
        if (filteredRequests.length !== requests.length) {
          chrome.storage.local.set({ networkRequests: filteredRequests })
          console.log(`清理了 ${requests.length - filteredRequests.length} 个旧请求`)
        }
      })
    }
  })
}

// 监听插件图标点击（可选）
chrome.action.onClicked.addListener((tab) => {
  console.log('网络控制台图标被点击:', tab.url)
  
  // 可以在这里添加快捷操作
})

// 监听扩展卸载，清理资源
chrome.runtime.onSuspend.addListener(() => {
  console.log('🔄 扩展即将暂停，清理资源...')
  requestsCache.clear()
})

console.log('🎯 内存优化的 Background Script 初始化完成')
console.log('🔍 响应拦截器已初始化，准备进行响应拦截')