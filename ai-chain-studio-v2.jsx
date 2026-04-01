import { useState, useRef, useCallback, useEffect } from "react";

// ─── GitHub-inspired palette ───
const C = {
  bg: "#0d1117",
  card: "#161b22",
  cardBorder: "#30363d",
  cardHover: "#1c2129",
  surface: "#21262d",
  surfaceLight: "#282e36",
  border: "#30363d",
  borderHover: "#484f58",
  text: "#e6edf3",
  textMuted: "#8b949e",
  textFaint: "#484f58",
  accent: "#1f6feb",
  accentHover: "#388bfd",
  green: "#238636",
  greenHover: "#2ea043",
  greenMuted: "#23863633",
  red: "#da3633",
  orange: "#d29922",
  purple: "#8957e5",
  pink: "#db61a2",
  cyan: "#39d353",
};

const AI_MODELS = [
  { id: "flux", name: "FLUX.1", icon: "◆", color: C.green },
  { id: "sdxl", name: "Stable Diffusion XL", icon: "◇", color: C.cyan },
  { id: "dalle", name: "DALL·E 3", icon: "○", color: C.accent },
  { id: "midjourney", name: "Midjourney", icon: "◈", color: C.purple },
  { id: "ip-adapter", name: "IP-Adapter", icon: "◎", color: C.pink },
  { id: "controlnet", name: "ControlNet", icon: "◉", color: C.orange },
];

const SAMPLE_OUTPUTS = Array.from({ length: 12 }, (_, i) =>
  `https://picsum.photos/seed/chain${i}/300/300`
);

let _id = 0;
const uid = () => `c${++_id}`;

let dragPayload = null;

// ─── Small components ───

function ImageThumb({ src, size = 52, onRemove, draggable, cardId }) {
  return (
    <div
      draggable={draggable}
      onDragStart={e => {
        dragPayload = { src, fromCard: cardId };
        e.dataTransfer.setData("text/plain", src);
        e.dataTransfer.effectAllowed = "copy";
      }}
      onDragEnd={() => { dragPayload = null; }}
      style={{
        width: size, height: size, borderRadius: 6, overflow: "hidden",
        position: "relative", flexShrink: 0,
        cursor: draggable ? "grab" : "default",
        border: `1px solid ${C.border}`,
        transition: "transform 0.12s, border-color 0.12s",
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.06)"; e.currentTarget.style.borderColor = C.borderHover; }}
      onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.borderColor = C.border; }}
    >
      <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      {onRemove && (
        <button onClick={onRemove} style={{
          position: "absolute", top: 1, right: 1, width: 16, height: 16,
          borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.75)",
          color: "#fff", fontSize: 10, cursor: "pointer", display: "flex",
          alignItems: "center", justifyContent: "center", lineHeight: 1, padding: 0,
        }}>×</button>
      )}
    </div>
  );
}

function DropZone({ onDrop, children, label }) {
  const [over, setOver] = useState(false);
  const hasChildren = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <div
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); if (dragPayload) onDrop(dragPayload); }}
      style={{
        minHeight: 48, borderRadius: 6, padding: 6,
        border: `1px dashed ${over ? C.accent : C.border}`,
        background: over ? `${C.accent}11` : "transparent",
        transition: "all 0.15s",
        display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center",
      }}
    >
      {children}
      {!hasChildren && (
        <span style={{ color: C.textFaint, fontSize: 11, margin: "auto", userSelect: "none" }}>
          {over ? "＋ ドロップ" : label || "画像をドロップ"}
        </span>
      )}
    </div>
  );
}

function ModelSelector({ selected, onSelect }) {
  const [open, setOpen] = useState(false);
  const model = AI_MODELS.find(m => m.id === selected);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(!open)} style={{
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6,
        padding: "4px 10px", color: C.text, cursor: "pointer",
        display: "flex", alignItems: "center", gap: 6, fontSize: 12, width: "100%",
      }}>
        <span style={{ color: model?.color, fontSize: 14 }}>{model?.icon}</span>
        <span style={{ flex: 1, textAlign: "left", fontWeight: 600 }}>{model?.name}</span>
        <span style={{ fontSize: 9, color: C.textFaint }}>▼</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 2px)", left: 0, right: 0,
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
          zIndex: 200, overflow: "hidden", boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
        }}>
          {AI_MODELS.map(m => (
            <button key={m.id} onClick={() => { onSelect(m.id); setOpen(false); }} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "6px 10px",
              background: m.id === selected ? C.surface : "transparent",
              border: "none", color: C.text, cursor: "pointer", width: "100%", fontSize: 12,
            }}
              onMouseEnter={e => e.currentTarget.style.background = C.surface}
              onMouseLeave={e => e.currentTarget.style.background = m.id === selected ? C.surface : "transparent"}
            >
              <span style={{ color: m.color, fontSize: 14 }}>{m.icon}</span>{m.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Collapsible parameters ───
function ParamsPanel({ params, onChange }) {
  const [open, setOpen] = useState(false);
  const update = (k, v) => onChange({ ...params, [k]: v });

  const Slider = ({ label, k, min, max, step = 1 }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <label style={{ fontSize: 11, color: C.textMuted, width: 80, flexShrink: 0 }}>{label}</label>
      <input type="range" min={min} max={max} step={step} value={params[k]}
        onChange={e => update(k, Number(e.target.value))}
        style={{ flex: 1, accentColor: C.green, height: 4 }} />
      <span style={{ fontSize: 11, color: C.text, width: 38, textAlign: "right", fontFamily: "monospace" }}>{params[k]}</span>
    </div>
  );

  return (
    <div style={{ borderTop: `1px solid ${C.border}` }}>
      <button onClick={() => setOpen(!open)} style={{
        width: "100%", background: "none", border: "none", color: C.textMuted,
        padding: "6px 0", fontSize: 11, cursor: "pointer",
        display: "flex", alignItems: "center", gap: 4, fontWeight: 500,
      }}>
        <span style={{
          display: "inline-block", fontSize: 8, transition: "transform 0.15s",
          transform: open ? "rotate(90deg)" : "rotate(0deg)",
        }}>▶</span>
        Parameters
      </button>
      {open && (
        <div style={{
          display: "flex", flexDirection: "column", gap: 6, padding: "2px 0 8px",
          animation: "fadeIn 0.15s ease",
        }}>
          <Slider label="Steps" k="steps" min={1} max={100} />
          <Slider label="CFG Scale" k="cfg" min={1} max={20} step={0.5} />
          <Slider label="Strength" k="strength" min={0} max={1} step={0.05} />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ fontSize: 11, color: C.textMuted, width: 80, flexShrink: 0 }}>Size</label>
            <select value={params.size} onChange={e => update("size", e.target.value)}
              style={{
                flex: 1, background: C.surface, border: `1px solid ${C.border}`,
                borderRadius: 4, padding: "3px 6px", color: C.text, fontSize: 11,
              }}>
              <option value="512x512">512 × 512</option>
              <option value="768x768">768 × 768</option>
              <option value="1024x1024">1024 × 1024</option>
              <option value="1024x768">1024 × 768</option>
              <option value="768x1024">768 × 1024</option>
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ fontSize: 11, color: C.textMuted, width: 80, flexShrink: 0 }}>Seed</label>
            <input type="number" value={params.seed} onChange={e => update("seed", Number(e.target.value))}
              style={{
                flex: 1, background: C.surface, border: `1px solid ${C.border}`,
                borderRadius: 4, padding: "3px 6px", color: C.text, fontSize: 11, fontFamily: "monospace",
              }} />
          </div>
          <Slider label="Batch" k="batch" min={1} max={8} />
        </div>
      )}
    </div>
  );
}

// ─── Connection lines (SVG overlay) ───
function ConnectionLines({ connections, cardPositions, cardRefs, scrollOffset }) {
  const lines = connections.map((conn, i) => {
    const fromEl = cardRefs.current[conn.from];
    const toEl = cardRefs.current[conn.to];
    if (!fromEl || !toEl) return null;

    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();

    const fromX = fromRect.left + fromRect.width / 2 + scrollOffset.x;
    const fromY = fromRect.top + fromRect.height + scrollOffset.y;
    const toX = toRect.left + toRect.width / 2 + scrollOffset.x;
    const toY = toRect.top + scrollOffset.y;

    // If target is mostly to the right, exit from right side instead
    const horizontal = Math.abs(toRect.left - fromRect.right) < Math.abs(toY - fromY);
    let x1, y1, x2, y2;
    if (toRect.top > fromRect.bottom - 20) {
      // below
      x1 = fromRect.left + fromRect.width / 2 + scrollOffset.x;
      y1 = fromRect.bottom + scrollOffset.y;
      x2 = toRect.left + toRect.width / 2 + scrollOffset.x;
      y2 = toRect.top + scrollOffset.y;
    } else {
      // right
      x1 = fromRect.right + scrollOffset.x;
      y1 = fromRect.top + fromRect.height / 2 + scrollOffset.y;
      x2 = toRect.left + scrollOffset.x;
      y2 = toRect.top + toRect.height / 2 + scrollOffset.y;
    }

    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    const cx1 = dx > dy ? mx : x1;
    const cy1 = dx > dy ? y1 : my;
    const cx2 = dx > dy ? mx : x2;
    const cy2 = dx > dy ? y2 : my;

    return (
      <g key={i}>
        <path
          d={`M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`}
          fill="none" stroke={C.border} strokeWidth="2" strokeDasharray="6 4"
        />
        <circle cx={x2} cy={y2} r="4" fill={C.green} />
      </g>
    );
  });

  return (
    <svg style={{
      position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
      pointerEvents: "none", zIndex: 1,
    }}>
      {lines}
    </svg>
  );
}

// ─── Card component ───
function GenCard({ card, onUpdate, onDelete, onGenerate, onStartConnect, onAutoConnect, onDragHandle, connectMode, cardRef, totalCards }) {
  const model = AI_MODELS.find(m => m.id === card.model);
  const isGen = card.status === "generating";

  const handleDropInput = useCallback(payload => {
    if (!card.inputImages.includes(payload.src)) {
      onUpdate({ ...card, inputImages: [...card.inputImages, payload.src] });
      // Auto-connect when image is dropped from another card
      if (payload.fromCard && payload.fromCard !== card.id) {
        onAutoConnect(payload.fromCard, card.id);
      }
    }
  }, [card, onUpdate, onAutoConnect]);

  return (
    <div ref={cardRef} style={{
      width: 300, borderRadius: 8,
      background: C.card, border: `1px solid ${C.cardBorder}`,
      display: "flex", flexDirection: "column", overflow: "visible",
      transition: "box-shadow 0.2s, border-color 0.2s",
      position: "relative",
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = C.borderHover; e.currentTarget.style.boxShadow = `0 4px 24px rgba(0,0,0,0.3)`; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = C.cardBorder; e.currentTarget.style.boxShadow = "none"; }}
    >
      {/* Header — drag handle */}
      <div
        onMouseDown={e => {
          // Only drag from header, skip interactive elements
          if (e.target.tagName === "BUTTON" || e.target.closest("button") || e.target.closest("[data-nodrag]")) return;
          onDragHandle(card.id, e);
        }}
        style={{
          padding: "10px 12px 8px", display: "flex", alignItems: "center", gap: 8,
          borderBottom: `1px solid ${C.border}`, cursor: "grab",
        }}>
        {/* Grip icon */}
        <div style={{ color: C.textFaint, fontSize: 14, cursor: "grab", flexShrink: 0, lineHeight: 1, userSelect: "none" }} title="ドラッグで移動">⠿</div>
        <div data-nodrag="true" style={{ flex: 1 }}>
          <ModelSelector selected={card.model} onSelect={id => onUpdate({ ...card, model: id })} />
        </div>
        {totalCards > 1 && (
          <button onClick={onDelete} style={{
            background: "none", border: "none", color: C.textFaint,
            cursor: "pointer", fontSize: 16, padding: "2px 4px", lineHeight: 1,
          }}
            onMouseEnter={e => e.currentTarget.style.color = C.red}
            onMouseLeave={e => e.currentTarget.style.color = C.textFaint}
          >×</button>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
        {/* Prompt */}
        <textarea
          value={card.prompt}
          onChange={e => onUpdate({ ...card, prompt: e.target.value })}
          placeholder="Prompt..."
          rows={2}
          style={{
            width: "100%", background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 6, padding: "8px 10px", color: C.text, fontSize: 12,
            resize: "vertical", outline: "none", fontFamily: "'Mona Sans','Segoe UI',sans-serif",
            boxSizing: "border-box",
          }}
          onFocus={e => e.target.style.borderColor = C.accent}
          onBlur={e => e.target.style.borderColor = C.border}
        />

        {/* Negative prompt */}
        <textarea
          value={card.negative || ""}
          onChange={e => onUpdate({ ...card, negative: e.target.value })}
          placeholder="Negative prompt..."
          rows={1}
          style={{
            width: "100%", background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 6, padding: "6px 10px", color: C.textMuted, fontSize: 11,
            resize: "vertical", outline: "none", fontFamily: "'Mona Sans','Segoe UI',sans-serif",
            boxSizing: "border-box",
          }}
          onFocus={e => e.target.style.borderColor = C.accent}
          onBlur={e => e.target.style.borderColor = C.border}
        />

        {/* Input images */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: C.textFaint, marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>Input</div>
          <DropZone onDrop={handleDropInput} label="画像をドラッグ＆ドロップ">
            {card.inputImages.map((src, i) => (
              <ImageThumb key={`${src}-${i}`} src={src} size={44} onRemove={() => {
                const n = [...card.inputImages]; n.splice(i, 1);
                onUpdate({ ...card, inputImages: n });
              }} />
            ))}
          </DropZone>
        </div>

        {/* Parameters */}
        <ParamsPanel params={card.params} onChange={p => onUpdate({ ...card, params: p })} />

        {/* Generate */}
        <button onClick={() => onGenerate(card.id)}
          disabled={isGen || (!card.prompt.trim() && card.inputImages.length === 0)}
          style={{
            padding: "7px 0", borderRadius: 6, border: "none",
            background: isGen ? C.surface : C.green,
            color: "#fff", fontWeight: 600, fontSize: 12, cursor: isGen ? "wait" : "pointer",
            transition: "background 0.15s",
            opacity: (!card.prompt.trim() && card.inputImages.length === 0) ? 0.4 : 1,
          }}
          onMouseEnter={e => { if (!isGen) e.currentTarget.style.background = C.greenHover; }}
          onMouseLeave={e => { if (!isGen) e.currentTarget.style.background = C.green; }}
        >
          {isGen ? "⟳ Generating..." : "▶ Generate"}
        </button>

        {/* Outputs */}
        {card.outputs.length > 0 && (
          <div>
            <div style={{
              fontSize: 10, fontWeight: 600, color: C.textFaint, marginBottom: 3,
              textTransform: "uppercase", letterSpacing: "0.06em",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <span>Output <span style={{ color: C.green }}>{card.outputs.length}枚</span></span>
              <span style={{ fontWeight: 400, textTransform: "none", fontSize: 10, color: C.textFaint }}>drag to chain →</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {card.outputs.map((src, i) => (
                <ImageThumb key={`o-${i}`} src={src} size={60} draggable cardId={card.id} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom connector handle */}
      <div
        onClick={() => onStartConnect(card.id)}
        title="ここからドラッグして接続"
        style={{
          position: "absolute", bottom: -8, left: "50%", transform: "translateX(-50%)",
          width: 16, height: 16, borderRadius: "50%",
          background: connectMode === card.id ? C.green : C.surface,
          border: `2px solid ${connectMode === card.id ? C.green : C.border}`,
          cursor: "pointer", zIndex: 10,
          transition: "all 0.15s",
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = C.green; e.currentTarget.style.background = C.greenMuted; }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = connectMode === card.id ? C.green : C.border;
          e.currentTarget.style.background = connectMode === card.id ? C.green : C.surface;
        }}
      />
      {/* Right connector handle */}
      <div
        onClick={() => onStartConnect(card.id)}
        style={{
          position: "absolute", right: -8, top: "50%", transform: "translateY(-50%)",
          width: 16, height: 16, borderRadius: "50%",
          background: connectMode === card.id ? C.green : C.surface,
          border: `2px solid ${connectMode === card.id ? C.green : C.border}`,
          cursor: "pointer", zIndex: 10,
          transition: "all 0.15s",
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = C.green; e.currentTarget.style.background = C.greenMuted; }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = connectMode === card.id ? C.green : C.border;
          e.currentTarget.style.background = connectMode === card.id ? C.green : C.surface;
        }}
      />
    </div>
  );
}

// ─── Main App ───
const defaultParams = () => ({ steps: 30, cfg: 7, strength: 0.75, size: "1024x1024", seed: -1, batch: 2 });

export default function AIChainStudio() {
  const [cards, setCards] = useState([
    { id: uid(), model: "flux", prompt: "", negative: "", inputImages: [], outputs: [], status: "idle", params: defaultParams(), pos: { x: 60, y: 40 } },
    { id: uid(), model: "sdxl", prompt: "", negative: "", inputImages: [], outputs: [], status: "idle", params: defaultParams(), pos: { x: 440, y: 40 } },
    { id: uid(), model: "controlnet", prompt: "", negative: "", inputImages: [], outputs: [], status: "idle", params: defaultParams(), pos: { x: 250, y: 520 } },
  ]);
  const [connections, setConnections] = useState([]);
  const [connectFrom, setConnectFrom] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [linesTick, setLinesTick] = useState(0);
  const cardRefs = useRef({});
  const canvasRef = useRef(null);

  const updateCard = useCallback(updated => {
    setCards(prev => prev.map(c => c.id === updated.id ? updated : c));
  }, []);

  const deleteCard = useCallback(id => {
    setCards(prev => prev.filter(c => c.id !== id));
    setConnections(prev => prev.filter(c => c.from !== id && c.to !== id));
  }, []);

  const addCard = useCallback((offsetX = 0, offsetY = 0) => {
    const newCard = {
      id: uid(), model: AI_MODELS[Math.floor(Math.random() * AI_MODELS.length)].id,
      prompt: "", negative: "", inputImages: [], outputs: [], status: "idle",
      params: defaultParams(),
      pos: { x: 60 + cards.length * 100 + offsetX, y: 40 + offsetY },
    };
    setCards(prev => [...prev, newCard]);
  }, [cards.length]);

  const handleGenerate = useCallback(cardId => {
    setCards(prev => prev.map(c => c.id === cardId ? { ...c, status: "generating" } : c));
    const card = cards.find(c => c.id === cardId);
    const count = card?.params.batch || 2;
    const offset = Math.floor(Math.random() * SAMPLE_OUTPUTS.length);
    setTimeout(() => {
      setCards(prev => prev.map(c => {
        if (c.id !== cardId) return c;
        const outputs = Array.from({ length: count }, (_, i) => SAMPLE_OUTPUTS[(offset + i) % SAMPLE_OUTPUTS.length]);
        return { ...c, status: "done", outputs };
      }));
    }, 1000 + Math.random() * 800);
  }, [cards]);

  const handleStartConnect = useCallback(cardId => {
    if (connectFrom && connectFrom !== cardId) {
      const exists = connections.some(c => c.from === connectFrom && c.to === cardId);
      if (!exists) setConnections(prev => [...prev, { from: connectFrom, to: cardId }]);
      setConnectFrom(null);
    } else {
      setConnectFrom(cardId);
    }
  }, [connectFrom, connections]);

  // Auto-connect when image is dropped between cards
  const handleAutoConnect = useCallback((fromCardId, toCardId) => {
    setConnections(prev => {
      const exists = prev.some(c => c.from === fromCardId && c.to === toCardId);
      if (exists) return prev;
      return [...prev, { from: fromCardId, to: toCardId }];
    });
    setLinesTick(t => t + 1);
  }, []);

  // Cancel connect mode on Escape
  useEffect(() => {
    const h = e => { if (e.key === "Escape") setConnectFrom(null); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // Card dragging
  const handleMouseDown = useCallback((cardId, e) => {
    if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "BUTTON" || e.target.closest("button")) return;
    e.preventDefault();
    const card = cards.find(c => c.id === cardId);
    if (!card) return;
    setDragging({ id: cardId, startX: e.clientX, startY: e.clientY, origX: card.pos.x, origY: card.pos.y });
  }, [cards]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = e => {
      const dx = e.clientX - dragging.startX;
      const dy = e.clientY - dragging.startY;
      setCards(prev => prev.map(c =>
        c.id === dragging.id ? { ...c, pos: { x: Math.max(0, dragging.origX + dx), y: Math.max(0, dragging.origY + dy) } } : c
      ));
      setLinesTick(t => t + 1);
    };
    const onUp = () => setDragging(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [dragging]);

  // Redraw lines on scroll / resize
  useEffect(() => {
    const t = setInterval(() => setLinesTick(x => x + 1), 300);
    return () => clearInterval(t);
  }, []);

  // Compute SVG lines
  const svgLines = connections.map((conn, i) => {
    const fromEl = cardRefs.current[conn.from];
    const toEl = cardRefs.current[conn.to];
    const canvas = canvasRef.current;
    if (!fromEl || !toEl || !canvas) return null;

    const cRect = canvas.getBoundingClientRect();
    const fRect = fromEl.getBoundingClientRect();
    const tRect = toEl.getBoundingClientRect();

    // Decide direction
    const belowThresh = tRect.top > fRect.bottom - 30;
    let x1, y1, x2, y2;
    if (belowThresh) {
      x1 = fRect.left + fRect.width / 2 - cRect.left + canvas.scrollLeft;
      y1 = fRect.bottom - cRect.top + canvas.scrollTop;
      x2 = tRect.left + tRect.width / 2 - cRect.left + canvas.scrollLeft;
      y2 = tRect.top - cRect.top + canvas.scrollTop;
    } else {
      x1 = fRect.right - cRect.left + canvas.scrollLeft;
      y1 = fRect.top + fRect.height / 2 - cRect.top + canvas.scrollTop;
      x2 = tRect.left - cRect.left + canvas.scrollLeft;
      y2 = tRect.top + tRect.height / 2 - cRect.top + canvas.scrollTop;
    }

    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    let cp1x, cp1y, cp2x, cp2y;
    if (belowThresh) {
      const offset = Math.min(dy * 0.45, 80);
      cp1x = x1; cp1y = y1 + offset;
      cp2x = x2; cp2y = y2 - offset;
    } else {
      const offset = Math.min(dx * 0.45, 80);
      cp1x = x1 + offset; cp1y = y1;
      cp2x = x2 - offset; cp2y = y2;
    }

    // Arrow head
    const angle = Math.atan2(y2 - cp2y, x2 - cp2x);
    const aLen = 8;
    const a1x = x2 - aLen * Math.cos(angle - 0.4);
    const a1y = y2 - aLen * Math.sin(angle - 0.4);
    const a2x = x2 - aLen * Math.cos(angle + 0.4);
    const a2y = y2 - aLen * Math.sin(angle + 0.4);

    return (
      <g key={i}>
        <path d={`M${x1},${y1} C${cp1x},${cp1y} ${cp2x},${cp2y} ${x2},${y2}`}
          fill="none" stroke={C.border} strokeWidth="2" />
        <path d={`M${a1x},${a1y} L${x2},${y2} L${a2x},${a2y}`}
          fill="none" stroke={C.textFaint} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={x1} cy={y1} r="3" fill={C.green} />
        <circle cx={x2} cy={y2} r="3" fill={C.green} />
      </g>
    );
  });

  // Canvas size
  const maxX = Math.max(1200, ...cards.map(c => c.pos.x + 360));
  const maxY = Math.max(800, ...cards.map(c => c.pos.y + 600));

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: C.bg, fontFamily: "'Mona Sans','Segoe UI','Noto Sans JP',sans-serif", color: C.text }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: ${C.bg}; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 4px; }
        ::-webkit-scrollbar-corner { background: ${C.bg}; }
        * { box-sizing: border-box; }
      `}</style>

      {/* Header */}
      <header style={{
        padding: "10px 20px", display: "flex", alignItems: "center", gap: 12,
        borderBottom: `1px solid ${C.border}`, background: C.card, zIndex: 50, flexShrink: 0,
      }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <rect x="2" y="2" width="8" height="8" rx="2" fill={C.green} />
          <rect x="14" y="2" width="8" height="8" rx="2" fill={C.accent} />
          <rect x="8" y="14" width="8" height="8" rx="2" fill={C.purple} />
          <line x1="10" y1="6" x2="14" y2="6" stroke={C.textFaint} strokeWidth="1.5" />
          <line x1="12" y1="10" x2="12" y2="14" stroke={C.textFaint} strokeWidth="1.5" />
        </svg>
        <span style={{ fontWeight: 700, fontSize: 15 }}>Chain Studio</span>
        <span style={{ fontSize: 11, color: C.textFaint, borderLeft: `1px solid ${C.border}`, paddingLeft: 10, marginLeft: 4 }}>
          AI Image Generation Pipeline
        </span>
        <div style={{ flex: 1 }} />
        {connectFrom && (
          <div style={{
            padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600,
            background: `${C.green}22`, color: C.green, border: `1px solid ${C.green}44`,
            animation: "fadeIn 0.2s ease",
          }}>
            🔗 接続先のカードをクリック（Escでキャンセル）
          </div>
        )}
        <span style={{ fontSize: 11, color: C.textMuted }}>{cards.length} nodes · {connections.length} links</span>
        <button onClick={() => addCard()} style={{
          padding: "5px 14px", borderRadius: 6,
          background: C.green, border: "none",
          color: "#fff", fontWeight: 600, fontSize: 12, cursor: "pointer",
        }}
          onMouseEnter={e => e.currentTarget.style.background = C.greenHover}
          onMouseLeave={e => e.currentTarget.style.background = C.green}
        >+ Add Node</button>
      </header>

      {/* Toolbar */}
      <div style={{
        padding: "6px 20px", borderBottom: `1px solid ${C.border}`, background: C.card,
        display: "flex", alignItems: "center", gap: 16, fontSize: 11, color: C.textMuted, flexShrink: 0,
      }}>
        <span>💡 ヘッダー ⠿ をドラッグで移動</span>
        <span style={{ color: C.border }}>|</span>
        <span>出力画像を別カードのInputにドロップ → 自動接続</span>
        <span style={{ color: C.border }}>|</span>
        <span>○ コネクタをクリックして手動接続</span>
      </div>

      {/* Canvas */}
      <div ref={canvasRef} style={{
        flex: 1, overflow: "auto", position: "relative",
        backgroundImage: `radial-gradient(${C.border}40 1px, transparent 1px)`,
        backgroundSize: "24px 24px",
      }}>
        <div style={{ width: maxX, height: maxY, position: "relative" }}>
          {/* SVG connection lines */}
          <svg style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 0 }}
            key={linesTick}>
            {svgLines}
          </svg>

          {/* Cards */}
          {cards.map(card => (
            <div key={card.id}
              onClick={() => {
                if (connectFrom && connectFrom !== card.id) {
                  handleStartConnect(card.id);
                }
              }}
              style={{
                position: "absolute",
                left: card.pos.x, top: card.pos.y,
                zIndex: dragging?.id === card.id ? 100 : 10,
                outline: connectFrom && connectFrom !== card.id ? `2px solid ${C.green}66` : "none",
                borderRadius: 10,
                transition: dragging?.id === card.id ? "none" : "outline 0.15s",
              }}
            >
              <GenCard
                card={card}
                onUpdate={updateCard}
                onDelete={() => deleteCard(card.id)}
                onGenerate={handleGenerate}
                onStartConnect={handleStartConnect}
                onAutoConnect={handleAutoConnect}
                onDragHandle={handleMouseDown}
                connectMode={connectFrom}
                cardRef={el => { cardRefs.current[card.id] = el; }}
                totalCards={cards.length}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
