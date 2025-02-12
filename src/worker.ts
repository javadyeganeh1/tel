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
          {text: '📈 نمودار رشد', callback_data: chart_${username}}, // اصلاح
          {text: '🔄 بروزرسانی', callback_data: refresh_${username}} // اصلاح
        ],
        [
          {text: '🔔 تنظیم هشدار', callback_data: alert_${username}}, // اصلاح
          {text: '👁️ مشاهده پروفایل', url: https://instagram.com/${username}} // اصلاح
        ]
      ]
    }
  }, env)
}

// ------ توابع API ------
async function fetchProfileData(username: string, env: Env): Promise<any> {
  const cacheKey = profile_${username} // اصلاح
  const cached = await env.INSTAGRAM_STATS.get(cacheKey, 'json')
  
  if (cached) return cached

  const response = await fetch(${INSTA_API}/profile/${username}, { // اصلاح
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
