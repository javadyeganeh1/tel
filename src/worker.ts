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
    
    if (request.method === 'POST' && new RegExp(^/webhook/${env.BOT_TOKEN}$).test(url.pathname)) {
      return handleTelegramUpdate(await request.json(), env)
    }
    
    return new Response('✅ سرویس فعال', {
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

// ------ توابع اصلی ------
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
    text: '🛠 *دسترسی سریع:*',
    parse_mode: 'Markdown',
    reply_markup: {
      keyboard: [
        [{text: '📥 دانلود محتوا'}, {text: '📊 آمار پروفایل'}],
        [{text: '⚙️ تنظیمات'}, {text: '📞 پشتیبانی'}]
      ],
      resize_keyboard: true
    }
  }, env)
}

async function handleProfileCommand(chatId: number, text: string, env: Env): Promise<void> {
  const username = text.split(' ')[1]?.replace(/@/g, '')
  if (!username) throw new Error('لطفا نام کاربری را وارد کنید\nمثال: /profile username')
  
  const profile = await fetchProfileData(username, env)
  
  await telegramApi('sendMessage', {
    chat_id: chatId,
    text: formatProfileText(profile),
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          {text: '📈 نمودار رشد', callback_data: chart_${username}},
          {text: '🔄 بروزرسانی', callback_data: refresh_${username}}
        ],
        [
          {text: '🔔 تنظیم هشدار', callback_data: alert_${username}},
          {text: '👁️ مشاهده پروفایل', url: https://instagram.com/${username}}
        ]
      ]
    }
  }, env)
}

// ------ توابع API ------
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
  
  if (!response.ok) throw new Error('خطا در دریافت اطلاعات پروفایل')
  
  const data = await response.json()
  await env.INSTAGRAM_STATS.put(cacheKey, JSON.stringify(data), {expirationTtl: 3600})
  
  return data
}

> ᴛᴀʏᴍᴀᴢ:
async function handleInstagramMedia(chatId: number, url: string, env: Env): Promise<void> {
  try {
    const parsedUrl = new URL(url)
    if (!['instagram.com', 'www.instagram.com'].includes(parsedUrl.hostname)) {
      throw new Error('لینک اینستاگرام معتبر نیست')
    }

    const response = await fetch(${INSTA_API}/media?url=${encodeURIComponent(url)}, {
      headers: {
        'X-RapidAPI-Key': env.RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'instagram-scraper-api2.p.rapidapi.com'
      }
    })
    
    if (!response.ok) throw new Error('خطا در دریافت محتوا')
    
    const media = await response.json()

    if (media.type === 'video') {
      await telegramApi('sendVideo', {
        chat_id: chatId,
        video: media.url,
        supports_streaming: true,
        caption: '🎥 ویدیو دریافت شد'
      }, env)
    } else {
      await sendPhotoAlbum(chatId, media.images, env)
    }
  } catch (error) {
    await sendError(chatId, (error as Error).message, env)
  }
}

// ------ توابع کمکی ------
function formatProfileText(profile: any): string {
  return 📊 *آمار پروفایل*\n
👤 نام: ${profile.full_name}
📌 نام کاربری: @${profile.username}
👥 دنبال کننده: ${Number(profile.followers).toLocaleString('fa-IR')}
📌 دنبال میکند: ${Number(profile.following).toLocaleString('fa-IR')}
📮 پستها: ${Number(profile.post_count).toLocaleString('fa-IR')}
🖼 هایلایت‌ها: ${profile.highlight_reel_count}
}

async function sendPhotoAlbum(chatId: number, images: string[], env: Env): Promise<void> {
  const media = images.map((url, index) => ({
    type: 'photo',
    media: url,
    caption: index === 0 ? '📸 مجموعه تصاویر:' : ''
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
  if (!data.ok) throw new Error(data.description || 'خطا در ارتباط با تلگرام')
  return data
}

// ------ سیستم لاگ و مدیریت خطاها ------
async function logInteraction(chatId: number, text: string, env: Env): Promise<void> {
  const timestamp = new Date().toISOString()
  await env.INSTAGRAM_STATS.put(
    log_${chatId}_${Date.now()},
    JSON.stringify({chatId, text, timestamp})
  )
}

async
