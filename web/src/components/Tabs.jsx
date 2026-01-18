export default function Tabs({ tab, setTab }) {
  const mk = (id, label) => (
    <button className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
      {label}
    </button>
  )
  return (
    <div className="tabs">
      {mk('domains', 'Domainss')}
      {mk('vless', 'VLESS')}
      {mk('clients', 'Clients')}
    </div>
  )
}
