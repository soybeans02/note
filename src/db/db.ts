import Dexie, { type Table } from 'dexie'

export interface Folder {
  id: string
  name: string
  parentId: string | null
  order: number
  createdAt: number
  updatedAt: number
}

export interface DocumentMeta {
  id: string
  folderId: string | null
  name: string
  size: number
  pageCount: number
  thumbDataUrl: string
  order: number
  createdAt: number
  updatedAt: number
}

export interface DocumentBlob {
  id: string
  blob: Blob
}

class NoteDB extends Dexie {
  folders!: Table<Folder, string>
  documents!: Table<DocumentMeta, string>
  blobs!: Table<DocumentBlob, string>

  constructor() {
    super('note-db')
    this.version(1).stores({
      folders: 'id, parentId, name, updatedAt',
      documents: 'id, folderId, name, updatedAt',
      blobs: 'id',
    })
    this.version(2)
      .stores({
        folders: 'id, parentId, name, order, updatedAt',
        documents: 'id, folderId, name, order, updatedAt',
        blobs: 'id',
      })
      .upgrade(async (tx) => {
        // Backfill `order` based on existing updatedAt-desc grouping per folder
        const assignOrders = async (
          table: 'folders' | 'documents',
          groupKey: 'parentId' | 'folderId',
        ) => {
          const rows = await tx.table(table).toArray()
          const groups = new Map<string | null, any[]>()
          for (const r of rows) {
            const key = (r[groupKey] ?? null) as string | null
            if (!groups.has(key)) groups.set(key, [])
            groups.get(key)!.push(r)
          }
          for (const group of groups.values()) {
            group.sort((a, b) => b.updatedAt - a.updatedAt)
            for (let i = 0; i < group.length; i++) {
              await tx.table(table).update(group[i].id, { order: i })
            }
          }
        }
        await assignOrders('documents', 'folderId')
        await assignOrders('folders', 'parentId')
      })
  }
}

export const db = new NoteDB()

export const uid = () =>
  (crypto.randomUUID?.() ??
    Math.random().toString(36).slice(2) + Date.now().toString(36))
