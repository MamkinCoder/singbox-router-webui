export function cleanError(error) {
  const raw = error?.message ?? String(error)
  return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}
