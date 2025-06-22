const SynthesizedSummary = ({ summary }: { summary?: string }) => {
  if (!summary) {
    return null
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center gap-2 px-3 py-1 bg-accent/10 rounded-full border border-accent/20">
          <span className="text-accent text-sm">✨</span>
          <span className="text-sm font-medium text-accent">AI Analysis</span>
        </div>
      </div>

      <div className="prose prose-lg max-w-none">
        <p className="text-lg leading-relaxed text-foreground font-medium">{summary}</p>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
        <div className="w-1 h-1 bg-accent rounded-full animate-pulse"></div>
        <span>Generated from multiple sources using AI</span>
      </div>
    </div>
  )
}

export default SynthesizedSummary
