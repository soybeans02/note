interface Props {
  tool: 'pen' | 'eraser'
  color: string
  width: number
  onToolChange: (tool: 'pen' | 'eraser') => void
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
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-slate-800/95 backdrop-blur border border-slate-700 rounded-xl px-3 py-2 shadow-2xl z-20">
      {/* Pen / Eraser */}
      <button
        onClick={() => onToolChange('pen')}
        className={`px-2.5 py-1.5 rounded-lg text-sm transition ${
          tool === 'pen'
            ? 'bg-sky-600 text-white'
            : 'text-slate-300 hover:bg-slate-700'
        }`}
      >
        ペン
      </button>
      <button
        onClick={() => onToolChange('eraser')}
        className={`px-2.5 py-1.5 rounded-lg text-sm transition ${
          tool === 'eraser'
            ? 'bg-sky-600 text-white'
            : 'text-slate-300 hover:bg-slate-700'
        }`}
      >
        消しゴム
      </button>

      <div className="w-px h-6 bg-slate-600 mx-1" />

      {/* Colors */}
      {COLORS.map((c) => (
        <button
          key={c.value}
          onClick={() => onColorChange(c.value)}
          title={c.label}
          className={`w-6 h-6 rounded-full border-2 transition ${
            color === c.value ? 'border-white scale-110' : 'border-slate-600'
          }`}
          style={{ backgroundColor: c.value }}
        />
      ))}

      <div className="w-px h-6 bg-slate-600 mx-1" />

      {/* Widths */}
      {WIDTHS.map((w) => (
        <button
          key={w.value}
          onClick={() => onWidthChange(w.value)}
          className={`px-2 py-1 rounded text-xs transition ${
            width === w.value
              ? 'bg-sky-600 text-white'
              : 'text-slate-400 hover:bg-slate-700'
          }`}
        >
          {w.label}
        </button>
      ))}

      <div className="w-px h-6 bg-slate-600 mx-1" />

      <button
        onClick={onDone}
        className="px-3 py-1.5 rounded-lg text-sm bg-slate-600 text-white hover:bg-slate-500 transition"
      >
        完了
      </button>
    </div>
  )
}
