import { useCallback, useEffect, useMemo, useState } from 'react'
import Sidebar from './components/Sidebar'
import Toolbar from './components/Toolbar'
import DocumentGrid from './components/DocumentGrid'
import UploadDropZone from './components/UploadDropZone'
import PdfViewer from './components/PdfViewer'
import { useAllFolders } from './hooks/useFolders'
import { useDocumentsInFolder } from './hooks/useDocuments'
import { type DocumentMeta } from './db/db'

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth < 768)
  useEffect(() => {
    const onResize = () => setMobile(window.innerWidth < 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return mobile
}

export default function App() {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [openDoc, setOpenDoc] = useState<DocumentMeta | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const isMobile = useIsMobile()

  const folders = useAllFolders()
  const documents = useDocumentsInFolder(selectedFolderId, search)

  const folderLabel = useMemo(() => {
    if (selectedFolderId === null) return 'すべて'
    return folders.find((f) => f.id === selectedFolderId)?.name ?? '(削除済み)'
  }, [folders, selectedFolderId])

  const handleSelectFolder = useCallback(
    (id: string | null) => {
      setSelectedFolderId(id)
      if (isMobile) setSidebarOpen(false)
    },
    [isMobile],
  )

  return (
    <div className="h-full flex relative">
      {/* Mobile sidebar overlay */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={
          isMobile
            ? `fixed inset-y-0 left-0 z-40 transition-transform duration-200 ${
                sidebarOpen ? 'translate-x-0' : '-translate-x-full'
              }`
            : ''
        }
      >
        <Sidebar
          selectedFolderId={selectedFolderId}
          onSelect={handleSelectFolder}
        />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <Toolbar
          search={search}
          onSearch={setSearch}
          folderLabel={folderLabel}
          isMobile={isMobile}
          onMenuToggle={() => setSidebarOpen((v) => !v)}
        />
        <UploadDropZone folderId={selectedFolderId} onOpenDoc={setOpenDoc}>
          <DocumentGrid documents={documents} folders={folders} onOpen={setOpenDoc} />
        </UploadDropZone>
      </div>
      {openDoc && <PdfViewer doc={openDoc} onClose={() => setOpenDoc(null)} />}
    </div>
  )
}
