// 响应内容编码处理工具
// 处理 gzip、deflate 等压缩格式

/**
 * 响应内容编码处理器
 */
export class ResponseContentProcessor {
  constructor() {
    // 检查是否支持 CompressionStream 和 DecompressionStream
    this.supportsCompressionStreams = typeof CompressionStream !== 'undefined' 
      && typeof DecompressionStream !== 'undefined'
  }

  /**
   * 检测内容编码类型
   * @param {Object} headers - 响应头对象
   * @returns {string} - 编码类型 ('gzip', 'deflate', 'br', 'identity')
   */
  detectContentEncoding(headers) {
    if (!headers) return 'identity'

    let contentEncoding = ''
    
    // 处理不同的headers格式
    if (Array.isArray(headers)) {
      // webRequest API 格式
      const encodingHeader = headers.find(h => 
        h.name.toLowerCase() === 'content-encoding'
      )
      contentEncoding = encodingHeader?.value || ''
    } else {
      // 对象格式
      for (const [key, value] of Object.entries(headers)) {
        if (key.toLowerCase() === 'content-encoding') {
          contentEncoding = value
          break
        }
      }
    }

    contentEncoding = contentEncoding.toLowerCase().trim()
    
    if (contentEncoding.includes('gzip')) return 'gzip'
    if (contentEncoding.includes('deflate')) return 'deflate'
    if (contentEncoding.includes('br')) return 'br'
    
    return 'identity'
  }

  /**
   * 解压缩响应内容
   * @param {string|ArrayBuffer} content - 压缩的内容
   * @param {string} encoding - 编码类型
   * @param {boolean} isBase64 - 是否是 base64 编码
   * @returns {Promise<string>} - 解压缩后的内容
   */
  async decompressContent(content, encoding, isBase64 = false) {
    try {
      console.log('🗜️ 开始解压缩内容:', { encoding, isBase64, contentLength: content?.length })

      if (encoding === 'identity' || !encoding) {
        // 无压缩，直接返回
        return isBase64 ? this.base64ToText(content) : content
      }

      let binaryData
      
      if (isBase64) {
        // 从 base64 解码为二进制数据
        binaryData = this.base64ToArrayBuffer(content)
      } else if (typeof content === 'string') {
        // 字符串转为 ArrayBuffer
        binaryData = new TextEncoder().encode(content)
      } else {
        // 已经是 ArrayBuffer
        binaryData = content
      }

      // 根据编码类型进行解压缩
      let decompressed
      switch (encoding) {
        case 'gzip':
          decompressed = await this.decompressGzip(binaryData)
          break
        case 'deflate':
          decompressed = await this.decompressDeflate(binaryData)
          break
        case 'br':
          // Brotli 压缩暂不支持，返回原内容
          console.warn('⚠️ Brotli 压缩暂不支持解压缩')
          return isBase64 ? this.base64ToText(content) : content
        default:
          // 未知编码，返回原内容
          return isBase64 ? this.base64ToText(content) : content
      }

      // 将解压缩后的数据转为文本
      const decodedText = new TextDecoder('utf-8').decode(decompressed)
      console.log('✅ 解压缩完成:', { 
        originalLength: binaryData.length, 
        decompressedLength: decodedText.length 
      })

      return decodedText

    } catch (error) {
      console.error('❌ 解压缩失败:', error)
      // 解压缩失败，返回原内容
      return isBase64 ? this.base64ToText(content) : content
    }
  }

  /**
   * 压缩响应内容
   * @param {string} content - 要压缩的文本内容
   * @param {string} encoding - 目标编码类型
   * @param {boolean} returnBase64 - 是否返回 base64 编码
   * @returns {Promise<string|ArrayBuffer>} - 压缩后的内容
   */
  async compressContent(content, encoding, returnBase64 = false) {
    try {
      console.log('🗜️ 开始压缩内容:', { encoding, contentLength: content.length })

      if (encoding === 'identity' || !encoding) {
        // 无需压缩
        return content
      }

      // 将文本转为 ArrayBuffer
      const textData = new TextEncoder().encode(content)

      // 根据编码类型进行压缩
      let compressed
      switch (encoding) {
        case 'gzip':
          compressed = await this.compressGzip(textData)
          break
        case 'deflate':
          compressed = await this.compressDeflate(textData)
          break
        case 'br':
          // Brotli 压缩暂不支持
          console.warn('⚠️ Brotli 压缩暂不支持')
          return content
        default:
          return content
      }

      console.log('✅ 压缩完成:', { 
        originalLength: textData.length, 
        compressedLength: compressed.byteLength 
      })

      // 返回 base64 或 ArrayBuffer
      return returnBase64 ? this.arrayBufferToBase64(compressed) : compressed

    } catch (error) {
      console.error('❌ 压缩失败:', error)
      return content
    }
  }

  /**
   * 使用 gzip 解压缩
   * @param {ArrayBuffer} data - 压缩数据
   * @returns {Promise<ArrayBuffer>} - 解压缩后的数据
   */
  async decompressGzip(data) {
    if (this.supportsCompressionStreams) {
      return this.streamDecompress(data, 'gzip')
    } else {
      // 降级到基础解压缩（如果可用）
      return this.fallbackDecompress(data, 'gzip')
    }
  }

  /**
   * 使用 deflate 解压缩
   * @param {ArrayBuffer} data - 压缩数据
   * @returns {Promise<ArrayBuffer>} - 解压缩后的数据
   */
  async decompressDeflate(data) {
    if (this.supportsCompressionStreams) {
      return this.streamDecompress(data, 'deflate')
    } else {
      return this.fallbackDecompress(data, 'deflate')
    }
  }

  /**
   * 使用 gzip 压缩
   * @param {ArrayBuffer} data - 原始数据
   * @returns {Promise<ArrayBuffer>} - 压缩后的数据
   */
  async compressGzip(data) {
    if (this.supportsCompressionStreams) {
      return this.streamCompress(data, 'gzip')
    } else {
      throw new Error('gzip 压缩不支持')
    }
  }

  /**
   * 使用 deflate 压缩
   * @param {ArrayBuffer} data - 原始数据
   * @returns {Promise<ArrayBuffer>} - 压缩后的数据
   */
  async compressDeflate(data) {
    if (this.supportsCompressionStreams) {
      return this.streamCompress(data, 'deflate')
    } else {
      throw new Error('deflate 压缩不支持')
    }
  }

  /**
   * 使用流 API 进行解压缩
   * @param {ArrayBuffer} data - 压缩数据
   * @param {string} format - 压缩格式
   * @returns {Promise<ArrayBuffer>} - 解压缩后的数据
   */
  async streamDecompress(data, format) {
    const decompressor = new DecompressionStream(format)
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(data))
        controller.close()
      }
    })

    const decompressedStream = stream.pipeThrough(decompressor)
    const chunks = []

    const reader = decompressedStream.getReader()
    let done = false
    while (!done) {
      const result = await reader.read()
      done = result.done
      if (!done) {
        chunks.push(result.value)
      }
    }

    // 合并所有块
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
    const result = new Uint8Array(totalLength)
    let offset = 0
    for (const chunk of chunks) {
      result.set(chunk, offset)
      offset += chunk.length
    }

    return result.buffer
  }

  /**
   * 使用流 API 进行压缩
   * @param {ArrayBuffer} data - 原始数据
   * @param {string} format - 压缩格式
   * @returns {Promise<ArrayBuffer>} - 压缩后的数据
   */
  async streamCompress(data, format) {
    const compressor = new CompressionStream(format)
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(data))
        controller.close()
      }
    })

    const compressedStream = stream.pipeThrough(compressor)
    const chunks = []

    const reader = compressedStream.getReader()
    let done = false
    while (!done) {
      const result = await reader.read()
      done = result.done
      if (!done) {
        chunks.push(result.value)
      }
    }

    // 合并所有块
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
    const result = new Uint8Array(totalLength)
    let offset = 0
    for (const chunk of chunks) {
      result.set(chunk, offset)
      offset += chunk.length
    }

    return result.buffer
  }

  /**
   * 降级解压缩（当现代 API 不可用时）
   * @param {ArrayBuffer} data - 压缩数据
   * @param {string} format - 压缩格式
   * @returns {Promise<ArrayBuffer>} - 尝试解压缩后的数据
   */
  async fallbackDecompress(data, format) {
    console.warn(`⚠️ ${format} 解压缩功能在当前环境中不可用，返回原始数据`)
    return data
  }

  /**
   * Base64 转 ArrayBuffer
   * @param {string} base64 - Base64 字符串
   * @returns {ArrayBuffer} - 二进制数据
   */
  base64ToArrayBuffer(base64) {
    const binaryString = atob(base64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    return bytes.buffer
  }

  /**
   * ArrayBuffer 转 Base64
   * @param {ArrayBuffer} buffer - 二进制数据
   * @returns {string} - Base64 字符串
   */
  arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer)
    let binaryString = ''
    for (let i = 0; i < bytes.length; i++) {
      binaryString += String.fromCharCode(bytes[i])
    }
    return btoa(binaryString)
  }

  /**
   * Base64 转文本
   * @param {string} base64 - Base64 字符串
   * @returns {string} - 文本内容
   */
  base64ToText(base64) {
    try {
      const binaryString = atob(base64)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      return new TextDecoder('utf-8').decode(bytes)
    } catch (error) {
      console.error('Base64 解码失败:', error)
      return base64 // 返回原始内容
    }
  }

  /**
   * 检查内容是否可能是文本
   * @param {string} contentType - Content-Type 头
   * @returns {boolean} - 是否是文本类型
   */
  isTextContent(contentType) {
    if (!contentType) return false
    
    const textTypes = [
      'text/', 
      'application/json', 
      'application/xml',
      'application/javascript',
      'application/x-javascript'
    ]
    
    return textTypes.some(type => contentType.toLowerCase().includes(type))
  }

  /**
   * 处理响应体
   * @param {Object} responseBody - 响应体对象
   * @param {Object} headers - 响应头
   * @returns {Promise<Object>} - 处理后的响应体信息
   */
  async processResponseBody(responseBody, headers) {
    const result = {
      content: '',
      originalContent: responseBody?.content || '',
      isCompressed: false,
      encoding: 'identity',
      isBase64: responseBody?.base64Encoded || false,
      isText: false,
      error: null
    }

    try {
      // 检测编码
      result.encoding = this.detectContentEncoding(headers)
      result.isCompressed = result.encoding !== 'identity'

      // 检测内容类型
      const contentType = this.getHeaderValue(headers, 'content-type') || ''
      result.isText = this.isTextContent(contentType)

      if (result.isCompressed && result.isText) {
        // 解压缩文本内容
        result.content = await this.decompressContent(
          result.originalContent, 
          result.encoding, 
          result.isBase64
        )
      } else if (result.isBase64 && result.isText) {
        // 解码 base64 文本
        result.content = this.base64ToText(result.originalContent)
      } else {
        // 直接使用原内容
        result.content = result.originalContent
      }

      console.log('📦 响应体处理完成:', {
        encoding: result.encoding,
        isCompressed: result.isCompressed,
        isBase64: result.isBase64,
        isText: result.isText,
        originalLength: result.originalContent.length,
        processedLength: result.content.length
      })

    } catch (error) {
      console.error('❌ 响应体处理失败:', error)
      result.error = error.message
      result.content = result.originalContent // 降级到原内容
    }

    return result
  }

  /**
   * 获取头部值
   * @param {Object|Array} headers - 响应头
   * @param {string} name - 头部名称
   * @returns {string|null} - 头部值
   */
  getHeaderValue(headers, name) {
    if (!headers) return null
    
    const lowerName = name.toLowerCase()
    
    if (Array.isArray(headers)) {
      const header = headers.find(h => h.name.toLowerCase() === lowerName)
      return header?.value || null
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
}

// 导出单例
export const responseContentProcessor = new ResponseContentProcessor()
export default responseContentProcessor