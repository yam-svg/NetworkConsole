/**
 * 浏览器插件剪贴板操作工具
 * 实现多层备用方案：chrome.scripting API -> Clipboard API -> execCommand -> 手动复制模态框
 */

/**
 * 复制文本到剪贴板（多层备用方案）
 * @param {string} text - 要复制的文本
 * @param {string} [description] - 操作描述（用于提示）
 * @returns {Promise<boolean>} - 是否复制成功
 */
export async function copyToClipboard(text, description = '内容') {
  // 方案1: 尝试使用 chrome.scripting API 注入复制脚本
  try {
    if (chrome?.scripting && chrome?.tabs) {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tabs.length > 0) {
        await chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: (textToCopy) => {
            return navigator.clipboard.writeText(textToCopy)
          },
          args: [text]
        })
        console.log('✅ 使用 chrome.scripting API 复制成功')
        return true
      }
    }
  } catch (error) {
    console.warn('❌ chrome.scripting API 复制失败:', error)
  }

  // 方案2: 尝试现代 Clipboard API
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      console.log('✅ 使用 Clipboard API 复制成功')
      return true
    }
  } catch (error) {
    console.warn('❌ Clipboard API 复制失败:', error)
  }

  // 方案3: 尝试传统 execCommand 方法
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    textarea.style.top = '-9999px'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    
    textarea.focus()
    textarea.select()
    
    const success = document.execCommand('copy')
    document.body.removeChild(textarea)
    
    if (success) {
      console.log('✅ 使用 execCommand 复制成功')
      return true
    }
  } catch (error) {
    console.warn('❌ execCommand 复制失败:', error)
  }

  // 方案4: 显示手动复制模态框
  showCopyModal(text, description)
  return false
}

/**
 * 显示手动复制模态框
 * @param {string} text - 要复制的文本
 * @param {string} description - 操作描述
 */
function showCopyModal(text, description) {
  // 创建模态框
  const modal = document.createElement('div')
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `

  const modalContent = document.createElement('div')
  modalContent.style.cssText = `
    background: white;
    padding: 24px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    max-width: 500px;
    width: 90%;
    max-height: 400px;
  `

  const title = document.createElement('h3')
  title.textContent = `复制${description}`
  title.style.cssText = `
    margin: 0 0 16px 0;
    color: #333;
    font-size: 18px;
  `

  const instruction = document.createElement('p')
  instruction.textContent = '请手动选择下面的内容并复制（Ctrl+C 或 Cmd+C）：'
  instruction.style.cssText = `
    margin: 0 0 12px 0;
    color: #666;
    font-size: 14px;
  `

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.cssText = `
    width: 100%;
    height: 150px;
    padding: 12px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    font-size: 12px;
    resize: vertical;
    margin-bottom: 16px;
  `
  textarea.readOnly = true

  const buttonContainer = document.createElement('div')
  buttonContainer.style.cssText = `
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  `

  const selectAllBtn = document.createElement('button')
  selectAllBtn.textContent = '全选'
  selectAllBtn.style.cssText = `
    padding: 8px 16px;
    border: 1px solid #007bff;
    background: white;
    color: #007bff;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
  `
  selectAllBtn.onclick = () => {
    textarea.select()
    textarea.setSelectionRange(0, 99999) // 兼容移动设备
  }

  const closeBtn = document.createElement('button')
  closeBtn.textContent = '关闭'
  closeBtn.style.cssText = `
    padding: 8px 16px;
    border: 1px solid #6c757d;
    background: white;
    color: #6c757d;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
  `
  closeBtn.onclick = () => {
    document.body.removeChild(modal)
  }

  // 组装模态框
  buttonContainer.appendChild(selectAllBtn)
  buttonContainer.appendChild(closeBtn)
  modalContent.appendChild(title)
  modalContent.appendChild(instruction)
  modalContent.appendChild(textarea)
  modalContent.appendChild(buttonContainer)
  modal.appendChild(modalContent)

  // 添加到页面并自动选中文本
  document.body.appendChild(modal)
  setTimeout(() => {
    textarea.select()
    textarea.setSelectionRange(0, 99999)
  }, 100)

  // 点击背景关闭
  modal.onclick = (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal)
    }
  }

  console.log('📋 显示手动复制模态框')
}

/**
 * DevTools环境专用复制函数
 * @param {string} text - 要复制的文本  
 * @param {string} [description] - 操作描述
 * @returns {Promise<boolean>} - 是否复制成功
 */
export async function copyToClipboardInDevTools(text, description = '内容') {
  // 在DevTools环境中，优先使用手动复制模态框
  // 因为DevTools panel的安全限制更严格
  
  // 先尝试简单的Clipboard API
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      console.log('✅ DevTools中使用 Clipboard API 复制成功')
      return true
    }
  } catch (error) {
    console.warn('❌ DevTools中 Clipboard API 复制失败:', error)
  }

  // 尝试execCommand
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    textarea.style.top = '-9999px'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    
    textarea.focus()
    textarea.select()
    
    const success = document.execCommand('copy')
    document.body.removeChild(textarea)
    
    if (success) {
      console.log('✅ DevTools中使用 execCommand 复制成功')
      return true
    }
  } catch (error) {
    console.warn('❌ DevTools中 execCommand 复制失败:', error)
  }

  // 如果都失败，显示手动复制模态框
  showCopyModal(text, description)
  return false
}