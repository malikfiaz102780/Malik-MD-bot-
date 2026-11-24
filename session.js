import fs from 'fs';
import path from 'path';

export async function restoreSessionFromEnv(sessionId, targetDir) {
  if (!sessionId) return false;
  fs.mkdirSync(targetDir, { recursive: true });
  try {
    const cleaned = sessionId.startsWith('MALIK_MD~')
      ? sessionId.slice('MALIK_MD~'.length)
      : sessionId;
    const decoded = Buffer.from(cleaned, 'base64').toString('utf-8');
    const bundle = JSON.parse(decoded);
    if (bundle && typeof bundle === 'object') {
      for (const [fileName, content] of Object.entries(bundle)) {
        const safeName = path.basename(fileName);
        const destPath = path.join(targetDir, safeName);
        fs.writeFileSync(
          destPath,
          typeof content === 'string' ? content : JSON.stringify(content, null, 2),
          'utf-8'
        );
      }
      return true;
    }
  } catch (err) {
    console.error('[Session Restore Error]:', err.message);
  }
  return false;
}

export function exportSessionToBase64(targetDir) {
  if (!fs.existsSync(targetDir)) {
    throw new Error(`Session directory not found: ${targetDir}`);
  }
  const bundle = {};
  for (const file of fs.readdirSync(targetDir)) {
    const fullPath = path.join(targetDir, file);
    if (fs.statSync(fullPath).isFile()) {
      bundle[file] = fs.readFileSync(fullPath, 'utf-8');
    }
  }
  const b64 = Buffer.from(JSON.stringify(bundle), 'utf-8').toString('base64');
  return `MALIK_MD~${b64}`;
}
