// 网络控制台 - 增强内容脚本（支持真实响应拦截）
// console.log('🔗 网络控制台 Content Script 开始加载:', window.location.href);

// 确保脚本在页面加载前就开始执行
(function() {
  'use strict';
  
  // console.log('🚀 Enhanced Content Script 主函数开始执行');
  
  // 检查是否已经注入过，避免重复注入
  if (window.__NETWORK_CONSOLE_INJECTED__) {
    // console.log('⚠️ 网络拦截器已存在，跳过重复注入');
    return;
  }
  
  window.__NETWORK_CONSOLE_INJECTED__ = true;
  
  // 响应拦截器配置
  const interceptorConfig = {
    enabled: false,
    patterns: [],
    interceptedResponses: new Map(),
    pendingRequests: new Map(),
    modifiedResponses: new Map()
  };
  
  // 生成唯一ID
  function generateRequestId() {
    return 'content_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
  
  // 检查URL是否匹配拦截模式
  function shouldInterceptUrl(url) {
    if (!interceptorConfig.enabled || interceptorConfig.patterns.length === 0) {
      return false;
    }
    
    return interceptorConfig.patterns.some(pattern => {
      try {
        if (pattern === '*') return true;
        
        // 处理通配符模式
        const regexPattern = pattern
          .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '.*');
        const regex = new RegExp('^' + regexPattern + '$');
        
        return regex.test(url);
      } catch (error) {
        // console.warn('⚠️ 模式匹配错误:', error);
        return url.includes(pattern.replace(/\*/g, ''));
      }
    });
  }
  
  // 发送网络请求数据到background script
  function sendNetworkRequest(data) {
    // console.log('📤 Content Script 发送网络请求数据:', data.method, data.url, '类型:', data.requestType);
    
    try {
      // 安全序列化数据，移除不可序列化的属性
      const safeData = {
        id: data.id,
        url: String(data.url || ''),
        method: String(data.method || 'GET'),
        requestType: String(data.requestType || 'unknown'),
        timestamp: Number(data.timestamp || Date.now()),
        status: data.status,
        source: String(data.source || 'content-script'),
        headers: data.headers ? JSON.parse(JSON.stringify(data.headers)) : {},
        body: data.body ? String(data.body) : null,
        response: data.response ? String(data.response) : null,
        duration: data.duration ? Number(data.duration) : null
      };
      
      chrome.runtime.sendMessage({
        type: 'NETWORK_REQUEST',
        data: safeData
      }).then(response => {
        // console.log('✅ Content Script 请求数据已发送:', response);
      }).catch(err => {
        // console.log('❌ Content Script 发送失败:', err);
      });
    } catch (err) {
      // console.error('Content Script 消息发送异常:', err);
    }
  }
  
  // 创建修改后的Response对象
  function createModifiedResponse(originalResponse, modifiedBody, modifiedHeaders = {}) {
    // console.log('🔧 开始创建修改后的Response对象');
    
    try {
      // 合并响应头
      const headers = new Headers();
      
      // 复制原始响应头
      if (originalResponse.headers) {
        originalResponse.headers.forEach((value, key) => {
          headers.set(key, value);
        });
      }
      
      // 应用修改的响应头
      Object.entries(modifiedHeaders).forEach(([key, value]) => {
        headers.set(key, value);
      });
      
      // 自动设置Content-Type和Content-Length
      if (modifiedBody) {
        const bodyBytes = new TextEncoder().encode(modifiedBody);
        headers.set('Content-Length', bodyBytes.length.toString());
        
        // 如果没有指定Content-Type，根据内容自动检测
        if (!headers.has('Content-Type')) {
          try {
            JSON.parse(modifiedBody);
            headers.set('Content-Type', 'application/json; charset=utf-8');
          } catch {
            headers.set('Content-Type', 'text/plain; charset=utf-8');
          }
        }
      }
      
      // 创建新的Response对象
      const modifiedResponse = new Response(modifiedBody, {
        status: originalResponse.status,
        statusText: originalResponse.statusText,
        headers: headers
      });
      
      // console.log('✅ 修改后的Response对象创建成功');
      return modifiedResponse;
      
    } catch (error) {
      // console.error('❌ 创建修改后的Response对象失败:', error);
      return originalResponse;
    }
  }
  
  // 增强的fetch拦截（支持真实响应修改）
  try {
    const originalFetch = window.fetch;
    
    window.fetch = async function(url, init = {}) {
      const requestId = generateRequestId();
      const timestamp = Date.now();
      const method = init.method || 'GET';
      const MAX_BODY_SIZE = 200 * 1024; // 200KB 上限，避免卡顿
      const urlString = url.toString();
      
      // console.log('🎯 Enhanced Fetch 拦截开始:', method, urlString);
      
      const requestData = {
        id: requestId,
        url: urlString,
        method: method,
        requestType: 'fetch',
        timestamp: timestamp,
        headers: init.headers || {},
        body: init.body || null,
        status: 'pending',
        source: 'content-script-fetch'
      };
      
      // 发送请求数据到background
      sendNetworkRequest(requestData);
      
      // 检查是否需要拦截这个请求
      const shouldIntercept = shouldInterceptUrl(urlString);
      // console.log('🔍 URL拦截检查:', urlString, '结果:', shouldIntercept);
      
      if (shouldIntercept) {
        // console.log('🛡️ 请求被标记为拦截:', urlString);
        // 将请求标记为待拦截
        interceptorConfig.pendingRequests.set(requestId, {
          url: urlString,
          method: method,
          timestamp: timestamp,
          originalFetch: originalFetch,
          originalArgs: [url, init]
        });
      }
      
      try {
        const startTime = performance.now();
        // console.log('📡 开始发送原始fetch请求');
        
        const response = await originalFetch.call(this, url, init);
        const endTime = performance.now();
        
        // console.log('📨 原始fetch响应接收完成:', response.status, response.statusText);
        
        // 如果这个请求被拦截，检查是否有修改的响应
        if (shouldIntercept) {
          // console.log('🔄 检查是否有修改的响应数据');
          
          // 检查是否有预设的修改响应
          const modifiedResponseData = interceptorConfig.modifiedResponses.get(requestId);
          if (modifiedResponseData) {
            // console.log('✨ 找到修改的响应数据，应用修改');
            
            // 清理存储的修改数据
            interceptorConfig.modifiedResponses.delete(requestId);
            interceptorConfig.pendingRequests.delete(requestId);
            
            // 返回修改后的响应
            return createModifiedResponse(
              response, 
              modifiedResponseData.body, 
              modifiedResponseData.headers
            );
          }
        }
        
        // 读取原始响应内容用于记录
        let responseText = null;
        let responseHeaders = {};
        
        try {
          response.headers.forEach((value, key) => {
            responseHeaders[key] = value;
          });
        } catch (error) {
          // console.warn('⚠️ 无法读取响应头:', error);
        }

        try {
          const cloned = response.clone();
          const contentType = (cloned.headers && cloned.headers.get('content-type')) || '';
          
          if (contentType.includes('application/json')) {
            try {
              const data = await cloned.json();
              responseText = JSON.stringify(data, null, 2);
            } catch {
              responseText = await cloned.text();
            }
          } else {
            responseText = await cloned.text();
          }
          
          if (typeof responseText === 'string' && responseText.length > MAX_BODY_SIZE) {
            responseText = responseText.slice(0, MAX_BODY_SIZE) + '...内容过大已截断';
          }
        } catch (readErr) {
          // console.warn('⚠️ 无法读取响应内容:', readErr);
        }

        // 更新请求状态
        sendNetworkRequest({
          ...requestData,
          status: response.status,
          duration: Math.round(endTime - startTime),
          response: responseText,
          responseHeaders
        });
        
        // console.log('✅ Fetch请求处理完成，返回响应');
        return response;
        
      } catch (error) {
        // console.error('❌ Fetch请求失败:', error);
        
        sendNetworkRequest({
          ...requestData,
          status: 'error',
          response: error.message
        });
        
        throw error;
      }
    };
    
    // console.log('✅ Enhanced Fetch 拦截器已设置');
  } catch (err) {
    // console.error('❌ 设置 Enhanced Fetch 拦截器失败:', err);
  }
  
  // 监听来自DevTools的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // console.log('📨 Content Script 收到消息:', message.type);
    
    try {
      switch (message.type) {
        case 'GET_PAGE_INFO':
          sendResponse({
            title: document.title,
            url: window.location.href,
            domain: window.location.hostname
          });
          break;
          
        case 'ENABLE_RESPONSE_INTERCEPTION':
          // console.log('🛡️ 启用响应拦截:', message.patterns);
          interceptorConfig.enabled = true;
          interceptorConfig.patterns = message.patterns || [];
          sendResponse({ success: true });
          break;
          
        case 'DISABLE_RESPONSE_INTERCEPTION':
          // console.log('🚫 禁用响应拦截');
          interceptorConfig.enabled = false;
          interceptorConfig.patterns = [];
          interceptorConfig.modifiedResponses.clear();
          interceptorConfig.pendingRequests.clear();
          sendResponse({ success: true });
          break;
          
        case 'APPLY_MODIFIED_RESPONSE':
          // console.log('✏️ 应用修改的响应:', message.requestId);
          
          // 存储修改的响应数据
          interceptorConfig.modifiedResponses.set(message.requestId, {
            body: message.modifiedContent,
            headers: message.headers || {},
            timestamp: Date.now()
          });
          
          // 处理响应修改通知
          handleResponseModified({
            requestId: message.requestId,
            response: {
              body: message.modifiedContent,
              headers: message.headers || {},
              status: message.originalResponse?.status || 200
            }
          });
          
          sendResponse({ success: true });
          break;
          
        case 'RESPONSE_MODIFIED':
          // console.log('📋 Content Script 收到响应修改通知:', message.data);
          handleResponseModified(message.data);
          sendResponse({ success: true });
          break;
          
        default:
          // console.log('❓ 未知消息类型:', message.type);
          sendResponse({ success: false, error: '未知消息类型' });
      }
    } catch (error) {
      // console.error('❌ 处理消息失败:', error);
      sendResponse({ success: false, error: error.message });
    }
    
    return true;
  });
  
  // 处理响应修改通知
  function handleResponseModified(data) {
    try {
      const { requestId, response } = data;
      
      // console.log('🔄 处理响应修改通知:', requestId);
      
      // 触发自定义事件
      const event = new CustomEvent('networkResponseModified', {
        detail: {
          requestId: requestId,
          response: response,
          timestamp: Date.now()
        }
      });
      
      window.dispatchEvent(event);
      document.dispatchEvent(event);
      
      // console.log('✅ 响应修改事件已触发:', { requestId, status: response.status });
    } catch (error) {
      // console.error('❌ 处理响应修改通知失败:', error);
    }
  }
  
  // 监听网络响应修改事件
  window.addEventListener('networkResponseModified', (event) => {
    // console.log('📋 监听到网络响应修改事件:', event.detail);
  });
  
  // 测试网络捕获功能
  function testNetworkCapture() {
    // console.log('🧪 准备测试网络捕获功能...');
    
    // 延迟3秒后发送测试请求
    setTimeout(() => {
      // console.log('🔬 发送测试请求...');
      fetch('https://httpbin.org/get?test=enhanced-content-script-test&time=' + Date.now())
        .then(response => response.json())
        .then(data => {
          // console.log('🎉 测试请求成功:', data);
        })
        .catch(err => {
          // console.log('⚠️ 测试请求失败（这是正常的，重要的是能捕获到请求）:', err.message);
        });
    }, 3000);
  }
  
  // 页面加载完成后的初始化
  function initialize() {
    testNetworkCapture();
    // console.log('🎯 Enhanced Content Script 初始化完成，支持真实响应拦截');
    
    // 暴露拦截器配置到全局，供调试使用
    window.__networkInterceptorConfig__ = interceptorConfig;
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    setTimeout(initialize, 100);
  }
  
  console.log('🔍 Enhanced 网络控制台 Content Script 启动完成');
  
})();