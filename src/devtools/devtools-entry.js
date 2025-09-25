// DevTools 入口文件 - 注册面板
console.log('🔧 网络控制台 DevTools 入口开始加载...');

// 检查DevTools API是否可用
if (chrome.devtools && chrome.devtools.panels) {
  console.log('✅ DevTools API 可用');
  
  try {
    // 创建自定义面板
    chrome.devtools.panels.create(
      '网络控制台',              // 面板名称
      '',                       // 面板图标（暂时留空）
      'devtools.html',          // 面板页面
      function(panel) {
        console.log('🎉 网络控制台面板创建成功！');
        
        // 面板显示时的回调
        panel.onShown.addListener(function(panelWindow) {
          console.log('👁️ 网络控制台面板已显示');
          // 避免跨域访问问题，不直接调用panelWindow的方法
          // 面板会自动初始化，无需手动调用
          try {
            // 可以安全地检查panelWindow是否存在
            if (panelWindow) {
              console.log('✅ 面板窗口对象可用');
            }
          } catch (error) {
            console.log('⚠️ 面板窗口访问受限（正常情况）:', error.message);
          }
        });
        
        // 面板隐藏时的回调
        panel.onHidden.addListener(function() {
          console.log('👁️‍🗨️ 网络控制台面板已隐藏');
        });
      }
    );
  } catch (error) {
    console.error('❌ 创建DevTools面板时出错:', error);
  }
} else {
  console.error('❌ DevTools API 不可用！');
}

// 监听网络事件（增强功能，但避免跨域问题）
try {
  if (chrome.devtools && chrome.devtools.network) {
    console.log('📡 DevTools 网络API可用');
    // 注释掉可能引起跨域问题的网络监听
    // chrome.devtools.network.onRequestFinished.addListener(function(request) {
    //   console.log('🌐 DevTools 网络事件:', request.request.url);
    // });
  } else {
    console.log('⚠️ DevTools 网络API不可用');
  }
} catch (error) {
  console.log('⚠️ DevTools 网络API访问受限:', error.message);
}

console.log('🎯 DevTools 入口脚本加载完成');