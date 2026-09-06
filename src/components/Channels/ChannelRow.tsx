'use client'

import React from 'react'
import { Badge } from '@/components/ui'
import { YouTubeChannel } from '@/types'

interface ChannelRowProps {
  channel: YouTubeChannel
  checked: boolean
  orphaned: boolean
  onToggle: (channel: YouTubeChannel) => void
}

export default function ChannelRow({ channel, checked, orphaned, onToggle }: ChannelRowProps) {
  return (
    <li>
      <label className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-accent/50 transition-colors">
        <input
          type="checkbox"
          checked={checked}
          onChange={() => onToggle(channel)}
          aria-label={channel.title}
          className="size-4 shrink-0 accent-primary"
        />
        {channel.thumbnail ? (
          // Plain <img>: avatar hosts (yt3.ggpht.com) are not in next/image remotePatterns
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={channel.thumbnail}
            alt=""
            width={40}
            height={40}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="size-10 shrink-0 rounded-full bg-muted object-cover"
          />
        ) : (
          <div className="size-10 shrink-0 rounded-full bg-muted" aria-hidden="true" />
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{channel.title}</span>
        {orphaned && (
          <Badge variant="outline" className="shrink-0 text-muted-foreground">
            unsubscribed?
          </Badge>
        )}
      </label>
    </li>
  )
}
