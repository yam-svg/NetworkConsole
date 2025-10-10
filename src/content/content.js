// 网络控制台 - 内容脚本
console.log('🔗 网络控制台 Content Script 开始加载:', window.location.href);

// 确保脚本在页面加载前就开始执行
(function() {
  'use strict';
  
  console.log('🚀 Content Script 主函数开始执行');
  
  // 检查是否已经注入过，避免重复注入
  if (window.__NETWORK_CONSOLE_INJECTED__) {
    console.log('⚠️ 网络拦截器已存在，跳过重复注入');
    return;
  }
  
  window.__NETWORK_CONSOLE_INJECTED__ = true;
  
  // 生成唯一ID
  function generateRequestId() {
    return 'content_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
  
  // 发送网络请求数据到background script
  function sendNetworkRequest(data) {
    console.log('📤 Content Script 发送网络请求数据:', data.method, data.url, '类型:', data.requestType);
    
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
        console.log('✅ Content Script 请求数据已发送:', response);
      }).catch(err => {
        console.log('❌ Content Script 发送失败:', err);
      });
    } catch (err) {
      console.error('Content Script 消息发送异常:', err);
    }
  }
  
  // 简化的fetch拦截（主要用于补充webRequest可能遗漏的情况）
  try {
    const originalFetch = window.fetch;
    
    window.fetch = async function(url, init = {}) {
      const requestId = generateRequestId();
      const timestamp = Date.now();
      const method = init.method || 'GET';
      const MAX_BODY_SIZE = 200 * 1024; // 200KB 上限，避免卡顿
      
      const requestData = {
        id: requestId,
        url: url.toString(),
        method: method,
        requestType: 'fetch',
        timestamp: timestamp,
        headers: init.headers || {},
        body: init.body || null,
        status: 'pending',
        source: 'content-script-fetch'
      };
      
      console.log('🎯 Content Script 拦截 Fetch:', method, url);
      sendNetworkRequest(requestData);
      
      try {
        const startTime = performance.now();
        const response = await originalFetch.call(this, url, init);
        const endTime = performance.now();
        
        // 读取可访问的响应头与内容（受CORS限制，opaque响应不可读）
        let responseText = null;
        let responseHeaders = {};
        try {
          response.headers.forEach((value, key) => {
            responseHeaders[key] = value;
          });
        } catch {}

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
          // 无法读取（多为跨域 opaque），保持为空
        }

        // 更新请求状态（包含可读的响应体/头）
        sendNetworkRequest({
          ...requestData,
          status: response.status,
          duration: Math.round(endTime - startTime),
          response: responseText,
          responseHeaders
        });
        
        return response;
      } catch (error) {
        sendNetworkRequest({
          ...requestData,
          status: 'error',
          response: error.message
        });
        throw error;
      }
    };
    
    console.log('✅ Fetch 拦截器已设置');
  } catch (err) {
    console.error('❌ 设置 Fetch 拦截器失败:', err);
  }
  
  // 监听来自DevTools的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_PAGE_INFO') {
      sendResponse({
        title: document.title,
        url: window.location.href,
        domain: window.location.hostname
      });
    }
    return true;
  });
  
  // 测试网络捕获功能
  function testNetworkCapture() {
    console.log('🧪 准备测试网络捕获功能...');
    
    // 延迟3秒后发送测试请求
    setTimeout(() => {
      console.log('🔬 发送测试请求...');
      fetch('https://httpbin.org/get?test=content-script-test&time=' + Date.now())
        .then(response => response.json())
        .then(data => {
          console.log('🎉 测试请求成功:', data);
        })
        .catch(err => {
          console.log('⚠️ 测试请求失败（这是正常的，重要的是能捕获到请求）:', err.message);
        });
    }, 3000);
  }
  
  // 页面加载完成后的初始化
  function initialize() {
    testNetworkCapture();
    console.log('🎯 Content Script 初始化完成，主要依赖 webRequest API 捕获网络请求');
  }
  
  // 根据页面加载状态选择初始化时机
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    setTimeout(initialize, 100);
  }
  
  console.log('🔍 网络控制台 Content Script 启动完成（简化版）');
  
})();