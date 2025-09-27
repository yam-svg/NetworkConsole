// 网络控制台 - 后台服务工作器（内存优化版本）
console.log('🚀 网络控制台 Background Script 已加载')

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
  console.log('后台收到消息:', message.type, '来自:', sender.tab?.url || sender.url)
  
  // 检查 runtime 是否仍然有效
  if (chrome.runtime.lastError) {
    console.error('Runtime错误:', chrome.runtime.lastError)
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

      default:
        sendResponse({ error: '未知消息类型' })
        return false
    }
  } catch (error) {
    console.error('处理消息时出错:', error)
    sendResponse({ error: error.message })
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