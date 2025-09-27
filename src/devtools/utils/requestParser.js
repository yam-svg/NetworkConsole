/**
 * 请求解析工具
 * 仅支持标准的bash格式cURL命令和JSON配置解析
 * 简单有效，不依赖第三方库
 */

/**
 * 解析标准bash格式cURL命令
 * @param {string} curlCommand - cURL命令字符串
 * @returns {object} 解析后的请求对象
 */
export function parseCurlCommand(curlCommand) {
  try {
    console.log('开始解析cURL命令:', curlCommand)
    
    const result = {
      url: '',
      method: 'GET',
      headers: {},
      body: ''
    }

    // 清理命令，仅处理bash格式
    let cmd = curlCommand
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\\\s*\n\s*/g, ' ') // 处理bash的\\换行连接符
      .replace(/\s+/g, ' ')
      .trim()
    
    // 移除curl前缀
    cmd = cmd.replace(/^curl\s+/i, '')
    
    // 使用简单的正则解析
    const tokens = tokenizeCurl(cmd)
    console.log('Token化结果:', tokens)
    
    // 解析tokens
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]
      
      if (token.startsWith('-')) {
        const nextToken = tokens[i + 1]
        
        switch (token) {
          case '-X':
          case '--request':
            if (nextToken) {
              result.method = nextToken.toUpperCase()
              i++
            }
            break
            
          case '-H':
          case '--header':
            if (nextToken) {
              const header = parseHeader(nextToken)
              if (header) {
                result.headers[header.key] = header.value
              }
              i++
            }
            break
            
          case '-b':
          case '--cookie':
            if (nextToken) {
              result.headers['Cookie'] = cleanQuotes(nextToken)
              i++
            }
            break
            
          case '-d':
          case '--data':
          case '--data-raw':
            if (nextToken) {
              result.body = cleanQuotes(nextToken)
              if (result.method === 'GET') {
                result.method = 'POST'
              }
              i++
            }
            break
        }
      } else if (!result.url && !token.startsWith('-')) {
        result.url = cleanQuotes(token)
      }
    }
    
    // 格式化JSON body
    if (result.body) {
      try {
        const parsed = JSON.parse(result.body)
        result.body = JSON.stringify(parsed, null, 2)
      } catch {
        // 不是JSON格式，保持原样
      }
    }

    console.log('cURL解析完成:', result)
    return result
  } catch (error) {
    console.error('解析cURL命令失败:', error)
    throw new Error('无法解析cURL命令，请使用标准bash格式')
  }
}

/**
 * 简单的cURL token化器（bash格式）
 * @param {string} cmd - 清理后的命令
 * @returns {Array} token数组
 */
function tokenizeCurl(cmd) {
  const tokens = []
  const regex = /"([^"]*)"|'([^']*)'|(\S+)/g
  let match
  
  while ((match = regex.exec(cmd)) !== null) {
    tokens.push(match[1] || match[2] || match[3])
  }
  
  return tokens
}

/**
 * 清理引号
 * @param {string} str - 要清理的字符串
 * @returns {string} 清理后的字符串
 */
function cleanQuotes(str) {
  if (!str) return ''
  return str.replace(/^["']|["']$/g, '')
}

/**
 * 解析请求头
 * @param {string} headerStr - 请求头字符串
 * @returns {object|null} 解析后的请求头
 */
function parseHeader(headerStr) {
  const cleaned = cleanQuotes(headerStr)
  const colonIndex = cleaned.indexOf(':')
  
  if (colonIndex > 0) {
    return {
      key: cleaned.substring(0, colonIndex).trim(),
      value: cleaned.substring(colonIndex + 1).trim()
    }
  }
  
  return null
}

/**
 * 自动检测并解析请求文本
 * @param {string} text - 要解析的文本
 * @returns {object} 解析后的请求对象
 */
export function parseRequestText(text) {
  const trimmedText = text.trim()
  
  // 检测是否为cURL命令
  if (trimmedText.toLowerCase().startsWith('curl ')) {
    return parseCurlCommand(trimmedText)
  }
  
  // 尝试解析为JSON对象
  try {
    const parsed = JSON.parse(trimmedText)
    if (parsed && typeof parsed === 'object') {
      return {
        url: parsed.url || '',
        method: (parsed.method || 'GET').toUpperCase(),
        headers: parsed.headers || {},
        body: typeof parsed.body === 'string' ? parsed.body : JSON.stringify(parsed.body || '', null, 2)
      }
    }
  } catch {
    // 不是JSON，继续其他检测
  }
  
  throw new Error('无法识别的请求格式。支持的格式：bash格式cURL命令、JSON配置对象')
}

/**
 * 示例文本
 */
export const exampleTexts = {
  curl: `curl "https://api.example.com/v1/config" \\
  -H "Accept: application/json" \\
  -H "Accept-Language: zh-CN,zh;q=0.9,en;q=0.8" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" \\
  --data-raw '{"userId":"12345","action":"getConfig"}'`,
  
  json: `{
  "url": "https://api.example.com/v1/orders",
  "method": "POST",
  "headers": {
    "Content-Type": "application/json",
    "Authorization": "Bearer demo-token-12345",
    "X-Request-ID": "req-abc-123"
  },
  "body": "{\\"productId\\":\\"prod-123\\",\\"quantity\\":2,\\"price\\":99.99}"
}`
}