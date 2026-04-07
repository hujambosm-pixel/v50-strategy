import { useState, useEffect } from 'react'

export function useStrategyBlocks() {
  const [blocks, setBlocks] = useState({})
  // blocks = { filter: [...], setup: [...], trigger: [...], abort: [...], exit: [...], stop: [...] }

  useEffect(() => { loadBlocks() }, [])

  async function loadBlocks() {
    try {
      const res = await fetch('/api/strategy-blocks')
      if (!res.ok) return
      const data = await res.json()
      const grouped = {}
      data.forEach(b => {
        if (!grouped[b.role]) grouped[b.role] = []
        grouped[b.role].push(b)
      })
      setBlocks(grouped)
    } catch(_) {}
  }

  async function saveBlock(role, name, definition) {
    await fetch('/api/strategy-blocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, name, definition }),
    })
    await loadBlocks()
  }

  async function deleteBlock(id) {
    await fetch(`/api/strategy-blocks?id=${id}`, { method: 'DELETE' })
    await loadBlocks()
  }

  return { blocks, saveBlock, deleteBlock }
}
