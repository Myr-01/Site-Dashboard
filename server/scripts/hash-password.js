/**
 * Bir dəfəlik miqrasiya scripti.
 * Admin şifrəsini bcrypt hash-ə çevirir ki, .env-də plain text saxlanılmasın.
 *
 * İşlətmək: cd server && node scripts/hash-password.js
 */
import readline from 'readline';
import { hashPassword } from '../utils.js';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question('Admin şifrəsini daxil et: ', async (password) => {
  if (!password || !password.trim()) {
    console.error('\nXəta: şifrə boş ola bilməz.');
    rl.close();
    process.exit(1);
  }

  try {
    const hash = await hashPassword(password);
    console.log('\nBu hash-i .env faylında ADMIN_PASSWORD_HASH= dəyərinə yapışdır:\n');
    console.log(hash);
    console.log('\nKöhnə ADMIN_PASSWORD sətrini .env-dən silməyi unutma.');
  } catch (err) {
    console.error('\nHash yaradıla bilmədi:', err.message);
    process.exitCode = 1;
  } finally {
    rl.close();
  }
});
