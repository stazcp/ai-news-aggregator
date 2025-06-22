const SynthesizedSummary = ({ summary }: { summary?: string }) => {
  if (!summary) {
    return null
  }

  return (
    <div
      className="p-4 rounded-lg bg-accent/10 border border-accent/20"
      style={{ animation: 'pulse-border 3s infinite' }}
    >
      <h4 className="flex items-center text-sm font-semibold text-accent mb-2">
        <span className="mr-2">✨</span>
        Synthesized AI Summary
      </h4>
      <p className="text-md text-muted-foreground leading-relaxed">{summary}</p>
    </div>
  )
}

export default SynthesizedSummary
