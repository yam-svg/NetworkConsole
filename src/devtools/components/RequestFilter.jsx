import { memo } from 'react'

const RequestFilter = memo(({ filter, onFilterChange }) => {
  const handleTypeChange = (e) => {
    onFilterChange({
      ...filter,
      type: e.target.value
    })
  }

  const handleStatusChange = (e) => {
    onFilterChange({
      ...filter,
      status: e.target.value
    })
  }

  return (
    <div className="request-filter">
      <div className="filter-group">
        <label>类型:</label>
        <select value={filter.type} onChange={handleTypeChange}>
          <option value="all">全部</option>
          <option value="xhr">XHR</option>
          <option value="fetch">Fetch</option>
          <option value="script">Script</option>
          <option value="stylesheet">CSS</option>
          <option value="image">Image</option>
          <option value="document">Document</option>
          <option value="other">Other</option>
        </select>
      </div>

      <div className="filter-group">
        <label>状态:</label>
        <select value={filter.status} onChange={handleStatusChange}>
          <option value="all">全部</option>
          <option value="success">成功 (2xx)</option>
          <option value="error">错误 (4xx/5xx)</option>
          <option value="pending">进行中</option>
        </select>
      </div>
    </div>
  )
})

RequestFilter.displayName = 'RequestFilter'

export default RequestFilter