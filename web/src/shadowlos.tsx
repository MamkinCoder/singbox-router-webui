import type { ButtonHTMLAttributes, ReactNode } from 'react'

import androidIcon from './shadowlos/assets/icons/android.svg?url'
import arrowRightIcon from './shadowlos/assets/icons/arrow-right.svg?url'
import copyIcon from './shadowlos/assets/icons/copy.svg?url'
import desktopIcon from './shadowlos/assets/icons/desktop.svg?url'
import globeIcon from './shadowlos/assets/icons/globe.svg?url'
import infoIcon from './shadowlos/assets/icons/info.svg?url'
import iosIcon from './shadowlos/assets/icons/ios.svg?url'
import keyIcon from './shadowlos/assets/icons/key.svg?url'
import linuxIcon from './shadowlos/assets/icons/linux.svg?url'
import macosIcon from './shadowlos/assets/icons/macos.svg?url'
import settingsIcon from './shadowlos/assets/icons/settings.svg?url'
import shieldIcon from './shadowlos/assets/icons/shield.svg?url'
import starIcon from './shadowlos/assets/icons/star.svg?url'
import telegramIcon from './shadowlos/assets/icons/telegram.svg?url'
import terminalIcon from './shadowlos/assets/icons/terminal.svg?url'
import userIcon from './shadowlos/assets/icons/user.svg?url'
import logoUrl from './shadowlos/assets/logo/shadowlos-mark.svg'

const iconUrls: Record<string, string> = {
  android: androidIcon,
  'arrow-right': arrowRightIcon,
  copy: copyIcon,
  desktop: desktopIcon,
  globe: globeIcon,
  info: infoIcon,
  ios: iosIcon,
  key: keyIcon,
  linux: linuxIcon,
  macos: macosIcon,
  settings: settingsIcon,
  shield: shieldIcon,
  star: starIcon,
  telegram: telegramIcon,
  terminal: terminalIcon,
  user: userIcon,
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 's' | 'm'
  iconLeft?: ReactNode
}

export function Button({ tone = 'secondary', size = 'm', iconLeft, className = '', children, ...props }: ButtonProps) {
  return (
    <button className={`btn ${tone} ${size === 's' ? 'small' : ''} ${className}`} {...props}>
      {iconLeft}
      <span>{children}</span>
    </button>
  )
}

type SwitchProps = {
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
  label?: string
}

export function Switch({ checked, disabled = false, onChange, label }: SwitchProps) {
  return (
    <button
      type="button"
      className={`switch ${checked ? 'on' : ''}`}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        if (!disabled) onChange(!checked)
      }}
    >
      <span className="switch-knob" />
    </button>
  )
}

type TagProps = {
  tone?: 'accent' | 'success' | 'danger' | 'muted'
  children: ReactNode
}

export function Tag({ tone = 'muted', children }: TagProps) {
  return <span className={`tag ${tone}`}>{children}</span>
}

type IconProps = {
  name: string
  size?: number
  color?: string
  className?: string
}

export function Ic({ name, size = 24, color = 'currentColor', className = '' }: IconProps) {
  const url = iconUrls[name] || iconUrls.desktop
  return (
    <img
      aria-hidden="true"
      className={`ic ${className}`}
      src={url}
      alt=""
      style={{
        width: size,
        height: size,
        opacity: color.includes('tertiary') ? 0.72 : 1,
      }}
    />
  )
}

export type Region = {
  id: string
  flag: string
  emoji?: string
  raw?: string
  name: string
  meta: string
  ping: string
}

export function Flag({ code = 'auto', emoji }: { code?: string; emoji?: string }) {
  if (emoji) return <span className="flag emoji">{emoji}</span>
  const box = { className: 'flag', viewBox: '0 0 24 18', preserveAspectRatio: 'none' }
  if (code === 'nl') return <svg {...box}><rect width="24" height="6" fill="#AE1C28" /><rect y="6" width="24" height="6" fill="#fff" /><rect y="12" width="24" height="6" fill="#21468B" /></svg>
  if (code === 'de') return <svg {...box}><rect width="24" height="6" fill="#000" /><rect y="6" width="24" height="6" fill="#DD0000" /><rect y="12" width="24" height="6" fill="#FFCE00" /></svg>
  if (code === 'fi') return <svg {...box}><rect width="24" height="18" fill="#fff" /><rect y="6.5" width="24" height="5" fill="#003580" /><rect x="6.5" width="5" height="18" fill="#003580" /></svg>
  return (
    <span className="flag auto">
      <Ic name="globe" size={14} color="var(--text-secondary)" />
    </span>
  )
}

export function Logo() {
  return (
    <div className="brand">
      <img src={logoUrl} alt="" className="brand-mark" />
      <span className="brand-word">Shadowlos</span>
    </div>
  )
}

export function StatusDot({ kind }: { kind?: 'ok' | 'bad' | 'busy' | null }) {
  return <span className={`status-dot ${kind || ''}`} />
}
