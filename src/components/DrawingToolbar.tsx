export type DrawTool = 'pen' | 'object-eraser' | 'trace-eraser'

interface Props {
  tool: DrawTool
  color: string
  width: number
  onToolChange: (tool: DrawTool) => void
  onColorChange: (color: string) => void
  onWidthChange: (width: number) => void
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

export default function DrawingToolbar({
  tool,
  color,
  width,
  onToolChange,
  onColorChange,
  onWidthChange,
  onDone,
}: Props) {
  const isEraser = tool === 'object-eraser' || tool === 'trace-eraser'

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-neutral-900/95 backdrop-blur-md border border-neutral-800 rounded-2xl px-3 py-2 shadow-2xl z-20">
      {/* Pen */}
      <button
        onClick={() => onToolChange('pen')}
        className={`h-7 px-2.5 rounded-lg text-[11px] transition ${
          tool === 'pen'
            ? 'bg-white text-black'
            : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
        }`}
      >
        ペン
      </button>

      {/* Object eraser */}
      <button
        onClick={() => onToolChange('object-eraser')}
        className={`h-7 px-2.5 rounded-lg text-[11px] transition ${
          tool === 'object-eraser'
            ? 'bg-white text-black'
            : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
        }`}
        title="ストローク全体を削除"
      >
        消しゴム
      </button>

      {/* Trace eraser */}
      <button
        onClick={() => onToolChange('trace-eraser')}
        className={`h-7 px-2.5 rounded-lg text-[11px] transition ${
          tool === 'trace-eraser'
            ? 'bg-white text-black'
            : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
        }`}
        title="なぞった部分だけ消す"
      >
        なぞり消し
      </button>

      {!isEraser && (
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

          {/* Widths */}
          {WIDTHS.map((w) => (
            <button
              key={w.value}
              onClick={() => onWidthChange(w.value)}
              className={`h-6 px-2 rounded-md text-[10px] transition ${
                width === w.value
                  ? 'bg-neutral-700 text-white'
                  : 'text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300'
              }`}
            >
              {w.label}
            </button>
          ))}
        </>
      )}

      <div className="w-px h-5 bg-neutral-800 mx-0.5" />

      <button
        onClick={onDone}
        className="h-7 px-3 rounded-lg text-[11px] bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white transition"
      >
        完了
      </button>
    </div>
  )
}
