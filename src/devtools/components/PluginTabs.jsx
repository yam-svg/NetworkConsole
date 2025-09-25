import { memo } from 'react'

const PluginTabs = memo(({ activeTab, onTabChange, tabs }) => {
  return (
    <div className="plugin-tabs">
      {tabs.map(tab => (
        <button
          key={tab.id}
          className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
})

PluginTabs.displayName = 'PluginTabs'

export default PluginTabs