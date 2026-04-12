import JSZip from 'jszip'
import {
  db,
  uid,
  type Folder,
  type DocumentMeta,
  type Annotation,
  type NotePage,
} from '../db/db'

interface BackupManifestV1 {
  version: 1
  exportedAt: number
  folders: Folder[]
  documents: DocumentMeta[]
}

interface BackupManifestV2 {
  version: 2
  exportedAt: number
  folders: Folder[]
  documents: DocumentMeta[]
  annotations: Annotation[]
  notePages: NotePage[]
}

type BackupManifest = BackupManifestV1 | BackupManifestV2

export async function exportAll(): Promise<Blob> {
  const zip = new JSZip()
  const folders = await db.folders.toArray()
  const documents = await db.documents.toArray()
  const annotations = await db.annotations.toArray()
  const notePages = await db.notePages.toArray()
  const manifest: BackupManifestV2 = {
    version: 2,
    exportedAt: Date.now(),
    folders,
    documents,
    annotations,
    notePages,
  }
  zip.file('manifest.json', JSON.stringify(manifest, null, 2))
  const blobsFolder = zip.folder('blobs')!
  for (const doc of documents) {
    const row = await db.blobs.get(doc.id)
    if (row) blobsFolder.file(`${doc.id}.pdf`, row.blob)
  }
  return zip.generateAsync({ type: 'blob' })
}

export async function importAll(
  file: File,
): Promise<{ folders: number; documents: number }> {
  const zip = await JSZip.loadAsync(file)
  const manifestFile = zip.file('manifest.json')
  if (!manifestFile) throw new Error('manifest.json が見つかりません')
  const manifest = JSON.parse(
    await manifestFile.async('string'),
  ) as BackupManifest

  if (manifest.version !== 1 && manifest.version !== 2)
    throw new Error('未対応のバックアップ形式です')

  await db.transaction(
    'rw',
    [db.folders, db.documents, db.blobs, db.annotations, db.notePages],
    async () => {
      await db.folders.bulkPut(manifest.folders)
      await db.documents.bulkPut(manifest.documents)

      for (const doc of manifest.documents) {
        const entry = zip.file(`blobs/${doc.id}.pdf`)
        if (!entry) continue
        const blob = await entry.async('blob')
        await db.blobs.put({ id: doc.id, blob })
      }

      if (manifest.version === 2) {
        await db.annotations.bulkPut(manifest.annotations)
        await db.notePages.bulkPut(manifest.notePages)
      } else {
        // v1: migrate old notes field to notePages
        for (const doc of manifest.documents) {
          if (doc.notes && doc.notes.trim()) {
            const id = uid()
            const now = Date.now()
            await db.notePages.put({
              id,
              documentId: doc.id,
              afterPage: doc.pageCount || 0,
              content: doc.notes,
              createdAt: now,
              updatedAt: now,
            })
          }
        }
      }
    },
  )

  return { folders: manifest.folders.length, documents: manifest.documents.length }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
