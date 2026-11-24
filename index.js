import fetch from 'node-fetch';
import { config } from './config.js';
import { WhatsAppBridge } from './waClient.js';

if (!config.telegramToken) {
  console.error('❌ TELEGRAM_BOT_TOKEN missing! .env file check karein.');
  process.exit(1);
}

const TG_API = `https://api.telegram.org/bot${config.telegramToken}`;
let offset = 0;

function isAuthorized(chatId) {
  if (!config.adminIds.length) return true;
  return config.adminIds.includes(String(chatId));
}

async function tgRequest(method, payload = {}) {
  const res = await fetch(`${TG_API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

async function sendTgMessage(chatId, text) {
  const chunkSize = 3900;
  for (let i = 0; i < text.length; i += chunkSize) {
    const part = text.slice(i, i + chunkSize);
    await tgRequest('sendMessage', {
      chat_id: chatId,
      text: part,
      parse_mode: 'Markdown',
    });
  }
}

const waBridge = new WhatsAppBridge(config, async (alertText) => {
  for (const adminId of config.adminIds) {
    try {
      await sendTgMessage(adminId, alertText);
    } catch (e) {
      console.error('[Notify Error]:', e.message);
    }
  }
});

async function handleTelegramUpdate(update) {
  const msg = update.message;
  if (!msg || !msg.text) return;

  const chatId = msg.chat.id;
  const text = msg.text.trim();
  if (!isAuthorized(chatId)) {
    await sendTgMessage(chatId, '⛔ Access denied.');
    return;
  }

  const parts = text.split(/\s+/);
  const cmd = parts[0].toLowerCase().split('@')[0];
  const args = parts.slice(1);

  if (cmd === '/start' || cmd === '/help') {
    await sendTgMessage(
      chatId,
      [
        `⚡ *${config.botName.toUpperCase()}* — Telegram Control`,
        `👑 *Owner:* ${config.ownerName}`,
        ``,
        `• \`/menu\` — Full Malik Fiaz MD WhatsApp command menu`,
        `• \`/status\` — Connection status`,
        `• \`/pair <phone>\` — WhatsApp pairing code`,
        `• \`/send <number|jid> <msg>\` — Send WhatsApp message`,
        `• \`/session\` — Export SESSION_ID for cloud hosting`,
      ].join('\n')
    );
  } else if (cmd === '/menu') {
    await sendTgMessage(chatId, waBridge.getMenuText());
  } else if (cmd === '/status') {
    await sendTgMessage(
      chatId,
      `📊 *${config.botName}*\n👑 Owner: *${config.ownerName}*\n🟢 Connected: *${waBridge.isConnected ? 'Yes' : 'No'}*\n⌨️ Prefix: \`${config.ctx?.prefix || config.prefix}\``
    );
  } else if (cmd === '/pair') {
    const phone = (args[0] || config.pairingPhone || '').replace(/[^0-9]/g, '');
    if (!phone) {
      await sendTgMessage(chatId, '⚠️ Example: `/pair 923001234567`');
      return;
    }
    await sendTgMessage(chatId, `⏳ Requesting pairing code for \`+${phone}\`...`);
    await waBridge.start(phone);
  } else if (cmd === '/send') {
    const target = args[0];
    const body = args.slice(1).join(' ').trim();
    if (!target || !body) {
      await sendTgMessage(chatId, '⚠️ Example: `/send 923001234567 Hello`');
      return;
    }
    try {
      const sentTo = await waBridge.sendWhatsAppMessage(target, body);
      await sendTgMessage(chatId, `✅ Sent to \`${sentTo}\``);
    } catch (err) {
      await sendTgMessage(chatId, `❌ ${err.message}`);
    }
  } else if (cmd === '/session') {
    try {
      const sessionStr = waBridge.getSessionExport();
      await sendTgMessage(chatId, `🔐 *SESSION_ID*\n\n\`${sessionStr}\``);
    } catch (err) {
      await sendTgMessage(chatId, `❌ ${err.message}`);
    }
  }
}

async function run() {
  console.log(`⚡ ${config.botName} (${config.ownerName}) started...`);
  await waBridge.start();

  while (true) {
    try {
      const res = await tgRequest('getUpdates', {
        offset,
        timeout: 25,
        allowed_updates: ['message'],
      });
      if (res.ok && Array.isArray(res.result)) {
        for (const upd of res.result) {
          offset = upd.update_id + 1;
          await handleTelegramUpdate(upd);
        }
      }
    } catch (err) {
      console.error('[TG Poll Error]:', err.message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

run();
