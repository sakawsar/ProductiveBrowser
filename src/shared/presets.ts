import type { Site } from './types'

export const PRESETS: Site[] = [
  { id: 'youtube', name: 'YouTube', domains: ['youtube.com', 'youtu.be', 'youtube-nocookie.com'], dailyMinutes: 30, windows: [] },
  { id: 'facebook', name: 'Facebook', domains: ['facebook.com', 'fb.com', 'messenger.com'], dailyMinutes: 15, windows: [] },
  { id: 'instagram', name: 'Instagram', domains: ['instagram.com'], dailyMinutes: 15, windows: [] },
  { id: 'x', name: 'X (Twitter)', domains: ['x.com', 'twitter.com'], dailyMinutes: 15, windows: [] },
  { id: 'tiktok', name: 'TikTok', domains: ['tiktok.com'], dailyMinutes: 15, windows: [] },
  { id: 'reddit', name: 'Reddit', domains: ['reddit.com', 'redd.it'], dailyMinutes: 15, windows: [] }
]
