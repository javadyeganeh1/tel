// env.d.ts
interface Env {
  BOT_TOKEN: string
  RAPIDAPI_KEY: string
  INSTAGRAM_STATS: KVNamespace
}

// worker.ts
addEventListener('fetch', (event: FetchEvent) => {
  event.respondWith(handleRequest(event.request, event.env))
})

addEventListener('scheduled', (event: ScheduledEvent) => {
  event.waitUntil(handleScheduledEvent(event.env))
})

const INSTA_API = 'https://instagram-scraper-api2.p.rapidapi.com/v1'

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  
  try {
    await validateRequest(request, env)
    
    if (request.method === 'POST' && new RegExp(`^/webhook/${env.BOT_TOKEN}$`).test(url.pathname)) {
      return handleTelegramUpdate(await request.json(), env)
    }
    
    return new Response('? ÓÑæíÓ ÝÚÇá', {
      status: 200,
      headers: {'Access-Control-Allow-Origin': '*'}
    })
  } catch (error) {
    return new Response((error as Error).message, {status: 403})
  }
}

async function handleTelegramUpdate(update: any, env: Env): Promise<Response> {
  try {
    if (update.callback_query) {
      const {data, message} = update.callback_query
      await handleInlineButton(message.chat.id, data, env)
      return new Response('OK')
    }

    const {chat, text} = update.message
    await logInteraction(chat.id, text, env)

    if (/^\/start/i.test(text)) {
      await sendWelcomeMenu(chat.id, env)
    } else if (/^\/profile/i.test(text)) {
      await handleProfileCommand(chat.id, text, env)
    } else if (/(instagram\.com|instagr\.am)/i.test(text)) {
      await handleInstagramMedia(chat.id, text, env)
    } else {
      await handleUnknownCommand(chat.id, env)
    }
  } catch (error) {
    await sendError(chat.id, (error as Error).message, env)
  }
  
  return new Response('OK')
}

// ------ ÊæÇÈÚ ÇÕáí ------
async function validateRequest(request: Request, env: Env): Promise<void> {
  const signature = request.headers.get('X-Telegram-Bot-Api-Secret-Token')
  const secret = await env.INSTAGRAM_STATS.get('SECRET_HASH')
  
  if (!signature || signature !== secret) {
    throw new Error('Invalid request signature')
  }
}

async function sendWelcomeMenu(chatId: number, env: Env): Promise<void> {
  await telegramApi('sendMessage', {
    chat_id: chatId,
    text: '?? *ÏÓÊÑÓí ÓÑíÚ:*',
    parse_mode: 'Markdown',
    reply_markup: {
      keyboard: [
        [{text: '?? ÏÇäáæÏ ãÍÊæÇ'}, {text: '?? ÂãÇÑ ÑæÝÇíá'}],
        [{text: '?? ÊäÙíãÇÊ'}, {text: '?? ÔÊíÈÇäí'}]
      ],
      resize_keyboard: true
    }
  }, env)
}

async function handleProfileCommand(chatId: number, text: string, env: Env): Promise<void> {
  const username = text.split(' ')[1]?.replace(/@/g, '')
  if (!username) throw new Error('áØÝÇ äÇã ˜ÇÑÈÑí ÑÇ æÇÑÏ ˜äíÏ\nãËÇá: /profile username')
  
  const profile = await fetchProfileData(username, env)
  
  await telegramApi('sendMessage', {
    chat_id: chatId,
    text: formatProfileText(profile),
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          {text: '?? äãæÏÇÑ ÑÔÏ', callback_data: chart_${username}},
          {text: '?? ÈÑæÒÑÓÇäí', callback_data: refresh_${username}}
        ],
        [
          {text: '?? ÊäÙíã åÔÏÇÑ', callback_data: alert_${username}},
          {text: '??? ãÔÇåÏå ÑæÝÇíá', url: https://instagram.com/${username}}
        ]
      ]
    }
  }, env)
}

// ------ ÊæÇÈÚ API ------
async function fetchProfileData(username: string, env: Env): Promise<any> {
  const cacheKey = profile_${username}
  const cached = await env.INSTAGRAM_STATS.get(cacheKey, 'json')
  
  if (cached) return cached

  const response = await fetch(${INSTA_API}/profile/${username}, {
    headers: {
      'X-RapidAPI-Key': env.RAPIDAPI_KEY,
      'X-RapidAPI-Host': 'instagram-scraper-api2.p.rapidapi.com'
    }
  })
  
  if (!response.ok) throw new Error('ÎØÇ ÏÑ ÏÑíÇÝÊ ÇØáÇÚÇÊ ÑæÝÇíá')
  
  const data = await response.json()
  await env.INSTAGRAM_STATS.put(cacheKey, JSON.stringify(data), {expirationTtl: 3600})
  
  return data
}
async function handleInstagramMedia(chatId: number, url: string, env: Env): Promise<void> {
  try {
    const parsedUrl = new URL(url)
    if (!['instagram.com', 'www.instagram.com'].includes(parsedUrl.hostname)) {
      throw new Error('áíä˜ ÇíäÓÊÇÑÇã ãÚÊÈÑ äíÓÊ')
    }

    const response = await fetch(${INSTA_API}/media?url=${encodeURIComponent(url)}, {
      headers: {
        'X-RapidAPI-Key': env.RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'instagram-scraper-api2.p.rapidapi.com'
      }
    })
    
    if (!response.ok) throw new Error('ÎØÇ ÏÑ ÏÑíÇÝÊ ãÍÊæÇ')
    
    const media = await response.json()

    if (media.type === 'video') {
      await telegramApi('sendVideo', {
        chat_id: chatId,
        video: media.url,
        supports_streaming: true,
        caption: '?? æíÏíæ ÏÑíÇÝÊ ÔÏ'
      }, env)
    } else {
      await sendPhotoAlbum(chatId, media.images, env)
    }
  } catch (error) {
    await sendError(chatId, (error as Error).message, env)
  }
}

// ------ ÊæÇÈÚ ˜ã˜í ------
function formatProfileText(profile: any): string {
  return ?? *ÂãÇÑ ÑæÝÇíá*\n
?? äÇã: ${profile.full_name}
?? äÇã ˜ÇÑÈÑí: @${profile.username}
?? ÏäÈÇá ˜ääÏå: ${Number(profile.followers).toLocaleString('fa-IR')}
?? ÏäÈÇá ãí˜äÏ: ${Number(profile.following).toLocaleString('fa-IR')}
?? ÓÊåÇ: ${Number(profile.post_count).toLocaleString('fa-IR')}
?? åÇíáÇíÊåÇ: ${profile.highlight_reel_count}
}

async function sendPhotoAlbum(chatId: number, images: string[], env: Env): Promise<void> {
  const media = images.map((url, index) => ({
    type: 'photo',
    media: url,
    caption: index === 0 ? '?? ãÌãæÚå ÊÕÇæíÑ:' : ''
  }))

  await telegramApi('sendMediaGroup', {
    chat_id: chatId,
    media: media
  }, env)
}

async function telegramApi(method: string, params: object, env: Env): Promise<any> {
  const response = await fetch(https://api.telegram.org/bot${env.BOT_TOKEN}/${method}, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(params)
  })
  
  const data = await response.json()
  if (!data.ok) throw new Error(data.description || 'ÎØÇ ÏÑ ÇÑÊÈÇØ ÈÇ ÊáÑÇã')
  return data
}

// ------ ÓíÓÊã áÇ æ ãÏíÑíÊ ÎØÇåÇ ------
async function logInteraction(chatId: number, text: string, env: Env): Promise<void> {
  const timestamp = new Date().toISOString()
  await env.INSTAGRAM_STATS.put(
    log_${chatId}_${Date.now()},
    JSON.stringify({chatId, text, timestamp})
  )
}

async function sendError(chatId: number, error: string, env: Env): Promise<void> {
  await telegramApi('sendMessage', {
    chat_id: chatId,
    text: ?? ÎØÇ:\n${error}
  }, env)
}

// ------ ÊæÇÈÚ ÒãÇäÈäÏí ÔÏå ------
async function handleScheduledEvent(env: Env): Promise<void> {
  await cleanOldCache(env)
  await checkFollowerAlerts(env)
}

async function cleanOldCache(env: Env): Promise<void> {
  const keys = await env.INSTAGRAM_STATS.list({prefix: 'profile_'})
  for (const key of keys.keys) {
    await env.INSTAGRAM_STATS.delete(key.name)
  }
}

async function checkFollowerAlerts(env: Env): Promise<void> {
  // íÇÏåÓÇÒí ãäØÞ åÔÏÇÑåÇ
}

// ------ ÊæÇÈÚ ÇÖÇÝí ------
async function handleInlineButton(chatId: number, data: string, env: Env): Promise<void> {
  const [action, username] = data.split('_')
  switch(action) {
    case 'chart':
      await sendGrowthChart(chatId, username, env)
      break
    case 'refresh':
      await refreshProfileData(chatId, username, env)
      break
    case 'alert':
      await setupFollowerAlert(chatId, username, env)
      break
  }
}

async function handleUnknownCommand(chatId: number, env: Env): Promise<void> {
  await telegramApi('sendMessage', {
    chat_id: chatId,
    text: '?? ÏÓÊæÑ äÇÔäÇÎÊå!'
  }, env)
}
