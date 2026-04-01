import { useState, useRef, useCallback, useEffect } from "react";
import { C } from "./theme";
import { AI_MODELS } from "./models";
import {
  runModel,
  uploadImage,
  hasApiKey,
  dispatchGenerate,
  fetchManifest,
  getGhToken,
  setGhToken,
  getGhRepo,
  hasGhConfig,
} from "./fal";

let _id = 0;
const uid = () => `c${++_id}`;
let dragPayload = null;
const STUDIO_STATE_KEY = "fal_studio_state";

function isHostedPages() {
  if (typeof window === "undefined") return false;
  return window.location.hostname.endsWith("github.io");
}

function buildPatCreationUrl(repoFullName) {
  const [owner, repo] = String(repoFullName || "").split("/");
  const params = new URLSearchParams({
    name: "fal-image-studio-actions",
    description: "Dispatch generate.yml for fal-image-studio",
    expires_in: "30",
    actions: "write",
  });

  if (owner) params.set("target_name", owner);

  return {
    url: `https://github.com/settings/personal-access-tokens/new?${params.toString()}`,
    repoName: repo || repoFullName || "this repository",
  };
}

function defaultParams(modelId) {
  const model = AI_MODELS.find((m) => m.id === modelId);
  const params = {};
  if (model?.params) {
    for (const def of model.params) {
      params[def.key] = def.default;
    }
  }
  return params;
}

function getModelMeta(modelId) {
  return AI_MODELS.find((model) => model.id === modelId);
}

function extractOutputImages(source) {
  const urls = [];
  const rawResult = source?.result && typeof source.result === "object" ? source.result : source;

  if (Array.isArray(source?.imageUrls)) {
    urls.push(...source.imageUrls);
  }
  if (Array.isArray(rawResult?.images)) {
    for (const image of rawResult.images) {
      if (image?.url) urls.push(image.url);
    }
  }
  if (rawResult?.image?.url) {
    urls.push(rawResult.image.url);
  }

  return [...new Set(urls.filter(Boolean))];
}

function readLocalHistoryRaw() {
  try {
    const history = JSON.parse(localStorage.getItem("fal_history") || "[]");
    return Array.isArray(history) ? history : [];
  } catch (error) {
    console.error("Failed to parse fal_history:", error);
    return [];
  }
}

function readStudioStateRaw() {
  try {
    const saved = JSON.parse(localStorage.getItem(STUDIO_STATE_KEY) || "null");
    return saved && typeof saved === "object" ? saved : null;
  } catch (error) {
    console.error("Failed to parse fal_studio_state:", error);
    return null;
  }
}

function normalizeHistoryEntries(items, source) {
  return items
    .map((item, index) => {
      const timestamp = item?.timestamp || "";
      const imageUrls = extractOutputImages(item);
      const cardState = normalizeCardState(item?.card_state ?? item?.cardState, {
        model: item?.model,
        prompt: item?.prompt,
        inputImages: Array.isArray(item?.input_images)
          ? item.input_images
          : Array.isArray(item?.inputImages)
            ? item.inputImages
            : [],
        params: item?.params,
      });

      return {
        id: item?.id || `${source}-${item?.filename || index}-${timestamp || index}`,
        source,
        filename: item?.filename || null,
        model: item?.model || "unknown",
        prompt: item?.prompt || "",
        timestamp,
        imageUrls,
        inputImages: Array.isArray(item?.input_images)
          ? item.input_images.filter(Boolean)
          : Array.isArray(item?.inputImages)
            ? item.inputImages.filter(Boolean)
            : [],
        result: item?.result ?? item?.raw ?? null,
        cardState,
      };
    })
    .filter((item) => item.imageUrls.length > 0 || item.prompt || item.model !== "unknown");
}

function sortHistoryEntries(items) {
  return [...items].sort((a, b) => {
    const aTime = Date.parse(a.timestamp || "") || 0;
    const bTime = Date.parse(b.timestamp || "") || 0;
    return bTime - aTime;
  });
}

function formatTimestamp(timestamp) {
  if (!timestamp) return "Unknown time";
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString();
}

function createCard(modelId, overrides = {}) {
  const params = {
    ...defaultParams(modelId),
    ...(overrides.params || {}),
  };

  return {
    id: uid(),
    model: modelId,
    prompt: "",
    inputImages: [],
    outputs: [],
    status: "idle",
    error: null,
    pos: { x: 60, y: 40 },
    ...overrides,
    params,
  };
}

function getDefaultStudioCards() {
  return [
    createCard("reve", { pos: { x: 60, y: 40 } }),
    createCard("clarity-upscaler", { pos: { x: 440, y: 40 } }),
  ];
}

function normalizeCardState(cardState, fallback = null) {
  const raw = cardState && typeof cardState === "object" ? cardState : {};
  const base = fallback && typeof fallback === "object" ? fallback : {};
  const fallbackModel = typeof base.model === "string" && getModelMeta(base.model) ? base.model : null;
  const modelId = typeof raw.model === "string" && getModelMeta(raw.model)
    ? raw.model
    : fallbackModel || AI_MODELS[0]?.id || null;

  if (!modelId) return null;

  const inputImages = Array.isArray(raw.inputImages)
    ? raw.inputImages
    : Array.isArray(raw.input_images)
      ? raw.input_images
      : Array.isArray(base.inputImages)
        ? base.inputImages
        : Array.isArray(base.input_images)
          ? base.input_images
          : [];
  const params = raw.params && typeof raw.params === "object"
    ? raw.params
    : base.params && typeof base.params === "object"
      ? base.params
      : {};
  const position = raw.pos && typeof raw.pos === "object"
    ? raw.pos
    : base.pos && typeof base.pos === "object"
      ? base.pos
      : null;
  const numericIndex = Number(raw.index ?? raw.cardIndex ?? base.index ?? base.cardIndex);
  const index = Number.isFinite(numericIndex) && numericIndex > 0 ? numericIndex : null;

  return {
    version: Number(raw.version) || 1,
    index,
    model: modelId,
    prompt: typeof raw.prompt === "string"
      ? raw.prompt
      : typeof base.prompt === "string"
        ? base.prompt
        : "",
    inputImages: [...new Set(inputImages.filter(Boolean))],
    params: {
      ...defaultParams(modelId),
      ...params,
    },
    pos: position && Number.isFinite(position.x) && Number.isFinite(position.y)
      ? { x: position.x, y: position.y }
      : null,
  };
}

function buildCardState(card, index) {
  return normalizeCardState({
    version: 1,
    index: index + 1,
    model: card.model,
    prompt: card.prompt,
    inputImages: card.inputImages,
    params: card.params,
    pos: card.pos,
  });
}

function applyCardState(card, cardState, imageUrls = []) {
  const normalized = normalizeCardState(cardState, card);
  if (!normalized) return card;

  return {
    ...card,
    model: normalized.model,
    prompt: normalized.prompt,
    inputImages: [...normalized.inputImages],
    params: { ...normalized.params },
    pos: normalized.pos ? { ...normalized.pos } : card.pos,
    outputs: [...new Set((imageUrls || []).filter(Boolean))],
    status: imageUrls.length > 0 ? "done" : "idle",
    error: null,
  };
}

function syncUidCounter(cards) {
  const maxId = cards.reduce((max, card) => {
    const match = /^c(\d+)$/.exec(card.id || "");
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  _id = Math.max(_id, maxId);
}

function loadStudioState() {
  const raw = readStudioStateRaw();
  if (!raw) return null;

  const cards = Array.isArray(raw.cards)
    ? raw.cards
      .map((item, index) => {
        const normalized = normalizeCardState(item, item);
        if (!normalized) return null;

        return {
          id: typeof item?.id === "string" && item.id ? item.id : `c${index + 1}`,
          model: normalized.model,
          prompt: normalized.prompt,
          inputImages: normalized.inputImages,
          outputs: Array.isArray(item?.outputs) ? item.outputs.filter(Boolean) : [],
          status: item?.status === "done" ? "done" : "idle",
          error: typeof item?.error === "string" ? item.error : null,
          params: normalized.params,
          pos: normalized.pos || { x: 60 + index * 120, y: 40 },
        };
      })
      .filter(Boolean)
    : [];

  if (!cards.length) return null;

  syncUidCounter(cards);

  const validIds = new Set(cards.map((card) => card.id));
  const seenConnections = new Set();
  const connections = Array.isArray(raw.connections)
    ? raw.connections.filter((connection) => {
        if (!connection || !validIds.has(connection.from) || !validIds.has(connection.to)) return false;
        const key = `${connection.from}->${connection.to}`;
        if (seenConnections.has(key)) return false;
        seenConnections.add(key);
        return true;
      })
    : [];
  const galleryTargetCardId = validIds.has(raw.galleryTargetCardId) ? raw.galleryTargetCardId : cards[0].id;

  return {
    cards,
    connections,
    galleryOpen: typeof raw.galleryOpen === "boolean" ? raw.galleryOpen : true,
    galleryTargetCardId,
  };
}

function ImageThumb({ src, size = 52, onRemove, draggable, cardId, onClick, title }) {
  return (
    <div
      draggable={draggable}
      title={title}
      onClick={onClick}
      onDragStart={(e) => {
        if (!draggable) return;
        dragPayload = { src, fromCard: cardId || null };
        e.dataTransfer.setData("text/plain", src);
        e.dataTransfer.effectAllowed = "copy";
      }}
      onDragEnd={() => { dragPayload = null; }}
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        overflow: "hidden",
        position: "relative",
        flexShrink: 0,
        cursor: draggable ? "grab" : onClick ? "pointer" : "default",
        border: `1px solid ${C.border}`,
        transition: "transform 0.12s, border-color 0.12s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "scale(1.06)";
        e.currentTarget.style.borderColor = C.borderHover;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "scale(1)";
        e.currentTarget.style.borderColor = C.border;
      }}
    >
      <img
        src={src}
        alt=""
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          style={{
            position: "absolute",
            top: 1,
            right: 1,
            width: 16,
            height: 16,
            borderRadius: "50%",
            border: "none",
            background: "rgba(0,0,0,0.75)",
            color: "#fff",
            fontSize: 10,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 1,
            padding: 0,
          }}
        >
          x
        </button>
      )}
    </div>
  );
}

function DropZone({ onDrop, onFileDrop, children, label }) {
  const [over, setOver] = useState(false);
  const hasChildren = Array.isArray(children) ? children.length > 0 : !!children;
  const fileRef = useRef(null);

  const handleDrop = (e) => {
    e.preventDefault();
    setOver(false);
    if (dragPayload) {
      onDrop(dragPayload);
      return;
    }
    const files = e.dataTransfer.files;
    if (files.length > 0 && onFileDrop) {
      for (const file of files) {
        if (file.type.startsWith("image/")) onFileDrop(file);
      }
    }
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={handleDrop}
      onClick={() => fileRef.current?.click()}
      style={{
        minHeight: 48,
        borderRadius: 6,
        padding: 6,
        border: `1px dashed ${over ? C.accent : C.border}`,
        background: over ? `${C.accent}11` : "transparent",
        transition: "all 0.15s",
        cursor: "pointer",
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        alignItems: "center",
      }}
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          if (onFileDrop) {
            for (const file of e.target.files) onFileDrop(file);
          }
          e.target.value = "";
        }}
      />
      {children}
      {!hasChildren && (
        <span style={{ color: C.textFaint, fontSize: 11, margin: "auto", userSelect: "none" }}>
          {over ? "+ Drop" : label || "Drop or click to add images"}
        </span>
      )}
    </div>
  );
}

function ModelSelector({ selected, onSelect }) {
  const [open, setOpen] = useState(false);
  const model = getModelMeta(selected);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handleMouseDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 6,
          padding: "4px 10px",
          color: C.text,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          width: "100%",
        }}
      >
        <span style={{ color: model?.color, fontSize: 14 }}>{model?.icon}</span>
        <span style={{ flex: 1, textAlign: "left", fontWeight: 600 }}>{model?.name}</span>
        <span style={{ fontSize: 9, color: C.textFaint }}>v</span>
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 2px)",
            left: 0,
            right: 0,
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            zIndex: 200,
            overflow: "hidden",
            boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
          }}
        >
          {AI_MODELS.map((modelOption) => (
            <button
              key={modelOption.id}
              onClick={() => {
                onSelect(modelOption.id);
                setOpen(false);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 10px",
                background: modelOption.id === selected ? C.surface : "transparent",
                border: "none",
                color: C.text,
                cursor: "pointer",
                width: "100%",
                fontSize: 12,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = C.surface; }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = modelOption.id === selected ? C.surface : "transparent";
              }}
            >
              <span style={{ color: modelOption.color, fontSize: 14 }}>{modelOption.icon}</span>
              {modelOption.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ParamsPanel({ params, onChange, modelId }) {
  const [open, setOpen] = useState(false);
  const update = (key, value) => onChange({ ...params, [key]: value });
  const model = getModelMeta(modelId);
  const paramDefs = model?.params || [];

  if (paramDefs.length === 0) return null;

  return (
    <div style={{ borderTop: `1px solid ${C.border}` }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%", background: "none", border: "none", color: C.textMuted,
          padding: "6px 0", fontSize: 11, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 4, fontWeight: 500,
        }}
      >
        <span style={{
          display: "inline-block", fontSize: 8, transition: "transform 0.15s",
          transform: open ? "rotate(90deg)" : "rotate(0deg)",
        }}>{">"}</span>
        Parameters
      </button>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "2px 0 8px", animation: "fadeIn 0.15s ease" }}>
          {paramDefs.map((def) => {
            const val = params[def.key] ?? def.default;
            if (def.type === "slider") {
              return (
                <div key={def.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <label style={{ fontSize: 11, color: C.textMuted, width: 80, flexShrink: 0 }}>{def.label}</label>
                  <input type="range" min={def.min} max={def.max} step={def.step || 1} value={val}
                    onChange={(e) => update(def.key, Number(e.target.value))}
                    style={{ flex: 1, accentColor: C.green, height: 4 }} />
                  <span style={{ fontSize: 11, color: C.text, width: 38, textAlign: "right", fontFamily: "monospace" }}>{val}</span>
                </div>
              );
            }
            if (def.type === "select") {
              return (
                <div key={def.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <label style={{ fontSize: 11, color: C.textMuted, width: 80, flexShrink: 0 }}>{def.label}</label>
                  <select value={val} onChange={(e) => update(def.key, e.target.value)}
                    style={{ flex: 1, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 4, padding: "3px 6px", color: C.text, fontSize: 11 }}>
                    {def.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              );
            }
            if (def.type === "number") {
              return (
                <div key={def.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <label style={{ fontSize: 11, color: C.textMuted, width: 80, flexShrink: 0 }}>{def.label}</label>
                  <input type="number" value={val} onChange={(e) => update(def.key, Number(e.target.value))}
                    style={{ flex: 1, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 4, padding: "3px 6px", color: C.text, fontSize: 11, fontFamily: "monospace" }} />
                </div>
              );
            }
            if (def.type === "bool") {
              return (
                <div key={def.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <label style={{ fontSize: 11, color: C.textMuted, width: 80, flexShrink: 0 }}>{def.label}</label>
                  <input type="checkbox" checked={!!val} onChange={(e) => update(def.key, e.target.checked)}
                    style={{ accentColor: C.green }} />
                  <span style={{ fontSize: 11, color: C.textFaint }}>{val ? "on" : "off"}</span>
                </div>
              );
            }
            return null;
          })}
        </div>
      )}
    </div>
  );
}

function GenCard({
  card,
  onUpdate,
  onDelete,
  onGenerate,
  onStartConnect,
  onAutoConnect,
  onDragHandle,
  connectMode,
  cardRef,
  totalCards,
}) {
  const isGenerating = card.status === "generating";

  const handleDropInput = useCallback((payload) => {
    if (!card.inputImages.includes(payload.src)) {
      onUpdate({ ...card, inputImages: [...card.inputImages, payload.src] });
      if (payload.fromCard && payload.fromCard !== card.id) {
        onAutoConnect(payload.fromCard, card.id);
      }
    }
  }, [card, onUpdate, onAutoConnect]);

  const handleFileDrop = useCallback(async (file) => {
    try {
      const url = await uploadImage(file);
      onUpdate({ ...card, inputImages: [...card.inputImages, url] });
    } catch (error) {
      console.error("Upload failed:", error);
    }
  }, [card, onUpdate]);

  return (
    <div
      ref={cardRef}
      style={{
        width: 300,
        borderRadius: 8,
        background: C.card,
        border: `1px solid ${C.cardBorder}`,
        display: "flex",
        flexDirection: "column",
        overflow: "visible",
        transition: "box-shadow 0.2s, border-color 0.2s",
        position: "relative",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = C.borderHover;
        e.currentTarget.style.boxShadow = "0 4px 24px rgba(0,0,0,0.3)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = C.cardBorder;
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div
        onMouseDown={(e) => {
          if (e.target.tagName === "BUTTON" || e.target.closest("button") || e.target.closest("[data-nodrag]")) return;
          onDragHandle(card.id, e);
        }}
        style={{
          padding: "10px 12px 8px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          borderBottom: `1px solid ${C.border}`,
          cursor: "grab",
        }}
      >
        <div
          style={{
            color: C.textFaint,
            fontSize: 14,
            cursor: "grab",
            flexShrink: 0,
            lineHeight: 1,
            userSelect: "none",
          }}
          title="Drag to move"
        >
          {"\u2807"}
        </div>
        <div data-nodrag="true" style={{ flex: 1 }}>
          <ModelSelector selected={card.model} onSelect={(id) => onUpdate({ ...card, model: id, params: defaultParams(id) })} />
        </div>
        {totalCards > 1 && (
          <button
            onClick={onDelete}
            style={{
              background: "none",
              border: "none",
              color: C.textFaint,
              cursor: "pointer",
              fontSize: 16,
              padding: "2px 4px",
              lineHeight: 1,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = C.red; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = C.textFaint; }}
          >
            x
          </button>
        )}
      </div>

      <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
        <textarea
          value={card.prompt}
          onChange={(e) => onUpdate({ ...card, prompt: e.target.value })}
          placeholder="Prompt..."
          rows={2}
          style={{
            width: "100%",
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: "8px 10px",
            color: C.text,
            fontSize: 12,
            resize: "vertical",
            outline: "none",
            fontFamily: "'Segoe UI','Noto Sans JP',sans-serif",
            boxSizing: "border-box",
          }}
          onFocus={(e) => { e.target.style.borderColor = C.accent; }}
          onBlur={(e) => { e.target.style.borderColor = C.border; }}
        />

        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: C.textFaint,
              marginBottom: 3,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Input
          </div>
          <DropZone onDrop={handleDropInput} onFileDrop={handleFileDrop} label="Drop images or click to upload">
            {card.inputImages.map((src, index) => (
              <ImageThumb
                key={`${src}-${index}`}
                src={src}
                size={44}
                onRemove={() => {
                  const next = [...card.inputImages];
                  next.splice(index, 1);
                  onUpdate({ ...card, inputImages: next });
                }}
              />
            ))}
          </DropZone>
        </div>

        <ParamsPanel params={card.params} onChange={(params) => onUpdate({ ...card, params })} modelId={card.model} />

        <button
          onClick={() => onGenerate(card.id)}
          disabled={isGenerating || (!card.prompt.trim() && card.inputImages.length === 0)}
          style={{
            padding: "7px 0",
            borderRadius: 6,
            border: "none",
            background: isGenerating ? C.surface : C.green,
            color: "#fff",
            fontWeight: 600,
            fontSize: 12,
            cursor: isGenerating ? "wait" : "pointer",
            transition: "background 0.15s",
            opacity: (!card.prompt.trim() && card.inputImages.length === 0) ? 0.4 : 1,
          }}
          onMouseEnter={(e) => { if (!isGenerating) e.currentTarget.style.background = C.greenHover; }}
          onMouseLeave={(e) => { if (!isGenerating) e.currentTarget.style.background = C.green; }}
        >
          {isGenerating
            ? (hasApiKey() ? "Generating..." : "Waiting for Actions...")
            : (hasApiKey() ? "\u25b6 Generate" : "\u25b6 Generate via Actions")
          }
        </button>

        {card.error && (
          <div
            style={{
              fontSize: 11,
              color: C.red,
              padding: "4px 8px",
              background: `${C.red}11`,
              borderRadius: 4,
            }}
          >
            {card.error}
          </div>
        )}

        {card.outputs.length > 0 && (
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: C.textFaint,
                marginBottom: 3,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span>
                Output <span style={{ color: C.green }}>{card.outputs.length}</span>
              </span>
              <span style={{ fontWeight: 400, textTransform: "none", fontSize: 10, color: C.textFaint }}>
                drag to chain
              </span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {card.outputs.map((src, index) => (
                <ImageThumb key={`output-${index}`} src={src} size={60} draggable cardId={card.id} />
              ))}
            </div>
          </div>
        )}
      </div>

      <div
        onClick={() => onStartConnect(card.id)}
        title="Click to connect"
        style={{
          position: "absolute",
          bottom: -8,
          left: "50%",
          transform: "translateX(-50%)",
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: connectMode === card.id ? C.green : C.surface,
          border: `2px solid ${connectMode === card.id ? C.green : C.border}`,
          cursor: "pointer",
          zIndex: 10,
          transition: "all 0.15s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = C.green;
          e.currentTarget.style.background = C.greenMuted;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = connectMode === card.id ? C.green : C.border;
          e.currentTarget.style.background = connectMode === card.id ? C.green : C.surface;
        }}
      />
      <div
        onClick={() => onStartConnect(card.id)}
        style={{
          position: "absolute",
          right: -8,
          top: "50%",
          transform: "translateY(-50%)",
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: connectMode === card.id ? C.green : C.surface,
          border: `2px solid ${connectMode === card.id ? C.green : C.border}`,
          cursor: "pointer",
          zIndex: 10,
          transition: "all 0.15s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = C.green;
          e.currentTarget.style.background = C.greenMuted;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = connectMode === card.id ? C.green : C.border;
          e.currentTarget.style.background = connectMode === card.id ? C.green : C.surface;
        }}
      />
    </div>
  );
}

function SettingsModal({ onClose }) {
  const hostedPages = isHostedPages();
  const [ghToken, setGhTokenVal] = useState(getGhToken());
  const detectedRepo = getGhRepo();
  const canSave = (!!ghToken && !!detectedRepo) || !hostedPages;
  const patSetup = buildPatCreationUrl(detectedRepo);

  const inputStyle = {
    width: "100%",
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    padding: "10px 12px",
    color: C.text,
    fontSize: 13,
    outline: "none",
    fontFamily: "monospace",
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        style={{
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
          padding: 32, width: 460, display: "flex", flexDirection: "column", gap: 20,
        }}
      >
        <h2 style={{ color: C.text, fontSize: 18, fontWeight: 700, margin: 0 }}>Settings</h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ color: C.textMuted, fontSize: 12 }}>
            <span style={{ fontWeight: 600 }}>GitHub Actions</span> (required for GitHub Pages)
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ color: C.textMuted, fontSize: 12 }}>Detected repository</label>
            <div
              style={{
                ...inputStyle,
                color: detectedRepo ? C.text : C.textFaint,
                background: C.bg,
              }}
            >
              {detectedRepo || "Could not detect repository from the current URL"}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ color: C.textMuted, fontSize: 12 }}>Personal Access Token (repo scope)</label>
            <input type="password" value={ghToken} onChange={(e) => setGhTokenVal(e.target.value)}
              placeholder="ghp_..." style={inputStyle}
              onFocus={(e) => { e.target.style.borderColor = C.accent; }}
              onBlur={(e) => { e.target.style.borderColor = C.border; }}
            />
            <div style={{ fontSize: 11, color: C.textFaint, lineHeight: 1.45 }}>
              <a
                href={patSetup.url}
                target="_blank"
                rel="noreferrer"
                style={{ color: C.accent }}
              >
                Create a fine-grained PAT with `Actions: write`
              </a>
              {" "}and select only `{patSetup.repoName}` under Repository access.
            </div>
          </div>
        </div>

        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 11, color: C.textFaint }}>
            `FAL_KEY` is read from the build environment locally. GitHub Pages uses the repository secret on Actions runners.
          </div>
        </div>

        <div style={{ display: "flex" }}>
          <button
            onClick={() => {
              setGhToken(ghToken);
              if (canSave) {
                onClose();
              }
            }}
            disabled={!canSave}
            style={{
              flex: 1,
              padding: "10px 0",
              borderRadius: 6,
              border: "none",
              background: canSave ? C.green : C.surface,
              color: canSave ? "#fff" : C.textFaint,
              fontWeight: 600,
              fontSize: 14,
              cursor: canSave ? "pointer" : "not-allowed",
            }}
          >Save</button>
        </div>

        <div style={{ fontSize: 11, color: C.textFaint }}>
          {hasGhConfig()
            ? "Actions mode: GitHub configured"
            : hasApiKey()
              ? "Direct mode: local .env key detected"
              : hostedPages
                ? "GitHub Pages requires a PAT before generation can run"
                : "Local direct mode uses .env. Actions mode needs a PAT."}
        </div>
      </div>
    </div>
  );
}

function HistoryPanel({
  open,
  onToggle,
  entries,
  cards,
  targetCardId,
  onTargetCardChange,
  onUseImage,
  onRestoreEntry,
}) {
  const targetCard = cards.find((card) => card.id === targetCardId) || null;

  return (
    <section
      style={{
        height: open ? 232 : 52,
        borderTop: `1px solid ${C.border}`,
        background: C.card,
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        transition: "height 0.2s ease",
      }}
    >
      <div
        style={{
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          borderBottom: open ? `1px solid ${C.border}` : "none",
          minHeight: 52,
        }}
      >
        <button
          onClick={onToggle}
          style={{
            width: 30,
            height: 30,
            borderRadius: 6,
            border: `1px solid ${C.border}`,
            background: C.surface,
            color: C.text,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          {open ? "-" : "+"}
        </button>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>Gallery / History</div>
          <div style={{ color: C.textMuted, fontSize: 11 }}>
            {entries.length} items available. Drag thumbnails into card inputs or click to send to the selected card.
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <label style={{ fontSize: 11, color: C.textMuted }}>Click target</label>
        <select
          value={targetCardId || ""}
          onChange={(e) => onTargetCardChange(e.target.value)}
          style={{
            minWidth: 180,
            background: C.surface,
            color: C.text,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: "6px 10px",
            fontSize: 12,
            outline: "none",
          }}
        >
          {cards.map((card, index) => {
            const model = getModelMeta(card.model);
            return (
              <option key={card.id} value={card.id}>
                {index + 1}. {model?.name || card.model}
              </option>
            );
          })}
        </select>
        <span style={{ fontSize: 11, color: C.textFaint, minWidth: 120, textAlign: "right" }}>
          {targetCard ? `Selected: ${getModelMeta(targetCard.model)?.name || targetCard.model}` : "No target"}
        </span>
      </div>

      {open && (
        <div style={{ flex: 1, overflow: "auto", padding: 14 }}>
          {entries.length === 0 ? (
            <div
              style={{
                height: "100%",
                borderRadius: 10,
                border: `1px dashed ${C.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: C.textMuted,
                fontSize: 12,
                background: `${C.bg}99`,
              }}
            >
              No saved generations yet.
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: 12,
              }}
            >
              {entries.map((entry) => {
                const model = getModelMeta(entry.model);
                return (
                  <article
                    key={entry.id}
                    style={{
                      borderRadius: 10,
                      background: `${C.bg}bb`,
                      border: `1px solid ${C.border}`,
                      padding: 12,
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                      minHeight: 150,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span
                        style={{
                          color: model?.color || C.accent,
                          fontSize: 13,
                          fontWeight: 700,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span>{model?.icon || "*"}</span>
                        <span>{model?.name || entry.model}</span>
                      </span>
                      <span
                        style={{
                          marginLeft: "auto",
                          fontSize: 10,
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                          color: entry.source === "repo" ? C.orange : C.textFaint,
                        }}
                      >
                        {entry.source}
                      </span>
                    </div>
                    {entry.cardState && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        {entry.cardState.index && (
                          <span
                            style={{
                              fontSize: 10,
                              color: C.green,
                              background: `${C.green}16`,
                              border: `1px solid ${C.green}33`,
                              borderRadius: 999,
                              padding: "3px 8px",
                            }}
                          >
                            Card {entry.cardState.index}
                          </span>
                        )}
                        <span style={{ fontSize: 10, color: C.textFaint }}>
                          {entry.cardState.inputImages.length} input
                          {entry.cardState.inputImages.length === 1 ? "" : "s"}
                        </span>
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: C.textMuted }}>{formatTimestamp(entry.timestamp)}</div>
                    <div
                      style={{
                        fontSize: 12,
                        color: entry.prompt ? C.text : C.textMuted,
                        lineHeight: 1.45,
                        minHeight: 34,
                      }}
                    >
                      {entry.prompt || "No prompt saved"}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {entry.imageUrls.map((src, index) => (
                        <ImageThumb
                          key={`${entry.id}-${index}`}
                          src={src}
                          size={68}
                          draggable
                          title={targetCard ? `Click to add to ${getModelMeta(targetCard.model)?.name || targetCard.model}` : "Drag to a card input"}
                          onClick={() => onUseImage(targetCardId, src)}
                        />
                      ))}
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <button
                        onClick={() => onRestoreEntry(targetCardId, entry)}
                        disabled={!targetCardId || !entry.cardState}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 6,
                          border: `1px solid ${C.border}`,
                          background: !targetCardId || !entry.cardState ? C.bg : C.surface,
                          color: !targetCardId || !entry.cardState ? C.textFaint : C.text,
                          fontSize: 11,
                          cursor: !targetCardId || !entry.cardState ? "not-allowed" : "pointer",
                        }}
                      >
                        Restore To Selected
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default function App() {
  const initialStudioStateRef = useRef(loadStudioState());
  const initialStudioState = initialStudioStateRef.current;
  const [showSettings, setShowSettings] = useState(isHostedPages() ? !hasGhConfig() : false);
  const [cards, setCards] = useState(initialStudioState?.cards || getDefaultStudioCards());
  const [connections, setConnections] = useState(initialStudioState?.connections || []);
  const [connectFrom, setConnectFrom] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [linesTick, setLinesTick] = useState(0);
  const [galleryOpen, setGalleryOpen] = useState(initialStudioState?.galleryOpen ?? true);
  const [localHistoryEntries, setLocalHistoryEntries] = useState([]);
  const [repoHistoryEntries, setRepoHistoryEntries] = useState([]);
  const [galleryTargetCardId, setGalleryTargetCardId] = useState(initialStudioState?.galleryTargetCardId || null);
  const cardRefs = useRef({});
  const canvasRef = useRef(null);

  const galleryEntries = sortHistoryEntries([...localHistoryEntries, ...repoHistoryEntries]);

  const loadLocalHistory = useCallback(() => {
    setLocalHistoryEntries(normalizeHistoryEntries(readLocalHistoryRaw(), "local"));
  }, []);

  useEffect(() => {
    loadLocalHistory();
  }, [loadLocalHistory]);

  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key === "fal_history") loadLocalHistory();
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [loadLocalHistory]);

  useEffect(() => {
    let active = true;

    async function loadManifest() {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}outputs.json`, { cache: "no-store" });
        if (!response.ok) return;
        const manifest = await response.json();
        if (active && Array.isArray(manifest)) {
          manifestCountRef.current = manifest.length;
          setRepoHistoryEntries(normalizeHistoryEntries(manifest, "repo"));
        }
      } catch (error) {
        console.error("Failed to load outputs manifest:", error);
      }
    }

    loadManifest();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!cards.length) {
      setGalleryTargetCardId(null);
      return;
    }
    if (!galleryTargetCardId || !cards.some((card) => card.id === galleryTargetCardId)) {
      setGalleryTargetCardId(cards[0].id);
    }
  }, [cards, galleryTargetCardId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      localStorage.setItem(STUDIO_STATE_KEY, JSON.stringify({
        cards: cards.map((card) => ({
          id: card.id,
          model: card.model,
          prompt: card.prompt,
          inputImages: card.inputImages,
          outputs: card.outputs,
          status: card.status,
          error: card.error,
          params: card.params,
          pos: card.pos,
        })),
        connections,
        galleryOpen,
        galleryTargetCardId,
      }));
    }, 120);

    return () => window.clearTimeout(timeoutId);
  }, [cards, connections, galleryOpen, galleryTargetCardId]);

  const updateCard = useCallback((updated) => {
    setCards((prev) => prev.map((card) => (card.id === updated.id ? updated : card)));
  }, []);

  const deleteCard = useCallback((id) => {
    setCards((prev) => prev.filter((card) => card.id !== id));
    setConnections((prev) => prev.filter((connection) => connection.from !== id && connection.to !== id));
  }, []);

  const addCard = useCallback(() => {
    const modelId = AI_MODELS[Math.floor(Math.random() * AI_MODELS.length)].id;
    const newCard = createCard(modelId, {
      pos: { x: 60 + cards.length * 120, y: 40 },
    });
    setCards((prev) => [...prev, newCard]);
    setGalleryTargetCardId(newCard.id);
  }, [cards.length]);

  const saveToHistory = useCallback((record, imageUrls) => {
    const history = readLocalHistoryRaw();
    history.unshift({
      model: record.model,
      prompt: record.prompt,
      inputImages: record.input_images,
      imageUrls,
      timestamp: record.timestamp,
      result: record.result,
      cardState: record.card_state,
    });
    if (history.length > 100) history.length = 100;
    localStorage.setItem("fal_history", JSON.stringify(history));
    setLocalHistoryEntries(normalizeHistoryEntries(history, "local"));
  }, []);

  const addImageToCard = useCallback((cardId, src) => {
    if (!cardId || !src) return;
    setCards((prev) => prev.map((card) => {
      if (card.id !== cardId || card.inputImages.includes(src)) return card;
      return { ...card, inputImages: [...card.inputImages, src] };
    }));
  }, []);

  // ─── Polling for Actions mode ───
  const pollingRef = useRef(null);
  const manifestCountRef = useRef(0);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const startPolling = useCallback((cardId, prevCount, fallbackCardState) => {
    stopPolling();
    let attempts = 0;
    const maxAttempts = 40; // ~10 minutes at 15s interval
    pollingRef.current = setInterval(async () => {
      attempts++;
      try {
        const manifest = await fetchManifest(import.meta.env.BASE_URL);
        if (manifest.length > prevCount) {
          // New result found - pick the latest
          const latest = manifest[0];
          const images = extractOutputImages(latest);
          if (images.length > 0) {
            setCards((prev) => prev.map((c) =>
              c.id === cardId
                ? applyCardState(c, latest?.cardState || latest?.card_state || fallbackCardState, images)
                : c
            ));
            manifestCountRef.current = manifest.length;
            setRepoHistoryEntries(normalizeHistoryEntries(manifest, "repo"));
            stopPolling();
            return;
          }
        }
      } catch (_) { /* ignore fetch errors */ }
      if (attempts >= maxAttempts) {
        setCards((prev) => prev.map((c) =>
          c.id === cardId ? { ...c, status: "idle", error: "Timed out waiting for Actions result. Check GitHub Actions tab." } : c
        ));
        stopPolling();
      }
    }, 15000);
  }, [stopPolling]);

  useEffect(() => stopPolling, [stopPolling]);

  // ─── Generate: local direct or Actions dispatch ───
  const handleGenerate = useCallback(async (cardId) => {
    setCards((prev) => prev.map((card) => (card.id === cardId ? { ...card, status: "generating", error: null } : card)));

    const card = cards.find((item) => item.id === cardId);
    if (!card) return;
    const cardIndex = cards.findIndex((item) => item.id === cardId);
    const cardState = buildCardState(card, cardIndex);

    const model = getModelMeta(card.model);
    if (!model) return;

    // ── Local direct mode (FAL_KEY available) ──
    if (hasApiKey()) {
      const input = {};
      if (card.prompt.trim()) input.prompt = card.prompt.trim();
      if (card.inputImages.length > 0) {
        if (model.imageParam === "image_urls") {
          input.image_urls = card.inputImages;
        } else {
          input.image_url = card.inputImages[0];
        }
      }

      // Send model-specific params (skip seed if -1)
      if (model.params) {
        for (const def of model.params) {
          const val = card.params[def.key] ?? def.default;
          if (def.key === "seed" && val < 0) continue;
          if (val !== undefined) input[def.key] = val;
        }
      }

      try {
        const result = await runModel(model.endpoint, input);
        const images = extractOutputImages(result);
        const timestamp = new Date().toISOString();
        const record = {
          model: card.model,
          prompt: card.prompt.trim(),
          input_images: [...card.inputImages],
          timestamp,
          result,
          card_state: cardState,
        };

        setCards((prev) => prev.map((item) => (
          item.id === cardId ? applyCardState(item, cardState, images) : item
        )));

        saveToHistory(record, images);
      } catch (error) {
        setCards((prev) => prev.map((item) => (
          item.id === cardId
            ? { ...item, status: "idle", error: error?.body?.detail || error?.message || JSON.stringify(error) }
            : item
        )));
      }
      return;
    }

    // ── Actions dispatch mode (GitHub PAT) ──
    if (!hasGhConfig()) {
      setCards((prev) => prev.map((item) => (
        item.id === cardId
          ? {
            ...item,
            status: "idle",
            error: isHostedPages()
              ? "GitHub repository and PAT are required on GitHub Pages. Open Settings."
              : "No API key or GitHub config. Open Settings.",
          }
          : item
      )));
      return;
    }

    try {
      await dispatchGenerate({
        model: card.model,
        prompt: card.prompt.trim(),
        imageUrl: card.inputImages[0] || "",
        cardState,
      });
      // Start polling for result
      startPolling(cardId, manifestCountRef.current, cardState);
    } catch (error) {
      setCards((prev) => prev.map((item) => (
        item.id === cardId
          ? { ...item, status: "idle", error: error.message || "Failed to dispatch" }
          : item
      )));
    }
  }, [cards, saveToHistory, startPolling]);

  const restoreHistoryEntry = useCallback((cardId, entry) => {
    const cardState = normalizeCardState(entry?.cardState, entry);
    if (!cardId || !cardState) return;
    setCards((prev) => prev.map((card) => (
      card.id === cardId ? applyCardState(card, cardState, entry?.imageUrls || []) : card
    )));
    setGalleryTargetCardId(cardId);
    setLinesTick((value) => value + 1);
  }, []);

  const handleStartConnect = useCallback((cardId) => {
    if (connectFrom && connectFrom !== cardId) {
      const exists = connections.some((connection) => connection.from === connectFrom && connection.to === cardId);
      if (!exists) setConnections((prev) => [...prev, { from: connectFrom, to: cardId }]);
      setConnectFrom(null);
    } else {
      setConnectFrom(cardId);
    }
  }, [connectFrom, connections]);

  const handleAutoConnect = useCallback((fromCardId, toCardId) => {
    setConnections((prev) => {
      const exists = prev.some((connection) => connection.from === fromCardId && connection.to === toCardId);
      if (exists) return prev;
      return [...prev, { from: fromCardId, to: toCardId }];
    });
    setLinesTick((tick) => tick + 1);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") setConnectFrom(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleMouseDown = useCallback((cardId, e) => {
    if (["TEXTAREA", "INPUT", "SELECT", "BUTTON"].includes(e.target.tagName) || e.target.closest("button")) return;
    e.preventDefault();
    const card = cards.find((item) => item.id === cardId);
    if (!card) return;
    setGalleryTargetCardId(cardId);
    setDragging({
      id: cardId,
      startX: e.clientX,
      startY: e.clientY,
      origX: card.pos.x,
      origY: card.pos.y,
    });
  }, [cards]);

  useEffect(() => {
    if (!dragging) return undefined;

    const onMove = (e) => {
      const dx = e.clientX - dragging.startX;
      const dy = e.clientY - dragging.startY;
      setCards((prev) => prev.map((card) => (
        card.id === dragging.id
          ? { ...card, pos: { x: Math.max(0, dragging.origX + dx), y: Math.max(0, dragging.origY + dy) } }
          : card
      )));
      setLinesTick((tick) => tick + 1);
    };
    const onUp = () => setDragging(null);

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging]);

  useEffect(() => {
    const interval = setInterval(() => setLinesTick((value) => value + 1), 300);
    return () => clearInterval(interval);
  }, []);

  const svgLines = connections.map((connection, index) => {
    const fromEl = cardRefs.current[connection.from];
    const toEl = cardRefs.current[connection.to];
    const canvas = canvasRef.current;
    if (!fromEl || !toEl || !canvas) return null;

    const canvasRect = canvas.getBoundingClientRect();
    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();

    const belowThreshold = toRect.top > fromRect.bottom - 30;
    let x1;
    let y1;
    let x2;
    let y2;

    if (belowThreshold) {
      x1 = fromRect.left + fromRect.width / 2 - canvasRect.left + canvas.scrollLeft;
      y1 = fromRect.bottom - canvasRect.top + canvas.scrollTop;
      x2 = toRect.left + toRect.width / 2 - canvasRect.left + canvas.scrollLeft;
      y2 = toRect.top - canvasRect.top + canvas.scrollTop;
    } else {
      x1 = fromRect.right - canvasRect.left + canvas.scrollLeft;
      y1 = fromRect.top + fromRect.height / 2 - canvasRect.top + canvas.scrollTop;
      x2 = toRect.left - canvasRect.left + canvas.scrollLeft;
      y2 = toRect.top + toRect.height / 2 - canvasRect.top + canvas.scrollTop;
    }

    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    let cp1x;
    let cp1y;
    let cp2x;
    let cp2y;

    if (belowThreshold) {
      const offset = Math.min(dy * 0.45, 80);
      cp1x = x1;
      cp1y = y1 + offset;
      cp2x = x2;
      cp2y = y2 - offset;
    } else {
      const offset = Math.min(dx * 0.45, 80);
      cp1x = x1 + offset;
      cp1y = y1;
      cp2x = x2 - offset;
      cp2y = y2;
    }

    const angle = Math.atan2(y2 - cp2y, x2 - cp2x);
    const arrowLength = 8;
    const a1x = x2 - arrowLength * Math.cos(angle - 0.4);
    const a1y = y2 - arrowLength * Math.sin(angle - 0.4);
    const a2x = x2 - arrowLength * Math.cos(angle + 0.4);
    const a2y = y2 - arrowLength * Math.sin(angle + 0.4);

    return (
      <g key={index}>
        <path
          d={`M${x1},${y1} C${cp1x},${cp1y} ${cp2x},${cp2y} ${x2},${y2}`}
          fill="none"
          stroke={C.border}
          strokeWidth="2"
        />
        <path
          d={`M${a1x},${a1y} L${x2},${y2} L${a2x},${a2y}`}
          fill="none"
          stroke={C.textFaint}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={x1} cy={y1} r="3" fill={C.green} />
        <circle cx={x2} cy={y2} r="3" fill={C.green} />
      </g>
    );
  });

  const maxX = Math.max(1200, ...cards.map((card) => card.pos.x + 360));
  const maxY = Math.max(800, ...cards.map((card) => card.pos.y + 600));

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: C.bg,
        fontFamily: "'Segoe UI','Noto Sans JP',sans-serif",
        color: C.text,
      }}
    >
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: ${C.bg}; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 4px; }
        ::-webkit-scrollbar-corner { background: ${C.bg}; }
        * { box-sizing: border-box; }
      `}</style>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

      <header
        style={{
          padding: "10px 20px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          borderBottom: `1px solid ${C.border}`,
          background: C.card,
          zIndex: 50,
          flexShrink: 0,
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <rect x="2" y="2" width="8" height="8" rx="2" fill={C.green} />
          <rect x="14" y="2" width="8" height="8" rx="2" fill={C.accent} />
          <rect x="8" y="14" width="8" height="8" rx="2" fill={C.purple} />
          <line x1="10" y1="6" x2="14" y2="6" stroke={C.textFaint} strokeWidth="1.5" />
          <line x1="12" y1="10" x2="12" y2="14" stroke={C.textFaint} strokeWidth="1.5" />
        </svg>
        <span style={{ fontWeight: 700, fontSize: 15 }}>fal Image Studio</span>
        <span
          style={{
            fontSize: 11,
            color: C.textFaint,
            borderLeft: `1px solid ${C.border}`,
            paddingLeft: 10,
            marginLeft: 4,
          }}
        >
          AI Image Generation Pipeline
        </span>
        <div style={{ flex: 1 }} />
        {connectFrom && (
          <div
            style={{
              padding: "4px 12px",
              borderRadius: 20,
              fontSize: 11,
              fontWeight: 600,
              background: `${C.green}22`,
              color: C.green,
              border: `1px solid ${C.green}44`,
              animation: "fadeIn 0.2s ease",
            }}
          >
            Click target card to connect (Esc to cancel)
          </div>
        )}
        <span style={{ fontSize: 11, color: C.textMuted }}>{cards.length} nodes</span>
        <button
          onClick={() => setShowSettings(true)}
          style={{
            padding: "5px 10px",
            borderRadius: 6,
            background: C.surface,
            border: `1px solid ${C.border}`,
            color: C.textMuted,
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          Settings
        </button>
        <button
          onClick={addCard}
          style={{
            padding: "5px 14px",
            borderRadius: 6,
            background: C.green,
            border: "none",
            color: "#fff",
            fontWeight: 600,
            fontSize: 12,
            cursor: "pointer",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = C.greenHover; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = C.green; }}
        >
          + Add Node
        </button>
      </header>

      <div
        style={{
          padding: "6px 20px",
          borderBottom: `1px solid ${C.border}`,
          background: C.card,
          display: "flex",
          alignItems: "center",
          gap: 16,
          fontSize: 11,
          color: C.textMuted,
          flexShrink: 0,
        }}
      >
        <span>Drag header to move cards</span>
        <span style={{ color: C.border }}>|</span>
        <span>Drop output images to another card's Input to chain</span>
        <span style={{ color: C.border }}>|</span>
        <span>Click connectors to link cards</span>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div
          ref={canvasRef}
          style={{
            flex: 1,
            minHeight: 0,
            overflow: "auto",
            position: "relative",
            backgroundImage: `radial-gradient(${C.border}40 1px, transparent 1px)`,
            backgroundSize: "24px 24px",
          }}
        >
          <div style={{ width: maxX, height: maxY, position: "relative" }}>
            <svg
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
                zIndex: 0,
              }}
              key={linesTick}
            >
              {svgLines}
            </svg>
            {cards.map((card) => (
              <div
                key={card.id}
                onMouseDown={() => setGalleryTargetCardId(card.id)}
                onClick={() => {
                  setGalleryTargetCardId(card.id);
                  if (connectFrom && connectFrom !== card.id) handleStartConnect(card.id);
                }}
                style={{
                  position: "absolute",
                  left: card.pos.x,
                  top: card.pos.y,
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
                  cardRef={(el) => { cardRefs.current[card.id] = el; }}
                  totalCards={cards.length}
                />
              </div>
            ))}
          </div>
        </div>

        <HistoryPanel
          open={galleryOpen}
          onToggle={() => setGalleryOpen((value) => !value)}
          entries={galleryEntries}
          cards={cards}
          targetCardId={galleryTargetCardId}
          onTargetCardChange={setGalleryTargetCardId}
          onUseImage={addImageToCard}
          onRestoreEntry={restoreHistoryEntry}
        />
      </div>
    </div>
  );
}
