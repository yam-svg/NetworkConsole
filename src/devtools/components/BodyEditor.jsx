import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'

const BodyEditor = ({ body, bodyType, onBodyChange, onBodyTypeChange }) => {
  const [bodyParams, setBodyParams] = useState([])

  useEffect(() => {
    if (bodyType === 'form') {
      parseBodyToParams(body)
    }
  }, [body, bodyType])

  const parseBodyToParams = (bodyText) => {
    if (!bodyText) {
      setBodyParams([{ key: '', value: '', enabled: true }])
      return
    }

    try {
      // 尝试解析JSON格式
      if (bodyText.trim().startsWith('{')) {
        const jsonObj = JSON.parse(bodyText)
        const params = Object.entries(jsonObj).map(([key, value]) => ({
          key,
          value: typeof value === 'object' ? JSON.stringify(value) : String(value),
          enabled: true
        }))
        setBodyParams(params.length > 0 ? params : [{ key: '', value: '', enabled: true }])
        return
      }

      // 尝试解析URL编码格式
      if (bodyText.includes('=')) {
        const params = bodyText.split('&').map(param => {
          const [key, value] = param.split('=')
          return {
            key: decodeURIComponent(key || ''),
            value: decodeURIComponent(value || ''),
            enabled: true
          }
        })
        setBodyParams(params.length > 0 ? params : [{ key: '', value: '', enabled: true }])
        return
      }

      // 其他格式，添加一个空参数
      setBodyParams([{ key: '', value: '', enabled: true }])
    } catch (error) {
      // 解析失败，添加一个空参数
      setBodyParams([{ key: '', value: '', enabled: true }])
    }
  }

  const handleParamChange = (index, field, value) => {
    const newParams = [...bodyParams]
    newParams[index] = { ...newParams[index], [field]: value }
    setBodyParams(newParams)
    
    // 更新请求体
    updateBodyFromParams(newParams)
  }

  const addParam = () => {
    const newParams = [...bodyParams, { key: '', value: '', enabled: true }]
    setBodyParams(newParams)
    updateBodyFromParams(newParams)
  }

  const removeParam = (index) => {
    const newParams = bodyParams.filter((_, i) => i !== index)
    setBodyParams(newParams.length > 0 ? newParams : [{ key: '', value: '', enabled: true }])
    updateBodyFromParams(newParams)
  }

  const updateBodyFromParams = (params) => {
    const enabledParams = params.filter(p => p.enabled && p.key.trim())
    
    if (enabledParams.length === 0) {
      onBodyChange('')
      return
    }

    if (bodyType === 'form') {
      // URL编码格式
      const formData = enabledParams
        .map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
        .join('&')
      onBodyChange(formData)
    } else {
      // JSON格式
      const jsonObj = {}
      enabledParams.forEach(p => {
        try {
          // 尝试解析为JSON
          jsonObj[p.key] = JSON.parse(p.value)
        } catch {
          // 作为字符串处理
          jsonObj[p.key] = p.value
        }
      })
      onBodyChange(JSON.stringify(jsonObj, null, 2))
    }
  }

  if (bodyType === 'none') {
    return null
  }

  if (bodyType === 'raw' || bodyType === 'json') {
    return (
      <div className="body-editor">
        <div className="body-editor-toolbar">
          <button
            className="btn"
            onClick={() => {
              try {
                const obj = JSON.parse(body)
                onBodyChange(JSON.stringify(obj, null, 2))
              } catch {
                // 非JSON忽略
              }
            }}
          >
            格式化JSON
          </button>
          <button
            className="btn"
            onClick={() => {
              try {
                const obj = JSON.parse(body)
                onBodyChange(JSON.stringify(obj))
              } catch {
                // 非JSON忽略
              }
            }}
          >
            压缩
          </button>
          <button
            className="btn"
            onClick={() => {
              try {
                const obj = JSON.parse(body)
                const sortKeys = (value) => {
                  if (Array.isArray(value)) return value.map(sortKeys)
                  if (value && typeof value === 'object') {
                    const sorted = {}
                    Object.keys(value).sort().forEach(k => {
                      sorted[k] = sortKeys(value[k])
                    })
                    return sorted
                  }
                  return value
                }
                const sorted = sortKeys(obj)
                onBodyChange(JSON.stringify(sorted, null, 2))
              } catch {
                // 非JSON忽略
              }
            }}
          >
            键排序
          </button>
          {onBodyTypeChange && (
            <button
              className="btn"
              onClick={() => {
                // 尝试把 JSON 转为表单键值对
                try {
                  const obj = JSON.parse(body || '{}')
                  // 简单对象可直接切换
                  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
                    onBodyTypeChange('form')
                  } else {
                    onBodyTypeChange('form')
                  }
                } catch {
                  onBodyTypeChange('form')
                }
              }}
            >
              转为表单
            </button>
          )}
        </div>
        <textarea
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
          placeholder={bodyType === 'json' ? '{"key": "value"}' : '请求体内容'}
          className="body-textarea"
          rows={10}
        />
      </div>
    )
  }

  // form 和 params 模式
  return (
    <div className="body-params-editor">
      <div className="params-header">
        <span>参数</span>
        <button onClick={addParam} className="add-param-button">+ 添加参数</button>
      </div>
      
      <div className="params-list">
        <div className="params-header-row">
          <div className="param-checkbox-header">启用</div>
          <div className="param-key-header">参数名</div>
          <div className="param-value-header">参数值</div>
          <div className="param-action-header">操作</div>
        </div>
        
        {bodyParams.map((param, index) => (
          <div key={index} className="param-row">
            <input
              type="checkbox"
              checked={param.enabled}
              onChange={(e) => handleParamChange(index, 'enabled', e.target.checked)}
              className="param-checkbox"
            />
            <input
              type="text"
              value={param.key}
              onChange={(e) => handleParamChange(index, 'key', e.target.value)}
              placeholder="参数名"
              className="param-key"
            />
            <input
              type="text"
              value={param.value}
              onChange={(e) => handleParamChange(index, 'value', e.target.value)}
              placeholder="参数值"
              className="param-value"
            />
            <button 
              onClick={() => removeParam(index)} 
              className="remove-param-button"
              disabled={bodyParams.length === 1}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      
      <div className="params-preview">
        <h5>预览:</h5>
        <div className="preview-content">
          {body || '(空)'}
        </div>
      </div>
    </div>
  )
}

BodyEditor.propTypes = {
  body: PropTypes.string,
  bodyType: PropTypes.string.isRequired,
  onBodyChange: PropTypes.func.isRequired,
  onBodyTypeChange: PropTypes.func
}

export default BodyEditor