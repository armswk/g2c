// frontend/js/documents.js
//
// "เอกสาร / Rechnungen" section.
//   Tab 1 (amway): upload + list of incoming Amway invoice PDFs (UI skeleton).
//   Tab 2 (pos):   list of POS orders, each with a German "Rechnung" PDF export.
//
// The PDF generator (generateRechnung) is also wired to shortcut buttons in the
// Reports (orders.js) and Customers (customers.js) views, so it must work for
// any order id regardless of which screen triggered it.
import { state } from './state.js';
import { pb } from './api.js';
import { getOrderCustomerId, getOrderCustomerName } from './orders.js';
import { sarabunRegularBase64 } from './fonts/sarabun-normal.js';
import { sarabunBoldBase64 } from './fonts/sarabun-bold.js';

// Register the embedded Sarabun font (Thai + Latin) onto a jsPDF document so
// Thai customer names / addresses render with correct glyphs. jsPDF's built-in
// Helvetica has no Thai coverage. Called once per generated document.
const FONT = 'Sarabun';
function registerThaiFont(doc) {
  doc.addFileToVFS('Sarabun-Regular.ttf', sarabunRegularBase64);
  doc.addFont('Sarabun-Regular.ttf', FONT, 'normal');
  doc.addFileToVFS('Sarabun-Bold.ttf', sarabunBoldBase64);
  doc.addFont('Sarabun-Bold.ttf', FONT, 'bold');
  doc.setFont(FONT, 'normal');
}

// Active tab for the documents view: 'amway' | 'pos'.
let docActiveTab = 'amway';

// ===== Tab switching =====
export function switchDocTab(tab) {
  if (tab !== 'amway' && tab !== 'pos') return;
  docActiveTab = tab;

  const amwayBtn = document.getElementById('doc-tab-amway');
  const posBtn = document.getElementById('doc-tab-pos');
  const amwayPane = document.getElementById('docs-pane-amway');
  const posPane = document.getElementById('docs-pane-pos');

  if (amwayBtn) amwayBtn.classList.toggle('active', tab === 'amway');
  if (posBtn) posBtn.classList.toggle('active', tab === 'pos');
  if (amwayPane) amwayPane.style.display = tab === 'amway' ? 'block' : 'none';
  if (posPane) posPane.style.display = tab === 'pos' ? 'block' : 'none';

  renderDocuments();
}

// ===== Main render entry (called by switchView + the month filter) =====
export function renderDocuments() {
  // Default the POS month filter to the current month the first time we open it.
  const monthEl = document.getElementById('docsPosMonth');
  if (monthEl && !monthEl.value) {
    const today = new Date();
    monthEl.value = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
  }

  if (docActiveTab === 'amway') renderAmwayList();
  else renderPosList();
}

// ===== Tab 1: Amway invoices (amway_invoices collection) =====
// Lazy-load guard so renderDocuments() (called from realtime/order events) doesn't
// refetch on every tick. Set true once the first fetch resolves.
let amwayLoaded = false;

// Fetch the current user's incoming Amway invoices once, cache in state, re-render.
async function loadAmwayInvoices() {
  const model = pb.authStore.model;
  try {
    const opts = { sort: '-invoice_date,-created' };
    if (model) opts.filter = `owner = "${model.id}"`;
    state.amwayInvoices = await pb.collection('amway_invoices').getFullList(opts) || [];
  } catch (e) {
    state.amwayInvoices = [];
  }
  amwayLoaded = true;
  renderAmwayList();
}

// Pick a PDF, ask for invoice number + date, upload to the amway_invoices
// collection. Supports multiple files (one confirm dialog each, sequentially).
export async function handleAmwayUpload(files) {
  const input = document.getElementById('amwayUploadInput');
  const reset = () => { if (input) input.value = ''; };

  if (!files || files.length === 0) return reset();

  const pdfs = Array.from(files).filter(f =>
    f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
  if (pdfs.length === 0) {
    reset();
    return Swal.fire({ icon: 'warning', title: 'ไฟล์ไม่ถูกต้อง', text: 'กรุณาเลือกไฟล์ PDF เท่านั้น', confirmButtonColor: '#2D6A4F' });
  }

  for (const file of pdfs) {
    const proceed = await uploadOneAmwayInvoice(file);
    if (!proceed) break; // user cancelled — stop the queue
  }
  reset();
}

async function uploadOneAmwayInvoice(file) {
  const defaultNumber = file.name.replace(/\.pdf$/i, '');
  const today = new Date().toISOString().split('T')[0];

  const res = await Swal.fire({
    title: `<div style="font-family:'Sarabun',sans-serif; color:var(--primary-dk); font-weight:700; font-size:1.2rem;"><i class="ph-fill ph-file-pdf" style="font-size:2.2rem; color:var(--primary-lt); display:block; margin-bottom:8px;"></i>บันทึกบิลซื้อเข้า</div>`,
    html: `
      <div style="text-align:left; font-family:'Sarabun',sans-serif;">
        <div style="font-size:0.82rem; color:var(--text-muted); margin-bottom:12px; word-break:break-all;"><i class="ph-fill ph-paperclip"></i> ${escapeHtml(file.name)}</div>
        <label style="display:block; font-size:0.88rem; font-weight:600; color:var(--text-muted); margin-bottom:6px;">เลขที่บิล (Invoice No.) <span style="color:var(--danger);">*</span></label>
        <input id="swal-amway-number" class="c-input" value="${escapeHtml(defaultNumber)}" style="margin-bottom:12px;">
        <label style="display:block; font-size:0.88rem; font-weight:600; color:var(--text-muted); margin-bottom:6px;">วันที่บิล (Invoice Date) <span style="color:var(--danger);">*</span></label>
        <input type="date" id="swal-amway-date" class="c-input" value="${today}" style="margin:0;">
      </div>`,
    showCancelButton: true,
    confirmButtonText: 'อัปโหลด',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#2D6A4F',
    focusConfirm: false,
    preConfirm: () => {
      const number = document.getElementById('swal-amway-number').value.trim();
      const date = document.getElementById('swal-amway-date').value;
      if (!number) { Swal.showValidationMessage('⚠️ กรุณากรอกเลขที่บิล'); return false; }
      if (!date) { Swal.showValidationMessage('⚠️ กรุณาเลือกวันที่บิล'); return false; }
      return { number, date };
    }
  });

  if (!res.isConfirmed) return false;

  Swal.fire({ title: 'กำลังอัปโหลด...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  try {
    const fd = new FormData();
    fd.append('invoice_number', res.value.number);
    fd.append('invoice_date', new Date(res.value.date).toISOString());
    fd.append('pdf_file', file);
    if (pb.authStore.model) fd.append('owner', pb.authStore.model.id);

    const record = await pb.collection('amway_invoices').create(fd);
    state.amwayInvoices = state.amwayInvoices || [];
    state.amwayInvoices.unshift(record);
    amwayLoaded = true;
    renderAmwayList();
    Swal.fire({ toast: true, position: 'top-end', showConfirmButton: false, timer: 1800, icon: 'success', title: 'อัปโหลดสำเร็จ!' });
    return true;
  } catch (e) {
    Swal.fire('อัปโหลดล้มเหลว', e.message, 'error');
    return false;
  }
}

export function deleteAmwayInvoice(id) {
  Swal.fire({ title: 'ยืนยันการลบ?', text: 'ลบบิลซื้อเข้านี้ออกจากระบบ', icon: 'warning', showCancelButton: true, confirmButtonColor: '#DC3545', confirmButtonText: 'ลบ', cancelButtonText: 'ยกเลิก' }).then(async res => {
    if (!res.isConfirmed) return;
    try {
      await pb.collection('amway_invoices').delete(id);
      state.amwayInvoices = (state.amwayInvoices || []).filter(x => x.id !== id);
      renderAmwayList();
      Swal.fire({ toast: true, position: 'top-end', showConfirmButton: false, timer: 1500, icon: 'success', title: 'ลบสำเร็จ' });
    } catch (e) { Swal.fire('Error', e.message, 'error'); }
  });
}

function renderAmwayList() {
  const list = document.getElementById('docs-amway-list');
  if (!list) return;

  // First visit: kick off the fetch and show a loading state.
  if (!amwayLoaded) {
    list.innerHTML = '<div style="padding:40px;text-align:center;color:#999;">กำลังโหลด...</div>';
    loadAmwayInvoices();
    return;
  }

  const items = state.amwayInvoices || [];
  if (items.length === 0) {
    list.innerHTML = `
      <div style="padding:40px 20px; text-align:center; color:#94a3b8;">
        <i class="ph ph-tray" style="font-size:3rem; margin-bottom:10px; display:block;"></i>
        <div style="font-weight:600; color:#94a3b8;">ยังไม่มีบิลซื้อเข้าในระบบ</div>
        <div style="font-size:0.82rem; margin-top:4px;">อัปโหลดไฟล์ PDF จาก Amway เพื่อเริ่มต้น</div>
      </div>`;
    return;
  }

  list.innerHTML = items.map(inv => {
    let d = new Date(inv.invoice_date);
    const dStr = isNaN(d.getTime()) ? '-' : d.toLocaleDateString('th-TH');
    const fileUrl = inv.pdf_file ? pb.files.getUrl(inv, inv.pdf_file) : '';
    const openBtn = fileUrl
      ? `<a href="${escapeHtml(fileUrl)}" target="_blank" rel="noopener" style="background:var(--primary); color:#fff; text-decoration:none; padding:8px 14px; border-radius:8px; font-weight:600; font-size:0.85rem; display:flex; align-items:center; gap:6px; white-space:nowrap;"><i class="ph-bold ph-file-pdf"></i> เปิดไฟล์</a>`
      : '<span style="color:var(--text-muted); font-size:0.82rem;">ไม่มีไฟล์</span>';

    return `
      <div style="padding:16px 20px; border-bottom:1px solid var(--border); display:flex; flex-wrap:wrap; gap:12px; align-items:center;">
        <div style="width:42px; height:42px; border-radius:8px; background:#FEF2F2; color:#DC2626; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
          <i class="ph-fill ph-file-pdf" style="font-size:1.5rem;"></i>
        </div>
        <div style="flex:1; min-width:180px;">
          <div style="font-weight:700; color:var(--primary-dk); font-size:1rem; margin-bottom:3px;">${escapeHtml(inv.invoice_number || '(ไม่มีเลขที่)')}</div>
          <div style="font-size:0.83rem; color:var(--text-muted);">📅 ${dStr}</div>
        </div>
        ${openBtn}
        <button onclick="deleteAmwayInvoice('${inv.id}')" title="ลบ" style="background:#FEF2F2; color:#DC2626; border:1px solid #FECACA; padding:8px 12px; border-radius:8px; font-family:inherit; font-weight:600; font-size:0.85rem; cursor:pointer; display:flex; align-items:center; gap:6px;"><i class="ph ph-trash"></i></button>
      </div>`;
  }).join('');
}

// ===== Tab 2: POS orders list =====
function renderPosList() {
  const list = document.getElementById('docs-pos-list');
  if (!list) return;

  const monthVal = document.getElementById('docsPosMonth')?.value;
  let orders = [...state.allOrders];

  if (monthVal) {
    const [y, m] = monthVal.split('-');
    const targetYear = parseInt(y), targetMonth = parseInt(m) - 1;
    orders = orders.filter(o => {
      let d = new Date(o.date); if (isNaN(d.getTime())) d = new Date();
      return d.getMonth() === targetMonth && d.getFullYear() === targetYear;
    });
  }

  orders.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (orders.length === 0) {
    list.innerHTML = '<div style="padding:40px;text-align:center;color:#999;">ไม่พบออเดอร์ในเดือนที่เลือก</div>';
    return;
  }

  list.innerHTML = orders.map(o => {
    let d = new Date(o.date); if (isNaN(d.getTime())) d = new Date();
    const dStr = d.toLocaleDateString('th-TH');
    const displayId = o.orderNumber || o.id;
    const refHtml = o.orderRef
      ? `<span style="font-size:0.78rem; color:var(--primary-lt);"><i class="ph-fill ph-hash"></i> Ref: ${escapeHtml(o.orderRef)}</span>`
      : '';
    const statusBadge = o.paymentStatus === 'จ่ายแล้ว'
      ? `<span style="background:var(--success); color:#fff; padding:2px 8px; border-radius:12px; font-size:0.72rem;">จ่ายแล้ว</span>`
      : o.paymentStatus === 'ผ่อน'
      ? `<span style="background:var(--accent); color:#fff; padding:2px 8px; border-radius:12px; font-size:0.72rem;">ผ่อนชำระ</span>`
      : `<span style="background:var(--danger); color:#fff; padding:2px 8px; border-radius:12px; font-size:0.72rem;">ยังไม่จ่าย</span>`;

    return `
      <div style="padding:16px 20px; border-bottom:1px solid var(--border); display:flex; flex-wrap:wrap; gap:12px; align-items:center;">
        <div style="flex:1; min-width:200px;">
          <div style="font-weight:700; color:var(--primary-dk); font-size:1rem; margin-bottom:3px;">
            <i class="ph-fill ph-receipt"></i> ${escapeHtml(displayId)} ${statusBadge}
          </div>
          <div style="font-size:0.83rem; color:var(--text-muted);">👤 ${escapeHtml(getOrderCustomerName(o))} &nbsp;|&nbsp; 📅 ${dStr} ${refHtml ? '&nbsp;|&nbsp; ' + refHtml : ''}</div>
        </div>
        <div style="font-size:1.1rem; font-weight:700; color:var(--primary); white-space:nowrap;">€${(Number(o.totalPrice) || 0).toFixed(2)}</div>
        <button onclick="generateRechnung('${o.id}', 'preview')" style="background:#fff; color:var(--primary-dk); border:1.5px solid var(--primary); padding:8px 14px; border-radius:8px; font-family:inherit; font-weight:600; font-size:0.85rem; cursor:pointer; display:flex; align-items:center; gap:6px; white-space:nowrap;">
          <i class="ph-bold ph-eye"></i> Preview
        </button>
        <button onclick="generateRechnung('${o.id}')" style="background:var(--primary); color:#fff; border:none; padding:8px 14px; border-radius:8px; font-family:inherit; font-weight:600; font-size:0.85rem; cursor:pointer; display:flex; align-items:center; gap:6px; white-space:nowrap;">
          <i class="ph-bold ph-file-pdf"></i> Download PDF
        </button>
        ${o.amwayInvoiceId ? `<button onclick="downloadAmwayInvoice('${o.amwayInvoiceId}')" style="background:var(--accent); color:#fff; border:none; padding:8px 14px; border-radius:8px; font-family:inherit; font-weight:600; font-size:0.85rem; cursor:pointer; display:flex; align-items:center; gap:6px; white-space:nowrap;">
          <i class="ph-bold ph-download-simple"></i> โหลดบิล Amway
        </button>` : ''}
      </div>`;
  }).join('');
}

// Download an Amway invoice PDF by its record ID. Fetches the record on demand
// so it works regardless of which tab was visited first.
export async function downloadAmwayInvoice(invoiceId) {
  if (!invoiceId) return;
  Swal.fire({ title: 'กำลังโหลด...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  try {
    const record = await pb.collection('amway_invoices').getOne(invoiceId);
    if (record.pdf_file) {
      const url = pb.files.getUrl(record, record.pdf_file);
      Swal.close();
      window.open(url, '_blank');
    } else {
      Swal.fire('ไม่พบไฟล์', 'ไม่พบไฟล์ PDF ในบันทึกนี้', 'warning');
    }
  } catch (e) {
    Swal.fire('ข้อผิดพลาด', 'ไม่สามารถโหลดไฟล์: ' + e.message, 'error');
  }
}

// ===== Seller (business_info) resolution =====
// Parse a user's `business_info` (JSON string or object) into a normalized shape,
// tolerant of several plausible key names since the schema isn't fixed yet.
function parseBusinessInfo(raw) {
  let bi = raw;
  if (typeof bi === 'string') { try { bi = JSON.parse(bi); } catch (e) { bi = {}; } }
  if (!bi || typeof bi !== 'object') bi = {};

  const pick = (...keys) => {
    for (const k of keys) {
      if (bi[k] != null && String(bi[k]).trim() !== '') return String(bi[k]).trim();
    }
    return '';
  };
  const bank = (bi.bank && typeof bi.bank === 'object') ? bi.bank : {};

  // Build a multi-line address from structured fields (street / address_line2 /
  // plz + city). Falls back to the legacy "address" key if no structured fields
  // are present, so existing users' data keeps rendering.
  function buildAddress() {
    const street  = pick('street');
    const line2   = pick('address_line2');
    const plz     = pick('plz');
    const city    = pick('city');
    const parts = [street];
    if (line2) parts.push(line2);
    if (plz || city) parts.push((plz + ' ' + city).trim());
    const joined = parts.filter(Boolean).join('\n');
    if (joined) return joined;
    // Fallback to legacy address key
    return pick('address', 'adresse', 'companyAddress', 'company_address');
  }

  return {
    companyName:      pick('companyName', 'company_name', 'company', 'firma', 'name'),
    managingDirector: pick('managingDirector', 'geschaeftsfuehrer', 'geschäftsführer', 'ceo', 'director', 'owner', 'manager_name'),
    address:          buildAddress(),
    taxNumber:        pick('taxNumber', 'steuernummer', 'tax_number', 'steuerNr', 'tax_id'),
    vatId:            pick('vatId', 'ustId', 'ust_id', 'ustIdNr', 'vat', 'vatNumber', 'vat_id'),
    bankName: (bank.name || bank.bankName || '') || pick('bankName', 'bank_name', 'bank'),
    iban:     (bank.iban || '')                  || pick('iban', 'IBAN'),
    bic:      (bank.bic  || bank.swift || '')    || pick('bic', 'BIC', 'swift'),
    phone:            pick('company_phone', 'phone', 'tel', 'telephone'),
    email:            pick('company_email', 'email', 'mail')
  };
}

// Resolve the seller's business info from the order OWNER's user record (not the
// logged-in user). Tries: authStore model (if owner === me) → cached downlines →
// a direct fetch → fall back to the logged-in user as a last resort.
async function getOwnerBusinessInfo(ownerId) {
  const model = pb.authStore.model;
  const id = ownerId || (model ? model.id : null);
  let raw = null;

  if (model && id === model.id) {
    raw = model.business_info;
  } else if (id) {
    const cached = (state.downlines || []).find(u => u.id === id);
    if (cached) {
      raw = cached.business_info;
    } else {
      try {
        const u = await pb.collection('users').getOne(id);
        raw = u.business_info;
      } catch (e) {
        raw = model ? model.business_info : null;
      }
    }
  }
  return parseBusinessInfo(raw);
}

// ===== German "Rechnung" PDF generation (DIN 5008) =====

// ── Safe value helpers ──
// jsPDF throws "Invalid argument" when doc.text() or autoTable receives
// null, undefined, or a non-string. These helpers ensure every dynamic
// value is safely stringified before reaching jsPDF.

/** Convert anything to a safe string for doc.text() / autoTable cells. */
const S = v => (v == null) ? '' : String(v);

/** Format a number as German currency string "1.234,56 €". Never returns empty. */
const fmtEUR = n => {
  const num = Number(n);
  const safe = isFinite(num) ? num : 0;
  return safe.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
};

/** Ensure text passed to doc.text() is never null/undefined/empty.
 *  If the value is empty after trimming, returns fallback. */
const T = (v, fallback) => {
  const s = S(v).trim();
  return s || (fallback != null ? S(fallback) : ' ');
};

// Parse a multi-line address into { street, plzCity } parts.
// Last line is assumed to be "PLZ City"; earlier lines are street.
function parseAddressParts(addr) {
  const lines = splitAddress(addr);
  if (lines.length === 0) return { street: '', plzCity: '' };
  if (lines.length === 1) return { street: lines[0], plzCity: '' };
  const plzCity = lines[lines.length - 1];
  const street = lines.slice(0, -1).join(' · ');
  return { street, plzCity };
}

function splitAddress(addr) {
  if (!addr) return [];
  return String(addr)
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export async function generateRechnung(orderId, action = 'download') {
  const order = state.allOrders.find(o => o.id === orderId);
  if (!order) return Swal.fire('Fehler', 'ไม่พบออเดอร์', 'error');

  const jspdfNs = window.jspdf;
  if (!jspdfNs || !jspdfNs.jsPDF) {
    return Swal.fire('Fehler', 'ไม่สามารถโหลดไลบรารีสร้าง PDF ได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต', 'error');
  }

  const isPreview = action === 'preview';
  Swal.fire({ title: isPreview ? 'กำลังสร้างตัวอย่าง...' : 'กำลังสร้าง Rechnung...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

  try {
    // ── Resolve seller & customer ──
    const seller = await getOwnerBusinessInfo(order.owner);
    const customer = state.allCustomers.find(c => c.id === getOrderCustomerId(order)) || null;

    // ── Guard every seller field against null/undefined ──
    const SE = (key, fallback) => T((seller && seller[key]), fallback || '');
    const sellerCompany   = SE('companyName', 'Unternehmen');
    const sellerDirector  = SE('managingDirector');
    const sellerPhone     = SE('phone');
    const sellerTax       = SE('taxNumber');
    const sellerVat       = SE('vatId');
    const sellerBank      = SE('bankName');
    const sellerIban      = SE('iban');
    const sellerBic       = SE('bic');

    // Resolve business email: company_email (from business_info) first,
    // then fall back to the owner's account email.
    const sellerBizEmail = SE('email');       // picks company_email > email > mail
    let ownerEmail = sellerBizEmail;
    if (!ownerEmail) {
      try {
        if (pb.authStore.model && (!order.owner || order.owner === pb.authStore.model.id)) {
          ownerEmail = pb.authStore.model.email || '';
        } else if (order.owner) {
          const cached = (state.downlines || []).find(u => u.id === order.owner);
          ownerEmail = cached ? (cached.email || '') : '';
        }
      } catch (e) { ownerEmail = ''; }
    }

    const { jsPDF } = jspdfNs;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    registerThaiFont(doc);
    const pageW = doc.internal.pageSize.getWidth();
    const MARGIN = 20;
    const RIGHT_X = pageW - MARGIN;

    // ── Seller address parts ──
    const sellerAddr = parseAddressParts(seller ? seller.address : '');
    const addrParts = [sellerCompany, sellerAddr.street, sellerAddr.plzCity].filter(Boolean);
    const headerOneLine = addrParts.length > 0 ? addrParts.join(' – ') : 'Unternehmen';

    // ── Dates ──
    const orderDate = new Date(order.orderDate || order.date || Date.now());
    const dateStr = isNaN(orderDate.getTime())
      ? new Date().toLocaleDateString('de-DE')
      : orderDate.toLocaleDateString('de-DE');

    // ══════════════════════════════════════════════════════════════
    //  1. HEADER
    // ══════════════════════════════════════════════════════════════

    // ── Top-left: seller one-line address (very small, grey) ──
    doc.setFont('Sarabun', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(140, 140, 140);
    doc.text(T(headerOneLine), MARGIN, 45, { maxWidth: 115 });

    // ── Left: buyer address block (Y=55) ──
    // Issue #1: use getOrderCustomerName() alone — it already handles
    // customerId / legacy fallback and nickname-vs-name display logic.
    const buyerName = T(getOrderCustomerName(order), 'Kunde');
    let buyerY = 55;

    doc.setFont('Sarabun', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(30, 30, 30);
    doc.text(buyerName, MARGIN, buyerY);
    buyerY += 5.5;

    doc.setFont('Sarabun', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(60, 60, 60);
    if (customer && customer.address) {
      splitAddress(customer.address).forEach(l => {
        // Skip a line that duplicates the buyer name (some addresses include
        // the recipient name on the first line of the address field).
        if (l.trim().toLowerCase() === buyerName.toLowerCase()) return;
        doc.text(T(l), MARGIN, buyerY);
        buyerY += 5;
      });
    }

    // ── Right: meta block (X=140, Y=50) ──
    const META_X = 140;
    let metaY = 50;

    const metaRows = [
      ['Rechnungs-Nr.:', T(order.orderNumber || order.id, '–')],
    ];
    // Issue #3: show the Amway order reference if present
    const orderRef = S(order.orderRef || '').trim();
    if (orderRef) {
      metaRows.push(['Referenz:', orderRef]);
    }
    metaRows.push(
      ['Rechnungsdatum:', dateStr],
      ['Lieferdatum:',    dateStr]
    );

    metaRows.forEach(([label, val]) => {
      doc.setFont('Sarabun', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(60, 60, 60);
      doc.text(T(label), META_X, metaY);
      doc.setFont('Sarabun', 'normal');
      doc.text(T(val), META_X + 33, metaY);
      metaY += 5.5;
    });

    // ══════════════════════════════════════════════════════════════
    //  2. TITLE & INTRO
    // ══════════════════════════════════════════════════════════════

    doc.setFont('Sarabun', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(30, 30, 30);
    doc.text('Rechnung', MARGIN, 100);

    doc.setFont('Sarabun', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text(
      'Vielen Dank für Ihren Auftrag. Wir berechnen Ihnen folgende Lieferung bzw. Leistung:',
      MARGIN, 115, { maxWidth: RIGHT_X - MARGIN }
    );

    // ══════════════════════════════════════════════════════════════
    //  3. ITEMS TABLE (Y=125)
    // ══════════════════════════════════════════════════════════════

    const items = order.items || [];
    // Issue #4: hardcoded to 0 % (Kleinunternehmer / steuerfrei)
    const mwstLabel = '0 %';

    // Every cell value is explicitly stringified — jsPDF/autoTable will
    // reject null, undefined, or Number type values in body cells.
    const body = items.map((it, idx) => {
      const qty       = isFinite(Number(it && it.qty)) ? Number(it.qty) : 0;
      const unitPrice = isFinite(Number(it && it.price)) ? Number(it.price) : 0;
      const lineTotal = unitPrice * qty;
      // Combine brand + product name when a meaningful brand exists
      const brandLabel = (it && it.brand && it.brand !== 'ทั่วไป')
        ? it.brand + ' — ' + S(it && it.name)
        : S(it && it.name);
      return [
        S(idx + 1),                    // Pos.
        brandLabel,                    // Artikel / Leistung
        S(qty),                        // Menge
        'Stk.',                        // Einheit (always a literal)
        mwstLabel,                     // MwSt. (always a literal)
        fmtEUR(unitPrice),             // Preis (always returns string)
        fmtEUR(lineTotal)              // Gesamt (always returns string)
      ];
    });

    const TABLE_START = 125;

    doc.autoTable({
      startY: TABLE_START,
      margin: { left: MARGIN, right: MARGIN },
      head: [[
        'Pos.', 'Artikel / Leistung', 'Menge', 'Einheit',
        'MwSt.', 'Preis', 'Gesamt'
      ]],
      body: body.length > 0 ? body : [['', 'Keine Artikel', '', '', '', '', '']],
      theme: 'plain',
      styles: {
        font: 'Sarabun',
        fontSize: 9,
        cellPadding: 3,
        textColor: [40, 40, 40],
        lineWidth: 0
      },
      headStyles: {
        fillColor: [255, 255, 255],
        textColor: [40, 40, 40],
        fontStyle: 'bold',
        lineColor: [60, 60, 60],
        lineWidth: { top: 0.3, bottom: 0.3, left: 0, right: 0 }
      },
      columnStyles: {
        0: { halign: 'center' },
        1: { halign: 'left' },
        2: { halign: 'center' },
        3: { halign: 'center' },
        4: { halign: 'center' },
        5: { halign: 'right' },
        6: { halign: 'right' }
      }
    });

    // ══════════════════════════════════════════════════════════════
    //  4. TOTALS BLOCK
    // ══════════════════════════════════════════════════════════════

    const subtotal  = items.reduce((s, it) => s + (isFinite(Number(it && it.price)) ? Number(it.price) : 0) * (isFinite(Number(it && it.qty)) ? Number(it.qty) : 0), 0);
    const discount  = isFinite(Number(order.discount))   ? Number(order.discount)   : 0;
    const arBalance = isFinite(Number(order.ar_balance)) ? Number(order.ar_balance) : 0;
    const net       = isFinite(Number(order.totalPrice))  ? Number(order.totalPrice)  : subtotal;

    let ty = doc.lastAutoTable.finalY + 10;
    
    // บังคับพิกัดแกน X ให้ตรงกับ "ตัวหนังสือ" ในตารางเป๊ะๆ
    // RIGHT_X คือขอบเส้นตาราง หักลบ cellPadding 3mm 
    const TOTALS_VAL_X = RIGHT_X - 3; 
    const LABEL_X      = RIGHT_X - 45;
    const LINE_LEFT    = RIGHT_X - 50;

    const totalRow = (label, val, bold) => {
      doc.setFont('Sarabun', bold ? 'bold' : 'normal');
      doc.setFontSize(bold ? 11 : 9.5);
      doc.setTextColor(bold ? 0 : 60, bold ? 0 : 60, bold ? 0 : 60);
      doc.text(T(label), LABEL_X, ty);
      doc.text(T(val), TOTALS_VAL_X, ty, { align: 'right' }); // บังคับชิดขวา
      ty += bold ? 7 : 5.5;
    };

    totalRow('Summe netto', fmtEUR(subtotal));
    if (discount > 0) totalRow('Rabatt',       '– ' + fmtEUR(discount));
    if (arBalance > 0) totalRow('AR-Guthaben', '– ' + fmtEUR(arBalance));
    totalRow('MwSt. ' + mwstLabel, '–');

    ty += 1;
    doc.setDrawColor(60, 60, 60);
    doc.setLineWidth(0.3);
    // วาดเส้นคั่นจากซ้าย ไปสุดที่ "ขอบเส้นตาราง (RIGHT_X)" พอดีเป๊ะ
    doc.line(LINE_LEFT, ty, RIGHT_X, ty); 
    ty += 6;  

    totalRow('Gesamt', fmtEUR(net), true);

    // ══════════════════════════════════════════════════════════════
    //  5. OUTRO TEXT
    // ══════════════════════════════════════════════════════════════

    ty += 10;
    doc.setFont('Sarabun', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);

    doc.text('Zahlbar nach Erhalt der Rechnung.', MARGIN, ty);
    ty += 6;

    // Issue #6: always show the tax exemption note (MwSt is 0 %)
    doc.setFontSize(8.5);
    doc.text(
      'Diese Rechnung enthält steuerfreie Umsätze nach §19 UStG, daher ist keine Umsatzsteuer enthalten und ausgewiesen.',
      MARGIN, ty, { maxWidth: RIGHT_X - MARGIN }
    );
    ty += 6;

    doc.setFontSize(9);
    doc.text(
      'Wir bedanken uns für Ihren Auftrag und freuen uns auf die weitere Zusammenarbeit.',
      MARGIN, ty, { maxWidth: RIGHT_X - MARGIN }
    );

    // ══════════════════════════════════════════════════════════════
    //  6. FOOTER  (3-column layout, Y ≥ 260)
    // ══════════════════════════════════════════════════════════════

    const FOOTER_Y = Math.max(260, ty + 18);

    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, FOOTER_Y - 4, RIGHT_X, FOOTER_Y - 4);

    const colW = (RIGHT_X - MARGIN) / 3;
    const COL1 = MARGIN;
    const COL2 = MARGIN + colW;
    const COL3 = MARGIN + 2 * colW;

    // Shared footer helper — normal-weight lines
    const footerLine = (text, x, y) => {
      doc.setFont('Sarabun', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(110, 110, 110);
      doc.text(T(text), x, y);
      return y + 3.8;
    };

    // ── Column 1: Company ──
    // Issue #2: explicitly set bold for the company name, then switch back.
    let fy = FOOTER_Y;
    doc.setFont('Sarabun', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(110, 110, 110);
    doc.text(T(sellerCompany), COL1, fy);
    fy += 4.2;
    // Switch back to normal for address lines below the company name
    if (sellerAddr.street)  { fy = footerLine(sellerAddr.street,  COL1, fy); }
    if (sellerAddr.plzCity) { fy = footerLine(sellerAddr.plzCity, COL1, fy); }
    footerLine('Deutschland', COL1, fy);

    // ── Column 2: Contact / Tax ──
    fy = FOOTER_Y;
    if (sellerDirector) {
      doc.setFont('Sarabun', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(110, 110, 110);
      doc.text(T('Geschäftsführer: ' + sellerDirector), COL2, fy);
      fy += 4.2;
    }
    if (sellerPhone)    { fy = footerLine('Telefon: ' + sellerPhone, COL2, fy); }
    if (ownerEmail)     { fy = footerLine('E-Mail: ' + ownerEmail,    COL2, fy); }
    if (sellerTax)      { fy = footerLine('Steuernummer: ' + sellerTax, COL2, fy); }
    if (sellerVat)      { fy = footerLine('USt.-IDNr.: ' + sellerVat,   COL2, fy); }

    // ── Column 3: Bank ──
    fy = FOOTER_Y;
    doc.setFont('Sarabun', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(110, 110, 110);
    doc.text(T('Bankverbindungen'), COL3, fy);
    fy += 4.2;
    if (sellerBank) { fy = footerLine(sellerBank,                COL3, fy); }
    if (sellerIban) { fy = footerLine('IBAN: ' + sellerIban,      COL3, fy); }
    if (sellerBic)  { fy = footerLine('BIC/Swift: ' + sellerBic,  COL3, fy); }

    // ── Output ──
    if (isPreview) {
      const blobUrl = doc.output('bloburl');
      Swal.close();
      window.open(blobUrl, '_blank');
    } else {
      doc.save(`Rechnung_${T(order.orderNumber || order.id, 'Rechnung')}.pdf`);
      Swal.close();
    }
  } catch (e) {
    Swal.fire('Fehler', 'สร้าง PDF ไม่สำเร็จ: ' + e.message, 'error');
  }
}
