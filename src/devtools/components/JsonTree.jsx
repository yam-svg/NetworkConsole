import { useState, memo } from 'react'

const JsonTree = memo(({ data, level = 0 }) => {
  const [collapsed, setCollapsed] = useState(level > 2)

  if (data === null) {
    return <span className="json-null">null</span>
  }

  if (typeof data === 'string') {
    return <span className="json-string">"{data}"</span>
  }

  if (typeof data === 'number') {
    return <span className="json-number">{data}</span>
  }

  if (typeof data === 'boolean') {
    return <span className="json-boolean">{data.toString()}</span>
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return <span className="json-bracket">[]</span>
    }

    return (
      <div className="json-array">
        <span 
          className="json-toggle"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? '▶' : '▼'}
        </span>
        <span className="json-bracket">[</span>
        <span className="json-length">({data.length})</span>
        
        {!collapsed && (
          <div className="json-content">
            {data.map((item, index) => (
              <div key={index} className="json-item">
                <span className="json-index">{index}:</span>
                <JsonTree data={item} level={level + 1} />
                {index < data.length - 1 && <span className="json-comma">,</span>}
              </div>
            ))}
          </div>
        )}
        
        <span className="json-bracket">]</span>
      </div>
    )
  }

  if (typeof data === 'object') {
    const keys = Object.keys(data)
    if (keys.length === 0) {
      return <span className="json-bracket">{}</span>
    }

    return (
      <div className="json-object">
        <span 
          className="json-toggle"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? '▶' : '▼'}
        </span>
        <span className="json-bracket">{'{'}</span>
        <span className="json-length">({keys.length})</span>
        
        {!collapsed && (
          <div className="json-content">
            {keys.map((key, index) => (
              <div key={key} className="json-item">
                <span className="json-key">"{key}":</span>
                <JsonTree data={data[key]} level={level + 1} />
                {index < keys.length - 1 && <span className="json-comma">,</span>}
              </div>
            ))}
          </div>
        )}
        
        <span className="json-bracket">{'}'}</span>
      </div>
    )
  }

  return <span className="json-unknown">{String(data)}</span>
})

JsonTree.displayName = 'JsonTree'

export default JsonTree