import { Ic } from '../shadowlos'

type Tab = 'routing' | 'vless'

const tabs: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'routing', label: 'Маршрутизация', icon: 'shield' },
  { id: 'vless', label: 'Свой VLESS', icon: 'key' },
]

export default function Tabs({ tab, setTab }: { tab: Tab; setTab: (tab: Tab) => void }) {
  return (
    <nav className="tabsbar">
      <div className="wrap tabnav">
        {tabs.map((t) => (
          <button key={t.id} className={`tabnav-item ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            <Ic name={t.icon} size={18} />
            {t.label}
          </button>
        ))}
      </div>
    </nav>
  )
}

export type AppTab = Tab
