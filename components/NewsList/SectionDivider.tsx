import React from 'react'

export default function SectionDivider() {
  return (
    <div className="relative text-center my-16">
      <hr className="border-t border" />
      <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-4 text-sm font-medium text-muted-foreground">
        Individual Headlines
      </span>
    </div>
  )
}
