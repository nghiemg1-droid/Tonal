import { useState } from 'react'

type GreetingProps = {
  name: string
}

function Greeting({ name }: GreetingProps) {
  return (
    <h1 className="text-5xl font-bold tracking-tight text-gray-900">
      Welcome to <span className="text-brand">{name}</span>
    </h1>
  )
}

function App() {
  const [likes, setLikes] = useState(0)

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gray-50">
      <Greeting name="Tonal" />
      <p className="text-lg text-gray-500">Say it with your voice.</p>
      <button
        onClick={() => setLikes(likes + 1)}
        className="rounded-full bg-brand px-6 py-2 font-medium text-white hover:bg-brand-dark active:scale-95 transition"
      >
        ♥ {likes} 
      </button>
    </main>
  )
}

export default App