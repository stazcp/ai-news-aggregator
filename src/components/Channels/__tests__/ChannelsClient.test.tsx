/**
 * @jest-environment jsdom
 */
import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ChannelsClient from '../ChannelsClient'
import { YouTubeChannel } from '../../../types'

// next/link renders a plain anchor in tests, but next/navigation is unused here.

// Mock fetch globally
global.fetch = jest.fn()
const mockFetch = fetch as jest.MockedFunction<typeof fetch>

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response
}

const SUBSCRIPTIONS: YouTubeChannel[] = [
  { id: 'UC1', title: 'Two Minute Papers', thumbnail: 'https://yt3.ggpht.com/a.jpg' },
  { id: 'UC2', title: 'Fireship' },
  { id: 'UC3', title: 'Veritasium' },
]

const STORED_SELECTION: YouTubeChannel[] = [
  { id: 'UC2', title: 'Fireship' },
  { id: 'UC9', title: 'Deleted Channel' },
]

function mockApi({
  subscriptionsStatus = 200,
  subscriptions = SUBSCRIPTIONS,
  selection = [] as YouTubeChannel[],
  onPut = jest.fn(),
} = {}) {
  mockFetch.mockImplementation(async (input, init) => {
    const url = String(input)
    if (url.includes('/api/youtube/subscriptions')) {
      if (subscriptionsStatus !== 200) {
        return jsonResponse({ error: 'nope' }, subscriptionsStatus)
      }
      return jsonResponse({ channels: subscriptions })
    }
    if (url.includes('/api/youtube/channels')) {
      if (init?.method === 'PUT') {
        const body = JSON.parse(String(init.body))
        onPut(body)
        return jsonResponse({ channels: body.channels })
      }
      return jsonResponse({ channels: selection })
    }
    throw new Error(`Unexpected fetch: ${url}`)
  })
  return onPut
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ChannelsClient />
    </QueryClientProvider>
  )
}

describe('ChannelsClient', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('shows a Connect YouTube button when not connected (401)', async () => {
    mockApi({ subscriptionsStatus: 401 })
    renderPage()

    const link = await screen.findByRole('link', { name: 'Connect YouTube' })
    expect(link.getAttribute('href')).toBe('/api/youtube/auth')
  })

  it('shows env setup instructions when OAuth is not configured (503)', async () => {
    mockApi({ subscriptionsStatus: 503 })
    renderPage()

    await screen.findByText('Google OAuth is not configured')
    expect(screen.getByText(/GOOGLE_CLIENT_ID/).textContent).toContain('GOOGLE_CLIENT_SECRET')
  })

  it('renders subscriptions pre-checked from the stored selection', async () => {
    mockApi({ selection: STORED_SELECTION })
    renderPage()

    await screen.findByText('Two Minute Papers')

    const unchecked = screen.getByRole('checkbox', { name: 'Two Minute Papers' })
    const checked = screen.getByRole('checkbox', { name: 'Fireship' })
    expect((unchecked as HTMLInputElement).checked).toBe(false)
    expect((checked as HTMLInputElement).checked).toBe(true)
  })

  it('still lists previously-selected channels missing from live subscriptions, flagged', async () => {
    mockApi({ selection: STORED_SELECTION })
    renderPage()

    await screen.findByText('Deleted Channel')
    expect(screen.getByText('unsubscribed?')).toBeTruthy()
    const orphan = screen.getByRole('checkbox', { name: 'Deleted Channel' })
    expect((orphan as HTMLInputElement).checked).toBe(true)
  })

  it('filters the list via search', async () => {
    mockApi()
    renderPage()

    await screen.findByText('Fireship')
    fireEvent.change(screen.getByLabelText('Search channels'), { target: { value: 'verit' } })

    expect(screen.queryByText('Fireship')).toBeNull()
    expect(screen.getByText('Veritasium')).toBeTruthy()
  })

  it('saves toggled selection via PUT and shows the count', async () => {
    const onPut = mockApi({ selection: STORED_SELECTION })
    renderPage()

    await screen.findByText('Two Minute Papers')

    // Add UC1, remove orphaned UC9 -> selection becomes UC2 + UC1
    fireEvent.click(screen.getByRole('checkbox', { name: 'Two Minute Papers' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Deleted Channel' }))
    expect(screen.getByText('2 selected')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Save selection' }))

    await screen.findByText('Saved')
    expect(onPut).toHaveBeenCalledTimes(1)
    const sentIds = onPut.mock.calls[0][0].channels.map((c: YouTubeChannel) => c.id).sort()
    expect(sentIds).toEqual(['UC1', 'UC2'])
  })

  it('select all and clear update the selection', async () => {
    mockApi()
    renderPage()

    await screen.findByText('Fireship')

    fireEvent.click(screen.getByRole('button', { name: 'Select all' }))
    expect(screen.getByText('3 selected')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.getByText('0 selected')).toBeTruthy()
  })
})
