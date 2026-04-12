import { useLiveQuery } from 'dexie-react-hooks'
import { db, uid, type Folder } from '../db/db'

export function useAllFolders(): Folder[] {
  return useLiveQuery(() => db.folders.orderBy('name').toArray(), [], []) ?? []
}

export async function createFolder(name: string, parentId: string | null) {
  const now = Date.now()
  const siblings = (await db.folders.toArray()).filter(
    (f) => (f.parentId ?? null) === parentId,
  )
  const order = siblings.length
    ? Math.max(...siblings.map((f) => f.order ?? 0)) + 1
    : 0
  const folder: Folder = {
    id: uid(),
    name: name.trim() || '無題のフォルダ',
    parentId,
    order,
    createdAt: now,
    updatedAt: now,
  }
  await db.folders.add(folder)
  return folder
}

export async function renameFolder(id: string, name: string) {
  await db.folders.update(id, { name: name.trim() || '無題', updatedAt: Date.now() })
}

export async function moveFolder(id: string, newParentId: string | null) {
  if (id === newParentId) return
  // prevent moving into own descendant
  const all = await db.folders.toArray()
  const isDescendant = (candidateId: string | null): boolean => {
    let cur = candidateId
    while (cur) {
      if (cur === id) return true
      const parent = all.find((f) => f.id === cur)
      cur = parent?.parentId ?? null
    }
    return false
  }
  if (newParentId && isDescendant(newParentId)) return
  await db.folders.update(id, { parentId: newParentId, updatedAt: Date.now() })
}

/** Recursively delete folder, its subfolders, and all contained documents/blobs. */
export async function deleteFolder(id: string) {
  const all = await db.folders.toArray()
  const toDelete = new Set<string>()
  const collect = (fid: string) => {
    toDelete.add(fid)
    for (const f of all) if (f.parentId === fid) collect(f.id)
  }
  collect(id)

  await db.transaction('rw', db.folders, db.documents, db.blobs, async () => {
    const docs = await db.documents.where('folderId').anyOf([...toDelete]).toArray()
    const docIds = docs.map((d) => d.id)
    await db.blobs.bulkDelete(docIds)
    await db.documents.bulkDelete(docIds)
    await db.folders.bulkDelete([...toDelete])
  })
}
