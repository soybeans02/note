import Tooltip from './Tooltip'

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

const FONT_SIZE_MIN = 8
const FONT_SIZE_MAX = 72

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
      <Tooltip label="ペン">
        <button
          onClick={() => onToolChange('pen')}
          className={toolBtnClass(tool === 'pen')}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9.5 3l3.5 3.5-8 8H1.5v-3.5l8-8z" />
            <path d="M8 4.5l3.5 3.5" />
          </svg>
        </button>
      </Tooltip>

      {/* Text */}
      <Tooltip label="テキスト">
        <button
          onClick={() => onToolChange('text')}
          className={toolBtnClass(tool === 'text')}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
            <path d="M4 3.5h8M8 3.5v9M5.5 12.5h5" />
          </svg>
        </button>
      </Tooltip>

      {/* Object eraser */}
      <Tooltip label="消しゴム（全体削除）">
        <button
          onClick={() => onToolChange('object-eraser')}
          className={toolBtnClass(tool === 'object-eraser')}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="5" width="12" height="7" rx="1.5" />
            <path d="M2 9h12" />
            <path d="M5 5V3.5h6V5" />
          </svg>
        </button>
      </Tooltip>

      {/* Trace eraser */}
      <Tooltip label="なぞり消し（部分削除）">
        <button
          onClick={() => onToolChange('trace-eraser')}
          className={toolBtnClass(tool === 'trace-eraser')}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="5" width="12" height="7" rx="1.5" />
            <path d="M2 9h12" />
            <path d="M5 5V3.5h6V5" />
            <path d="M5 7.5h6" strokeDasharray="2 2" strokeWidth="1.5" />
          </svg>
        </button>
      </Tooltip>

      {showColorWidth && (
        <>
          <div className="w-px h-5 bg-neutral-800 mx-0.5" />

          {/* Colors */}
          {COLORS.map((c) => (
            <Tooltip key={c.value} label={c.label}>
              <button
                onClick={() => onColorChange(c.value)}
                className={`w-5 h-5 rounded-full border-[1.5px] transition ${
                  color === c.value
                    ? 'border-white scale-110'
                    : 'border-neutral-700 hover:border-neutral-500'
                }`}
                style={{ backgroundColor: c.value }}
              />
            </Tooltip>
          ))}

          <div className="w-px h-5 bg-neutral-800 mx-0.5" />

          {/* Widths (pen only) */}
          {tool === 'pen' && WIDTHS.map((w) => (
            <Tooltip key={w.value} label={w.label}>
              <button
                onClick={() => onWidthChange(w.value)}
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
            </Tooltip>
          ))}

          {/* Font size px input (text only) */}
          {tool === 'text' && (
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => onFontSizeChange(Math.max(FONT_SIZE_MIN, fontSize - 1))}
                className="w-5 h-5 flex items-center justify-center rounded text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 transition text-[11px]"
              >
                −
              </button>
              <input
                type="number"
                value={fontSize}
                min={FONT_SIZE_MIN}
                max={FONT_SIZE_MAX}
                onChange={(e) => {
                  const v = parseInt(e.target.value)
                  if (!isNaN(v)) onFontSizeChange(Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, v)))
                }}
                onKeyDown={(e) => e.stopPropagation()}
                className="w-9 h-6 text-center text-[11px] bg-neutral-800 text-neutral-200 rounded border border-neutral-700 outline-none focus:border-neutral-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <span className="text-[9px] text-neutral-600 mr-0.5">px</span>
              <button
                onClick={() => onFontSizeChange(Math.min(FONT_SIZE_MAX, fontSize + 1))}
                className="w-5 h-5 flex items-center justify-center rounded text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 transition text-[11px]"
              >
                +
              </button>
            </div>
          )}

          {/* Bold toggle (text only) */}
          {tool === 'text' && (
            <Tooltip label="太字">
              <button
                onClick={() => onBoldChange(!bold)}
                className={`w-7 h-7 flex items-center justify-center rounded-md transition ${
                  bold
                    ? 'bg-neutral-700 text-white'
                    : 'text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300'
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                  <path d="M3.5 2h4a2.5 2.5 0 011.7 4.3A2.8 2.8 0 018 12H3.5V2zm1.8 4.2h2a1.1 1.1 0 000-2.2h-2v2.2zm0 4h2.3a1.3 1.3 0 000-2.5H5.3v2.5z" />
                </svg>
              </button>
            </Tooltip>
          )}
        </>
      )}

      <div className="w-px h-5 bg-neutral-800 mx-0.5" />

      {/* Done */}
      <Tooltip label="完了">
        <button
          onClick={onDone}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white transition"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2.5 7.5l3 3 6-6.5" />
          </svg>
        </button>
      </Tooltip>
    </div>
  )
}
