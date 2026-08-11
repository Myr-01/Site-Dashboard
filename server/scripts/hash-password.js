/**
 * Bir dəfəlik miqrasiya scripti.
 * Admin şifrəsini bcrypt hash-ə çevirir ki, .env-də plain text saxlanılmasın.
 *
 * İşlətmək: cd server && node scripts/hash-password.js
 */
import readline from 'readline';
import { hashPassword } from '../utils.js';

const PROMPT = 'Admin şifrəsini daxil et: ';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true,
});

// Yazılan şifrə terminalda (və scrollback/tarixçədə) görünməsin
let muted = false;
const originalWrite = rl._writeToOutput?.bind(rl);
rl._writeToOutput = function (chunk) {
  if (muted) return;
  if (originalWrite) originalWrite(chunk);
  else rl.output.write(chunk);
};

rl.question(PROMPT, async (password) => {
  muted = false;
  process.stdout.write('\n');
  if (!password || !password.trim()) {
    console.error('\nXəta: şifrə boş ola bilməz.');
    rl.close();
    process.exit(1);
  }

  try {
    const hash = await hashPassword(password);
    console.log('\nBu hash-i .env faylında ADMIN_PASSWORD_HASH= dəyərinə yapışdır:\n');
    console.log(hash);
    console.log('\nSonra serveri restart et. Diqqət: hash-i .env.example-ə YAZMA — o fayl git-ə gedir.');
  } catch (err) {
    console.error('\nHash yaradıla bilmədi:', err.message);
    process.exitCode = 1;
  } finally {
    rl.close();
  }
});

// question() prompt-u yazandan sonra girişi maskala
muted = true;
