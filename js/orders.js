import { state } from './state.js';
import { pb } from './api.js';
import { clearCart, updateCart } from './pos.js';
import { closeAllPanels, togglePaymentOptions } from './ui.js';
import { renderCustomers, setCustomerSelectValue } from './customers.js';

// Owner-scoped view for the dashboard / order history list.
//   'mine' → orders where owner === current user
//   'team' → orders where owner !== current user
// The filter applies to both KPIs and the historyList so the dashboard reads
// consistently end-to-end.
export const ordersViewState = { view: 'mine' };

// ===== Reactivity helpers =====
// PocketBase realtime can be unreliable behind some proxies, so every save path
// also updates local state directly and re-renders. Both the realtime handler
// and these helpers upsert by id, so running both is idempotent (no duplicates).
function refreshOrderUI() {
  updateDashboard();      // recomputes KPIs and calls loadHistory()
  renderInstallments();
  renderCustomers();
}

// Upsert an order record (as returned by PocketBase) into local state, mapping
// the DB field names to the shape the rest of the app expects.
export function syncOrderToState(record) {
  if (!record) return;
  const mapped = { ...record, date: record.orderDate, customer: record.customerName };
  const idx = state.allOrders.findIndex(o => o.id === mapped.id);
  if (idx > -1) state.allOrders[idx] = mapped;
  else state.allOrders.unshift(mapped);
  refreshOrderUI();
}

export function removeOrderFromState(id) {
  state.allOrders = state.allOrders.filter(o => o.id !== id);
  refreshOrderUI();
}

// Fill the "Order Owner" dropdown (เจ้าของยอดสั่งซื้อ) in the checkout panel.
// Self-contained: clears existing options, adds the current user as the default
// first option, fetches the downlines (users whose upline is the current user)
// and appends each, then explicitly selects the current user.
//
// Robust by design: it builds + selects "self" synchronously *before* awaiting
// the network, so even if the downline fetch is slow or fails the dropdown is
// never empty and always defaults to the logged-in user.
export async function populateOrderOwnerSelect() {
  const sel = document.getElementById('orderOwnerSelect');
  if (!sel) return;

  const model = pb.authStore.model;
  if (!model) { sel.innerHTML = ''; return; }

  // Preserve any in-progress selection (e.g. while editing an order) so a
  // re-populate doesn't reset the owner the user already picked.
  const prev = sel.value;

  // 1) Clear + add self as the default first option.
  sel.innerHTML = `<option value="${model.id}">👤 ตัวเอง (${escapeHtmlAttr(model.name || 'Myself')})</option>`;
  // 2) Default to the current user immediately.
  sel.value = model.id;

  // 3) Fetch downlines and append them. Non-fatal on error.
  let downlines = [];
  try {
    downlines = await pb.collection('users').getFullList({
      filter: `upline = "${model.id}"`
    });
  } catch (e) {
    downlines = [];
  }
  state.downlines = downlines;

  downlines.forEach(user => {
    const label = escapeHtmlAttr((user.name && user.name.trim()) || user.email || user.id);
    sel.insertAdjacentHTML('beforeend', `<option value="${user.id}">👥 ${label}</option>`);
  });

  // 4) Restore a valid prior selection, otherwise keep the default (self).
  const validIds = [model.id, ...downlines.map(u => u.id)];
  sel.value = (prev && validIds.includes(prev)) ? prev : model.id;
}

// Minimal escaping for values placed inside an option's text/attribute.
function escapeHtmlAttr(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const ORDERS_TOGGLE_BASE     = 'px-3 py-1.5 text-xs font-semibold rounded-md flex items-center gap-1 transition';
const ORDERS_TOGGLE_ACTIVE   = 'bg-green-700 text-white';
const ORDERS_TOGGLE_INACTIVE = 'bg-transparent text-gray-500 hover:bg-gray-200';

export function setOrdersOwnerView(view) {
  if (view !== 'mine' && view !== 'team') return;
  ordersViewState.view = view;

  const mineBtn = document.getElementById('orders-view-mine');
  const teamBtn = document.getElementById('orders-view-team');
  if (mineBtn && teamBtn) {
    mineBtn.className = `${ORDERS_TOGGLE_BASE} ${view === 'mine' ? ORDERS_TOGGLE_ACTIVE : ORDERS_TOGGLE_INACTIVE}`;
    teamBtn.className = `${ORDERS_TOGGLE_BASE} ${view === 'team' ? ORDERS_TOGGLE_ACTIVE : ORDERS_TOGGLE_INACTIVE}`;
  }
  // updateDashboard recomputes KPIs and then calls loadHistory.
  updateDashboard();
}

// Returns true if order `o` matches the current owner scope. Unauthenticated
// fallback: pass everything through so the screen still renders.
function matchesOwnerScope(o) {
  const uid = pb.authStore.model ? pb.authStore.model.id : null;
  if (!uid) return true;
  return ordersViewState.view === 'mine' ? o.owner === uid : o.owner !== uid;
}

function getPaidMonths(o) {
  let hist = o.instHistory || [];
  if (typeof hist === 'string') try { hist = JSON.parse(hist); } catch(e) { hist = []; }
  if (!Array.isArray(hist)) hist = [];
  return hist.filter(h => h.method && h.method !== 'รอดำเนินการ').length;
}

// Resolve an order's customer through the live customers list. Orders saved
// before customerId was introduced fall back to the legacy string match so
// historical data keeps rendering.
export function getOrderCustomerId(order) {
  if (!order) return null;
  if (order.customerId) return order.customerId;
  const legacyName = order.customer || order.customerName;
  if (!legacyName) return null;
  const match = state.allCustomers.find(c => c.name === legacyName);
  return match ? match.id : null;
}

export function getOrderCustomerName(order) {
  if (!order) return '';
  const displayFor = c => ((c.nickname || '').trim()) || c.name || '';
  // Primary: persistent ID lookup — survives renames.
  if (order.customerId) {
    const byId = state.allCustomers.find(x => x.id === order.customerId);
    if (byId) return displayFor(byId);
  }
  // Legacy fallback: try to resolve by the stored name so renames still
  // propagate when the order pre-dates the customerId migration, *as long
  // as that customer hasn't been renamed yet* (after a rename, only orders
  // with customerId can follow — that's why customerId must be persisted).
  const legacy = order.customer || order.customerName || '';
  if (legacy) {
    const byName = state.allCustomers.find(x => x.name === legacy);
    if (byName) return displayFor(byName);
  }
  return legacy;
}

export function updateInstallmentCalc() {
  const instOptions = document.getElementById('installmentOptions');
  if (!instOptions || instOptions.style.display === 'none') return;

  const totalStr = (document.getElementById('cartTotal')?.innerText || '0').replace('€', '');
  const totalPrice = parseFloat(totalStr) || 0;
  const terms = Math.max(1, parseInt(document.getElementById('instTerms')?.value || 0) || 1);
  const monthly = totalPrice / terms;

  const hasInput = document.getElementById('instTerms')?.value;
  const calcDisplay = document.getElementById('instCalcDisplay');
  if (calcDisplay) calcDisplay.style.display = hasInput ? 'block' : 'none';
  if (document.getElementById('instMonthlyDisplay')) document.getElementById('instMonthlyDisplay').innerText = `€${monthly.toFixed(2)} / เดือน`;
}

export async function submitOrder() {
  const customerId = document.getElementById('customerSelect').value;
  if(!customerId) return Swal.fire({icon:'warning', title:'กรุณาเลือกลูกค้า'});
  const customerRecord = state.allCustomers.find(c => c.id === customerId);
  if(!customerRecord) return Swal.fire({icon:'warning', title:'ไม่พบข้อมูลลูกค้า'});
  const customerName = customerRecord.name || customerRecord.nickname || '';
  const orderDate = document.getElementById('orderDate').value;
  if(!orderDate) return Swal.fire({icon:'warning', title:'กรุณาเลือกวันที่'});
  if(state.cart.length === 0) return Swal.fire({icon:'warning', title:'ตะกร้าว่างเปล่า'});

  const paymentStatus = document.getElementById('paymentStatus').value;
  let paymentMethod = '';
  if (paymentStatus === 'จ่ายแล้ว') paymentMethod = document.getElementById('paymentMethodFull').value;
  else if (paymentStatus === 'ผ่อน') paymentMethod = 'ผ่อน';

  let explodedCart = [];
  state.cart.forEach(item => {
     if (item.isSet) {
         let subItems = item.remark.split(','); let parsedSubs = []; let totalStdPrice = 0; let totalStdPv = 0;
         subItems.forEach(sub => {
             let match = sub.trim().match(/^(\d+)x\s+(.+)$/); let qty = 1; let pName = sub.trim();
             if(match) { qty = parseInt(match[1], 10); pName = match[2].trim(); }
             let stdProd = state.allProducts.find(p => p.name === pName);
             let stdPrice = stdProd ? Number(stdProd.price) * qty : 0; let stdPv = stdProd ? Number(stdProd.pv) * qty : 0;
             totalStdPrice += stdPrice; totalStdPv += stdPv;
             parsedSubs.push({ name: pName, qty: qty * item.qty, stdPrice: stdPrice, stdPv: stdPv });
         });
         parsedSubs.forEach(sub => {
             let ratioPrice = totalStdPrice > 0 ? (sub.stdPrice / totalStdPrice) : (1 / parsedSubs.length);
             let ratioPv = totalStdPv > 0 ? (sub.stdPv / totalStdPv) : (1 / parsedSubs.length);
             explodedCart.push({ name: sub.name, qty: sub.qty, price: (Number(item.price) * item.qty * ratioPrice) / sub.qty, pv: (Number(item.pv) * item.qty * ratioPv) / sub.qty, isSet: false });
         });
     } else { explodedCart.push(item); }
  });

  const discountInput = document.getElementById('discountInput');
  const discount = Math.max(0, Number(discountInput ? discountInput.value : 0) || 0);
  const arBalance = Math.max(0, Number(document.getElementById('arBalanceInput')?.value || 0) || 0);
  const subtotal = Number(explodedCart.reduce((s, i) => s + (i.price * i.qty), 0).toFixed(2));
  const netTotalPrice = Number(Math.max(0, subtotal - discount - arBalance).toFixed(2));

  const instTermsVal = paymentStatus === 'ผ่อน' ? Math.max(1, Number(document.getElementById('instTerms').value) || 1) : 0;
  const instMonthly = instTermsVal > 0 ? Number((netTotalPrice / instTermsVal).toFixed(2)) : 0;

  const payload = {
    orderNumber: state.currentEditId ? undefined : 'OR-' + Date.now(),
    customerId: customerId,
    customerName: customerName,
    orderDate: new Date(orderDate).toISOString(),
    remark: document.getElementById('orderRemark').value,
    items: explodedCart,
    discount: discount,
    ar_balance: arBalance,
    totalPrice: netTotalPrice,
    totalPV: Number(explodedCart.reduce((s, i) => s + (i.pv * i.qty), 0).toFixed(2)),
    paymentStatus,
    paymentMethod,
    orderRef: document.getElementById('orderRef').value,
    instType: paymentStatus === 'ผ่อน' ? document.getElementById('instType').value : '',
    instTerms: instTermsVal,
    instMonthly: instMonthly,
    instPaid: 0,
    instHistory: paymentStatus === 'ผ่อน' && document.getElementById('instType').value === 'เรา' ? [{term: 1, date: new Date(orderDate).toISOString(), method: 'รอดำเนินการ'}] : [],
    // Order owner: the user selected in the "เจ้าของยอดสั่งซื้อ" dropdown
    // (self by default, or a downline). Falls back to the current user.
    owner: document.getElementById('orderOwnerSelect')?.value || (pb.authStore.model ? pb.authStore.model.id : null)
  };

  Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

  try {
    // ถ้ากำลังแก้ไขออเดอร์ และมีการอัปโหลดไฟล์ PDF → สร้าง record ใน amway_invoices ก่อน
    const pdfFileInput = document.getElementById('amwayPdfFile');
    if (state.currentEditId && pdfFileInput && pdfFileInput.files.length > 0) {
      const file = pdfFileInput.files[0];
      const fd = new FormData();
      fd.append('invoice_number', payload.orderRef || '');
      fd.append('invoice_date', payload.orderDate || new Date().toISOString());
      fd.append('pdf_file', file);
      if (pb.authStore.model) fd.append('owner', pb.authStore.model.id);
      const invRecord = await pb.collection('amway_invoices').create(fd);
      payload.amwayInvoiceId = invRecord.id;
      // Also push into local state so the Documents view doesn't need a re-fetch
      state.amwayInvoices = state.amwayInvoices || [];
      state.amwayInvoices.unshift(invRecord);
    }

    let record;
    if (state.currentEditId) {
        record = await pb.collection('orders').update(state.currentEditId, payload);
    } else {
        record = await pb.collection('orders').create(payload);
    }
    syncOrderToState(record);
    Swal.fire({toast: true, position: 'top-end', showConfirmButton: false, timer: 2000, icon:'success', title:'บันทึกออเดอร์สำเร็จ!'});
    resetForm();
  } catch(e) { Swal.fire('Error', e.message, 'error'); }
}

export function cancelEdit() { 
  state.currentEditId = null; 
  document.getElementById('editModeBanner').style.display = 'none'; 
  resetForm(); 
}

export function resetForm() {
  state.currentEditId = null;
  document.getElementById('editModeBanner').style.display = 'none';
  clearCart();
  document.getElementById('orderDate').valueAsDate = new Date();
  document.getElementById('orderRemark').value = '';
  setCustomerSelectValue('');
  if(document.getElementById('orderRef')) document.getElementById('orderRef').value = '';
  // Hide and clear the Amway PDF upload area
  const pdfArea = document.getElementById('amwayPdfUploadArea');
  if (pdfArea) pdfArea.style.display = 'none';
  const pdfFile = document.getElementById('amwayPdfFile');
  if (pdfFile) pdfFile.value = '';
  if(document.getElementById('paymentStatus')) document.getElementById('paymentStatus').value = 'ยังไม่จ่าย';
  if(document.getElementById('discountInput')) document.getElementById('discountInput').value = '';
  if(document.getElementById('arBalanceInput')) document.getElementById('arBalanceInput').value = '0';
  if(document.getElementById('instTerms')) document.getElementById('instTerms').value = '';
  const calcDisplay = document.getElementById('instCalcDisplay'); if(calcDisplay) calcDisplay.style.display = 'none';
  // Reset order owner back to "self".
  const ownerSel = document.getElementById('orderOwnerSelect');
  if (ownerSel && pb.authStore.model) ownerSel.value = pb.authStore.model.id;

  togglePaymentOptions();
  closeAllPanels();
}

export function updateDashboard() {
  const monthVal = document.getElementById('dashMonth').value;
  if (!monthVal) return;
  const [filterY, filterM] = monthVal.split('-');
  const targetYear = parseInt(filterY), targetMonth = parseInt(filterM) - 1;
  const cus = document.getElementById('dashCustomerSelect')?.value || 'ALL';

  let sumEuro = 0, sumPV = 0;
  state.allOrders.forEach(o => {
    if (!matchesOwnerScope(o)) return;
    let safeDateObj = new Date(o.date); if(isNaN(safeDateObj.getTime())) safeDateObj = new Date();
    const matchDate = safeDateObj.getMonth() === targetMonth && safeDateObj.getFullYear() === targetYear;
    const matchCus = cus === 'ALL' || o.customerId === cus;
    if (matchDate && matchCus) { sumEuro += Number(o.totalPrice) || 0; sumPV += Number(o.totalPV) || 0; }
  });
  document.getElementById('dashSales').innerText = `€${sumEuro.toFixed(2)}`;
  document.getElementById('dashPV').innerText = sumPV.toFixed(2);
  loadHistory();
}

export function loadHistory() {
  const cus = document.getElementById('dashCustomerSelect').value;
  const payStatus = document.getElementById('dashPayStatus') ? document.getElementById('dashPayStatus').value : 'ALL';
  const orderRefFilter = document.getElementById('dashOrderRef') ? document.getElementById('dashOrderRef').value : 'ALL';
  const list = document.getElementById('historyList');
  const monthVal = document.getElementById('dashMonth').value;
  if (!monthVal) return;
  const [filterY, filterM] = monthVal.split('-');
  const targetYear = parseInt(filterY), targetMonth = parseInt(filterM) - 1; 

  let filtered = state.allOrders.filter(o => {
    if (!matchesOwnerScope(o)) return false;
    let safeDateObj = new Date(o.date); if(isNaN(safeDateObj.getTime())) safeDateObj = new Date();
    let matchDate = (safeDateObj.getMonth() === targetMonth && safeDateObj.getFullYear() === targetYear);
    let matchCus = (cus === 'ALL' || o.customerId === cus);
    let matchPay = (payStatus === 'ALL' || o.paymentStatus === payStatus);
    let safeRef = String(o.orderRef || '').trim();
    let matchRef = true;
    if(orderRefFilter === 'HAS_REF') matchRef = safeRef !== '';
    if(orderRefFilter === 'NO_REF') matchRef = safeRef === '';
    return matchDate && matchCus && matchPay && matchRef;
  });

  const display = filtered.sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 50);

  if(display.length === 0) { list.innerHTML = '<div style="padding:40px;text-align:center;color:#999;">ไม่พบประวัติออเดอร์ตามเงื่อนไข</div>'; return; }

  list.innerHTML = display.map(g => {
    let dObj = new Date(g.date); let safeDateObj = isNaN(dObj.getTime()) ? new Date() : dObj;
    const dStr = safeDateObj.toLocaleDateString('th-TH');
    const itemsHtml = (g.items || []).map(i => `<div style="font-size:0.9rem; color:#4B5563; display:flex; justify-content:space-between; margin-bottom:4px;"><span>- ${i.name} <span style="color:var(--text-muted);font-size:0.8rem;">x${i.qty}</span></span><span style="font-weight:600;">€${(Number(i.price)*i.qty).toFixed(2)}</span></div>`).join('');
    let statusBadge = g.paymentStatus === 'จ่ายแล้ว' ? `<span style="background:var(--success); color:#fff; padding:2px 8px; border-radius:12px; font-size:0.75rem; margin-left:8px;">จ่ายแล้ว</span>` :
                      g.paymentStatus === 'ผ่อน' ? `<span style="background:var(--accent); color:#fff; padding:2px 8px; border-radius:12px; font-size:0.75rem; margin-left:8px;">ผ่อนชำระ</span>` :
                      `<span style="background:var(--danger); color:#fff; padding:2px 8px; border-radius:12px; font-size:0.75rem; margin-left:8px;">ยังไม่จ่าย</span>`;
    
    // 🔥 แก้ไขคำอธิบาย Ref
    let refHtml = g.orderRef ? `<div style="font-size:0.8rem; color:var(--primary-lt); margin-top:4px;"><i class="ph-fill ph-hash"></i> Ref: ${g.orderRef}</div>` : `<div style="font-size:0.8rem; color:var(--danger); margin-top:4px;"><i class="ph-fill ph-warning"></i> ยังไม่มีเลขสั่งซื้ออ้างอิง</div>`;

    const displayId = g.orderNumber || g.id;

    // 📄 ออกบิล (Rechnung) — shown only for completed orders.
    const rechnungBtn = g.paymentStatus === 'จ่ายแล้ว'
      ? `<span style="font-size:0.85rem; color:var(--primary-dk); cursor:pointer; font-weight:600; display:flex; align-items:center; gap:5px;" onclick="generateRechnung('${g.id}')"><i class="ph ph-file-pdf"></i> ออกบิล (Rechnung)</span>`
      : '';

    let quickPayBtn = '';
    if (g.paymentStatus === 'ยังไม่จ่าย') {
        quickPayBtn = `<span style="font-size:0.85rem; color:var(--accent); cursor:pointer; font-weight:600; display:flex; align-items:center; gap:5px;" onclick="markAsPaid('${g.id}')"><i class="ph ph-hand-coins"></i> รับชำระเงิน</span>`;
    } else if (g.paymentStatus === 'ผ่อน' && g.instType !== 'บัญชีลูกค้า') {
        const gPaidMonths = getPaidMonths(g);
        if (gPaidMonths < g.instTerms) {
            quickPayBtn = `<span style="font-size:0.85rem; color:var(--accent); cursor:pointer; font-weight:600; display:flex; align-items:center; gap:5px;" onclick="payInstallment('${g.id}', ${gPaidMonths + 1})"><i class="ph ph-hand-coins"></i> รับชำระงวดที่ ${gPaidMonths + 1}</span>`;
        }
    }

    return `
      <div style="padding: 20px; border-bottom: 1px solid var(--border);">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 12px;">
          <div>
            <div style="font-weight:700; color:var(--primary-dk); font-size:1.05rem; margin-bottom:4px;"><i class="ph-fill ph-receipt"></i> ${displayId} ${statusBadge}</div>
            <div style="font-size:0.85rem; color:var(--text-muted);">👤 ${getOrderCustomerName(g)} &nbsp;|&nbsp; 📅 ${dStr}</div>
            ${refHtml}
          </div>
          <div style="text-align:right;">
            <div style="font-size:1.25rem; font-weight:700; color:var(--primary);">€${(Number(g.totalPrice)||0).toFixed(2)}</div>
            <div style="font-size:0.85rem; font-weight:600; color:var(--accent);">${(Number(g.totalPV)||0).toFixed(2)} PV</div>
          </div>
        </div>
        <div style="background:#F8FAFC; padding:12px 15px; border-radius:8px; margin-bottom:12px; border: 1px solid #E2E8F0;">${itemsHtml}</div>
        ${Number(g.ar_balance) > 0 ? `<div style="font-size:0.85rem; color:#1E40AF; background:#EFF6FF; padding:8px 12px; border-radius:6px; margin-bottom:8px; border: 1px solid #BFDBFE; display:flex; justify-content:space-between; align-items:center;"><span><i class="ph-fill ph-bank" style="color:#3B82F6;"></i> <span style="font-weight:600;">AR Balance:</span> -€${Number(g.ar_balance).toFixed(2)}</span></div>` : ''}
        ${g.remark ? `<div style="font-size:0.85rem; color:#92400E; background:#FFFBEB; padding:8px 12px; border-radius:6px; margin-bottom:12px; border: 1px solid #FDE68A;"><i class="ph-fill ph-note" style="color:#D97706;"></i> <span style="font-weight:600;">หมายเหตุ:</span> ${g.remark}</div>` : ''}
        <div style="display:flex; gap:15px; justify-content: flex-end; flex-wrap: wrap;">
          ${quickPayBtn}
          ${rechnungBtn}
          <span style="font-size:0.85rem; color:var(--success); cursor:pointer; font-weight:600; display:flex; align-items:center; gap:5px;" onclick="printReceipt('${g.id}')"><i class="ph ph-printer"></i> พิมพ์</span>
          <span style="font-size:0.85rem; color:var(--primary-lt); cursor:pointer; font-weight:600; display:flex; align-items:center; gap:5px;" onclick="editOrder('${g.id}')"><i class="ph ph-pencil-simple"></i> แก้ไข</span>
          <span style="font-size:0.85rem; color:var(--danger); cursor:pointer; font-weight:600; display:flex; align-items:center; gap:5px;" onclick="delOrder('${g.id}')"><i class="ph ph-trash"></i> ลบ</span>
        </div>
      </div>`;
  }).join('');
}

export function markAsPaid(orderId) {
  const o = state.allOrders.find(x => x.id === orderId);
  if(!o) return;

  Swal.fire({
    title: `รับชำระเงิน`,
    html: `<div style="text-align: left; font-size: 0.9rem; margin-bottom: 10px; color: var(--text-muted);">ยอดที่ต้องชำระ: <strong style="color: var(--primary); font-size: 1.1rem;">€${(Number(o.totalPrice)||0).toFixed(2)}</strong></div>
           <select id="swal-pay-method" class="c-input">
              <option value="เงินสด">เงินสด</option>
              <option value="โอนเงิน">โอนเงิน</option>
              <option value="บัตรเครดิต">บัตรเครดิต</option>
           </select>`,
    showCancelButton: true,
    confirmButtonText: 'ยืนยันรับชำระ',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#2D6A4F'
  }).then(async res => {
    if (res.isConfirmed) {
      let method = document.getElementById('swal-pay-method').value;
      let payload = { paymentStatus: 'จ่ายแล้ว', paymentMethod: method };
      
      try {
         const record = await pb.collection('orders').update(orderId, payload);
         syncOrderToState(record);
         Swal.fire({ toast: true, position: 'top-end', showConfirmButton: false, timer: 2000, icon: 'success', title: 'อัปเดตเป็นจ่ายแล้วสำเร็จ!' });
      } catch(e) { Swal.fire('Error', e.message, 'error'); }
    }
  });
}

export function printReceipt(orderId) {
  const group = state.allOrders.find(o => o.id === orderId);
  if(!group) return;
  
  let safeDateObj = new Date(group.date); 
  if(isNaN(safeDateObj.getTime())) safeDateObj = new Date();
  
  const dateStr = `${safeDateObj.getDate().toString().padStart(2,'0')}/${(safeDateObj.getMonth()+1).toString().padStart(2,'0')}/${safeDateObj.getFullYear()} ${safeDateObj.getHours().toString().padStart(2,'0')}:${safeDateObj.getMinutes().toString().padStart(2,'0')}`;
  
  const itemsHtml = (group.items || []).map(i => {
    const prod = state.allProducts.find(p => p.name === i.name);
    let brandStr = '';
    if (prod && prod.brand && prod.brand !== 'ทั่วไป') {
        brandStr = `[${prod.brand}] `;
    }
    
    const unitPriceStr = `@ €${Number(i.price).toFixed(2)}`;
    const totalPriceStr = `€${(Number(i.price) * i.qty).toFixed(2)}`;

    return `<div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px;">
              <div style="flex: 1; padding-right: 10px;">
                <span style="font-size: 11px; color: #555; font-weight: bold;">${brandStr}</span>${i.name} <br>
                <span style="color: #666; font-size: 12px;">x${i.qty} <span style="font-size: 11px; color: #888;">${unitPriceStr}</span></span>
              </div>
              <div style="font-weight: 600;">${totalPriceStr}</div>
            </div>`;
  }).join('');
  
  const remarkHtml = group.remark ? `<div style="font-size: 12px; margin-top: 5px;"><span class="font-bold">หมายเหตุ:</span> ${group.remark}</div>` : '';
  const displayId = group.orderNumber || group.id;

  // 🔥 เปลี่ยนหัวบิลใบเสร็จเป็น G2C POS
  const receiptHtml = `
    <html><head><title>Receipt ${displayId}</title><style>@import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap'); body { font-family: 'Sarabun', sans-serif; padding: 20px; max-width: 320px; margin: 0 auto; color: #000; } .text-center { text-align: center; } .font-bold { font-weight: 700; } hr { border: 0; border-top: 1px dashed #000; margin: 12px 0; } .flex-between { display: flex; justify-content: space-between; }</style></head>
    <body>
      <div class="text-center font-bold" style="font-size: 22px; margin-bottom: 5px;">G2C POS</div>
      <div class="text-center" style="font-size: 14px; margin-bottom: 15px;">ใบเสร็จรับเงิน</div>
      <div style="font-size: 12px; margin-bottom: 5px;"><span class="font-bold">รหัส:</span> ${displayId}</div>
      <div style="font-size: 12px; margin-bottom: 5px;"><span class="font-bold">วันที่:</span> ${dateStr}</div>
      <div style="font-size: 12px; margin-bottom: 5px;"><span class="font-bold">ลูกค้า:</span> ${getOrderCustomerName(group)}</div>
      ${remarkHtml}
      <hr><div style="margin-bottom: 10px; font-weight: 600; font-size: 13px;">รายการสินค้า</div>${itemsHtml}<hr>
      ${(Number(group.discount) > 0 || Number(group.ar_balance) > 0) ? `<div class="flex-between" style="font-size: 14px; margin-top: 5px; color: #333;"><span>ยอดรวมสินค้า</span><span>€${(Number(group.totalPrice) + Number(group.discount||0) + Number(group.ar_balance||0)).toFixed(2)}</span></div>` : ''}
      ${Number(group.discount) > 0 ? `<div class="flex-between" style="font-size: 14px; margin-top: 5px; color: #C0392B;"><span>ส่วนลด</span><span>-€${Number(group.discount).toFixed(2)}</span></div>` : ''}
      ${Number(group.ar_balance) > 0 ? `<div class="flex-between" style="font-size: 14px; margin-top: 5px; color: #1D4ED8;"><span>AR Balance</span><span>-€${Number(group.ar_balance).toFixed(2)}</span></div>` : ''}
      <div class="flex-between font-bold" style="font-size: 18px; margin-top: 10px;"><span>ยอดสุทธิ</span><span>€${(Number(group.totalPrice)||0).toFixed(2)}</span></div>
      <div class="flex-between" style="font-size: 14px; margin-top: 5px; color: #333;"><span>PV รวม</span><span>${(Number(group.totalPV)||0).toFixed(2)} PV</span></div>
      <hr><div class="text-center" style="font-size: 12px; margin-top: 20px;">ขอบคุณที่ไว้วางใจใช้บริการครับ/ค่ะ</div>
      <script>window.onload = function() { window.print(); setTimeout(() => { window.close(); }, 500); }<\/script>
    </body></html>`;
    
  const printWin = window.open('', '_blank'); 
  printWin.document.open(); 
  printWin.document.write(receiptHtml); 
  printWin.document.close();
}

export function editOrder(id) {
  const order = state.allOrders.find(o => o.id === id);
  if(!order) return;
  Swal.fire({ title: 'แก้ไขออเดอร์?', text: "สินค้าจะถูกนำไปที่ตะกร้าเพื่อแก้ไข", icon: 'info', showCancelButton: true, confirmButtonColor: '#2D6A4F', confirmButtonText: 'ตกลง'
  }).then((res) => {
    if (res.isConfirmed) {
      state.currentEditId = id;
      state.cart = (order.items || []).map(i => ({ ...i, brand: state.allProducts.find(p=>p.name===i.name)?.brand||"ทั่วไป", isSet: false }));
      
      setCustomerSelectValue(getOrderCustomerId(order) || '');
      let safeDateObj = new Date(order.date); if (isNaN(safeDateObj.getTime())) safeDateObj = new Date();
      document.getElementById('orderDate').value = safeDateObj.toISOString().split('T')[0];
      document.getElementById('orderRemark').value = order.remark || '';
      
      if(document.getElementById('paymentStatus')) {
        document.getElementById('paymentStatus').value = order.paymentStatus || 'ยังไม่จ่าย'; 
        togglePaymentOptions();
        if(document.getElementById('paymentMethodFull')) document.getElementById('paymentMethodFull').value = order.paymentMethod || 'เงินสด';
      }
      if(document.getElementById('orderRef')) document.getElementById('orderRef').value = order.orderRef || '';
      if(document.getElementById('discountInput')) document.getElementById('discountInput').value = order.discount || '';
      if(document.getElementById('arBalanceInput')) document.getElementById('arBalanceInput').value = order.ar_balance || '0';
      if(document.getElementById('instTerms')) document.getElementById('instTerms').value = order.instTerms || '';
      // Restore the order's owner into the dropdown (so re-saving keeps it).
      const ownerSel = document.getElementById('orderOwnerSelect');
      if (ownerSel) ownerSel.value = order.owner || (pb.authStore.model ? pb.authStore.model.id : '');

      document.getElementById('editModeBanner').style.display = 'flex';
      document.getElementById('editModeText').innerText = `กำลังแก้ไขรหัส: ${order.orderRef || order.orderNumber || order.id}`;

      // Show the Amway PDF upload area so the user can attach the invoice
      const pdfArea = document.getElementById('amwayPdfUploadArea');
      if (pdfArea) pdfArea.style.display = 'block';
      const pdfFileEl = document.getElementById('amwayPdfFile');
      if (pdfFileEl) pdfFileEl.value = ''; // clear any previous selection

      updateCart();
      updateInstallmentCalc();
      window.switchView('pos');
      if(window.innerWidth <= 900) window.toggleCart();
    }
  });
}

export async function delOrder(id) {
  Swal.fire({ title: 'ยืนยันการลบ?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#DC3545' }).then(async (res) => {
    if (res.isConfirmed) {
      try {
         await pb.collection('orders').delete(id);
         removeOrderFromState(id);
         Swal.fire({ toast: true, position: 'top-end', showConfirmButton: false, timer: 1500, icon: 'success', title: 'ลบสำเร็จ' });
      } catch(e) { Swal.fire('Error', e.message, 'error'); }
    }
  });
}

export function renderInstallments() {
  const list = document.getElementById('installmentList');
  if(!list) return;
  const filter = document.getElementById('instFilter').value;

  // The installments page shows ONLY the logged-in user's own installments —
  // never a downline's. Skip the owner check only when unauthenticated so the
  // screen still renders in any future preview context.
  const uid = pb.authStore.model ? pb.authStore.model.id : null;

  let displayArr = state.allOrders.filter(o => {
     if (uid && o.owner !== uid) return false;
     if (!o.instTerms || Number(o.instTerms) <= 0) return false;
     const paid = Number(o.instPaid) || 0;
     const total = Number(o.totalPrice) || 0;
     if (filter === 'ONGOING') return paid < total;
     if (filter === 'DONE') return paid >= total;
     return true;
  });

  if(displayArr.length === 0) { list.innerHTML = '<div style="padding:40px;text-align:center;color:#999;">ไม่พบรายการผ่อนชำระ</div>'; return; }

  list.innerHTML = displayArr.map(o => {
     let isAuto = o.instType === 'บัญชีลูกค้า';
     let typeBadge = isAuto ? `<span style="background:#E0F2FE; color:#0284C7; padding:2px 8px; border-radius:4px; font-size:0.75rem; white-space:nowrap;">บัญชีลูกค้า (Auto)</span>` : `<span style="background:#FEF3C7; color:#D97706; padding:2px 8px; border-radius:4px; font-size:0.75rem; white-space:nowrap;">ผ่อนกับเรา (Manual)</span>`;
     const paidMonths = getPaidMonths(o);
     const totalPrice = Number(o.totalPrice) || 0;
     const paidAmount = Number(o.instPaid) || 0;
     const remainingBalance = Math.max(0, totalPrice - paidAmount);
     const remainingTerms = Math.max(1, o.instTerms - paidMonths);
     const nextMonthly = remainingBalance > 0 ? (remainingBalance / remainingTerms) : 0;

     let progress = totalPrice > 0 ? Math.min((paidAmount / totalPrice) * 100, 100) : 0;
     let statusText = paidAmount >= totalPrice ? '<span style="color:var(--success); font-weight:700;"><i class="ph-bold ph-check"></i> ผ่อนครบแล้ว</span>' : `<span style="color:var(--accent); font-weight:700;">จ่ายไปแล้ว €${paidAmount.toFixed(2)} / €${totalPrice.toFixed(2)}</span>`;

     const isFullyPaid = paidAmount >= totalPrice;

     let payBtn = '';
     if (!isFullyPaid && !isAuto) {
        payBtn = `<button onclick="payInstallment('${o.id}', ${paidMonths + 1})" class="w-full sm:w-auto" style="background:var(--primary); color:#fff; border:none; padding:8px 15px; border-radius:6px; font-family:inherit; cursor:pointer; font-weight:600; font-size:0.85rem;"><i class="ph-bold ph-check-circle"></i> บันทึกชำระงวดที่ ${paidMonths + 1}</button>`;
     } else if (isFullyPaid) {
        payBtn = `<span style="display:flex; align-items:center; gap:6px; padding:8px 15px; border-radius:6px; background:#D1FAE5; color:#065F46; font-weight:700; font-size:0.85rem;"><i class="ph-bold ph-check-circle"></i> ชำระครบแล้ว</span>`;
     }

     const histBtn = `<button onclick="showInstallmentHistory('${o.id}')" class="w-full sm:w-auto" style="background:#F1F5F9; color:#374151; border:1px solid #CBD5E1; padding:8px 15px; border-radius:6px; font-family:inherit; cursor:pointer; font-weight:600; font-size:0.85rem;"><i class="ph ph-clock-counter-clockwise"></i> ประวัติการชำระเงิน</button>`;

     const displayId = o.orderNumber || o.id;
     const editTermsBtn = !isFullyPaid ? `<button onclick="editInstallmentTerms('${o.id}')" style="background:none; cursor:pointer; color:var(--primary-lt); font-size:0.78rem; padding:2px 8px; border:1px solid var(--border); border-radius:4px; font-family:inherit; white-space:nowrap;"><i class="ph ph-pencil-simple"></i> แก้ไขเดือน</button>` : '';
     const nextMonthlyHtml = !isFullyPaid ? `<span style="color:var(--primary-lt); font-weight:600;">(งวดถัดไป €${nextMonthly.toFixed(2)})</span>` : `<span></span>`;

     return `
      <div style="padding: 20px; border-bottom: 1px solid var(--border);">
        <div class="flex flex-wrap items-start gap-2 mb-2">
          <span style="font-weight:700; color:var(--primary-dk); font-size:1.1rem; line-height:1.4;">👤 ${getOrderCustomerName(o)}</span>
          ${typeBadge}
        </div>
        <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:8px; display:flex; flex-wrap:wrap; align-items:center; gap:4px;">
          <i class="ph-fill ph-receipt"></i>
          <span class="break-all">บิล: ${displayId}</span>
          <span style="white-space:nowrap;">| ยอดรวม: €${totalPrice.toFixed(2)} | ${o.instTerms} เดือน</span>
          ${editTermsBtn}
        </div>
        <div class="flex justify-between items-center mb-2" style="font-size:0.85rem;">
          ${nextMonthlyHtml}
          <span>${statusText}</span>
        </div>
        <div style="background:#E2E8F0; height:8px; border-radius:4px; margin-bottom:15px; overflow:hidden;">
           <div style="background:var(--success); height:100%; width:${progress.toFixed(1)}%; transition:width 0.5s;"></div>
        </div>
        <div class="flex flex-col sm:flex-row justify-end gap-2">
           ${histBtn}
           ${payBtn}
        </div>
      </div>`;
  }).join('');
}

export function payInstallment(orderId, nextTerm) {
   const o = state.allOrders.find(x => x.id === orderId);
   if (!o) return;

   const totalPrice = Number(o.totalPrice) || 0;
   const paidAmount = Number(o.instPaid) || 0;
   const remainingBalance = Math.max(0, totalPrice - paidAmount);
   const remainingTerms = Math.max(1, o.instTerms - getPaidMonths(o));
   const defaultAmount = Number((remainingBalance / remainingTerms).toFixed(2));

   Swal.fire({
      title: `บันทึกชำระงวดที่ ${nextTerm}`,
      html: `
        <div style="text-align:left; margin-bottom:10px; font-size:0.85rem; color:#4B5563; background:#F8FAFC; padding:8px 12px; border-radius:6px; border:1px solid #E2E8F0;">
          ยอดคงเหลือ: <strong style="color:var(--primary);">€${remainingBalance.toFixed(2)}</strong> &nbsp;|&nbsp; งวดที่เหลือ: <strong>${remainingTerms} งวด</strong>
        </div>
        <div style="margin-bottom:8px; text-align:left;">
          <label style="font-size:0.85rem; font-weight:600; color:#374151; display:block; margin-bottom:4px;">ยอดเงินที่รับชำระ (€)</label>
          <input type="number" id="swal-inst-amount" class="c-input" value="${defaultAmount}" min="0.01" step="0.01" style="text-align:right; font-size:1rem; font-weight:700; color:var(--primary-dk);">
        </div>
        <select id="swal-inst-method" class="c-input" style="margin-top:4px;"><option value="เงินสด">เงินสด</option><option value="โอนเงิน">โอนเงิน</option><option value="บัตรเครดิต">บัตรเครดิต</option></select>
      `,
      showCancelButton: true,
      confirmButtonText: 'บันทึกชำระ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#2D6A4F'
   }).then(async res => {
      if(res.isConfirmed) {
         const method = document.getElementById('swal-inst-method').value;
         const amount = Math.max(0.01, parseFloat(document.getElementById('swal-inst-amount').value) || defaultAmount);

         let hist = o.instHistory || [];
         if(typeof hist === 'string') try { hist = JSON.parse(hist); } catch(e) { hist = []; }
         if (!Array.isArray(hist)) hist = [];
         hist.push({ term: nextTerm, date: new Date().toISOString(), method, amount });

         const newInstPaid = Number((paidAmount + amount).toFixed(2));
         const paidMonthsNew = hist.filter(h => h.method && h.method !== 'รอดำเนินการ').length;
         const remainingTermsNew = Math.max(1, (Number(o.instTerms) || 1) - paidMonthsNew);
         const remainingBalanceNew = Math.max(0, totalPrice - newInstPaid);
         const newMonthly = Number((remainingBalanceNew > 0 ? remainingBalanceNew / remainingTermsNew : 0).toFixed(2));
         let payload = { instHistory: hist, instPaid: newInstPaid, instMonthly: newMonthly };
         if (newInstPaid >= totalPrice) payload.paymentStatus = 'จ่ายแล้ว';

         try {
            const record = await pb.collection('orders').update(orderId, payload);
            syncOrderToState(record);
            Swal.fire({ toast: true, position: 'top-end', showConfirmButton: false, timer: 1500, icon: 'success', title: `บันทึกชำระ €${amount.toFixed(2)} สำเร็จ` });
         } catch(e) { Swal.fire('Error', e.message, 'error'); }
      }
   });
}

export function editInstallmentAmount(orderId, histIndex) {
  const o = state.allOrders.find(x => x.id === orderId);
  if (!o) return;

  let hist = o.instHistory || [];
  if (typeof hist === 'string') try { hist = JSON.parse(hist); } catch(e) { hist = []; }
  if (!Array.isArray(hist)) hist = [];

  const entry = hist[histIndex];
  if (!entry) return;
  const currentAmount = Number(entry.amount) || 0;

  Swal.fire({
    title: `แก้ไขยอดงวดที่ ${entry.term}`,
    html: `
      <div style="text-align:left; margin-bottom:8px; font-size:0.85rem; color:#4B5563; background:#F8FAFC; padding:8px 12px; border-radius:6px; border:1px solid #E2E8F0;">
        ยอดเดิม: <strong style="color:var(--primary);">€${currentAmount.toFixed(2)}</strong>
      </div>
      <label style="display:block; text-align:left; font-size:0.85rem; font-weight:600; color:#374151; margin-bottom:4px;">ยอดเงินใหม่ (€)</label>
      <input type="number" id="swal-edit-amount" class="c-input" value="${currentAmount}" min="0" step="0.01" style="text-align:right; font-size:1rem; font-weight:700; color:var(--primary-dk);">
    `,
    showCancelButton: true,
    confirmButtonText: 'บันทึก',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#2D6A4F'
  }).then(async res => {
    if (!res.isConfirmed) return;
    const newAmount = Math.max(0, parseFloat(document.getElementById('swal-edit-amount').value) || 0);
    hist[histIndex] = { ...entry, amount: newAmount };

    const newInstPaid = Number(hist
      .filter(h => h.method && h.method !== 'รอดำเนินการ')
      .reduce((sum, h) => sum + (Number(h.amount) || 0), 0).toFixed(2));
    const totalPrice = Number(o.totalPrice) || 0;
    const paidMonthsNew = hist.filter(h => h.method && h.method !== 'รอดำเนินการ').length;
    const remainingTermsNew = Math.max(1, (Number(o.instTerms) || 1) - paidMonthsNew);
    const remainingBalanceNew = Math.max(0, totalPrice - newInstPaid);
    const newMonthly = Number((remainingBalanceNew > 0 ? remainingBalanceNew / remainingTermsNew : 0).toFixed(2));
    let payload = { instHistory: hist, instPaid: newInstPaid, instMonthly: newMonthly };
    if (newInstPaid >= totalPrice) payload.paymentStatus = 'จ่ายแล้ว';
    else if (o.paymentStatus === 'จ่ายแล้ว') payload.paymentStatus = 'ผ่อน';

    try {
      const record = await pb.collection('orders').update(orderId, payload);
      syncOrderToState(record);
      Swal.fire({ toast: true, position: 'top-end', showConfirmButton: false, timer: 1500, icon: 'success', title: 'แก้ไขยอดสำเร็จ' });
    } catch(e) { Swal.fire('Error', e.message, 'error'); }
  });
}

export function deleteInstallmentPayment(orderId, histIndex) {
  const o = state.allOrders.find(x => x.id === orderId);
  if (!o) return;

  let hist = o.instHistory || [];
  if (typeof hist === 'string') try { hist = JSON.parse(hist); } catch(e) { hist = []; }
  if (!Array.isArray(hist)) hist = [];

  const entry = hist[histIndex];
  if (!entry) return;

  Swal.fire({
    title: 'ยืนยันการลบ?',
    html: `ต้องการลบประวัติการรับชำระงวดที่ <strong>${entry.term}</strong> ยอด <strong>€${Number(entry.amount).toFixed(2)}</strong> ใช่หรือไม่?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#DC2626',
    confirmButtonText: 'ลบรายการนี้',
    cancelButtonText: 'ยกเลิก'
  }).then(async res => {
    if (!res.isConfirmed) return;

    hist.splice(histIndex, 1);

    const newInstPaid = Number(hist
      .filter(h => h.method && h.method !== 'รอดำเนินการ')
      .reduce((sum, h) => sum + (Number(h.amount) || 0), 0).toFixed(2));
    const totalPrice = Number(o.totalPrice) || 0;
    const paidMonthsNew = hist.filter(h => h.method && h.method !== 'รอดำเนินการ').length;
    const remainingTermsNew = Math.max(1, (Number(o.instTerms) || 1) - paidMonthsNew);
    const remainingBalanceNew = Math.max(0, totalPrice - newInstPaid);
    const newMonthly = Number((remainingBalanceNew > 0 ? remainingBalanceNew / remainingTermsNew : 0).toFixed(2));

    let payload = { instHistory: hist, instPaid: newInstPaid, instMonthly: newMonthly };
    if (newInstPaid >= totalPrice) payload.paymentStatus = 'จ่ายแล้ว';
    else if (o.paymentStatus === 'จ่ายแล้ว') payload.paymentStatus = 'ผ่อน';

    try {
      const record = await pb.collection('orders').update(orderId, payload);
      syncOrderToState(record);
      Swal.fire({ toast: true, position: 'top-end', showConfirmButton: false, timer: 1500, icon: 'success', title: 'ลบรายการสำเร็จ' });
    } catch(e) { Swal.fire('Error', e.message, 'error'); }
  });
}

export function showInstallmentHistory(orderId) {
  const o = state.allOrders.find(x => x.id === orderId);
  if (!o) return;

  let hist = o.instHistory || [];
  if (typeof hist === 'string') try { hist = JSON.parse(hist); } catch(e) { hist = []; }
  if (!Array.isArray(hist)) hist = [];

  const realPayments = hist.filter(h => h.method && h.method !== 'รอดำเนินการ' && h.amount != null);
  if (realPayments.length === 0) {
    Swal.fire({ title: 'ประวัติการชำระเงิน', text: 'ยังไม่มีประวัติการชำระ', icon: 'info' });
    return;
  }

  const rows = hist
    .map((h, originalIdx) => ({ h, originalIdx }))
    .filter(({ h }) => h.method && h.method !== 'รอดำเนินการ' && h.amount != null)
    .map(({ h, originalIdx }, displayIdx) => {
      let dObj = new Date(h.date); let safeDateObj = isNaN(dObj.getTime()) ? new Date() : dObj;
      const dateStr = safeDateObj.toLocaleDateString('th-TH');
      const editBtn = `<button onclick="editInstallmentAmount('${o.id}', ${originalIdx})" style="background:none; border:1px solid #CBD5E1; border-radius:4px; padding:2px 8px; font-size:0.78rem; color:#475569; cursor:pointer; font-family:inherit;"><i class="ph ph-pencil-simple"></i></button>`;
      const deleteBtn = `<button onclick="deleteInstallmentPayment('${o.id}', ${originalIdx})" style="background:none; border:1px solid #FCA5A5; border-radius:4px; padding:2px 8px; font-size:0.78rem; color:#DC2626; cursor:pointer; font-family:inherit; margin-left:4px;"><i class="ph ph-trash"></i></button>`;
      return `<tr style="border-top:1px solid #E2E8F0;">
        <td style="padding:8px 10px; font-weight:600; color:#1E3A5F; white-space:nowrap;">งวดที่ ${displayIdx + 1}</td>
        <td style="padding:8px 10px; color:#374151; white-space:nowrap;">${dateStr}</td>
        <td style="padding:8px 10px; color:#374151;">${h.method}</td>
        <td style="padding:8px 10px; text-align:right; font-weight:700; color:#2D6A4F; white-space:nowrap;">€${Number(h.amount).toFixed(2)}</td>
        <td style="padding:8px 10px; text-align:center; white-space:nowrap;">${editBtn}${deleteBtn}</td>
      </tr>`;
    }).join('');

  const displayId = o.orderNumber || o.id;

  Swal.fire({
    title: 'ประวัติการชำระเงิน',
    html: `
      <div style="font-size:0.82rem; color:#64748B; margin-bottom:10px; text-align:left;">บิล: <strong>${displayId}</strong> &nbsp;|&nbsp; ลูกค้า: <strong>${getOrderCustomerName(o)}</strong></div>
      <div style="overflow-x:auto;">
        <table style="width:100%; font-size:0.85rem; border-collapse:collapse; text-align:left;">
          <thead><tr style="background:#F1F5F9;">
            <th style="padding:8px 10px; color:#64748B; font-weight:600; font-size:0.78rem;">งวด</th>
            <th style="padding:8px 10px; color:#64748B; font-weight:600; font-size:0.78rem;">วันที่</th>
            <th style="padding:8px 10px; color:#64748B; font-weight:600; font-size:0.78rem;">ช่องทาง</th>
            <th style="padding:8px 10px; text-align:right; color:#64748B; font-weight:600; font-size:0.78rem;">ยอด</th>
            <th style="padding:8px 10px;"></th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `,
    showConfirmButton: false,
    showCloseButton: true,
    width: '520px'
  });
}

export function editInstallmentTerms(orderId) {
  const o = state.allOrders.find(x => x.id === orderId);
  if (!o) return;

  const currentTerms = Number(o.instTerms) || 1;
  const paidMonths = getPaidMonths(o);
  const paidAmount = Number(o.instPaid) || 0;
  const totalPrice = Number(o.totalPrice) || 0;
  const remainingBalance = Math.max(0, totalPrice - paidAmount);
  const minTerms = paidMonths + 1;

  Swal.fire({
    title: 'แก้ไขจำนวนเดือน',
    html: `
      <div style="text-align:left; margin-bottom:10px; font-size:0.85rem; color:#4B5563; background:#F8FAFC; padding:8px 12px; border-radius:6px; border:1px solid #E2E8F0;">
        จ่ายไปแล้ว <strong>${paidMonths} งวด</strong> &nbsp;|&nbsp; ยอดคงเหลือ: <strong style="color:var(--primary);">€${remainingBalance.toFixed(2)}</strong>
      </div>
      <label style="display:block; text-align:left; font-size:0.85rem; font-weight:600; color:#374151; margin-bottom:4px;">จำนวนเดือนทั้งหมด (ขั้นต่ำ ${minTerms} เดือน)</label>
      <input type="number" id="swal-edit-terms" class="c-input" value="${currentTerms}" min="${minTerms}" step="1" style="text-align:center; font-size:1rem; font-weight:700;">
      <div id="swal-monthly-preview" style="margin-top:10px; text-align:center; font-size:0.9rem; color:var(--primary-lt); font-weight:600; padding:6px; background:#EEF2FF; border-radius:6px;"></div>
    `,
    didOpen: () => {
      const input = document.getElementById('swal-edit-terms');
      const preview = document.getElementById('swal-monthly-preview');
      const updatePreview = () => {
        const newTerms = Math.max(minTerms, parseInt(input.value) || minTerms);
        const remaining = newTerms - paidMonths;
        const monthly = remaining > 0 ? remainingBalance / remaining : 0;
        preview.innerText = `ยอดผ่อนต่อเดือน (ใหม่): €${monthly.toFixed(2)} / เดือน`;
      };
      input.addEventListener('input', updatePreview);
      updatePreview();
    },
    showCancelButton: true,
    confirmButtonText: 'บันทึก',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#2D6A4F'
  }).then(async res => {
    if (!res.isConfirmed) return;
    const newTerms = Math.max(minTerms, parseInt(document.getElementById('swal-edit-terms').value) || currentTerms);
    const remainingTerms = Math.max(1, newTerms - paidMonths);
    const newMonthly = Number((remainingBalance / remainingTerms).toFixed(2));

    try {
      const record = await pb.collection('orders').update(orderId, { instTerms: newTerms, instMonthly: newMonthly });
      syncOrderToState(record);
      Swal.fire({ toast: true, position: 'top-end', showConfirmButton: false, timer: 1500, icon: 'success', title: 'แก้ไขจำนวนเดือนสำเร็จ' });
    } catch(e) { Swal.fire('Error', e.message, 'error'); }
  });
}


