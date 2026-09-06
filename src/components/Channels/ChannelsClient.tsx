'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Youtube } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardContent, Skeleton } from '@/components/ui'
import { YouTubeChannel } from '@/types'
import ChannelRow from './ChannelRow'

type SubscriptionsResult =
  | { kind: 'ok'; channels: YouTubeChannel[] }
  | { kind: 'unauthorized' }
  | { kind: 'unconfigured' }

function useSubscriptions() {
  return useQuery({
    queryKey: ['youtube-subscriptions'],
    queryFn: async (): Promise<SubscriptionsResult> => {
      const response = await fetch('/api/youtube/subscriptions')
      if (response.status === 401) return { kind: 'unauthorized' }
      if (response.status === 503) return { kind: 'unconfigured' }
      if (!response.ok) {
        throw new Error(`Failed to load subscriptions: ${response.status}`)
      }
      const data = await response.json().catch(() => ({}))
      return { kind: 'ok', channels: Array.isArray(data.channels) ? data.channels : [] }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  })
}

function useSelectedChannels() {
  return useQuery({
    queryKey: ['youtube-selected-channels'],
    queryFn: async (): Promise<YouTubeChannel[]> => {
      const response = await fetch('/api/youtube/channels')
      if (!response.ok) {
        // 5xx = selection store unavailable: surface the error (Retry card)
        // rather than rendering an empty list a Save would then overwrite
        if (response.status >= 500) {
          throw new Error(`Failed to load saved selection: ${response.status}`)
        }
        // Other non-OK (e.g. paused): degrade to empty rather than blocking the page
        return []
      }
      const data = await response.json().catch(() => ({}))
      return Array.isArray(data.channels) ? data.channels : []
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  })
}

function ChannelsLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="mb-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          Back to news
        </Link>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">
          YouTube Channels
        </h1>
        <p className="mt-2 text-muted-foreground">
          Pick which of your subscriptions feed videos into your news stream.
        </p>
      </div>
      {children}
    </main>
  )
}

function ChannelListSkeleton() {
  return (
    <div className="space-y-3" data-testid="channels-loading">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-4 rounded" />
          <Skeleton className="size-10 rounded-full" />
          <Skeleton className="h-4 w-48" />
        </div>
      ))}
    </div>
  )
}

export default function ChannelsClient() {
  const queryClient = useQueryClient()
  const subscriptionsQuery = useSubscriptions()
  const selectedQuery = useSelectedChannels()

  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Record<string, YouTubeChannel> | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)

  // Read ?error= from the OAuth callback redirect without triggering server navigation
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const err = params.get('error')
      if (err) setAuthError(err)
    } catch {}
  }, [])

  // Initialize the selection once the stored list arrives
  useEffect(() => {
    if (selected === null && selectedQuery.data) {
      const initial: Record<string, YouTubeChannel> = {}
      for (const channel of selectedQuery.data) {
        initial[channel.id] = channel
      }
      setSelected(initial)
    }
  }, [selected, selectedQuery.data])

  const saveMutation = useMutation({
    mutationFn: async (channels: YouTubeChannel[]): Promise<YouTubeChannel[]> => {
      const response = await fetch('/api/youtube/channels', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels }),
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed to save selection: ${response.status}`)
      }
      const data = await response.json().catch(() => ({}))
      return Array.isArray(data.channels) ? data.channels : channels
    },
    onSuccess: (channels) => {
      queryClient.setQueryData(['youtube-selected-channels'], channels)
    },
  })

  const subscriptions = useMemo(
    () => (subscriptionsQuery.data?.kind === 'ok' ? subscriptionsQuery.data.channels : []),
    [subscriptionsQuery.data]
  )

  // Previously-selected channels that no longer appear in the live subscription
  // list — keep them visible so they can be unchecked.
  const orphanedChannels = useMemo(() => {
    if (subscriptionsQuery.data?.kind !== 'ok') return []
    const liveIds = new Set(subscriptions.map((c) => c.id))
    return (selectedQuery.data || []).filter((c) => !liveIds.has(c.id))
  }, [subscriptionsQuery.data, subscriptions, selectedQuery.data])

  const rows = useMemo(() => {
    const all = [
      ...subscriptions.map((channel) => ({ channel, orphaned: false })),
      ...orphanedChannels.map((channel) => ({ channel, orphaned: true })),
    ]
    const term = search.trim().toLowerCase()
    if (!term) return all
    return all.filter(({ channel }) => channel.title.toLowerCase().includes(term))
  }, [subscriptions, orphanedChannels, search])

  const selectedCount = selected ? Object.keys(selected).length : 0

  const toggleChannel = (channel: YouTubeChannel) => {
    saveMutation.reset()
    setSelected((prev) => {
      const next = { ...(prev || {}) }
      if (next[channel.id]) delete next[channel.id]
      else next[channel.id] = channel
      return next
    })
  }

  const selectAllVisible = () => {
    saveMutation.reset()
    setSelected((prev) => {
      const next = { ...(prev || {}) }
      for (const { channel } of rows) next[channel.id] = channel
      return next
    })
  }

  const clearAll = () => {
    saveMutation.reset()
    setSelected({})
  }

  const handleSave = () => {
    saveMutation.mutate(Object.values(selected || {}))
  }

  // ---- Error / unavailable states -----------------------------------------

  if (subscriptionsQuery.error) {
    return (
      <ChannelsLayout>
        <Card>
          <CardContent className="py-10 text-center">
            <h2 className="text-xl font-bold text-red-600 dark:text-red-400 mb-2">
              Unable to load subscriptions
            </h2>
            <p className="text-muted-foreground mb-4">
              Something went wrong talking to YouTube. Please try again.
            </p>
            <Button onClick={() => subscriptionsQuery.refetch()}>Retry</Button>
          </CardContent>
        </Card>
      </ChannelsLayout>
    )
  }

  // Never render the picker without the stored selection: seeding it empty after
  // a transient failure would let a Save silently overwrite the saved list.
  if (selected === null && selectedQuery.isError) {
    return (
      <ChannelsLayout>
        <Card>
          <CardContent className="py-10 text-center">
            <h2 className="text-xl font-bold text-red-600 dark:text-red-400 mb-2">
              Unable to load your saved selection
            </h2>
            <p className="text-muted-foreground mb-4">
              Something went wrong loading your saved channels. Please try again.
            </p>
            <Button onClick={() => selectedQuery.refetch()}>Retry</Button>
          </CardContent>
        </Card>
      </ChannelsLayout>
    )
  }

  if (subscriptionsQuery.isLoading || (selected === null && selectedQuery.isLoading)) {
    return (
      <ChannelsLayout>
        <ChannelListSkeleton />
      </ChannelsLayout>
    )
  }

  if (subscriptionsQuery.data?.kind === 'unconfigured') {
    return (
      <ChannelsLayout>
        <Card>
          <CardContent className="py-8 space-y-4">
            <h2 className="text-xl font-bold">Google OAuth is not configured</h2>
            <p className="text-muted-foreground">
              To connect YouTube, set these environment variables (from a Google Cloud OAuth client
              with the <code className="text-foreground">youtube.readonly</code> scope) and restart
              the app:
            </p>
            <pre className="rounded-md border bg-muted/50 p-4 text-sm overflow-x-auto">
              {'GOOGLE_CLIENT_ID=...\nGOOGLE_CLIENT_SECRET=...\nGOOGLE_REDIRECT_URI=http://localhost:3000/api/youtube/callback'}
            </pre>
          </CardContent>
        </Card>
      </ChannelsLayout>
    )
  }

  if (subscriptionsQuery.data?.kind === 'unauthorized') {
    return (
      <ChannelsLayout>
        <Card>
          <CardContent className="py-10 text-center space-y-4">
            <Youtube className="size-10 mx-auto text-red-500" />
            <h2 className="text-xl font-bold">Connect your YouTube account</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Sign in with Google to list your subscriptions. Access is read-only and the sign-in
              only lasts for this browsing session — nothing is stored server-side.
            </p>
            {authError && (
              <p className="text-sm text-red-600 dark:text-red-400">
                Connection failed: {authError}. Please try again.
              </p>
            )}
            <Button asChild>
              <a href="/api/youtube/auth">Connect YouTube</a>
            </Button>
          </CardContent>
        </Card>
      </ChannelsLayout>
    )
  }

  // ---- Connected: searchable checklist ------------------------------------

  return (
    <ChannelsLayout>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search channels..."
          aria-label="Search channels"
          className="flex-1 min-w-48 h-9 rounded-md border bg-background dark:bg-input/30 dark:border-input px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
        />
        <Button size="sm" variant="outline" onClick={selectAllVisible}>
          Select all
        </Button>
        <Button size="sm" variant="outline" onClick={clearAll}>
          Clear
        </Button>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {search ? 'No channels match your search.' : 'No subscriptions found.'}
          </CardContent>
        </Card>
      ) : (
        <ul className="divide-y rounded-lg border">
          {rows.map(({ channel, orphaned }) => (
            <ChannelRow
              key={channel.id}
              channel={channel}
              orphaned={orphaned}
              checked={!!selected?.[channel.id]}
              onToggle={toggleChannel}
            />
          ))}
        </ul>
      )}

      <div className="sticky bottom-0 mt-6 -mx-4 border-t bg-background/95 backdrop-blur px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Badge variant="secondary">{selectedCount} selected</Badge>
            {saveMutation.isPending && (
              <span className="text-sm text-muted-foreground">Saving...</span>
            )}
            {saveMutation.isSuccess && (
              <span className="text-sm text-green-600 dark:text-green-400">Saved</span>
            )}
            {saveMutation.isError && (
              <span className="text-sm text-red-600 dark:text-red-400">
                {saveMutation.error instanceof Error
                  ? saveMutation.error.message
                  : 'Failed to save'}
              </span>
            )}
          </div>
          <Button onClick={handleSave} disabled={saveMutation.isPending || selected === null}>
            Save selection
          </Button>
        </div>
      </div>
    </ChannelsLayout>
  )
}
