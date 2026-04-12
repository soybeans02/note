import { useMemo, useState } from 'react'
import Sidebar from './components/Sidebar'
import Toolbar from './components/Toolbar'
import DocumentGrid from './components/DocumentGrid'
import UploadDropZone from './components/UploadDropZone'
import PdfViewer from './components/PdfViewer'
import { useAllFolders } from './hooks/useFolders'
import { useDocumentsInFolder } from './hooks/useDocuments'
import { type DocumentMeta } from './db/db'

export default function App() {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [openDoc, setOpenDoc] = useState<DocumentMeta | null>(null)

  const folders = useAllFolders()
  const documents = useDocumentsInFolder(selectedFolderId, search)

  const folderLabel = useMemo(() => {
    if (selectedFolderId === null) return 'すべて'
    return folders.find((f) => f.id === selectedFolderId)?.name ?? '(削除済み)'
  }, [folders, selectedFolderId])

  return (
    <div className="h-full flex">
      <Sidebar
        selectedFolderId={selectedFolderId}
        onSelect={setSelectedFolderId}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <Toolbar search={search} onSearch={setSearch} folderLabel={folderLabel} />
        <UploadDropZone folderId={selectedFolderId} onOpenDoc={setOpenDoc}>
          <DocumentGrid documents={documents} folders={folders} onOpen={setOpenDoc} />
        </UploadDropZone>
      </div>
      {openDoc && <PdfViewer doc={openDoc} onClose={() => setOpenDoc(null)} />}
    </div>
  )
}
