export type DrawTool = 'pen' | 'object-eraser' | 'trace-eraser' | 'text'

interface Props {
  tool: DrawTool
  color: string
  width: number
  fontSize: number
  bold: boolean
  onToolChange: (tool: DrawTool) => void
  onColorChange: (color: string) => void
  onWidthChange: (width: number) => void
  onFontSizeChange: (size: number) => void
  onBoldChange: (bold: boolean) => void
  onDone: () => void
}

const COLORS = [
  { value: '#000000', label: '黒' },
  { value: '#ef4444', label: '赤' },
  { value: '#3b82f6', label: '青' },
  { value: '#22c55e', label: '緑' },
  { value: '#f97316', label: 'オレンジ' },
]

const WIDTHS = [
  { value: 2, label: '細' },
  { value: 4, label: '中' },
  { value: 8, label: '太' },
]

const FONT_SIZES = [
  { value: 12, label: '小' },
  { value: 16, label: '中' },
  { value: 24, label: '大' },
]

const toolBtnClass = (active: boolean) =>
  `w-8 h-8 flex items-center justify-center rounded-lg transition ${
    active
      ? 'bg-white text-black'
      : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
  }`

export default function DrawingToolbar({
  tool,
  color,
  width,
  fontSize,
  bold,
  onToolChange,
  onColorChange,
  onWidthChange,
  onFontSizeChange,
  onBoldChange,
  onDone,
}: Props) {
  const showColorWidth = tool === 'pen' || tool === 'text'

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-neutral-900/95 backdrop-blur-md border border-neutral-800 rounded-2xl px-2.5 py-1.5 shadow-2xl z-20 max-w-[calc(100vw-2rem)] overflow-x-auto scroll-thin">
      {/* Pen */}
      <button
        onClick={() => onToolChange('pen')}
        className={toolBtnClass(tool === 'pen')}
        title="ペン"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9.5 3l3.5 3.5-8 8H1.5v-3.5l8-8z" />
          <path d="M8 4.5l3.5 3.5" />
        </svg>
      </button>

      {/* Text */}
      <button
        onClick={() => onToolChange('text')}
        className={toolBtnClass(tool === 'text')}
        title="テキスト"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
          <path d="M4 3.5h8M8 3.5v9M5.5 12.5h5" />
        </svg>
      </button>

      {/* Object eraser */}
      <button
        onClick={() => onToolChange('object-eraser')}
        className={toolBtnClass(tool === 'object-eraser')}
        title="消しゴム（ストローク全体）"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 14h7" />
          <path d="M3.5 10.5l6-6 3 3-6 6-3.5.5.5-3.5z" />
        </svg>
      </button>

      {/* Trace eraser */}
      <button
        onClick={() => onToolChange('trace-eraser')}
        className={toolBtnClass(tool === 'trace-eraser')}
        title="なぞり消し（部分消し）"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 14h7" />
          <path d="M3.5 10.5l6-6 3 3-6 6-3.5.5.5-3.5z" />
          <path d="M6.5 11.5l3-3" strokeDasharray="1.5 1.5" />
        </svg>
      </button>

      {showColorWidth && (
        <>
          <div className="w-px h-5 bg-neutral-800 mx-0.5" />

          {/* Colors */}
          {COLORS.map((c) => (
            <button
              key={c.value}
              onClick={() => onColorChange(c.value)}
              title={c.label}
              className={`w-5 h-5 rounded-full border-[1.5px] transition ${
                color === c.value
                  ? 'border-white scale-110'
                  : 'border-neutral-700 hover:border-neutral-500'
              }`}
              style={{ backgroundColor: c.value }}
            />
          ))}

          <div className="w-px h-5 bg-neutral-800 mx-0.5" />

          {/* Widths (pen only) */}
          {tool === 'pen' && WIDTHS.map((w) => (
            <button
              key={w.value}
              onClick={() => onWidthChange(w.value)}
              title={w.label}
              className={`w-7 h-7 flex items-center justify-center rounded-md transition ${
                width === w.value
                  ? 'bg-neutral-700'
                  : 'hover:bg-neutral-800'
              }`}
            >
              <span
                className="rounded-full bg-neutral-300"
                style={{ width: w.value + 2, height: w.value + 2 }}
              />
            </button>
          ))}

          {/* Font sizes (text only) */}
          {tool === 'text' && FONT_SIZES.map((f) => (
            <button
              key={f.value}
              onClick={() => onFontSizeChange(f.value)}
              className={`h-6 px-2 rounded-md text-[10px] transition ${
                fontSize === f.value
                  ? 'bg-neutral-700 text-white'
                  : 'text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300'
              }`}
            >
              {f.label}
            </button>
          ))}

          {/* Bold toggle (text only) */}
          {tool === 'text' && (
            <button
              onClick={() => onBoldChange(!bold)}
              className={`w-7 h-7 flex items-center justify-center rounded-md transition ${
                bold
                  ? 'bg-neutral-700 text-white'
                  : 'text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300'
              }`}
              title="太字"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <path d="M3.5 2h4a2.5 2.5 0 011.7 4.3A2.8 2.8 0 018 12H3.5V2zm1.8 4.2h2a1.1 1.1 0 000-2.2h-2v2.2zm0 4h2.3a1.3 1.3 0 000-2.5H5.3v2.5z" />
              </svg>
            </button>
          )}
        </>
      )}

      <div className="w-px h-5 bg-neutral-800 mx-0.5" />

      {/* Done */}
      <button
        onClick={onDone}
        className="w-8 h-8 flex items-center justify-center rounded-lg bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white transition"
        title="完了"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 7.5l3 3 6-6.5" />
        </svg>
      </button>
    </div>
  )
}
