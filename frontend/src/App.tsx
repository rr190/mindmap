import { useState, useCallback } from "react"
import { ReactFlow, addEdge, useNodesState, useEdgesState} from "@xyflow/react"
import type {Connection} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

function App() {
  const [filename, setFilename] = useState<string>("")
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges]
  )

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const formData = new FormData()
    formData.append("file", file)

    const response = await fetch("http://localhost:8000/upload", {
      method: "POST",
      body: formData
    })
    const data = await response.json()
    setFilename(data.filename)

    const extractResponse = await fetch("http://localhost:8000/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: data.text_preview })
    })
    const extractData = await extractResponse.json()

    // React Flow needs position on each node
    const flowNodes = extractData.nodes.map((node: any, index: number) => ({
      id: node.id,
      data: { label: node.label },
      position: { x: (index % 4) * 200, y: Math.floor(index / 4) * 150 }
    }))

    const flowEdges = extractData.edges.map((edge: any) => ({
      id: `${edge.source}-${edge.target}`,
      source: edge.source,
      target: edge.target
    }))

    setNodes(flowNodes)
    setEdges(flowEdges)
  }

  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <div style={{ padding: "1rem" }}>
        <h1>Mind Map Builder</h1>
        <input type="file" accept=".pdf" onChange={handleUpload} />
        {filename && <p>File: {filename}</p>}
      </div>
      <div style={{ height: "80vh" }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
        />
      </div>
    </div>
  )
}

export default App