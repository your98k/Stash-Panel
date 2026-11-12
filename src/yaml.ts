// Stash proxy-providers import. Deliberately parses only provider mappings;
// no YAML tags, aliases or arbitrary object construction is evaluated.
export type ImportedSub = { name: string; url: string }

function scalar(value: string): string {
  const s = value.trim()
  if (s.startsWith('"') && s.endsWith('"')) {
    try { return JSON.parse(s) } catch { throw new Error('YAML 双引号字符串格式错误') }
  }
  if (s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1).replace(/''/g, "'")
  return s.replace(/\s+#.*$/, '').trim()
}

function pair(line: string): [string, string] | null {
  let quote = ''
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quote) { if (c === quote && line[i - 1] !== '\\') quote = ''; continue }
    if (c === '"' || c === "'") { quote = c; continue }
    if (c === ':' && (i + 1 === line.length || /\s/.test(line[i + 1]))) return [scalar(line.slice(0, i)), line.slice(i + 1).trim()]
  }
  return null
}

function fields(line: string): string[] {
  const out: string[] = []
  let quote = '', depth = 0, start = 0
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quote) { if (c === quote && line[i - 1] !== '\\') quote = ''; continue }
    if (c === '"' || c === "'") { quote = c; continue }
    if ('[{'.includes(c)) depth++
    if (']}'.includes(c)) depth--
    if (c === ',' && depth === 0) { out.push(line.slice(start, i)); start = i + 1 }
  }
  out.push(line.slice(start))
  return out
}

export function parseProviderYAML(text: string): ImportedSub[] {
  const out: ImportedSub[] = []
  let root = -1, providerIndent = -1, name = '', url = '', headersIndent = -1
  let headers: Record<string, string> = {}
  const finish = () => {
    if (name && /^https?:\/\//i.test(url)) out.push({ name, url: Object.keys(headers).length ? `${url.split('#')[0]}#headers=${encodeURIComponent(JSON.stringify(headers))}` : url })
    name = ''; url = ''; headers = {}; headersIndent = -1
  }
  for (const original of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (!original.trim() || original.trim().startsWith('#')) continue
    if (/^\s*\t/.test(original)) throw new Error('YAML 缩进不能使用 Tab')
    const indent = original.length - original.trimStart().length
    const kv = pair(original.trim())
    if (root < 0) {
      if (kv?.[0] === 'proxy-providers') { root = indent; providerIndent = -1 }
      continue
    }
    if (indent <= root) { finish(); root = -1; continue }
    if (!kv) continue
    if (providerIndent < 0) providerIndent = indent
    if (indent === providerIndent) {
      finish(); name = kv[0]
      if (kv[1].startsWith('{') && kv[1].endsWith('}')) {
        for (const entry of fields(kv[1].slice(1, -1))) {
          const field = pair(entry.trim())
          if (field?.[0] === 'url') url = scalar(field[1])
        }
      }
    } else if (name && indent > providerIndent) {
      if (headersIndent >= 0 && indent > headersIndent) {
        const value = scalar(kv[1])
        // Stash header lists: accept a single inline list item as a string.
        headers[kv[0]] = value.startsWith('[') && value.endsWith(']') ? scalar(value.slice(1, -1)) : value
      } else {
        headersIndent = -1
        if (kv[0] === 'url') url = scalar(kv[1])
        if (kv[0] === 'headers' && !kv[1]) headersIndent = indent
      }
    }
  }
  finish()
  return out
}
