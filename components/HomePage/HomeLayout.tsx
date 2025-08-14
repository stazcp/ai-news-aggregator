import React, { PropsWithChildren } from 'react'

export default function HomeLayout({ children }: PropsWithChildren) {
  return <main className="container mx-auto px-4 py-8 max-w-7xl">{children}</main>
}
