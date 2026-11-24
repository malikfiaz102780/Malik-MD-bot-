import dotenv from 'dotenv';
dotenv.config();

const parseList = (raw) =>
  (raw || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

export const config = {
  botName: (process.env.BOT_NAME || 'Malik Fiaz MD').trim(),
  ownerName: (process.env.OWNER_NAME || 'Malik Fiaz').trim(),
  ownerNumber: (process.env.OWNER_NUMBER || '923000000000').replace(/[^0-9]/g, ''),
  prefix: (process.env.PREFIX || '.').trim(),
  telegramToken: (process.env.TELEGRAM_BOT_TOKEN || '').trim(),
  adminIds: parseList(process.env.TELEGRAM_ADMIN_IDS || ''),
  sessionId: (process.env.SESSION_ID || '').trim(),
  pairingPhone: (process.env.PAIRING_PHONE || '').replace(/[^0-9]/g, ''),
  sessionDir: './sessions/wa-auth',
};
