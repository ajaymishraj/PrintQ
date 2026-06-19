/**
 * db.js — Supabase data layer with localStorage fallback
 * All cloud operations are no-ops when Supabase is not configured.
 */

// Supabase client (null if not configured)
const _sb = HAS_SUPABASE
  ? supabase.createClient(PRINTQ_CONFIG.supabaseUrl, PRINTQ_CONFIG.supabaseAnonKey)
  : null;

// ── Local Storage helpers ───────────────────────────────────
function lsSave(queue, counter) {
  localStorage.setItem('pq_data', JSON.stringify({ q: queue, c: counter }));
}

function lsLoad() {
  try {
    const d = JSON.parse(localStorage.getItem('pq_data') || '{}');
    return { queue: d.q || [], counter: d.c || 1 };
  } catch (e) {
    return { queue: [], counter: 1 };
  }
}

// ── Row mapping ─────────────────────────────────────────────
function fromDb(row) {
  return {
    id:            row.id,
    num:           row.num,
    tok:           row.token,
    name:          row.student_name,
    phone:         row.phone,
    doc:           row.doc_name,
    desc:          row.instructions || '',
    status:        row.status,
    ts:            row.created_at,
    updatedAt:     row.updated_at,
    paymentStatus: row.payment_status,
    paymentId:     row.payment_id,
    orderId:       row.order_id,
    amount:        Number(row.amount || 0),
    pages:         row.pages,
    copies:        row.copies,
    color:         row.color,
    sides:         row.sides,
    paper:         row.paper,
    finish:        row.finish,
    fileUrl:       row.file_url,
    filePath:      row.file_path,
  };
}

function toDb(job) {
  return {
    id:            job.id,
    num:           job.num,
    token:         job.tok,
    student_name:  job.name,
    phone:         job.phone,
    doc_name:      job.doc,
    instructions:  job.desc,
    status:        job.status,
    payment_status: job.paymentStatus,
    payment_id:    job.paymentId,
    order_id:      job.orderId,
    amount:        job.amount,
    pages:         job.pages,
    copies:        job.copies,
    color:         job.color,
    sides:         job.sides,
    paper:         job.paper,
    finish:        job.finish,
    file_url:      job.fileUrl,
    file_path:     job.filePath,
    updated_at:    new Date().toISOString(),
  };
}

// ── Cloud sync ──────────────────────────────────────────────
async function dbSyncAll() {
  if (!_sb) return null;
  const { data, error } = await _sb
    .from('print_jobs')
    .select('*')
    .order('num', { ascending: true });
  if (error) { console.warn('[PrintQ] Supabase sync error:', error.message); return null; }
  return (data || []).map(fromDb);
}

async function dbUpsertJob(job) {
  if (!_sb) return;
  const { error } = await _sb.from('print_jobs').upsert(toDb(job));
  if (error) throw new Error('Cloud save failed: ' + error.message);
}

async function dbUpdateStatus(job) {
  if (!_sb) return;
  const { error } = await _sb
    .from('print_jobs')
    .update({ status: job.status, updated_at: new Date().toISOString() })
    .eq('id', job.id);
  if (error) throw new Error('Status update failed: ' + error.message);
}

async function dbDeleteJob(id) {
  if (!_sb) return;
  const { error } = await _sb.from('print_jobs').delete().eq('id', id);
  if (error) throw new Error('Delete failed: ' + error.message);
}

// ── File upload ─────────────────────────────────────────────
async function dbUploadFile(jobId, fileObj) {
  if (!fileObj) return { fileUrl: '', filePath: '' };
  if (!_sb) {
    // Local fallback: create an object URL (only valid current session)
    return { fileUrl: URL.createObjectURL(fileObj), filePath: '' };
  }
  const safe = fileObj.name.replace(/[^a-z0-9._-]/gi, '_');
  const path = `${jobId}/${Date.now()}-${safe}`;
  const { error } = await _sb.storage
    .from('print-files')
    .upload(path, fileObj, { upsert: true });
  if (error) throw new Error('File upload failed: ' + error.message);
  const { data } = _sb.storage.from('print-files').getPublicUrl(path);
  return { fileUrl: data.publicUrl, filePath: path };
}

// ── Storage file deletion ────────────────────────────────────
async function dbDeleteStorageFile(filePath) {
  if (!_sb || !filePath) return;
  const { error } = await _sb.storage.from('print-files').remove([filePath]);
  if (error) console.warn('[PrintQ] Storage delete failed:', error.message);
}

// ── Null out file_url + file_path for a job (keep text) ──────
async function dbClearFileRef(jobId) {
  if (!_sb) return;
  const { error } = await _sb
    .from('print_jobs')
    .update({ file_url: null, file_path: null, updated_at: new Date().toISOString() })
    .eq('id', jobId);
  if (error) console.warn('[PrintQ] Clear file ref failed:', error.message);
}

// ── Hard delete a job row entirely ──────────────────────────
async function dbHardDelete(jobId) {
  if (!_sb) return;
  const { error } = await _sb.from('print_jobs').delete().eq('id', jobId);
  if (error) console.warn('[PrintQ] Hard delete failed:', error.message);
}

// ─────────────────────────────────────────────────────────────
//   RETENTION CLEANUP  (called after every poll)
//
//   Rules:
//   • Collected jobs older than 48 h → hard-delete row + file
//   • Collected jobs: keep files only for last 10 globally;
//     strip file_url/file_path from the rest (text stays)
//   • Per student: keep text for last 10 jobs only
//     (older ones are already gone via the 48 h rule above)
// ─────────────────────────────────────────────────────────────
async function runRetentionCleanup(queue) {
  if (!_sb) {
    // Local-only: just prune the in-memory array so UI stays clean
    return localRetention(queue);
  }

  const now        = Date.now();
  const H48        = 48 * 60 * 60 * 1000;
  const collected  = queue
    .filter(j => j.status === 'collected')
    .sort((a, b) => new Date(b.updatedAt || b.ts) - new Date(a.updatedAt || a.ts));

  // ── 1. Hard-delete rows + files older than 48 h ──────────
  const expired = collected.filter(j => {
    const age = now - new Date(j.updatedAt || j.ts).getTime();
    return age > H48;
  });
  for (const j of expired) {
    if (j.filePath) await dbDeleteStorageFile(j.filePath);
    await dbHardDelete(j.id);
  }

  // ── 2. For the remaining collected jobs, keep files only
  //       on the 10 most-recent; strip the rest ────────────
  const remaining = collected.filter(j => {
    const age = now - new Date(j.updatedAt || j.ts).getTime();
    return age <= H48;
  });
  const keepFile  = new Set(remaining.slice(0, 10).map(j => j.id));
  const stripFile = remaining.filter(j => !keepFile.has(j.id) && j.fileUrl);
  for (const j of stripFile) {
    if (j.filePath) await dbDeleteStorageFile(j.filePath);
    await dbClearFileRef(j.id);
    // Reflect in local copy so UI updates without waiting for next sync
    j.fileUrl  = '';
    j.filePath = '';
  }

  // ── 3. Return pruned queue (expired rows removed) ────────
  const expiredIds = new Set(expired.map(j => j.id));
  return queue.filter(j => !expiredIds.has(j.id));
}

// Local-only retention (no Supabase) — keeps in-memory data tidy
function localRetention(queue) {
  const now   = Date.now();
  const H48   = 48 * 60 * 60 * 1000;
  // Drop collected rows older than 48 h from local array
  return queue.filter(j => {
    if (j.status !== 'collected') return true;
    return (now - new Date(j.updatedAt || j.ts).getTime()) <= H48;
  });
}
