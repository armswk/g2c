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

  return {
    companyName:      pick('companyName', 'company_name', 'company', 'firma', 'name'),
    managingDirector: pick('managingDirector', 'geschaeftsfuehrer', 'geschäftsführer', 'ceo', 'director', 'owner'),
    address:          pick('address', 'adresse', 'companyAddress', 'company_address'),
    taxNumber:        pick('taxNumber', 'steuernummer', 'tax_number', 'steuerNr'),
    vatId:            pick('vatId', 'ustId', 'ust_id', 'ustIdNr', 'vat', 'vatNumber', 'vat_id'),
    bankName: (bank.name || bank.bankName || '') || pick('bankName', 'bank_name', 'bank'),
    iban:     (bank.iban || '')                  || pick('iban', 'IBAN'),
    bic:      (bank.bic  || bank.swift || '')    || pick('bic', 'BIC', 'swift'),
    phone:            pick('phone', 'tel', 'telephone'),
    email:            pick('email', 'mail')
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

// ===== German "Rechnung" PDF generation =====
const fmtEUR = n => (Number(n) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

export async function generateRechnung(orderId) {
  const order = state.allOrders.find(o => o.id === orderId);
  if (!order) return Swal.fire('Fehler', 'ไม่พบออเดอร์', 'error');

  const jspdfNs = window.jspdf;
  if (!jspdfNs || !jspdfNs.jsPDF) {
    return Swal.fire('Fehler', 'ไม่สามารถโหลดไลบรารีสร้าง PDF ได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต', 'error');
  }

  Swal.fire({ title: 'กำลังสร้าง Rechnung...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

  try {
    const seller = await getOwnerBusinessInfo(order.owner);
    const customer = state.allCustomers.find(c => c.id === getOrderCustomerId(order)) || null;

    const { jsPDF } = jspdfNs;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    registerThaiFont(doc);
    const pageW = doc.internal.pageSize.getWidth();
    const marginX = 18;
    let y = 20;

    // --- Seller header (Verkäufer) ---
    doc.setFont('Sarabun', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(26, 83, 54); // primary-dk
    doc.text(seller.companyName || 'Verkäufer', marginX, y);

    doc.setFont('Sarabun', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    let sy = y + 6;
    const sellerLines = [];
    if (seller.managingDirector) sellerLines.push('Geschäftsführer: ' + seller.managingDirector);
    splitAddress(seller.address).forEach(l => sellerLines.push(l));
    if (seller.phone) sellerLines.push('Tel: ' + seller.phone);
    if (seller.email) sellerLines.push(seller.email);
    sellerLines.forEach(line => { doc.text(line, marginX, sy); sy += 4.5; });

    // --- Document title + meta block (right) ---
    doc.setFont('Sarabun', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(30, 30, 30);
    doc.text('RECHNUNG', pageW - marginX, y, { align: 'right' });

    doc.setFontSize(9.5);
    doc.setFont('Sarabun', 'normal');
    doc.setTextColor(60, 60, 60);
    let my = y + 9;
    const orderDate = new Date(order.orderDate || order.date);
    const dateStr = isNaN(orderDate.getTime()) ? '-' : orderDate.toLocaleDateString('de-DE');
    const metaRows = [
      ['Rechnungs-Nr.:', order.orderNumber || order.id],
      ['Rechnungsdatum:', dateStr]
    ];
    if (order.orderRef && String(order.orderRef).trim() !== '') {
      metaRows.splice(1, 0, ['Referenz:', String(order.orderRef)]);
    }
    metaRows.forEach(([label, val]) => {
      doc.setFont('Sarabun', 'bold');
      doc.text(label, pageW - marginX - 42, my, { align: 'left' });
      doc.setFont('Sarabun', 'normal');
      doc.text(String(val), pageW - marginX, my, { align: 'right' });
      my += 5;
    });

    // --- Buyer (Käufer) block ---
    y = Math.max(sy, my) + 8;
    doc.setDrawColor(220, 220, 220);
    doc.line(marginX, y, pageW - marginX, y);
    y += 8;

    doc.setFont('Sarabun', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text('RECHNUNG AN (Käufer):', marginX, y);
    y += 5.5;

    doc.setFont('Sarabun', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(30, 30, 30);
    const buyerName = customer ? (customer.name || customer.nickname || '') : getOrderCustomerName(order);
    doc.text(buyerName || '-', marginX, y);
    y += 5.5;

    doc.setFont('Sarabun', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(70, 70, 70);
    if (customer && customer.address) {
      splitAddress(customer.address).forEach(l => { doc.text(l, marginX, y); y += 4.8; });
    }

    // --- Items table ---
    const items = order.items || [];
    const body = items.map((it, idx) => {
      const qty = Number(it.qty) || 0;
      const unit = Number(it.price) || 0;
      return [
        String(idx + 1),
        it.name || '',
        String(qty),
        fmtEUR(unit),
        fmtEUR(unit * qty)
      ];
    });

    doc.autoTable({
      startY: y + 4,
      margin: { left: marginX, right: marginX },
      head: [['Pos.', 'Bezeichnung', 'Menge', 'Einzelpreis', 'Gesamt']],
      body: body.length ? body : [['', 'Keine Artikel', '', '', '']],
      theme: 'striped',
      styles: { font: 'Sarabun', fontSize: 9, cellPadding: 2.5, textColor: [40, 40, 40] },
      headStyles: { fillColor: [45, 106, 79], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: {
        0: { halign: 'center', cellWidth: 12 },
        2: { halign: 'center', cellWidth: 18 },
        3: { halign: 'right', cellWidth: 30 },
        4: { halign: 'right', cellWidth: 30 }
      }
    });

    // --- Totals ---
    const subtotal = items.reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.qty) || 0), 0);
    const discount = Number(order.discount) || 0;
    const arBalance = Number(order.ar_balance) || 0;
    const net = Number(order.totalPrice) || 0;

    let ty = doc.lastAutoTable.finalY + 8;
    const totalsX = pageW - marginX;
    const labelX = pageW - marginX - 55;

    const totalRow = (label, val, bold = false, color = [60, 60, 60]) => {
      doc.setFont('Sarabun', bold ? 'bold' : 'normal');
      doc.setFontSize(bold ? 11.5 : 9.5);
      doc.setTextColor(color[0], color[1], color[2]);
      doc.text(label, labelX, ty);
      doc.text(val, totalsX, ty, { align: 'right' });
      ty += bold ? 7 : 5.5;
    };

    totalRow('Zwischensumme:', fmtEUR(subtotal));
    if (discount > 0) totalRow('Rabatt:', '-' + fmtEUR(discount), false, [192, 57, 43]);
    if (arBalance > 0) totalRow('AR-Guthaben:', '-' + fmtEUR(arBalance), false, [29, 78, 216]);

    doc.setDrawColor(45, 106, 79);
    doc.line(labelX, ty - 2, totalsX, ty - 2);
    ty += 2;
    totalRow('Gesamtbetrag:', fmtEUR(net), true, [26, 83, 54]);

    // Small-business note (most Amway resellers fall under §19 UStG). Shown only
    // when no VAT-ID is present, so VAT-registered sellers don't see it.
    if (!seller.vatId) {
      ty += 4;
      doc.setFont('Sarabun', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(110, 110, 110);
      doc.text('Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.', marginX, ty);
    }

    // --- Footer: tax / bank details ---
    const pageH = doc.internal.pageSize.getHeight();
    let fy = pageH - 28;
    doc.setDrawColor(220, 220, 220);
    doc.line(marginX, fy - 4, pageW - marginX, fy - 4);

    doc.setFont('Sarabun', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(110, 110, 110);

    const col1 = [];
    if (seller.taxNumber) col1.push('Steuernummer: ' + seller.taxNumber);
    if (seller.vatId) col1.push('USt.-IdNr.: ' + seller.vatId);

    const col2 = [];
    if (seller.bankName) col2.push('Bank: ' + seller.bankName);
    if (seller.iban) col2.push('IBAN: ' + seller.iban);
    if (seller.bic) col2.push('BIC: ' + seller.bic);

    let c1y = fy;
    col1.forEach(l => { doc.text(l, marginX, c1y); c1y += 3.8; });
    let c2y = fy;
    col2.forEach(l => { doc.text(l, pageW / 2, c2y); c2y += 3.8; });

    doc.save(`Rechnung_${order.orderNumber || order.id}.pdf`);
    Swal.close();
  } catch (e) {
    Swal.fire('Fehler', 'สร้าง PDF ไม่สำเร็จ: ' + e.message, 'error');
  }
}

// Split a multi-line / comma-ish address string into trimmed lines for the PDF.
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
