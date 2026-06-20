/**
 * app.js — PrintQ main application logic
 */

// ── App State ────────────────────────────────────────────────
const APP = {
  role:      'student',
  queue:     [],       // all jobs (paid only in queue, all in history)
  counter:   1,        // next token number
  myJobId:   null,     // currently-viewed job id (student)
  sView:     'queue',  // student nav pane
  kView:     'dash',   // shopkeeper nav pane
  loginName: '',
};

let printOptions = { color: 'bw', sides: 'single', paper: 'a4', finish: 'none' };
let selectedFileObj = null;
let qrRendered = false;

// ── Boot ─────────────────────────────────────────────────────
window.addEventListener('load', () => {
  const local = lsLoad();
  APP.queue   = local.queue;
  APP.counter = local.counter;
  showView('login-view');

  // Panda eye-covering
  const pw = document.getElementById('l-pw');
  const pandaStage = document.getElementById('panda-stage');
  pw.addEventListener('focus', () => pandaStage.classList.add('covering'));
  pw.addEventListener('blur',  () => pandaStage.classList.remove('covering'));
  pw.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
});

// ─────────────────────────────────────────────────────────────
//   LOGIN / LOGOUT  — Supabase Auth + local fallback
// ─────────────────────────────────────────────────────────────
function setRole(role) {
  APP.role = role;
  document.getElementById('tab-s').classList.toggle('active', role === 'student');
  document.getElementById('tab-k').classList.toggle('active', role === 'shopkeeper');
  // Shopkeeper tab hides register/forgot — only email+password login
  const registerLink = document.getElementById('register-link');
  if (registerLink) registerLink.style.display = role === 'shopkeeper' ? 'none' : '';
}

function showLogin() {
  document.getElementById('login-form').style.display    = '';
  document.getElementById('register-form').style.display = 'none';
  document.getElementById('forgot-form').style.display   = 'none';
}
function showRegister() {
  document.getElementById('login-form').style.display    = 'none';
  document.getElementById('register-form').style.display = '';
  document.getElementById('forgot-form').style.display   = 'none';
}
function showForgot() {
  document.getElementById('login-form').style.display    = 'none';
  document.getElementById('register-form').style.display = 'none';
  document.getElementById('forgot-form').style.display   = '';
}

function togglePW() {
  const pw  = document.getElementById('l-pw');
  const btn = document.getElementById('pw-eye-btn');
  const show = pw.type === 'password';
  pw.type = show ? 'text' : 'password';
  btn.textContent = show ? String.fromCodePoint(0x1F648) : String.fromCodePoint(0x1F441);
  const stage = document.getElementById('panda-stage');
  if (show) stage.classList.remove('covering');
  else if (document.activeElement === pw) stage.classList.add('covering');
}

async function doLogin() {
  const email = document.getElementById('l-user').value.trim();
  const pass  = document.getElementById('l-pw').value;
  if (!email) { toast('Please enter your email.', 'warn'); return; }
  if (!pass)  { toast('Please enter your password.', 'warn'); return; }

  // Shopkeeper — credentials verified server-side or local fallback
  if (APP.role === 'shopkeeper') {
    if (HAS_SUPABASE) {
      const btn = document.querySelector('.login-btn');
      const origText = btn.textContent;
      btn.textContent = 'Verifying...'; btn.disabled = true;
      try {
        const res = await fetch(PRINTQ_CONFIG.verifyShopkeeperUrl, {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${PRINTQ_CONFIG.supabaseAnonKey}`,
          },
          body: JSON.stringify({ email, password: pass }),
        });
        btn.textContent = origText; btn.disabled = false;
        if (!res.ok) {
          toast('Invalid shopkeeper credentials.', 'err'); return;
        }
        const data = await res.json();
        if (data && data.success) {
          showView('shopkeeper-view');
          await initShop();
        } else {
          toast(data.error || 'Invalid shopkeeper credentials.', 'err');
        }
      } catch (err) {
        btn.textContent = origText; btn.disabled = false;
        toast('Verification error: ' + err.message, 'err');
      }
      return;
    } else {
      // Local fallback for offline/demo mode
      const SHOP_EMAIL = PRINTQ_CONFIG.shopkeeperEmail || 'admin@printq.local';
      if (email !== SHOP_EMAIL || pass !== 'shop123') {
        toast('Invalid shopkeeper credentials.', 'err'); return;
      }
      showView('shopkeeper-view');
      await initShop();
      return;
    }
  }

  // Student — Supabase Auth if configured, else name-based fallback
  if (HAS_SUPABASE) {
    const btn = document.querySelector('.login-btn');
    btn.textContent = 'Logging in...'; btn.disabled = true;
    const { data, error } = await _sb.auth.signInWithPassword({ email, password: pass });
    btn.textContent = 'LOGIN'; btn.disabled = false;
    if (error) { toast(error.message, 'err'); return; }
    const displayName = data.user.user_metadata?.full_name || email.split('@')[0];
    APP.loginName = displayName;
    APP.userEmail = email;
    showView('student-view');
    await initStudent(displayName);
  } else {
    // Local fallback: email as username, any password works
    APP.loginName = email.split('@')[0];
    APP.userEmail = email;
    showView('student-view');
    await initStudent(APP.loginName);
  }
}

async function doRegister() {
  const name  = document.getElementById('r-name').value.trim();
  const email = document.getElementById('r-email').value.trim();
  const pass  = document.getElementById('r-pw').value;
  if (!name)  { toast('Please enter your name.', 'warn'); return; }
  if (!email) { toast('Please enter your email.', 'warn'); return; }
  if (pass.length < 6) { toast('Password must be at least 6 characters.', 'warn'); return; }

  if (HAS_SUPABASE) {
    const btn = document.querySelector('#register-form .login-btn');
    btn.textContent = 'Creating...'; btn.disabled = true;
    const { error } = await _sb.auth.signUp({
      email, password: pass,
      options: { data: { full_name: name } },
    });
    btn.textContent = 'CREATE ACCOUNT'; btn.disabled = false;
    if (error) { toast(error.message, 'err'); return; }
    toast('Account created! Check your email to confirm, then log in.', 'ok');
    showLogin();
  } else {
    // Local fallback: just log them in
    APP.loginName = name;
    APP.userEmail = email;
    showView('student-view');
    await initStudent(name);
  }
}

async function doForgot() {
  const email = document.getElementById('f-email').value.trim();
  if (!email) { toast('Please enter your email.', 'warn'); return; }

  if (HAS_SUPABASE) {
    const btn = document.querySelector('#forgot-form .login-btn');
    btn.textContent = 'Sending...'; btn.disabled = true;
    const { error } = await _sb.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.href,
    });
    btn.textContent = 'SEND RESET LINK'; btn.disabled = false;
    if (error) { toast(error.message, 'err'); return; }
    toast('Reset link sent! Check your email.', 'ok');
    showLogin();
  } else {
    toast('Password reset requires Supabase to be configured.', 'warn');
  }
}

async function doLogout() {
  clearInterval(window._pollInterval);
  window._notified = false;
  APP.myJobId = null;
  qrRendered  = false;
  selectedFileObj = null;
  if (HAS_SUPABASE) await _sb.auth.signOut().catch(() => {});
  showView('login-view');
  showLogin();
  document.getElementById('l-pw').value = '';
}

// ─────────────────────────────────────────────────────────────
//   VIEW / NAV HELPERS
// ─────────────────────────────────────────────────────────────
function showView(id) {
  document.querySelectorAll('.view').forEach(v => {
    v.classList.remove('active');
    v.style.display = 'none';
  });
  const el = document.getElementById(id);
  el.style.display = 'block';
  requestAnimationFrame(() => {
    el.classList.add('active');
    if (id === 'student-view')    setTimeout(() => pillUpdate('s-nav-items', 's-pill'), 80);
    if (id === 'shopkeeper-view') setTimeout(() => pillUpdate('k-nav-items', 'k-pill'), 80);
  });
}

function pillUpdate(navId, pillId) {
  const nav  = document.getElementById(navId);
  const pill = document.getElementById(pillId);
  if (!nav || !pill) return;
  const active = nav.querySelector('.nbtn.active');
  if (!active) return;
  const nr = nav.getBoundingClientRect();
  const br = active.getBoundingClientRect();
  pill.style.cssText = `left:${br.left-nr.left}px;top:${br.top-nr.top}px;width:${br.width}px;height:${br.height}px`;
}

function movePill(navId, pillId, btn) {
  const nav  = document.getElementById(navId);
  const pill = document.getElementById(pillId);
  nav.querySelectorAll('.nbtn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const nr = nav.getBoundingClientRect();
  const br = btn.getBoundingClientRect();
  pill.style.left   = (br.left - nr.left) + 'px';
  pill.style.top    = (br.top  - nr.top)  + 'px';
  pill.style.width  = br.width  + 'px';
  pill.style.height = br.height + 'px';
}

// ─────────────────────────────────────────────────────────────
//   STUDENT — INIT & NAV
// ─────────────────────────────────────────────────────────────
async function initStudent(name) {
  const cloud = await dbSyncAll();
  if (cloud) { APP.queue = cloud; APP.counter = Math.max(1, ...cloud.map(j => Number(j.num||0))) + 1; }
  lsSave(APP.queue, APP.counter);

  updateCap();
  updateEstimate();
  resetForm(name);

  if ('Notification' in window) Notification.requestPermission();

  // Restore last active job
  const savedId = localStorage.getItem('pq_myjob_' + name);
  if (savedId) {
    const job = APP.queue.find(j => j.id === savedId && j.paymentStatus === 'paid');
    if (job) {
      APP.myJobId = savedId;
      document.getElementById('sn-ticket').style.display = '';
      pillUpdate('s-nav-items', 's-pill');
    }
  }

  clearInterval(window._pollInterval);
  window._pollInterval = setInterval(pollStudent, 4000);
}

function sNav(pane, btn) {
  movePill('s-nav-items', 's-pill', btn);
  APP.sView = pane;
  document.getElementById('s-queue-pane').style.display  = pane === 'queue'  ? 'block' : 'none';
  document.getElementById('s-jobs-pane').style.display   = pane === 'jobs'   ? 'block' : 'none';
  document.getElementById('s-ticket-pane').style.display = pane === 'ticket' ? 'block' : 'none';

  if (pane === 'jobs')   renderMyJobsList();
  if (pane === 'ticket') {
    const job = APP.queue.find(j => j.id === APP.myJobId);
    if (job) renderTicket(job);
  }
}

async function pollStudent() {
  const cloud = await dbSyncAll();
  if (cloud) { APP.queue = cloud; }
  // Run retention every poll — keeps storage and data lean
  APP.queue = await runRetentionCleanup(APP.queue);
  lsSave(APP.queue, APP.counter);
  updateCap();
  if (APP.sView === 'jobs') renderMyJobsList();
  if (!APP.myJobId) return;
  const job = APP.queue.find(j => j.id === APP.myJobId);
  if (!job) return;
  if (APP.sView === 'ticket') renderTicket(job);
  if (job.status === 'ready' && !window._notified) {
    window._notified = true;
    pushNotify('PrintQ — Print Ready!', `Hi ${job.name}! ${job.tok} is ready. Head to the counter!`);
  }
}

// ─────────────────────────────────────────────────────────────
//   STUDENT — FORM
// ─────────────────────────────────────────────────────────────
function resetForm(name) {
  document.getElementById('s-name').value  = name || APP.loginName || '';
  document.getElementById('s-phone').value = '';
  document.getElementById('s-desc').value  = '';
  document.getElementById('s-copies').value = '1';
  removeFile();
  printOptions = { color: 'bw', sides: 'single', finish: 'none' };
  ['color-seg','side-seg','finish-seg'].forEach(segId => {
    const seg = document.getElementById(segId);
    if (!seg) return;
    seg.querySelectorAll('button').forEach((b,i) => b.classList.toggle('active', i===0));
  });
  updateEstimate();
}

function triggerFileInput() {
  document.getElementById('file-inp').click();
}

function onFile(e) {
  const f = e.target.files[0];
  if (!f) return;
  if (f.size > 50 * 1024 * 1024) { toast('File too large. Max 50 MB.', 'err'); return; }
  selectedFileObj = f;
  const z = document.getElementById('upload-z');
  z.classList.add('filled');
  z.innerHTML = `
    <div class="up-icon">&#128203;</div>
    <p class="up-text"><span>${escHtml(f.name)}</span></p>
    <p class="up-sub">${(f.size/1024/1024).toFixed(2)} MB &mdash; ready to upload</p>`;
  document.getElementById('file-actions').style.display = 'flex';
}

function removeFile() {
  selectedFileObj = null;
  const inp = document.getElementById('file-inp');
  if (inp) inp.value = '';
  document.getElementById('file-actions').style.display = 'none';
  const z = document.getElementById('upload-z');
  if (!z) return;
  z.classList.remove('filled');
  z.innerHTML = `
    <input type="file" id="file-inp" style="display:none"
      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.ppt,.pptx"
      onchange="onFile(event)">
    <div class="up-icon">&#128196;</div>
    <p class="up-text">Click to <span>select your file</span></p>
    <p class="up-sub">PDF, Word, Images, PPT &mdash; max 50 MB</p>`;
}

function setPrintOption(key, value, btn) {
  printOptions[key] = value;
  btn.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  updateEstimate();
}

function getEstimate() {
  const copies  = Math.max(1, parseInt(document.getElementById('s-copies')?.value) || 1);
  const p       = PRINTQ_CONFIG.pricing;
  const baseRate = printOptions.color === 'color' ? p.color : p.bw;
  const sideDisc = printOptions.sides === 'double' ? p.doubleDiscount : 1;
  const finishFee = printOptions.finish === 'bind' ? p.bind : printOptions.finish === 'staple' ? p.staple : 0;
  // Pages are not input by user — shopkeeper counts them; we charge per copy
  const amount = Math.max(1, Math.ceil(copies * baseRate * sideDisc + finishFee));
  return { copies, baseRate, amount };
}

function updateEstimate() {
  const est = getEstimate();
  const ep = document.getElementById('est-pages');
  if (!ep) return;
  ep.textContent = est.copies + (est.copies > 1 ? ' copies' : ' copy');
  document.getElementById('est-rate').textContent  = `Rs ${est.baseRate}`;
  document.getElementById('est-total').textContent = `Rs ${est.amount}`;
}

// ─────────────────────────────────────────────────────────────
//   PAYMENT  (PayU Bolt)
// ─────────────────────────────────────────────────────────────
async function collectPayment(job) {
  // Demo / test mode (no PayU config)
  if (!HAS_PAYU) {
    toast('Demo mode: payment simulated.', 'info');
    return { paymentId: 'demo_' + Date.now(), orderId: 'demo_order' };
  }

  if (typeof bolt === 'undefined' || typeof bolt.launch !== 'function') {
    throw new Error('PayU Bolt SDK is still loading or failed to load. Please refresh or try again.');
  }

  const txnid = 'PQ' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // Call Supabase Edge Function to generate PayU hash server-side
  const res = await fetch(PRINTQ_CONFIG.createPayuHashUrl, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${PRINTQ_CONFIG.supabaseAnonKey}`,
    },
    body: JSON.stringify({
      txnid,
      amount:      String(job.amount),
      productinfo: job.doc || 'Print Job',
      firstname:   job.name,
      email:       APP.userEmail || 'customer@printq.local',
      phone:       job.phone,
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error('Could not generate payment hash. ' + txt);
  }
  const hashData = await res.json();

  return new Promise((resolve, reject) => {
    bolt.launch({
      key:         hashData.key,
      txnid:       hashData.txnid,
      hash:        hashData.hash,
      amount:      hashData.amount,
      firstname:   hashData.firstname,
      email:       hashData.email,
      phone:       hashData.phone,
      productinfo: hashData.productinfo,
      surl:        window.location.href,
      furl:        window.location.href,
    }, {
      responseHandler: function(response) {
        if (response.response.txnStatus === 'SUCCESS') {
          resolve({
            paymentId: response.response.payuMoneyId || response.response.mihpayid || txnid,
            orderId:   response.response.txnid || txnid,
          });
        } else {
          reject(new Error('Payment failed: ' + (response.response.txnMessage || 'Transaction not successful')));
        }
      },
      catchException: function(response) {
        reject(new Error(response.message || 'Payment cancelled or failed'));
      }
    });
  });
}


// ─────────────────────────────────────────────────────────────
//   SUBMIT JOB
// ─────────────────────────────────────────────────────────────
async function submitJob() {
  const name  = document.getElementById('s-name').value.trim();
  const phone = document.getElementById('s-phone').value.trim();
  const desc  = document.getElementById('s-desc').value.trim();

  if (!name)  { toast('Please enter your name.', 'warn'); return; }
  if (!phone) { toast('Please enter your WhatsApp number.', 'warn'); return; }
  if (!selectedFileObj && !desc) {
    toast('Please select a file or add print instructions.', 'warn'); return;
  }

  // Re-sync to get fresh queue state
  const cloud = await dbSyncAll();
  if (cloud) { APP.queue = cloud; lsSave(APP.queue, APP.counter); }

  const activeCount = APP.queue.filter(j => j.status !== 'collected' && j.paymentStatus === 'paid').length;
  if (activeCount >= PRINTQ_CONFIG.queueLimit) {
    toast('Queue is full! Please try again later.', 'err'); return;
  }

  const btn = document.getElementById('submit-btn');
  btn.disabled    = true;
  btn.textContent = 'Opening payment...';

  const est = getEstimate();
  const num = APP.counter;
  const job = {
    id:            crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2),
    num,
    tok:           '#PRNT-' + String(num).padStart(3, '0'),
    name, phone,
    doc:           selectedFileObj ? selectedFileObj.name : (desc || 'Untitled'),
    desc,
    copies:        est.copies,
    color:         printOptions.color,
    sides:         printOptions.sides,
    finish:        printOptions.finish,
    amount:        est.amount,
    status:        'pending',
    paymentStatus: 'created',
    ts:            new Date().toISOString(),
  };

  try {
    const payment = await collectPayment(job);
    const file    = await dbUploadFile(job.id, selectedFileObj);

    job.paymentStatus = 'paid';
    job.paymentId     = payment.paymentId;
    job.orderId       = payment.orderId;
    job.fileUrl       = file.fileUrl;
    job.filePath      = file.filePath;

    APP.counter++;
    APP.queue.push(job);
    APP.myJobId = job.id;
    lsSave(APP.queue, APP.counter);
    localStorage.setItem('pq_myjob_' + name, job.id);

    await dbUpsertJob(job);

  } catch (err) {
    toast(err.message || 'Payment failed. Job not added.', 'err');
    btn.disabled    = false;
    btn.textContent = 'Pay & Get Token';
    return;
  }

  toast(`Token ${job.tok} confirmed!`, 'ok');
  qrRendered  = false;
  window._notified = false;

  document.getElementById('sn-ticket').style.display = '';
  updateCap();
  showTicket(job);

  btn.disabled    = false;
  btn.textContent = 'Pay & Get Token';
}

// ─────────────────────────────────────────────────────────────
//   STUDENT — TICKET
// ─────────────────────────────────────────────────────────────
function showTicket(job) {
  qrRendered = false;
  APP.sView  = 'ticket';
  document.getElementById('s-queue-pane').style.display  = 'none';
  document.getElementById('s-jobs-pane').style.display   = 'none';
  document.getElementById('s-ticket-pane').style.display = 'block';
  movePill('s-nav-items', 's-pill', document.getElementById('sn-ticket'));
  renderTicket(job);
}

function renderTicket(job) {
  document.getElementById('t-token').textContent = job.tok;
  document.getElementById('t-name').textContent  = job.name;
  document.getElementById('t-doc').textContent   = job.doc;
  document.getElementById('t-paid').textContent  = 'Rs ' + (job.amount || 0);
  document.getElementById('t-type').textContent  =
    [job.color || 'bw', job.sides || 'single', (job.paper||'a4').toUpperCase()].join(' / ');
  document.getElementById('t-issued').textContent =
    `Paid Rs ${job.amount} | ${(job.pages||1)} pg x ${(job.copies||1)} | ` +
    `${job.finish !== 'none' ? job.finish + ' | ' : ''}${fmtTime(new Date(job.ts))}`;

  // 24 h collection deadline notice (shown when job is ready)
  const deadlineEl = document.getElementById('t-deadline');
  if (deadlineEl) {
    if (job.status === 'ready' && job.updatedAt) {
      const readyAt   = new Date(job.updatedAt);
      const deadline  = new Date(readyAt.getTime() + 24 * 60 * 60 * 1000);
      const remaining = deadline - Date.now();
      if (remaining > 0) {
        const hrs = Math.floor(remaining / 3600000);
        const min = Math.floor((remaining % 3600000) / 60000);
        deadlineEl.textContent = `Collect within ${hrs}h ${min}m — prints are held for 24 hours only.`;
        deadlineEl.style.display = 'block';
      } else {
        deadlineEl.textContent = 'Collection window has passed. Please visit the counter.';
        deadlineEl.style.display = 'block';
      }
    } else {
      deadlineEl.style.display = 'none';
    }
  }

  // Position in queue
  const active = APP.queue.filter(j => j.status !== 'collected' && j.paymentStatus === 'paid');
  const idx    = active.findIndex(j => j.id === job.id);
  const ahead  = Math.max(0, idx);
  const wait   = ahead * PRINTQ_CONFIG.avgMinPerJob;

  document.getElementById('t-pos').textContent  = ahead === 0 ? "Next!" : ahead + ' ahead';
  document.getElementById('t-wait').textContent = wait  === 0 ? '~Now'  : '~' + wait + ' min';
  document.getElementById('cdown-val').textContent = wait === 0 ? 'Any moment now!' : '~' + wait + ' minutes';

  // Status badge
  const statusMap = {
    pending:   ['s-pending',   'In Queue'],
    printing:  ['s-printing',  'Printing...'],
    ready:     ['s-ready',     'Ready!'],
    collected: ['s-collected', 'Collected'],
  };
  const [cls, lbl] = statusMap[job.status] || statusMap.pending;
  const badge = document.getElementById('t-sbadge');
  badge.className = 'sbadge ' + cls;
  badge.innerHTML = `<div class="sdot"></div>${lbl}`;

  // Banners
  document.getElementById('ready-banner').style.display     = job.status === 'ready'     ? 'flex' : 'none';
  document.getElementById('collected-banner').style.display = job.status === 'collected' ? 'flex' : 'none';
  document.getElementById('cdown-card').style.display       = (job.status === 'pending' || job.status === 'printing') ? 'flex' : 'none';

  // QR Code (render once per ticket view)
  if (!qrRendered) {
    const box = document.getElementById('qr-box');
    box.innerHTML = '';
    try {
      new QRCode(box, {
        text: JSON.stringify({ tok: job.tok, id: job.id, name: job.name }),
        width: 92, height: 92,
        colorDark: '#1C1040', colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M,
      });
      qrRendered = true;
    } catch (e) {
      box.innerHTML = '<div style="font-size:28px;text-align:center;padding-top:28px">&#128241;</div>';
    }
  }
}

// ─────────────────────────────────────────────────────────────
//   STUDENT — MY JOBS LIST
// ─────────────────────────────────────────────────────────────
function renderMyJobsList() {
  const el = document.getElementById('my-jobs-list');
  if (!el) return;

  // All paid jobs for this student, newest first, capped at 10
  const mine = APP.queue
    .filter(j => j.name === APP.loginName && j.paymentStatus === 'paid')
    .sort((a, b) => new Date(b.ts) - new Date(a.ts))
    .slice(0, 10);  // last 10 only

  if (!mine.length) {
    el.innerHTML = '<div class="empty-jobs">No jobs yet. Submit your first print job!</div>';
    return;
  }

  // File download is available only on the 2 most-recent jobs
  const fileSlots = new Set(mine.slice(0, 2).map(j => j.id));

  el.className = 'job-history';
  el.innerHTML = mine.map(j => {
    const [cls, lbl] = statusBadgeParts(j.status);
    const hasFile    = fileSlots.has(j.id) && j.fileUrl;
    const fileNote   = !fileSlots.has(j.id)
      ? '<span style="font-size:11px;color:var(--t3)">File expired (text only)</span>'
      : '';
    return `
      <div class="mini-job">
        <div class="mini-info">
          <div class="mini-title">${escHtml(j.tok)} &mdash; ${escHtml(j.doc)}</div>
          <div class="mini-sub">
            ${escHtml(j.color||'bw')} / ${escHtml(j.sides||'single')} / ${(j.pages||1)} pg &times; ${(j.copies||1)}
            &bull; Rs ${j.amount} &bull; ${fmtTime(new Date(j.ts))}
          </div>
          ${fileNote}
        </div>
        <div class="mini-actions">
          <span class="sbadge ${cls}" style="font-size:11px"><div class="sdot"></div>${lbl}</span>
          ${hasFile ? `<a class="btn btn-ghost btn-sm" href="${j.fileUrl}" target="_blank" rel="noopener noreferrer">&#11123;</a>` : ''}
          <button class="btn btn-ghost btn-sm" onclick="openMyJob('${j.id}')">View</button>
        </div>
      </div>`;
  }).join('');
}

function openMyJob(id) {
  const job = APP.queue.find(j => j.id === id);
  if (!job) { toast('Job not found', 'err'); return; }
  APP.myJobId = id;
  document.getElementById('sn-ticket').style.display = '';
  qrRendered = false;
  showTicket(job);
}

// ─────────────────────────────────────────────────────────────
//   STUDENT — CANCEL JOB + CAPACITY
// ─────────────────────────────────────────────────────────────
async function cancelJob() {
  if (!APP.myJobId) return;
  const job = APP.queue.find(j => j.id === APP.myJobId);
  if (!job) return;
  if (job.status !== 'pending') {
    toast('Cannot cancel — job is already ' + job.status, 'warn'); return;
  }
  if (!confirm(`Cancel job ${job.tok}? This cannot be undone.`)) return;

  APP.queue = APP.queue.filter(j => j.id !== APP.myJobId);
  localStorage.removeItem('pq_myjob_' + APP.loginName);
  try { await dbDeleteJob(job.id); } catch (e) { /* local-only is fine */ }

  APP.myJobId = null;
  qrRendered  = false;
  lsSave(APP.queue, APP.counter);

  document.getElementById('sn-ticket').style.display   = 'none';
  document.getElementById('s-ticket-pane').style.display = 'none';
  document.getElementById('s-jobs-pane').style.display   = 'none';
  document.getElementById('s-queue-pane').style.display  = 'block';
  movePill('s-nav-items', 's-pill', document.getElementById('sn-queue'));

  updateCap();
  toast('Job cancelled.', 'ok');
}

function updateCap() {
  const active = APP.queue.filter(j => j.status !== 'collected' && j.paymentStatus === 'paid').length;
  const pct    = (active / PRINTQ_CONFIG.queueLimit) * 100;
  const fill   = document.getElementById('cap-fill');
  if (fill) {
    fill.style.width = pct + '%';
    fill.style.background = pct > 80
      ? 'linear-gradient(90deg,var(--amber),var(--red))'
      : pct > 55
      ? 'linear-gradient(90deg,var(--green),var(--amber))'
      : 'linear-gradient(90deg,var(--green),var(--brand))';
  }
  const cnt = document.getElementById('cap-cnt');
  if (cnt) cnt.textContent = active + ' / ' + PRINTQ_CONFIG.queueLimit;
  const isFull = active >= PRINTQ_CONFIG.queueLimit;
  const alert  = document.getElementById('full-alert');
  if (alert) alert.style.display = isFull ? 'block' : 'none';
  const fc = document.getElementById('form-card');
  if (fc) { fc.style.opacity = isFull ? '0.45' : '1'; fc.style.pointerEvents = isFull ? 'none' : ''; }
}

// ─────────────────────────────────────────────────────────────
//   SHOPKEEPER — INIT & NAV
// ─────────────────────────────────────────────────────────────
async function initShop() {
  const cloud = await dbSyncAll();
  if (cloud) { APP.queue = cloud; lsSave(APP.queue, APP.counter); }
  renderQueue();
  renderHistory();
  updateStats();
  clearInterval(window._pollInterval);
  window._pollInterval = setInterval(pollShop, 4000);
}

async function pollShop() {
  const cloud = await dbSyncAll();
  if (cloud) { APP.queue = cloud; }
  APP.queue = await runRetentionCleanup(APP.queue);
  lsSave(APP.queue, APP.counter);
  renderQueue();
  if (APP.kView === 'history') renderHistory();
  updateStats();
}

function kNav(pane, btn) {
  movePill('k-nav-items', 'k-pill', btn);
  APP.kView = pane;
  document.getElementById('k-dash-pane').style.display    = pane === 'dash'    ? 'block' : 'none';
  document.getElementById('k-history-pane').style.display = pane === 'history' ? 'block' : 'none';
  if (pane === 'history') renderHistory();
}

// ─────────────────────────────────────────────────────────────
//   SHOPKEEPER — QUEUE RENDER
// ─────────────────────────────────────────────────────────────
function renderQueue() {
  updateStats();
  const active = APP.queue
    .filter(j => j.status !== 'collected' && j.paymentStatus === 'paid')
    .sort((a, b) => a.num - b.num);
  const el = document.getElementById('q-rows');
  if (!el) return;
  if (!active.length) {
    el.innerHTML = `<div class="empty-q"><div class="empty-q-icon">&#127881;</div><p style="font-size:14px;color:var(--t2)">Queue is empty &mdash; all caught up!</p></div>`;
    return;
  }
  el.innerHTML = active.map(j => buildRow(j, false)).join('');
}

function renderHistory() {
  const q = (document.getElementById('srch-inp')?.value || '').trim().toLowerCase();
  let past = APP.queue
    .filter(j => j.status === 'collected')
    .sort((a, b) => new Date(b.updatedAt || b.ts) - new Date(a.updatedAt || a.ts))
    .slice(0, 10);
  if (q) {
    past = past.filter(j =>
      j.name.toLowerCase().includes(q) ||
      j.tok.toLowerCase().includes(q)  ||
      j.phone.includes(q)              ||
      j.doc.toLowerCase().includes(q));
  }
  const el = document.getElementById('hist-rows');
  if (!el) return;
  if (!past.length) {
    el.innerHTML = `<div class="empty-q"><div class="empty-q-icon">&#128214;</div><p style="font-size:14px;color:var(--t2)">${q ? 'No results for "' + escHtml(q) + '"' : 'No completed jobs yet.'}</p></div>`;
    return;
  }
  el.innerHTML = past.map(j => buildRow(j, true)).join('');
}

function doSearch() { renderHistory(); }
function clearSearch() {
  const inp = document.getElementById('srch-inp');
  if (inp) inp.value = '';
  renderHistory();
}

function buildRow(job, isHistory) {
  const [cls, lbl] = statusBadgeParts(job.status);
  const printInfo  = `${job.color||'bw'} | ${job.sides||'single'} | ${(job.paper||'a4').toUpperCase()} | ${job.pages||1}pg x ${job.copies||1} | ${job.finish||'none'} | Rs ${job.amount||0}`;
  let acts = '';

  if (!isHistory) {
    if (job.status === 'pending') {
      acts = `
        ${dlBtn(job)}
        <button class="btn btn-amb btn-sm" onclick="setStatus('${job.id}','printing')">Start Print</button>`;
    } else if (job.status === 'printing') {
      acts = `
        ${dlBtn(job)}
        <button class="btn btn-grn btn-sm" onclick="setStatus('${job.id}','ready')">Mark Ready</button>`;
    } else if (job.status === 'ready') {
      acts = `
        ${dlBtn(job)}
        <a class="btn btn-wa btn-sm" href="${waLink(job)}" target="_blank" rel="noopener noreferrer">${waIcon()} WhatsApp</a>
        <button class="btn btn-ghost btn-sm" onclick="setStatus('${job.id}','collected')">Collected</button>`;
    }
  } else {
    // History row — show file if still available, otherwise note
    const dl = dlBtn(job);
    acts = dl
      ? `${dl}<a class="btn btn-wa btn-sm" href="${waLink(job)}" target="_blank" rel="noopener noreferrer">${waIcon()} WA</a>`
      : `<span style="font-size:11px;color:var(--t3)">File purged</span>
         <a class="btn btn-wa btn-sm" href="${waLink(job)}" target="_blank" rel="noopener noreferrer">${waIcon()} WA</a>`;
  }

  // Collected-at time for history rows
  const collectedNote = isHistory && job.updatedAt
    ? `<div class="q-time">Collected ${fmtTime(new Date(job.updatedAt))}</div>` : '';

  return `
    <div class="q-row" id="row-${job.id}">
      <div class="q-token">${escHtml(job.tok)}</div>
      <div>
        <div class="q-name">${escHtml(job.name)}</div>
        <div class="q-time">${escHtml(printInfo)}</div>
        <div class="q-doc">&#128196; ${escHtml(job.doc)}</div>
        <div class="q-time">&#128222; ${escHtml(job.phone)} &bull; ${fmtTime(new Date(job.ts))}</div>
        ${job.desc ? `<div class="q-time">&#128221; ${escHtml(job.desc)}</div>` : ''}
        ${collectedNote}
      </div>
      <div><span class="sbadge ${cls}" style="font-size:11px"><div class="sdot"></div>${lbl}</span></div>
      <div class="q-acts">${acts}</div>
    </div>`;
}

function dlBtn(job) {
  if (!job.fileUrl) return '';
  return `<a class="btn btn-ghost btn-sm" href="${job.fileUrl}" download="${escAttr(job.doc)}" target="_blank" rel="noopener noreferrer">&#11123; Download</a>`;
}

function waIcon() {
  return `<svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>`;
}

function waLink(job) {
  const num = job.phone.replace(/\D/g, '');
  const cc  = (num.startsWith('91') && num.length >= 12) ? num : '91' + num;
  const opts = [job.color||'bw', job.sides||'single', (job.paper||'A4').toUpperCase(), `${job.pages||1} pages x ${job.copies||1}`, job.finish !== 'none' ? job.finish : ''].filter(Boolean).join(', ');
  const msg = encodeURIComponent(
    `Hey ${job.name}! 👋\n\nYour printout *${job.tok}* is *${job.status === 'ready' ? 'READY for collection' : 'done'}*! 🖨️\n\n` +
    `📄 *Document:* ${job.doc}\n` +
    `🖨️ *Options:* ${opts}\n` +
    `💰 *Paid:* Rs ${job.amount}\n` +
    `${job.desc ? '📝 *Notes:* ' + job.desc + '\n' : ''}` +
    `📍 *${PRINTQ_CONFIG.shopName}* — ${PRINTQ_CONFIG.shopAddress}\n\n` +
    `Please show this message or your token *${job.tok}* at the counter.\n\n_PrintQ_`
  );
  return `https://wa.me/${cc}?text=${msg}`;
}

// ─────────────────────────────────────────────────────────────
//   SHOPKEEPER — STATUS + STATS
// ─────────────────────────────────────────────────────────────
async function setStatus(id, newStatus) {
  const job = APP.queue.find(j => j.id === id);
  if (!job) return;

  const old = job.status;
  job.status    = newStatus;
  job.updatedAt = new Date().toISOString();
  lsSave(APP.queue, APP.counter);

  try {
    await dbUpdateStatus(job);
  } catch (err) {
    toast('Saved locally; cloud update failed: ' + err.message, 'warn');
  }

  renderQueue();
  renderHistory();
  if (APP.kView === 'search') doSearch();

  const msgs = {
    printing:  [`${job.tok} — started printing.`, 'info'],
    ready:     [`${job.tok} ready! Use WhatsApp to notify ${job.name}.`, 'ok'],
    collected: [`${job.tok} collected. Done!`, 'ok'],
  };
  const [msg, type] = msgs[newStatus] || ['Status updated.', 'info'];
  toast(msg, type);

  // Fire event so student view on same device updates instantly
  window.dispatchEvent(new CustomEvent('pq-status', { detail: job }));
}

function updateStats() {
  const active = APP.queue.filter(j => j.status !== 'collected' && j.paymentStatus === 'paid');
  const pend = document.getElementById('st-pend');
  const prnt = document.getElementById('st-prnt');
  const rdy  = document.getElementById('st-rdy');
  if (pend) pend.textContent = active.filter(j => j.status === 'pending').length;
  if (prnt) prnt.textContent = active.filter(j => j.status === 'printing').length;
  if (rdy)  rdy.textContent  = active.filter(j => j.status === 'ready').length;
}

// ─────────────────────────────────────────────────────────────
//   SEARCH
// ─────────────────────────────────────────────────────────────
function doSearch() {
  const q   = (document.getElementById('srch-inp')?.value || '').trim().toLowerCase();
  const pool = q
    ? APP.queue.filter(j =>
        j.name.toLowerCase().includes(q) ||
        j.tok.toLowerCase().includes(q)  ||
        j.phone.includes(q)              ||
        j.doc.toLowerCase().includes(q))
    : [...APP.queue];

  const el = document.getElementById('srch-rows');
  if (!el) return;
  if (!pool.length) {
    el.innerHTML = `<div class="empty-q"><div class="empty-q-icon">&#128270;</div><p style="color:var(--t2);font-size:14px">No results${q ? ' for "' + escHtml(q) + '"' : ''}</p></div>`;
    return;
  }
  el.innerHTML = pool
    .sort((a,b) => new Date(b.ts) - new Date(a.ts))
    .map(j => buildRow(j, j.status === 'collected')).join('');
}

function clearSearch() {
  const inp = document.getElementById('srch-inp');
  if (inp) inp.value = '';
  doSearch();
}

// ─────────────────────────────────────────────────────────────
//   SAME-DEVICE STATUS SYNC (student on same browser)
// ─────────────────────────────────────────────────────────────
window.addEventListener('pq-status', (e) => {
  const job = e.detail;
  if (APP.myJobId !== job.id) return;
  // Update local copy
  const local = APP.queue.find(j => j.id === job.id);
  if (local) local.status = job.status;
  if (APP.sView === 'ticket') renderTicket(APP.queue.find(j => j.id === job.id));
  if (job.status === 'ready' && !window._notified) {
    window._notified = true;
    pushNotify('PrintQ — Print Ready!', `${job.tok} is ready. Head to the counter!`);
  }
});

// ─────────────────────────────────────────────────────────────
//   UTILITIES
// ─────────────────────────────────────────────────────────────
function statusBadgeParts(status) {
  return ({
    pending:   ['s-pending',   'In Queue'],
    printing:  ['s-printing',  'Printing'],
    ready:     ['s-ready',     'Ready'],
    collected: ['s-collected', 'Collected'],
  })[status] || ['s-pending', status];
}

function fmtTime(d) {
  if (isNaN(d)) return '';
  const diff = (Date.now() - d) / 1000;
  if (diff < 60)   return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + ' min ago';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

function escAttr(str) {
  return escHtml(str).replace(/'/g, '&#039;');
}

function pushNotify(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body });
  }
}

function toast(msg, type = 'info') {
  const wrap = document.getElementById('toast-wrap');
  if (!wrap) return;
  const el = document.createElement('div');
  el.className = `toast ${type === 'ok' ? 'ok' : type === 'err' ? 'err' : ''}`;
  const icons = { ok: '✅', err: '❌', warn: '⚠️', info: 'ℹ️' };
  el.innerHTML = `<span>${icons[type] || 'ℹ️'}</span> ${escHtml(msg)}`;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 4400);
}
