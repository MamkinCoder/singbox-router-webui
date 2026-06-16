import { useEffect, useRef, useState } from 'react'

import api from '../api'
import { Button, Ic, Tag } from '../shadowlos'
import type { SetStatus, VlessTemplate } from '../types'
import { cleanError } from '../utils'

function guessProto(tpl: VlessTemplate): string {
  const text = `${tpl.link || tpl.vless || ''} ${tpl.name || ''}`.trim()
  const m = text.match(/^(vless|vmess|trojan|tuic|ss):\/\//i)
  if (m) return m[1].toLowerCase()
  if (/hysteria2/i.test(text)) return 'hysteria2'
  if (/\[Interface\]/i.test(text)) return 'amneziawg'
  return 'config'
}

export default function VlessTab({ setStatus }: { setStatus: SetStatus }) {
  const [link, setLink] = useState('')
  const [current, setCurrent] = useState('')
  const [templates, setTemplates] = useState<VlessTemplate[]>([])
  const [templateName, setTemplateName] = useState('')
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const refresh = async () => {
    try {
      const cur = await api.get('/sb/api/vless')
      setCurrent(JSON.stringify(cur, null, 2))
    } catch (e) {
      const message = cleanError(e)
      setCurrent(`Error: ${message}`)
      setStatus({ msg: `Текущий outbound не загружен: ${message}`, ok: false })
    }
  }

  const refreshTemplates = async () => {
    setTemplatesLoading(true)
    try {
      const data = await api.get<{ templates?: VlessTemplate[] }>('/sb/api/vless/templates')
      setTemplates(Array.isArray(data.templates) ? data.templates : [])
    } catch (e) {
      setStatus({ msg: `Шаблоны не загружены: ${cleanError(e)}`, ok: false })
    } finally {
      setTemplatesLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    refreshTemplates()
  }, [])

  const loadFile = async (file?: File) => {
    if (!file) return
    try {
      setLink(await file.text())
      setStatus({ msg: `Загружен ${file.name}`, ok: true })
    } catch (e) {
      setStatus({ msg: `Файл не загружен: ${cleanError(e)}`, ok: false })
    }
  }

  const apply = async () => {
    if (!link.trim()) return setStatus({ msg: 'Сначала вставьте VPN-ссылку или JSON outbound', ok: false })
    try {
      setStatus({ msg: 'Применяем конфигурацию и перезапускаем…', ok: null })
      await api.put('/sb/api/vless', { link: link.trim() })
      setStatus({ msg: 'Конфигурация применена', ok: true })
      await refresh()
      await refreshTemplates()
    } catch (e) {
      setStatus({ msg: `VPN не применён: ${cleanError(e)}`, ok: false })
    }
  }

  const saveTemplate = async () => {
    if (!link.trim()) return setStatus({ msg: 'Сначала вставьте VPN-ссылку или JSON outbound', ok: false })
    try {
      setStatus({ msg: 'Сохраняем шаблон…', ok: null })
      await api.post('/sb/api/vless/templates', { name: templateName, link: link.trim() })
      setTemplateName('')
      setStatus({ msg: 'Шаблон сохранён', ok: true })
      await refreshTemplates()
    } catch (e) {
      setStatus({ msg: `Шаблон не сохранён: ${cleanError(e)}`, ok: false })
    }
  }

  const applyTemplate = async (tpl: VlessTemplate) => {
    try {
      setStatus({ msg: `Применяем ${tpl.name}…`, ok: null })
      await api.put('/sb/api/vless', { template_id: tpl.id })
      setStatus({ msg: `Применено: ${tpl.name}`, ok: true })
      await refresh()
    } catch (e) {
      setStatus({ msg: `Шаблон не применён: ${cleanError(e)}`, ok: false })
    }
  }

  const deleteTemplate = async (id: string) => {
    try {
      await api.delete(`/sb/api/vless/templates/${encodeURIComponent(id)}`)
      setStatus({ msg: 'Шаблон удалён', ok: true })
      await refreshTemplates()
    } catch (e) {
      setStatus({ msg: `Шаблон не удалён: ${cleanError(e)}`, ok: false })
    }
  }

  const loadTemplate = async (tpl: VlessTemplate) => {
    try {
      const data = await api.get<VlessTemplate>(`/sb/api/vless/templates/${encodeURIComponent(tpl.id)}`)
      setLink(data.link || data.vless || '')
      setTemplateName(data.name || '')
      setStatus({ msg: `Загружено в редактор: ${data.name || tpl.name}`, ok: true })
    } catch (e) {
      setStatus({ msg: `Шаблон не загружен: ${cleanError(e)}`, ok: false })
    }
  }

  return (
    <>
      <section className="section">
        <div className="section-head">
          <div>
            <h2 className="section-title">Своя конфигурация</h2>
            <p className="section-sub">Вставьте свой ключ <span className="mono">vless://</span>, <span className="mono">tuic://</span>, <span className="mono">hysteria2</span> или JSON outbound.</p>
          </div>
        </div>

        <div className="cols-2">
          <div className="panel">
            <h3 className="panel-title">Ключ или JSON-конфиг</h3>
            <p className="panel-sub">Заменяет <span className="mono">outbounds[tag=vpn]</span> в конфиге sing-box.</p>

            <label
              className={`drop ${dragOver ? 'over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); loadFile(e.dataTransfer.files?.[0]) }}
              onClick={() => fileRef.current?.click()}
            >
              <Ic name="key" size={18} color="var(--text-tertiary)" />
              <span>Перетащите <span className="mono">.conf</span>, <span className="mono">.json</span> или нажмите, чтобы выбрать</span>
              <input ref={fileRef} type="file" accept=".conf,.json,.txt" hidden onChange={(e) => loadFile(e.target.files?.[0])} />
            </label>

            <textarea className="textarea mono" value={link} onChange={(e) => setLink(e.target.value)} placeholder={'vless://… · tuic://… · AmneziaWG .conf · {"type":"hysteria2", …}'} />

            <div className="panel-actions">
              <Button tone="primary" iconLeft={<Ic name="shield" size={20} />} onClick={apply}>Применить и перезапустить</Button>
            </div>

            <hr className="hairline" />
            <div className="save-template">
              <input className="input" value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="Название (необязательно)" />
              <Button tone="secondary" onClick={saveTemplate}>Сохранить себе</Button>
            </div>
          </div>

          <div className="panel">
            <div className="panel-title-row">
              <h3 className="panel-title">Текущий выход</h3>
              <Tag tone="accent">tag=vpn</Tag>
            </div>
            <pre className="pre">{current}</pre>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Сохранённые конфигурации</h2>
        </div>
        <div className="panel templates-panel">
          {templatesLoading ? (
            <div className="muted empty">Загружаем…</div>
          ) : templates.length ? templates.map((tpl) => (
            <div className="tpl-row" key={tpl.id}>
              <span className="device-ic"><Ic name="key" size={20} color="var(--text-secondary)" /></span>
              <div className="tpl-copy">
                <div className="tpl-name">{tpl.name}</div>
                <div className="tpl-id">{guessProto(tpl)} · {tpl.id}</div>
              </div>
              <div className="tpl-actions">
                <Button tone="ghost" size="s" onClick={() => loadTemplate(tpl)}>В редактор</Button>
                <Button tone="secondary" size="s" onClick={() => applyTemplate(tpl)}>Применить</Button>
                <Button tone="ghost" size="s" onClick={() => deleteTemplate(tpl.id)}>Удалить</Button>
              </div>
            </div>
          )) : (
            <div className="muted empty">Пока нет сохранённых конфигураций.</div>
          )}
        </div>
      </section>
    </>
  )
}
