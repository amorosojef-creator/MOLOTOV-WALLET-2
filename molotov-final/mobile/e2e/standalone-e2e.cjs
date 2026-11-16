// Standalone (NO backend) UI end-to-end: both accounts live on ONE device, as in the sideloaded IPA.
const { chromium } = require('playwright');
const base = process.argv[2] || 'http://localhost:8098';
const rnd = Math.random().toString(36).slice(2, 7);
let failed = 0; const check = (n, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`); if (!ok) failed++; };
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const p = await ctx.newPage(); p.on('pageerror', (e) => { console.log('PAGEERROR', e.message); failed++; });
  p.on('request', (r) => { if (/:4000/.test(r.url())) { console.log('FAIL  app called a server: ' + r.url()); failed++; } });
  const register = async (name, handle) => {
    await p.goto(base); await p.getByText('Get Started').click();
    await p.getByPlaceholder('Alex Morgan').fill(name); await p.getByPlaceholder('you@example.com').fill(`${handle}@example.com`);
    await p.getByPlaceholder('alexmorgan').fill(handle); await p.getByPlaceholder('At least 10 characters').fill('correct horse battery');
    await p.getByPlaceholder(/Needed to confirm/).fill('123456'); await p.getByText('Create Account', { exact: true }).last().click();
    await p.getByText('Recent Transactions').waitFor({ timeout: 20000 }); await p.waitForTimeout(600);
  };
  const signOut = async () => { await p.getByLabel('Profile').first().click(); await p.getByText('Sign Out', { exact: true }).click(); await p.getByText('Get Started').waitFor(); };
  const login = async (handle) => { await p.getByText('Log In', { exact: true }).click(); await p.getByPlaceholder('you@example.com').fill(`${handle}@example.com`); await p.getByPlaceholder('Your password').fill('correct horse battery'); await p.getByText('Sign In', { exact: true }).last().click(); await p.getByText('Recent Transactions').waitFor({ timeout: 20000 }); await p.waitForTimeout(800); };
  const A = `alex${rnd}`, B = `emma${rnd}`;
  await register('Emma Carter', B); await signOut(); await register('Alex Morgan', A);
  await p.getByLabel('Add Funds').click(); await p.getByLabel('Test amount').fill('5000'); await p.getByText('Add ₱5,000.00').click(); await p.getByText('Recent Transactions').waitFor(); await p.waitForTimeout(1000);
  await p.getByLabel('Send', { exact: true }).first().click(); await p.getByPlaceholder('@handle or scan a Molotov QR').fill(B);
  await p.getByText('Emma Carter').first().waitFor({ timeout: 8000 });
  await p.getByPlaceholder('0.00').fill('1250.50'); await p.getByPlaceholder('Dinner').fill('Dinner'); await p.getByText('Continue', { exact: true }).click();
  await p.getByPlaceholder('Enter your PIN to confirm').fill('123456'); await p.getByText('Confirm Transfer').click();
  await p.getByText('Payment Successful!').waitFor({ timeout: 10000 }); check('Alex -> Emma payment succeeded with no server', true);
  await p.getByText('Done').click(); await p.waitForTimeout(800);
  await p.reload(); await p.getByText('Recent Transactions').waitFor({ timeout: 20000 }); await p.waitForTimeout(800);
  check('Alex balance ₱3,749.50 and survives app restart', /3,749\.50/.test(await p.locator('body').innerText()));
  await signOut(); await login(B);
  const t = await p.locator('body').innerText(); check('Emma sees ₱1,250.50 from Alex', /1,250\.50/.test(t) && /Alex Morgan/.test(t));
  await browser.close(); console.log(failed ? `\n${failed} FAILED` : '\nALL STANDALONE UI CHECKS PASSED'); process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('E2E FAIL', e.message.split('\n')[0]); process.exit(1); });
