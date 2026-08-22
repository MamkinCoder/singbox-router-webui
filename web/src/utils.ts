export function cleanError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

export function pluralRu(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return forms[2]
  if (b > 1 && b < 5) return forms[1]
  if (b === 1) return forms[0]
  return forms[2]
}

const FLAG_EMOJI_RE = /[\u{1F1E6}-\u{1F1FF}]{2}/u

// Link names ship their country as a flag emoji ("Беларусь 🇧🇾 (ip) #1"), so the
// header can render the flag in its own slot and keep the text clean.
export function splitFlagEmoji(value: string): { emoji: string; text: string } {
  const raw = String(value || '').trim()
  const match = raw.match(FLAG_EMOJI_RE)
  if (!match) return { emoji: '', text: raw }
  const text = raw.replace(match[0], ' ').replace(/\s+/g, ' ').trim()
  return { emoji: match[0], text: text || raw }
}
