import { useState } from 'react'

import Tabs from './components/Tabs.jsx'
import Status from './components/Status.jsx'
import VpnCradles from './components/VpnCradles.jsx'
import DomainsTab from './components/DomainsTab.jsx'
import VlessTab from './components/VlessTab.jsx'
import ClientsTab from './components/ClientsTab.jsx'

export default function App() {
  const [tab, setTab] = useState('domains')
  const [status, setStatus] = useState({ msg: '…', ok: null })

  return (
    <>
      <header className="header">
        <h1 className="title">Sing-box WebUI</h1>
        <Tabs tab={tab} setTab={setTab} />
        <VpnCradles setStatus={setStatus} />
        <Status status={status} />
      </header>

      <main className="main">
        {tab === 'domains' && <DomainsTab setStatus={setStatus} />}
        {tab === 'vless' && <VlessTab setStatus={setStatus} />}
        {tab === 'clients' && <ClientsTab />}
      </main>
    </>
  )
}
