import Tooltip from './Tooltip'

export type DrawTool =
  | 'hand'
  | 'pen'
  | 'highlighter'
  | 'object-eraser'
  | 'trace-eraser'
  | 'text'

interface Props {
  tool: DrawTool
  color: string
  width: number
  highlighterColor: string
  highlighterWidth: number
  fontSize: number
  bold: boolean
  /** A text box is currently being edited — show text styling controls even
   *  when the active tool isn't the text tool. */
  editingText?: boolean
  onToolChange: (tool: DrawTool) => void
  onColorChange: (color: string) => void
  onWidthChange: (width: number) => void
  onHighlighterColorChange: (color: string) => void
  onHighlighterWidthChange: (width: number) => void
  onFontSizeChange: (size: number) => void
  onBoldChange: (bold: boolean) => void
}

const PEN_COLORS = [
  { value: '#000000', label: '黒' },
  { value: '#ffffff', label: '白' },
  { value: '#ef4444', label: '赤' },
  { value: '#f97316', label: 'オレンジ' },
  { value: '#eab308', label: '黄' },
  { value: '#22c55e', label: '緑' },
  { value: '#3b82f6', label: '青' },
  { value: '#8b5cf6', label: '紫' },
]

const HIGHLIGHTER_COLORS = [
  { value: '#fde047', label: '黄' },
  { value: '#86efac', label: '緑' },
  { value: '#7dd3fc', label: '青' },
  { value: '#f9a8d4', label: 'ピンク' },
  { value: '#fdba74', label: 'オレンジ' },
]

const PEN_WIDTHS = [1.5, 3, 5, 8, 12]
const HIGHLIGHTER_WIDTHS = [12, 18, 26]

const FONT_SIZE_MIN = 8
const FONT_SIZE_MAX = 72

const toolBtnClass = (active: boolean) =>
  `w-9 h-9 flex items-center justify-center rounded-lg transition ${
    active
      ? 'bg-white text-black'
      : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
  }`

export default function DrawingToolbar({
  tool,
  color,
  width,
  highlighterColor,
  highlighterWidth,
  fontSize,
  bold,
  editingText,
  onToolChange,
  onColorChange,
  onWidthChange,
  onHighlighterColorChange,
  onHighlighterWidthChange,
  onFontSizeChange,
  onBoldChange,
}: Props) {
  // Show text styling controls for the text tool, OR while a box is being
  // edited under another tool (e.g. tapping a box with the hand tool).
  const showTextOptions = tool === 'text' || !!editingText
  const showPen = tool === 'pen' && !editingText
  const showHighlighter = tool === 'highlighter' && !editingText
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 z-20 max-w-[calc(100vw-2rem)]">
      {/* Sub-options bar (color/width/text settings) */}
      {(showPen || showHighlighter || showTextOptions) && (
        <div className="flex items-center gap-1 bg-neutral-900/95 backdrop-blur-md border border-neutral-800 rounded-xl px-2 py-1.5 shadow-2xl overflow-x-auto scroll-thin">
          {showPen && (
            <>
              {PEN_COLORS.map((c) => (
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
              {PEN_WIDTHS.map((w) => (
                <button
                  key={w}
                  onClick={() => onWidthChange(w)}
                  className={`w-7 h-7 flex items-center justify-center rounded-md transition ${
                    width === w ? 'bg-neutral-700' : 'hover:bg-neutral-800'
                  }`}
                >
                  <span
                    className="rounded-full bg-neutral-200"
                    style={{ width: Math.min(w + 1, 14), height: Math.min(w + 1, 14) }}
                  />
                </button>
              ))}
            </>
          )}

          {showHighlighter && (
            <>
              {HIGHLIGHTER_COLORS.map((c) => (
                <Tooltip key={c.value} label={c.label}>
                  <button
                    onClick={() => onHighlighterColorChange(c.value)}
                    className={`w-5 h-5 rounded-full border-[1.5px] transition ${
                      highlighterColor === c.value
                        ? 'border-white scale-110'
                        : 'border-neutral-700 hover:border-neutral-500'
                    }`}
                    style={{ backgroundColor: c.value, opacity: 0.7 }}
                  />
                </Tooltip>
              ))}
              <div className="w-px h-5 bg-neutral-800 mx-0.5" />
              {HIGHLIGHTER_WIDTHS.map((w) => (
                <button
                  key={w}
                  onClick={() => onHighlighterWidthChange(w)}
                  className={`px-2 h-7 flex items-center justify-center rounded-md transition ${
                    highlighterWidth === w ? 'bg-neutral-700' : 'hover:bg-neutral-800'
                  }`}
                >
                  <span
                    className="rounded-sm"
                    style={{
                      width: 16,
                      height: Math.max(3, w / 3),
                      background: highlighterColor,
                      opacity: 0.7,
                    }}
                  />
                </button>
              ))}
            </>
          )}

          {showTextOptions && (
            <>
              {PEN_COLORS.map((c) => (
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
                    if (!isNaN(v))
                      onFontSizeChange(Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, v)))
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
            </>
          )}
        </div>
      )}

      {/* Main tool bar */}
      <div className="flex items-center gap-1 bg-neutral-900/95 backdrop-blur-md border border-neutral-800 rounded-2xl px-2.5 py-1.5 shadow-2xl">
        <Tooltip label="手のひら（スクロール）">
          <button onClick={() => onToolChange('hand')} className={toolBtnClass(tool === 'hand')}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 8V3.5a1 1 0 012 0V8" />
              <path d="M8 7.5V2.5a1 1 0 012 0V8" />
              <path d="M10 8V3.5a1 1 0 012 0V9" />
              <path d="M12 9V5.5a1 1 0 012 0V12c0 2.5-2 4.5-4.5 4.5S5 14.5 5 12V8.5a1 1 0 012 0" />
            </svg>
          </button>
        </Tooltip>

        <Tooltip label="ペン">
          <button onClick={() => onToolChange('pen')} className={toolBtnClass(tool === 'pen')}>
            <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9.5 3l3.5 3.5-8 8H1.5v-3.5l8-8z" />
              <path d="M8 4.5l3.5 3.5" />
            </svg>
          </button>
        </Tooltip>

        <Tooltip label="ハイライター">
          <button onClick={() => onToolChange('highlighter')} className={toolBtnClass(tool === 'highlighter')}>
            <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 13l2-2 5-5 3 3-5 5-2 2H3z" />
              <path d="M9 5l3 3" />
              <path d="M2 15h6" strokeWidth="1.6" />
            </svg>
          </button>
        </Tooltip>

        <Tooltip label="テキスト">
          <button onClick={() => onToolChange('text')} className={toolBtnClass(tool === 'text')}>
            <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <path d="M4 3.5h8M8 3.5v9M5.5 12.5h5" />
            </svg>
          </button>
        </Tooltip>

        <div className="w-px h-5 bg-neutral-800 mx-0.5" />

        <Tooltip label="なぞり消し">
          <button onClick={() => onToolChange('trace-eraser')} className={toolBtnClass(tool === 'trace-eraser')}>
            <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="5" width="12" height="7" rx="1.5" />
              <path d="M2 9h12" />
              <path d="M5 5V3.5h6V5" />
              <path d="M5 7.5h6" strokeDasharray="2 2" strokeWidth="1.5" />
            </svg>
          </button>
        </Tooltip>

        <Tooltip label="まとめて消す">
          <button onClick={() => onToolChange('object-eraser')} className={toolBtnClass(tool === 'object-eraser')}>
            <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="5" width="12" height="7" rx="1.5" />
              <path d="M2 9h12" />
              <path d="M5 5V3.5h6V5" />
            </svg>
          </button>
        </Tooltip>
      </div>
    </div>
  )
}
