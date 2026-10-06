import { useState } from 'react'

// 1. COMPONENT có PROPS
type GreetingProps = {
  name: string
}

function Greeting({ name }: GreetingProps) {
  return <h1>Welcome to {name}</h1>
}

// 2. COMPONENT chính, có STATE
function App() {
  const [likes, setLikes] = useState(0)

  return (
    <main style={{ padding: 40, textAlign: 'center' }}>
      <Greeting name="Tonal" />
      <p>Say it with your voice.</p>
      <button onClick={() => setLikes(likes + 1)}>
        ♥ {likes} likes
      </button>
    </main>
  )
}

export default App