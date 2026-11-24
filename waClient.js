import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { Boom } from '@hapi/boom';
import { restoreSessionFromEnv, exportSessionToBase64 } from './session.js';
import { executeBotCommand } from './commands/handlers.js';
import { buildMalikFiazMenu } from './commands/menuData.js';

export class WhatsAppBridge {
  constructor(initialConfig, onTelegramNotify) {
    this.ctx = {
      botName: initialConfig.botName || 'Malik Fiaz MD',
      ownerName: initialConfig.ownerName || 'Malik Fiaz',
      ownerNumber: initialConfig.ownerNumber || '923000000000',
      prefix: initialConfig.prefix || '.',
      sessionId: initialConfig.sessionId || '',
      pairingPhone: initialConfig.pairingPhone || '',
      sessionDir: initialConfig.sessionDir || './sessions/wa-auth',
      toggles: {},
    };
    this.onTelegramNotify = onTelegramNotify || (async () => {});
    this.sock = null;
    this.isConnected = false;
    this.logger = pino({ level: 'silent' });
  }

  getMenuText() {
    return buildMalikFiazMenu(this.ctx.botName, this.ctx.ownerName, this.ctx.prefix);
  }

  async start(customPhone = '') {
    if (this.ctx.sessionId) {
      await restoreSessionFromEnv(this.ctx.sessionId, this.ctx.sessionDir);
    }

    const { state, saveCreds } = await useMultiFileAuthState(this.ctx.sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    this.sock = makeWASocket({
      version,
      logger: this.logger,
      auth: state,
      printQRInTerminal: false,
      browser: [this.ctx.botName, 'Chrome', '2.0.0'],
    });

    const targetPhone = (customPhone || this.ctx.pairingPhone || '').replace(/[^0-9]/g, '');
    if (targetPhone && !this.sock.authState.creds.registered) {
      setTimeout(async () => {
        try {
          const code = await this.sock.requestPairingCode(targetPhone);
          await this.onTelegramNotify(
            `📱 *${this.ctx.botName} Pairing Code*\nPhone: \`+${targetPhone}\`\nCode: \`${code}\``
          );
        } catch (err) {
          await this.onTelegramNotify(`❌ Pairing error: ${err.message}`);
        }
      }, 2500);
    }

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        await this.onTelegramNotify(`🔲 *${this.ctx.botName} QR*\n\`${qr}\``);
      }

      if (connection === 'open') {
        this.isConnected = true;
        await this.onTelegramNotify(`✅ *${this.ctx.botName}* (Owner: ${this.ctx.ownerName}) WhatsApp par connect ho gaya!`);
      }

      if (connection === 'close') {
        this.isConnected = false;
        const statusCode =
          lastDisconnect?.error instanceof Boom
            ? lastDisconnect.error.output?.statusCode
            : lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        await this.onTelegramNotify(
          `⚠️ Connection closed (${statusCode || 'unknown'}). ${shouldReconnect ? 'Reconnecting...' : 'Logged out.'}`
        );
        if (shouldReconnect) {
          setTimeout(() => this.start(targetPhone), 3000);
        }
      }
    });

    this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        if (!msg.message || msg.key.fromMe) continue;

        const jid = msg.key.remoteJid;
        if (this.ctx.toggles.autoread) {
          await this.sock.readMessages([msg.key]).catch(() => {});
        }

        const body =
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          msg.message.imageMessage?.caption ||
          msg.message.videoMessage?.caption ||
          '';

        if (!body.startsWith(this.ctx.prefix)) continue;

        const args = body.slice(this.ctx.prefix.length).trim().split(/\s+/);
        const command = (args.shift() || '').toLowerCase();
        if (!command) continue;

        await executeBotCommand({
          sock: this.sock,
          jid,
          msg,
          command,
          args,
          fullText: body,
          ctx: this.ctx,
        });
      }
    });
  }

  async sendWhatsAppMessage(jidOrPhone, text) {
    if (!this.sock || !this.isConnected) {
      throw new Error('WhatsApp connected nahi hai.');
    }
    let jid = jidOrPhone.trim();
    if (!jid.includes('@')) {
      jid = `${jid.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    }
    await this.sock.sendMessage(jid, { text });
    return jid;
  }

  getSessionExport() {
    return exportSessionToBase64(this.ctx.sessionDir);
  }
}
