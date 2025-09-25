import { memo, useMemo } from 'react'

const RequestList = memo(({ requests, selectedRequest, onSelectRequest }) => {
  const formatTime = (timestamp) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString()
  }

  const formatDuration = (duration) => {
    if (!duration) return '-'
    return `${duration}ms`
  }

  const getStatusClass = (status) => {
    if (!status || status === 'pending') return 'pending'
    if (status >= 200 && status < 300) return 'success'
    return 'error'
  }

  const requestItems = useMemo(() => {
    return requests.map(request => (
      <div 
        key={request.id}
        className={`request-item ${selectedRequest?.id === request.id ? 'selected' : ''}`}
        onClick={() => onSelectRequest(request)}
      >
        <span className={`request-method ${request.method}`}>
          {request.method}
        </span>
        <span className={`request-status ${getStatusClass(request.status)}`}>
          {request.status || 'pending'}
        </span>
        <span className="request-url" title={request.url}>
          {request.url}
        </span>
        <span className="request-type">
          {request.requestType}
        </span>
        <span className="request-time">
          {formatTime(request.timestamp)}
        </span>
      </div>
    ))
  }, [requests, selectedRequest, onSelectRequest])

  if (requests.length === 0) {
    return (
      <div className="request-list">
        <div className="empty-state">
          <div>
            <p>没有捕获到网络请求</p>
            <p>请访问一个网页开始监控网络活动</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="request-list">
      <div className="request-list-header">
        <div className="request-list-row">
          <span>方法</span>
          <span>状态</span>
          <span>URL</span>
          <span>类型</span>
          <span>时间</span>
        </div>
      </div>
      <div className="request-list-body">
        {requestItems}
      </div>
    </div>
  )
})

RequestList.displayName = 'RequestList'

export default RequestList