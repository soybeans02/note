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
  notes: string
  createdAt: number
  updatedAt: number
}

export interface DocumentBlob {
  id: string
  blob: Blob
}

export interface Stroke {
  id: string
  points: [number, number, number][] // [x, y, pressure] 0-1 normalized
  color: string
  width: number
  tool?: 'pen' | 'highlighter'
}

export interface TextBox {
  id: string
  x: number // 0-1 normalized
  y: number // 0-1 normalized
  width?: number // 0-1 normalized
  text: string
  color: string
  fontSize: number // in px at base scale
  bold?: boolean
}

export interface Annotation {
  id: string // `${docId}-${pageNum}`
  docId: string
  pageNum: number
  strokes: Stroke[]
  textBoxes?: TextBox[]
  updatedAt: number
}

export interface NotePage {
  id: string
  documentId: string
  afterPage: number // 0=before first, N=after PDF page N
  content: string
  createdAt: number
  updatedAt: number
}

export interface ImagePage {
  id: string
  documentId: string
  afterPage: number
  blob: Blob
  createdAt: number
  updatedAt: number
}

class NoteDB extends Dexie {
  folders!: Table<Folder, string>
  documents!: Table<DocumentMeta, string>
  blobs!: Table<DocumentBlob, string>
  annotations!: Table<Annotation, string>
  notePages!: Table<NotePage, string>
  imagePages!: Table<ImagePage, string>

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
    this.version(3)
      .stores({
        folders: 'id, parentId, name, order, updatedAt',
        documents: 'id, folderId, name, order, updatedAt',
        blobs: 'id',
      })
      .upgrade(async (tx) => {
        await tx
          .table('documents')
          .toCollection()
          .modify((doc: any) => {
            if (doc.notes === undefined) doc.notes = ''
          })
      })
    this.version(4)
      .stores({
        folders: 'id, parentId, name, order, updatedAt',
        documents: 'id, folderId, name, order, updatedAt',
        blobs: 'id',
        annotations: 'id, docId, pageNum',
        notePages: 'id, documentId, afterPage',
      })
      .upgrade(async (tx) => {
        // Migrate existing DocumentMeta.notes → notePages table
        const docs = await tx.table('documents').toArray()
        for (const doc of docs) {
          if (doc.notes && doc.notes.trim()) {
            const id =
              crypto.randomUUID?.() ??
              Math.random().toString(36).slice(2) + Date.now().toString(36)
            const now = Date.now()
            await tx.table('notePages').add({
              id,
              documentId: doc.id,
              afterPage: doc.pageCount || 0,
              content: doc.notes,
              createdAt: now,
              updatedAt: now,
            })
            // Clear the old notes field but keep it for compatibility
            await tx.table('documents').update(doc.id, { notes: '' })
          }
        }
      })
    this.version(5).stores({
      folders: 'id, parentId, name, order, updatedAt',
      documents: 'id, folderId, name, order, updatedAt',
      blobs: 'id',
      annotations: 'id, docId, pageNum',
      notePages: 'id, documentId, afterPage',
      imagePages: 'id, documentId, afterPage',
    })
  }
}

export const db = new NoteDB()

export const uid = () =>
  (crypto.randomUUID?.() ??
    Math.random().toString(36).slice(2) + Date.now().toString(36))
