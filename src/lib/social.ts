import { db } from '@/lib/db'
import { promises as fs } from 'fs'

export interface PublishPayload {
  videoPath: string
  thumbnailPath?: string
  title: string
  description: string
  hashtags: string[]
  caption?: string
}

export interface PublishResult {
  platformPostId: string
  platformUrl: string
}

export interface SocialPlatform {
  platform: string
  displayName: string
  oauthUrl: (redirectUri: string, state: string) => string
  exchangeCode: (code: string, redirectUri: string) => Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number; handle?: string; displayName?: string; metadata?: any }>
  refreshIfNeeded: (account: any) => Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number } | null>
  publish: (account: any, payload: PublishPayload) => Promise<PublishResult>
}

// ---- YouTube ----
export const youtubePlatform: SocialPlatform = {
  platform: 'youtube',
  displayName: 'YouTube',
  oauthUrl: (redirectUri, state) => {
    const params = new URLSearchParams({
      client_id: process.env.YOUTUBE_CLIENT_ID || '',
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
      state,
      access_type: 'offline',
      prompt: 'consent',
    })
    return `https://accounts.google.com/o/oauth2/auth?${params.toString()}`
  },
  exchangeCode: async (code, redirectUri) => {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.YOUTUBE_CLIENT_ID || '',
        client_secret: process.env.YOUTUBE_CLIENT_SECRET || '',
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })
    const data = await res.json()
    if (!data.access_token) throw new Error('YouTube OAuth failed: ' + JSON.stringify(data))
    // Fetch channel info
    const ch = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
      headers: { Authorization: `Bearer ${data.access_token}` },
    }).then(r => r.json())
    const item = ch.items?.[0]
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      handle: item?.snippet?.customUrl || item?.id,
      displayName: item?.snippet?.title,
      metadata: JSON.stringify({ channelId: item?.id }),
    }
  },
  refreshIfNeeded: async (account) => {
    if (!account.tokenExpiry || account.tokenExpiry > new Date(Date.now() + 5 * 60 * 1000)) return null
    if (!account.refreshToken) return null
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.YOUTUBE_CLIENT_ID || '',
        client_secret: process.env.YOUTUBE_CLIENT_SECRET || '',
        refresh_token: account.refreshToken,
        grant_type: 'refresh_token',
      }),
    })
    const data = await res.json()
    if (!data.access_token) return null
    return {
      accessToken: data.access_token,
      refreshToken: account.refreshToken,
      expiresIn: data.expires_in,
    }
  },
  publish: async (account, payload) => {
    // Refresh if needed
    const refreshed = await youtubePlatform.refreshIfNeeded(account)
    const accessToken = refreshed?.accessToken || account.accessToken
    if (refreshed) {
      await db.socialAccount.update({
        where: { id: account.id },
        data: {
          accessToken: refreshed.accessToken,
          tokenExpiry: new Date(Date.now() + (refreshed.expiresIn || 3600) * 1000),
        },
      })
    }
    const stats = await fs.stat(payload.videoPath)
    const fileBuffer = await fs.readFile(payload.videoPath)
    const metadata = {
      snippet: {
        title: payload.title,
        description: payload.description + '\n\n' + payload.hashtags.map(h => `#${h}`).join(' '),
        tags: payload.hashtags,
        categoryId: '15', // Pets & Animals
      },
      status: { privacyStatus: 'public' },
    }
    const fileSize = stats.size
    const boundary = '-------' + Math.random().toString(16).slice(2)
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`),
      Buffer.from(JSON.stringify(metadata)),
      Buffer.from(`\r\n--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`),
      fileBuffer,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ])
    const res = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': body.length.toString(),
      },
      body,
    })
    const data = await res.json()
    if (!data.id) throw new Error('YouTube upload failed: ' + JSON.stringify(data))
    return {
      platformPostId: data.id,
      platformUrl: `https://www.youtube.com/watch?v=${data.id}`,
    }
  },
}

// ---- TikTok ----
export const tiktokPlatform: SocialPlatform = {
  platform: 'tiktok',
  displayName: 'TikTok',
  oauthUrl: (redirectUri, state) => {
    const params = new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY || '',
      scope: 'video.upload,video.publish,user.info.basic',
      response_type: 'code',
      redirect_uri: redirectUri,
      state,
    })
    return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`
  },
  exchangeCode: async (code, redirectUri) => {
    const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY || '',
        client_secret: process.env.TIKTOK_CLIENT_SECRET || '',
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    })
    const data = await res.json()
    if (!data.access_token) throw new Error('TikTok OAuth failed: ' + JSON.stringify(data))
    // Get user info
    const userRes = await fetch('https://open.tiktokapis.com/v2/user/info/', {
      headers: { Authorization: `Bearer ${data.access_token}` },
    })
    const userData = await userRes.json()
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      handle: userData?.data?.user?.username,
      displayName: userData?.data?.user?.display_name,
      metadata: JSON.stringify({ openId: userData?.data?.user?.open_id }),
    }
  },
  refreshIfNeeded: async (account) => {
    if (!account.tokenExpiry || account.tokenExpiry > new Date(Date.now() + 5 * 60 * 1000)) return null
    if (!account.refreshToken) return null
    const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY || '',
        client_secret: process.env.TIKTOK_CLIENT_SECRET || '',
        grant_type: 'refresh_token',
        refresh_token: account.refreshToken,
      }),
    })
    const data = await res.json()
    if (!data.access_token) return null
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    }
  },
  publish: async (account, payload) => {
    const refreshed = await tiktokPlatform.refreshIfNeeded(account)
    const accessToken = refreshed?.accessToken || account.accessToken
    if (refreshed) {
      await db.socialAccount.update({
        where: { id: account.id },
        data: {
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken || account.refreshToken,
          tokenExpiry: new Date(Date.now() + (refreshed.expiresIn || 3600) * 1000),
        },
      })
    }
    const meta = JSON.parse(account.metadata || '{}')
    const fileBuffer = await fs.readFile(payload.videoPath)
    // Step 1: Initialize upload
    const initRes = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({
        post_info: {
          title: `${payload.title}\n${payload.hashtags.map(h => `#${h}`).join(' ')}`,
          privacy_level: 'PUBLIC_TO_EVERYONE',
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
        },
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: fileBuffer.length,
          chunk_size: fileBuffer.length,
          total_chunk_count: 1,
        },
      }),
    })
    const initData = await initRes.json()
    if (!initData.data?.upload_url) throw new Error('TikTok init failed: ' + JSON.stringify(initData))
    // Step 2: Upload
    await fetch(initData.data.upload_url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Range': `bytes 0-${fileBuffer.length - 1}/${fileBuffer.length}`,
      },
      body: fileBuffer,
    })
    return {
      platformPostId: initData.data.publish_id,
      platformUrl: `https://www.tiktok.com/@${account.handle}/video/${initData.data.publish_id}`,
    }
  },
}

// ---- Instagram (Graph API) ----
export const instagramPlatform: SocialPlatform = {
  platform: 'instagram',
  displayName: 'Instagram',
  oauthUrl: (redirectUri, state) => {
    const params = new URLSearchParams({
      client_id: process.env.META_APP_ID || '',
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'instagram_content_publish,pages_read_engagement,pages_show_list',
      state,
    })
    return `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`
  },
  exchangeCode: async (code, redirectUri) => {
    const res = await fetch('https://graph.facebook.com/v21.0/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.META_APP_ID || '',
        client_secret: process.env.META_APP_SECRET || '',
        redirect_uri: redirectUri,
        code,
      }),
    })
    const data = await res.json()
    if (!data.access_token) throw new Error('Instagram OAuth failed: ' + JSON.stringify(data))
    // Get user pages + ig account
    const pagesRes = await fetch(`https://graph.facebook.com/v21.0/me/accounts?access_token=${data.access_token}`)
    const pagesData = await pagesRes.json()
    const page = pagesData.data?.[0]
    if (!page) throw new Error('No Instagram business account found')
    const igRes = await fetch(`https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`)
    const igData = await igRes.json()
    const igId = igData.instagram_business_account?.id
    if (!igId) throw new Error('No IG business account linked to page')
    const igProfile = await fetch(`https://graph.facebook.com/v21.0/${igId}?fields=username,name&access_token=${page.access_token}`).then(r => r.json())
    return {
      accessToken: page.access_token,
      refreshToken: data.access_token, // user token
      expiresIn: data.expires_in,
      handle: igProfile.username,
      displayName: igProfile.name || igProfile.username,
      metadata: JSON.stringify({ igUserId: igId, pageId: page.id }),
    }
  },
  refreshIfNeeded: async (account) => null, // Long-lived tokens handled separately
  publish: async (account, payload) => {
    const meta = JSON.parse(account.metadata || '{}')
    // For IG, we need a public URL for the video — this requires either S3 hosting or a temporary public URL
    // In a real deployment, you'd upload to S3/Cloudinary first and pass the URL here.
    // For this build, we'll create a container with a local URL (won't work in production without public hosting)
    // This is a documented limitation — to enable real IG publishing, host videos on S3 and provide public URLs.
    throw new Error('Instagram publishing requires a public video URL. Configure S3/public storage and update the connector.')
  },
}

// ---- Facebook ----
export const facebookPlatform: SocialPlatform = {
  platform: 'facebook',
  displayName: 'Facebook',
  oauthUrl: (redirectUri, state) => {
    const params = new URLSearchParams({
      client_id: process.env.META_APP_ID || '',
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'pages_manage_posts,pages_read_engagement,publish_video',
      state,
    })
    return `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`
  },
  exchangeCode: async (code, redirectUri) => {
    const res = await fetch('https://graph.facebook.com/v21.0/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.META_APP_ID || '',
        client_secret: process.env.META_APP_SECRET || '',
        redirect_uri: redirectUri,
        code,
      }),
    })
    const data = await res.json()
    if (!data.access_token) throw new Error('Facebook OAuth failed: ' + JSON.stringify(data))
    const pagesRes = await fetch(`https://graph.facebook.com/v21.0/me/accounts?access_token=${data.access_token}`)
    const pagesData = await pagesRes.json()
    const page = pagesData.data?.[0]
    if (!page) throw new Error('No Facebook pages found')
    return {
      accessToken: page.access_token,
      refreshToken: data.access_token,
      expiresIn: data.expires_in,
      handle: page.id,
      displayName: page.name,
      metadata: JSON.stringify({ pageId: page.id }),
    }
  },
  refreshIfNeeded: async () => null,
  publish: async (account, payload) => {
    const meta = JSON.parse(account.metadata || '{}')
    // Facebook requires either URL or chunked upload
    throw new Error('Facebook publishing requires a public video URL. Configure S3/public storage and update the connector.')
  },
}

// ---- X (Twitter) ----
export const xPlatform: SocialPlatform = {
  platform: 'x',
  displayName: 'X (Twitter)',
  oauthUrl: (redirectUri, state) => {
    // X uses OAuth 1.0a + 2.0 PKCE — too complex for inline. Stub URL.
    return `https://twitter.com/i/oauth2/authorize?client_id=${process.env.X_CLIENT_ID || ''}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=tweet.read%20tweet.write%20users.read%20media.write&state=${state}&code_challenge=${state}&code_challenge_method=plain`
  },
  exchangeCode: async (code, redirectUri) => {
    const res = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from(`${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`).toString('base64'),
      },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code_verifier: code, // simplified; production should use proper PKCE
      }),
    })
    const data = await res.json()
    if (!data.access_token) throw new Error('X OAuth failed: ' + JSON.stringify(data))
    const userRes = await fetch('https://api.twitter.com/2/users/me', {
      headers: { Authorization: `Bearer ${data.access_token}` },
    })
    const user = await userRes.json()
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      handle: user?.data?.username,
      displayName: user?.data?.name,
      metadata: JSON.stringify({ userId: user?.data?.id }),
    }
  },
  refreshIfNeeded: async (account) => {
    if (!account.tokenExpiry || account.tokenExpiry > new Date(Date.now() + 5 * 60 * 1000)) return null
    if (!account.refreshToken) return null
    const res = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: account.refreshToken,
        grant_type: 'refresh_token',
      }),
    })
    const data = await res.json()
    if (!data.access_token) return null
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    }
  },
  publish: async (account, payload) => {
    // X v2 media upload is two-step and uses OAuth 1.0a for media. Complex.
    // Posting a text tweet only:
    const refreshed = await xPlatform.refreshIfNeeded(account)
    const accessToken = refreshed?.accessToken || account.accessToken
    if (refreshed) {
      await db.socialAccount.update({
        where: { id: account.id },
        data: {
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken || account.refreshToken,
          tokenExpiry: new Date(Date.now() + (refreshed.expiresIn || 7200) * 1000),
        },
      })
    }
    // Note: Media upload requires OAuth 1.0a credentials. Without those, we post text only.
    const text = `${payload.title}\n\n${payload.hashtags.map(h => `#${h}`).join(' ')}`
    const res = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: text.slice(0, 280) }),
    })
    const data = await res.json()
    if (!data.data?.id) throw new Error('X post failed: ' + JSON.stringify(data))
    return {
      platformPostId: data.data.id,
      platformUrl: `https://twitter.com/i/web/status/${data.data.id}`,
    }
  },
}

export const platforms: Record<string, SocialPlatform> = {
  youtube: youtubePlatform,
  tiktok: tiktokPlatform,
  instagram: instagramPlatform,
  facebook: facebookPlatform,
  x: xPlatform,
}
