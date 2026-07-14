import { useCallback, useEffect, useRef, useState } from "react"
import {
  ReactFlow,
  addEdge,
  Background,
  Controls,
  Handle,
  Position,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { FileText, Plus, Sparkles, StickyNote, Trash2, Upload, X } from "lucide-react"
import { extractMindmap, uploadPdf } from "./api/client"

const tokens = {
  page: "#F5F6F9",
  surface: "#FFFFFF",
  border: "#E5E7EB",
  borderStrong: "#D6D9E0",
  textPrimary: "#111827",
  textSecondary: "#64748B",
  textMuted: "#94A3B8",
  accent: "#4338CA",
  accentSoft: "#EEF2FF",
  danger: "#DC2626",
  dangerSoft: "#FEF2F2",
}

const nodePalette = ["#4338CA", "#0F766E", "#B45309", "#BE123C", "#1D4ED8", "#4D7C0F"]

// ---------------------------------------------------------------------------
// Custom node — colored spine card. Must be registered via `nodeTypes` and
// each node must set `type: "mindMapNode"`, or ReactFlow silently falls
// back to its plain default box and `data.color` never gets rendered.
// ---------------------------------------------------------------------------
function MindMapNode({ data, selected }: NodeProps) {
  const color = (data as { color?: string })?.color || tokens.accent
  const label = (data as { label?: string })?.label || ""

  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        minWidth: "160px",
        maxWidth: "260px",
        background: tokens.surface,
        borderRadius: "10px",
        border: `1px solid ${selected ? color : tokens.border}`,
        boxShadow: selected ? `0 0 0 3px ${color}22, 0 4px 10px rgba(17,24,39,0.06)` : "0 1px 2px rgba(17,24,39,0.04)",
      }}
    >
      <div style={{ width: "4px", borderRadius: "10px 0 0 10px", background: color, flexShrink: 0 }} />
      <div style={{ padding: "10px 14px", fontSize: "13.5px", fontWeight: 500, color: tokens.textPrimary, lineHeight: 1.4, wordBreak: "break-word" }}>
        {label}
      </div>
      <Handle type="target" position={Position.Left} style={{ background: color, width: 7, height: 7, border: `2px solid ${tokens.surface}` }} />
      <Handle type="source" position={Position.Right} style={{ background: color, width: 7, height: 7, border: `2px solid ${tokens.surface}` }} />
    </div>
  )
}

const nodeTypes = { mindMapNode: MindMapNode }

type ExtractPayload = {
  nodes: Array<{ id: string; label: string }>
  edges: Array<{ source: string; target: string }>
}

function mapExtractToFlow(
  extractData: ExtractPayload,
  filePrefix: string,
  startIndex: number
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = Array.isArray(extractData.nodes)
    ? extractData.nodes.map((node, index) => ({
        id: `${filePrefix}-${node.id}`,
        type: "mindMapNode",
        data: {
          label: node.label,
          color: nodePalette[(startIndex + index) % nodePalette.length],
        },
        position: {
          x: ((startIndex + index) % 4) * 240,
          y: Math.floor((startIndex + index) / 4) * 130,
        },
      }))
    : []

  const edges: Edge[] = Array.isArray(extractData.edges)
    ? extractData.edges.map((edge) => ({
        id: `${filePrefix}-${edge.source}-${edge.target}`,
        source: `${filePrefix}-${edge.source}`,
        target: `${filePrefix}-${edge.target}`,
        style: { stroke: tokens.borderStrong, strokeWidth: 1.5 },
      }))
    : []

  return { nodes, edges }
}

function buttonStyle(variant: "primary" | "secondary" | "danger" | "ghost"): React.CSSProperties {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "0.55rem 0.85rem",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: 500,
    cursor: "pointer",
    border: "1px solid transparent",
    whiteSpace: "nowrap",
  }
  if (variant === "primary") return { ...base, background: tokens.accent, color: "#FFFFFF" }
  if (variant === "danger") return { ...base, background: tokens.dangerSoft, color: tokens.danger, border: "1px solid #F5C6C6" }
  if (variant === "ghost") return { ...base, background: "transparent", color: tokens.textSecondary, border: `1px solid ${tokens.border}` }
  return { ...base, background: tokens.surface, color: tokens.textPrimary, border: `1px solid ${tokens.borderStrong}` }
}

function App() {
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ name: string; previewUrl: string }>>([])
  const [nodes, setNodes, onNodesChange] = useNodesState([] as Node[])
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[])
  const [draftLabel, setDraftLabel] = useState("")
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedNodeColor, setSelectedNodeColor] = useState(nodePalette[0])
  const [selectedPdf, setSelectedPdf] = useState<{ name: string; previewUrl: string } | null>(null)
  const [activeWorkspace, setActiveWorkspace] = useState<"sources" | "nodes">("sources")
  const previewUrlsRef = useRef<string[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingMessage, setProcessingMessage] = useState("")
  const [message, setMessage] = useState(
    "Upload a PDF to generate an initial mind map, then refine it in the node workspace."
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      const newEdge: Edge = {
        id: `${connection.source}-${connection.target}`,
        source: connection.source ?? "",
        target: connection.target ?? "",
        sourceHandle: connection.sourceHandle,
        targetHandle: connection.targetHandle,
        style: { stroke: tokens.borderStrong, strokeWidth: 1.5 },
      }
      setEdges((eds) => addEdge(newEdge, eds))
    },
    [setEdges]
  )

  const addNodeAtPosition = useCallback(
    (position?: { x: number; y: number }) => {
      const label = draftLabel.trim() || "New idea"
      const newNode: Node = {
        id: `node-${Date.now()}`,
        type: "mindMapNode",
        data: { label, color: selectedNodeColor },
        position: position ?? { x: 180 + nodes.length * 35, y: 100 + nodes.length * 35 },
      }
      setNodes((current) => [...current, newNode])
      setMessage(`Added "${label}"`)
      setDraftLabel("")
    },
    [draftLabel, nodes.length, selectedNodeColor, setNodes]
  )

  const handlePaneClick = useCallback(() => {
    setSelectedNodeId(null)
  }, [])

  const updateSelectedNodeLabel = useCallback(
    (value: string) => {
      if (!selectedNodeId) return
      setNodes((current) =>
        current.map((node) =>
          node.id === selectedNodeId ? { ...node, data: { ...node.data, label: value } } : node
        )
      )
      setMessage("Updated node label")
    },
    [selectedNodeId, setNodes]
  )

  const deleteSelectedNode = useCallback(() => {
    if (!selectedNodeId) return
    setNodes((current) => current.filter((node) => node.id !== selectedNodeId))
    setEdges((current) =>
      current.filter((edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId)
    )
    setSelectedNodeId(null)
    setMessage("Deleted selected node")
  }, [selectedNodeId, setEdges, setNodes])

  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return

    setIsProcessing(true)
    setProcessingMessage("Uploading PDFs…")
    try {
      const uploadedFilesForState: Array<{ name: string; previewUrl: string }> = []
      const previousPreviewUrls = previewUrlsRef.current
      const allGeneratedNodes: Node[] = []
      const allGeneratedEdges: Edge[] = []

      for (const file of files) {
        setProcessingMessage(`Uploading ${file.name}…`)
        const data = await uploadPdf(file)

        if (!data.filename) {
          throw new Error("Upload response missing filename")
        }

        uploadedFilesForState.push({ name: data.filename, previewUrl: URL.createObjectURL(file) })

        let extractData: ExtractPayload
        if (data.cached && data.nodes.length > 0) {
          extractData = { nodes: data.nodes, edges: data.edges }
        } else {
          const textToExtract = data.full_text || data.text_preview || ""
          if (!textToExtract.trim()) {
            continue
          }

          setProcessingMessage(`Generating mind map for ${file.name}…`)
          extractData = await extractMindmap(textToExtract, data.document_id)
        }

        const { nodes: generatedNodes, edges: generatedEdges } = mapExtractToFlow(
          extractData,
          file.name,
          allGeneratedNodes.length
        )
        allGeneratedNodes.push(...generatedNodes)
        allGeneratedEdges.push(...generatedEdges)
      }

      setUploadedFiles(uploadedFilesForState)
      previewUrlsRef.current = uploadedFilesForState.map((file) => file.previewUrl)
      previousPreviewUrls.forEach((url) => {
        if (!previewUrlsRef.current.includes(url)) {
          URL.revokeObjectURL(url)
        }
      })
      setNodes(allGeneratedNodes)
      setEdges(allGeneratedEdges)
      if (!selectedPdf && uploadedFilesForState.length > 0) {
        setSelectedPdf(uploadedFilesForState[0])
      }
      setMessage(`Generated ${allGeneratedNodes.length} nodes from ${uploadedFilesForState.length} PDF${uploadedFilesForState.length > 1 ? "s" : ""}`)
      setActiveWorkspace("nodes")
    } catch (error) {
      console.error(error)
      setMessage(error instanceof Error ? error.message : "Something went wrong")
    } finally {
      setIsProcessing(false)
      setProcessingMessage("")
      e.target.value = ""
    }
  }

  const selectedNode = nodes.find((node) => node.id === selectedNodeId)
  const selectedLabel =
    typeof (selectedNode?.data as { label?: unknown })?.label === "string"
      ? String((selectedNode?.data as { label?: unknown })?.label)
      : ""
  const selectedColor = (selectedNode?.data as { color?: string })?.color || nodePalette[0]

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", background: tokens.page, color: tokens.textPrimary, fontFamily: "Inter, Segoe UI, sans-serif" }}>
      {/* Top bar */}
      <div style={{ padding: "0.85rem 1.25rem", borderBottom: `1px solid ${tokens.border}`, background: tokens.surface }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "30px", height: "30px", borderRadius: "8px", background: tokens.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Sparkles size={15} color={tokens.accent} />
            </div>
            <div style={{ lineHeight: 1.25 }}>
              <div style={{ fontSize: "0.95rem", fontWeight: 600, letterSpacing: "-0.01em" }}>Mind Map Builder</div>
              <div style={{ fontSize: "12px", color: tokens.textSecondary }}>Sources and nodes, side by side</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ ...buttonStyle("primary"), opacity: isProcessing ? 0.7 : 1 }}>
              <Upload size={14} />
              <span>{isProcessing ? processingMessage || "Processing…" : "Upload PDFs"}</span>
              <input type="file" accept=".pdf" multiple onChange={handleUpload} style={{ display: "none" }} disabled={isProcessing} />
            </label>
            <input
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addNodeAtPosition()}
              placeholder="New node label"
              style={{ padding: "0.55rem 0.75rem", border: `1px solid ${tokens.borderStrong}`, borderRadius: "8px", minWidth: "150px", fontSize: "13px", outline: "none" }}
            />
            <button onClick={() => addNodeAtPosition()} style={buttonStyle("secondary")}>
              <Plus size={14} />
              <span>Add node</span>
            </button>
            <button
              onClick={() => {
                previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
                previewUrlsRef.current = []
                setNodes([])
                setEdges([])
                setUploadedFiles([])
                setSelectedPdf(null)
                setSelectedNodeId(null)
                setMessage("Canvas cleared")
              }}
              style={buttonStyle("ghost")}
            >
              <Trash2 size={14} />
              <span>Clear</span>
            </button>
          </div>
        </div>

        {uploadedFiles.length > 0 && (
          <p style={{ margin: "0.5rem 0 0", color: tokens.textSecondary, fontSize: "12px" }}>Loaded files: {uploadedFiles.map((file) => file.name).join(", ")}</p>
        )}
        <p style={{ margin: "0.3rem 0 0", color: tokens.textMuted, fontSize: "12px" }}>{message}</p>
      </div>

      <div style={{ display: "flex", height: "calc(100vh - 86px)" }}>
        <div style={{ flex: 1, padding: "1rem 1.25rem", display: "flex", flexDirection: "column", gap: "0.85rem", minHeight: 0 }}>
          {/* Workspace switcher */}
          <div style={{ display: "inline-flex", gap: "4px", width: "fit-content", padding: "4px", borderRadius: "999px", border: `1px solid ${tokens.border}`, background: tokens.surface }}>
            {(["sources", "nodes"] as const).map((workspace) => (
              <button
                key={workspace}
                onClick={() => setActiveWorkspace(workspace)}
                style={{
                  padding: "0.5rem 0.95rem",
                  border: "none",
                  borderRadius: "999px",
                  background: activeWorkspace === workspace ? tokens.accent : "transparent",
                  color: activeWorkspace === workspace ? "#FFFFFF" : tokens.textSecondary,
                  fontWeight: 500,
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                {workspace === "sources" ? "PDF workspace" : "Node workspace"}
              </button>
            ))}
          </div>

          {activeWorkspace === "sources" ? (
            <div style={{ display: "flex", gap: "1rem", flex: 1, minHeight: 0 }}>
              {/* File list */}
              <div style={{ width: "260px", border: `1px solid ${tokens.border}`, borderRadius: "14px", background: tokens.surface, padding: "1rem", display: "flex", flexDirection: "column", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.85rem" }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: "14px", fontWeight: 600 }}>Sources</h2>
                    <p style={{ margin: "0.2rem 0 0", fontSize: "12px", color: tokens.textSecondary }}>Uploaded PDFs</p>
                  </div>
                  <div style={{ width: "28px", height: "28px", borderRadius: "8px", background: tokens.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <FileText size={14} color={tokens.accent} />
                  </div>
                </div>

                {uploadedFiles.length > 0 ? (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, overflowY: "auto" }}>
                    {uploadedFiles.map((file) => (
                      <li key={file.name} style={{ marginBottom: "4px" }}>
                        <button
                          onClick={() => setSelectedPdf(file)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            width: "100%",
                            background: selectedPdf?.name === file.name ? tokens.accentSoft : "transparent",
                            border: "none",
                            borderRadius: "8px",
                            padding: "0.55rem 0.6rem",
                            color: selectedPdf?.name === file.name ? tokens.accent : tokens.textPrimary,
                            cursor: "pointer",
                            textAlign: "left",
                            fontSize: "13px",
                          }}
                        >
                          <FileText size={14} style={{ flexShrink: 0 }} />
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", color: tokens.textMuted, padding: "1rem 0.5rem" }}>
                    <div>
                      <FileText size={22} style={{ marginBottom: "0.5rem", opacity: 0.5 }} />
                      <p style={{ margin: 0, fontSize: "12.5px" }}>No sources loaded yet.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Preview */}
              <div style={{ flex: 1, border: `1px solid ${tokens.border}`, borderRadius: "14px", background: tokens.surface, padding: "1rem", display: "flex", flexDirection: "column", minHeight: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: "14px", fontWeight: 600 }}>Preview</h2>
                    <p style={{ margin: "0.2rem 0 0", fontSize: "12px", color: tokens.textSecondary }}>Review the document before shaping the map</p>
                  </div>
                  {selectedPdf && (
                    <button onClick={() => setSelectedPdf(null)} style={{ border: "none", background: "none", cursor: "pointer", color: tokens.textMuted, padding: "4px", display: "flex" }} aria-label="Close preview">
                      <X size={14} />
                    </button>
                  )}
                </div>

                <div style={{ flex: 1, border: `1px solid ${tokens.border}`, borderRadius: "10px", overflow: "hidden", minHeight: 0 }}>
                  {selectedPdf ? (
                    <iframe title={selectedPdf.name} src={selectedPdf.previewUrl} style={{ width: "100%", height: "100%", border: "none" }} />
                  ) : (
                    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: tokens.textMuted, textAlign: "center", padding: "1rem" }}>
                      <div>
                        <FileText size={24} style={{ marginBottom: "0.6rem", opacity: 0.6 }} />
                        <p style={{ margin: 0, fontSize: "13px" }}>Select a PDF to preview it here.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: "1rem", flex: 1, minHeight: 0 }}>
              {/* Node inspector */}
              <div style={{ border: `1px solid ${tokens.border}`, borderRadius: "14px", background: tokens.surface, padding: "1rem", overflowY: "auto" }}>
                <h2 style={{ margin: "0 0 0.2rem", fontSize: "14px", fontWeight: 600 }}>Node workspace</h2>
                <p style={{ margin: "0 0 1rem", fontSize: "12px", color: tokens.textSecondary }}>Adjust, connect, and refine your nodes</p>

                {selectedNode ? (
                  <>
                    <label style={{ fontSize: "12px", fontWeight: 500, color: tokens.textSecondary, marginBottom: "6px", display: "block" }}>Label</label>
                    <input
                      value={selectedLabel}
                      onChange={(e) => updateSelectedNodeLabel(e.target.value)}
                      style={{ width: "100%", padding: "0.55rem 0.65rem", border: `1px solid ${tokens.borderStrong}`, borderRadius: "8px", fontSize: "13.5px", boxSizing: "border-box" }}
                    />

                    <label style={{ fontSize: "12px", fontWeight: 500, color: tokens.textSecondary, margin: "1rem 0 6px", display: "block" }}>Color</label>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      {nodePalette.map((color) => (
                        <button
                          key={color}
                          onClick={() => {
                            setSelectedNodeColor(color)
                            setNodes((current) =>
                              current.map((node) =>
                                node.id === selectedNodeId ? { ...node, data: { ...node.data, color } } : node
                              )
                            )
                          }}
                          style={{
                            width: "24px",
                            height: "24px",
                            borderRadius: "50%",
                            background: color,
                            border: selectedColor === color ? `2px solid ${tokens.textPrimary}` : "2px solid transparent",
                            cursor: "pointer",
                            padding: 0,
                          }}
                          aria-label={`Set node color to ${color}`}
                        />
                      ))}
                    </div>

                    <button onClick={deleteSelectedNode} style={{ ...buttonStyle("danger"), width: "100%", justifyContent: "center", marginTop: "1.25rem" }}>
                      <Trash2 size={14} />
                      <span>Delete node</span>
                    </button>
                  </>
                ) : (
                  <div style={{ textAlign: "center", padding: "2rem 0.5rem", color: tokens.textMuted }}>
                    <StickyNote size={22} style={{ marginBottom: "0.5rem", opacity: 0.5 }} />
                    <p style={{ margin: 0, fontSize: "12.5px" }}>Select a node to edit it.</p>
                  </div>
                )}
              </div>

              {/* Canvas */}
              <div style={{ border: `1px solid ${tokens.border}`, borderRadius: "14px", overflow: "hidden", background: tokens.surface }}>
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  nodeTypes={nodeTypes}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  onPaneClick={handlePaneClick}
                  onNodeClick={(_, node) => setSelectedNodeId(node.id)}
                  fitView
                >
                  <Background gap={18} size={1} color={tokens.border} />
                  <Controls showInteractive={false} />
                </ReactFlow>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App