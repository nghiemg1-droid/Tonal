export default function HomePage() {
  return (
    <div className="flex w-full flex-col items-center gap-3 pt-10 text-center animate-fade-up">
      <h1 className="text-4xl font-bold tracking-tight text-ink">
        Welcome to <span className="text-brand">Tonal</span>
      </h1>
      <p className="text-muted">
        Your feed will appear here soon. Find people to follow in Search.
      </p>
    </div>
  )
}