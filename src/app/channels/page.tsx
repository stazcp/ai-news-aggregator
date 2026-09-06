import ChannelsClient from '@/components/Channels/ChannelsClient'
import { isProjectPaused } from '@/lib/config/projectState'

export const revalidate = 0

export const metadata = {
  title: 'YouTube Channels - AI News Aggregator',
  description: 'Choose which YouTube channels to include in your news feed.',
}

export default function ChannelsPage() {
  if (isProjectPaused()) {
    return (
      <main className="min-h-screen bg-stone-950 text-stone-100">
        <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-20">
          <p className="mb-4 text-sm uppercase tracking-[0.3em] text-stone-400">Project Paused</p>
          <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            AI News Aggregator is offline.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-stone-300 sm:text-lg">
            Channel management is unavailable while the project is paused.
          </p>
        </div>
      </main>
    )
  }

  return <ChannelsClient />
}
