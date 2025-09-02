import React from 'react'

export default function HomeError() {
  return (
    <main className="container mx-auto px-4 py-8 max-w-7xl">
      <header className="text-center mb-12">
        <h1 className="text-5xl font-extrabold tracking-tight text-[var(--foreground)] sm:text-6xl md:text-7xl">
          AI-Curated News
        </h1>
        <p className="mt-4 text-lg text-[var(--muted-foreground)]">
          Your daily feed of news, intelligently grouped and summarized by AI.
        </p>
      </header>
      <div className="text-center py-12">
        <div className="mx-auto max-w-md">
          <h2 className="text-2xl font-bold text-[var(--foreground)] mb-4">Unable to load news</h2>
          <p className="text-lg text-[var(--muted-foreground)] mb-6">
            We're experiencing issues loading the latest news. This might be due to high traffic or
            temporary server issues.
          </p>
          <p className="text-sm text-[var(--muted-foreground)]">
            Please try refreshing the page in a few moments.
          </p>
        </div>
      </div>
    </main>
  )
}
