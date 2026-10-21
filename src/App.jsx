import { useEffect, useState } from 'react'

function loadTodos() {
  try {
    return JSON.parse(localStorage.getItem('todos') || '[]')
  } catch {
    return []
  }
}

export default function App() {
  const [todos, setTodos] = useState(loadTodos)
  const [input, setInput] = useState('')

  useEffect(() => {
    localStorage.setItem('todos', JSON.stringify(todos))
  }, [todos])

  function addTodo(text) {
    setTodos((prev) => [...prev, { id: Date.now(), text, done: false }])
  }

  function toggleTodo(id) {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)))
  }

  // BUG: delete tidak jalan - filter tidak di-assign ulang
  function deleteTodo(id) {
    todos.filter((t) => t.id !== id)
  }

  function handleSubmit(e) {
    e.preventDefault()
    const text = input.trim()
    if (!text) return
    addTodo(text)
    setInput('')
  }

  // Expose untuk testing (kompatibel dengan versi vanilla sebelumnya)
  useEffect(() => {
    window.__todos = () => todos
    window.__actions = { addTodo, deleteTodo, toggleTodo }
  }, [todos])

  return (
    <>
      <h1>Todo List</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Tulis todo baru..."
          autoComplete="off"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit">Tambah</button>
      </form>
      <ul>
        {todos.map((todo) => (
          <li key={todo.id} data-id={String(todo.id)} className={todo.done ? 'done' : ''}>
            <input type="checkbox" checked={todo.done} onChange={() => toggleTodo(todo.id)} />
            <span>{todo.text}</span>
            <button type="button" className="del-btn" onClick={() => deleteTodo(todo.id)}>
              Hapus
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}
