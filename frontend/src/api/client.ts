const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000"

export async function uploadPdf(file: File) {
  const formData = new FormData()
  formData.append("file", file)

  const response = await fetch(`${API_BASE}/upload`, {
    method: "POST",
    body: formData,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || "Upload failed")
  }

  return response.json() as Promise<{
    filename: string
    document_id: string
    cached: boolean
    nodes: Array<{ id: string; label: string }>
    edges: Array<{ source: string; target: string }>
    text_preview: string
    full_text: string
  }>
}

export async function extractMindmap(text: string, documentId: string) {
  const response = await fetch(`${API_BASE}/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, document_id: documentId }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || "Extraction failed")
  }

  return response.json() as Promise<{
    nodes: Array<{ id: string; label: string }>
    edges: Array<{ source: string; target: string }>
  }>
}
