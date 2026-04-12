import { type Folder } from '../db/db'

export interface FolderChoice {
  id: string
  path: string
}

/** Flat list of folders with full slash-separated paths, sorted by path. */
export function flatFolderList(folders: Folder[]): FolderChoice[] {
  const map = new Map(folders.map((f) => [f.id, f]))
  const pathOf = (f: Folder): string => {
    const parts: string[] = [f.name]
    let cur: Folder | undefined = f.parentId ? map.get(f.parentId) : undefined
    const seen = new Set<string>()
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id)
      parts.unshift(cur.name)
      cur = cur.parentId ? map.get(cur.parentId) : undefined
    }
    return parts.join(' / ')
  }
  return folders
    .map((f) => ({ id: f.id, path: pathOf(f) }))
    .sort((a, b) => a.path.localeCompare(b.path, 'ja'))
}

/** Show a numbered prompt for choosing a destination folder (or root). */
export function pickFolder(
  title: string,
  folders: Folder[],
  excludeId?: string,
): { id: string | null } | null {
  const list = flatFolderList(folders).filter((f) => f.id !== excludeId)
  const lines = ['0: ルート (フォルダなし)', ...list.map((f, i) => `${i + 1}: ${f.path}`)]
  const choice = prompt(`${title}\n\n${lines.join('\n')}\n\n番号を入力`)
  if (choice === null) return null
  const n = parseInt(choice, 10)
  if (Number.isNaN(n)) return null
  if (n === 0) return { id: null }
  if (n >= 1 && n <= list.length) return { id: list[n - 1].id }
  return null
}
