import { state } from './state.js';
import { pb } from './api.js';
import { clearCart, updateCart } from './pos.js';
import { closeAllPanels, togglePaymentOptions } from './ui.js';
import { renderCustomers } from './customers.js';

function getPaidMonths(o) {
  let hist = o.instHistory || [];
  if (typeof hist === 'string') try { hist = JSON.parse(hist); } catch(e) { hist = []; }
  if (!Array.isArray(hist)) hist = [];
  return hist.filter(h => h.method && h.method !== 'รอดำเนินการ').length;
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
  const customerName = document.getElementById('customerSelect').value;
  if(!customerName) return Swal.fire({icon:'warning', title:'กรุณาเลือกลูกค้า'});
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
  const subtotal = Number(explodedCart.reduce((s, i) => s + (i.price * i.qty), 0).toFixed(2));
  const netTotalPrice = Number(Math.max(0, subtotal - discount).toFixed(2));

  const instTermsVal = paymentStatus === 'ผ่อน' ? Math.max(1, Number(document.getElementById('instTerms').value) || 1) : 0;
  const instMonthly = instTermsVal > 0 ? Number((netTotalPrice / instTermsVal).toFixed(2)) : 0;

  const payload = {
    orderNumber: state.currentEditId ? undefined : 'OR-' + Date.now(),
    customerName: customerName,
    orderDate: new Date(orderDate).toISOString(),
    remark: document.getElementById('orderRemark').value,
    items: explodedCart,
    discount: discount,
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
    owner: pb.authStore.model ? pb.authStore.model.id : null
  };

  Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  
  try {
    if (state.currentEditId) {
        await pb.collection('orders').update(state.currentEditId, payload);
    } else {
        await pb.collection('orders').create(payload);
    }
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
  document.getElementById('customerSelect').value = ''; 
  if(document.getElementById('orderRef')) document.getElementById('orderRef').value = ''; 
  if(document.getElementById('paymentStatus')) document.getElementById('paymentStatus').value = 'ยังไม่จ่าย';
  if(document.getElementById('discountInput')) document.getElementById('discountInput').value = '';
  if(document.getElementById('instTerms')) document.getElementById('instTerms').value = '';
  const calcDisplay = document.getElementById('instCalcDisplay'); if(calcDisplay) calcDisplay.style.display = 'none';

  togglePaymentOptions();
  closeAllPanels();
}

export function updateDashboard() {
  const monthVal = document.getElementById('dashMonth').value;
  if (!monthVal) return;
  const [filterY, filterM] = monthVal.split('-');
  const targetYear = parseInt(filterY), targetMonth = parseInt(filterM) - 1; 

  let sumEuro = 0, sumPV = 0;
  state.allOrders.forEach(o => {
    let safeDateObj = new Date(o.date); if(isNaN(safeDateObj.getTime())) safeDateObj = new Date();
    if(safeDateObj.getMonth() === targetMonth && safeDateObj.getFullYear() === targetYear) { sumEuro += Number(o.totalPrice) || 0; sumPV += Number(o.totalPV) || 0; }
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
    let safeDateObj = new Date(o.date); if(isNaN(safeDateObj.getTime())) safeDateObj = new Date();
    let matchDate = (safeDateObj.getMonth() === targetMonth && safeDateObj.getFullYear() === targetYear);
    let matchCus = (cus === 'ALL' || o.customer === cus);
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
            <div style="font-size:0.85rem; color:var(--text-muted);">👤 ${g.customer} &nbsp;|&nbsp; 📅 ${dStr}</div>
            ${refHtml}
          </div>
          <div style="text-align:right;">
            <div style="font-size:1.25rem; font-weight:700; color:var(--primary);">€${(Number(g.totalPrice)||0).toFixed(2)}</div>
            <div style="font-size:0.85rem; font-weight:600; color:var(--accent);">${(Number(g.totalPV)||0).toFixed(2)} PV</div>
          </div>
        </div>
        <div style="background:#F8FAFC; padding:12px 15px; border-radius:8px; margin-bottom:12px; border: 1px solid #E2E8F0;">${itemsHtml}</div>
        ${g.remark ? `<div style="font-size:0.85rem; color:#92400E; background:#FFFBEB; padding:8px 12px; border-radius:6px; margin-bottom:12px; border: 1px solid #FDE68A;"><i class="ph-fill ph-note" style="color:#D97706;"></i> <span style="font-weight:600;">หมายเหตุ:</span> ${g.remark}</div>` : ''}
        <div style="display:flex; gap:15px; justify-content: flex-end; flex-wrap: wrap;">
          ${quickPayBtn}
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
         await pb.collection('orders').update(orderId, payload);
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
      <div style="font-size: 12px; margin-bottom: 5px;"><span class="font-bold">ลูกค้า:</span> ${group.customer}</div>
      ${remarkHtml}
      <hr><div style="margin-bottom: 10px; font-weight: 600; font-size: 13px;">รายการสินค้า</div>${itemsHtml}<hr>
      ${Number(group.discount) > 0 ? `<div class="flex-between" style="font-size: 14px; margin-top: 5px; color: #333;"><span>ยอดรวมสินค้า</span><span>€${(Number(group.totalPrice) + Number(group.discount)).toFixed(2)}</span></div><div class="flex-between" style="font-size: 14px; margin-top: 5px; color: #C0392B;"><span>ส่วนลด</span><span>-€${Number(group.discount).toFixed(2)}</span></div>` : ''}
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
      
      document.getElementById('customerSelect').value = order.customer;
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
      if(document.getElementById('instTerms')) document.getElementById('instTerms').value = order.instTerms || '';

      document.getElementById('editModeBanner').style.display = 'flex';
      document.getElementById('editModeText').innerText = `กำลังแก้ไขรหัส: ${id}`;
      
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
         Swal.fire({ toast: true, position: 'top-end', showConfirmButton: false, timer: 1500, icon: 'success', title: 'ลบสำเร็จ' });
      } catch(e) { Swal.fire('Error', e.message, 'error'); }
    }
  });
}

export function renderInstallments() {
  const list = document.getElementById('installmentList');
  if(!list) return;
  const filter = document.getElementById('instFilter').value;
  
  let displayArr = state.allOrders.filter(o => {
     if(o.paymentStatus !== 'ผ่อน') return false;
     if(filter === 'ONGOING') return getPaidMonths(o) < o.instTerms;
     if(filter === 'DONE') return getPaidMonths(o) >= o.instTerms;
     return true;
  });

  if(displayArr.length === 0) { list.innerHTML = '<div style="padding:40px;text-align:center;color:#999;">ไม่พบรายการผ่อนชำระ</div>'; return; }

  list.innerHTML = displayArr.map(o => {
     let isAuto = o.instType === 'บัญชีลูกค้า';
     let typeBadge = isAuto ? `<span style="background:#E0F2FE; color:#0284C7; padding:2px 8px; border-radius:4px; font-size:0.75rem;">บัญชีลูกค้า (Auto)</span>` : `<span style="background:#FEF3C7; color:#D97706; padding:2px 8px; border-radius:4px; font-size:0.75rem;">ผ่อนกับเรา (Manual)</span>`;
     const paidMonths = getPaidMonths(o);
     const totalPrice = Number(o.totalPrice) || 0;
     const paidAmount = Number(o.instPaid) || 0;
     const remainingBalance = Math.max(0, totalPrice - paidAmount);
     const remainingTerms = Math.max(1, o.instTerms - paidMonths);
     const nextMonthly = remainingBalance > 0 ? (remainingBalance / remainingTerms) : 0;

     let progress = totalPrice > 0 ? Math.min((paidAmount / totalPrice) * 100, 100) : 0;
     let statusText = paidAmount >= totalPrice ? '<span style="color:var(--success); font-weight:700;"><i class="ph-bold ph-check"></i> ผ่อนครบแล้ว</span>' : `<span style="color:var(--accent); font-weight:700;">จ่ายไปแล้ว €${paidAmount.toFixed(2)} / €${totalPrice.toFixed(2)}</span>`;

     let actionBtn = '';
     if (!isAuto && paidAmount < totalPrice) {
        actionBtn = `<button onclick="payInstallment('${o.id}', ${paidMonths + 1})" style="background:var(--primary); color:#fff; border:none; padding:8px 15px; border-radius:6px; font-family:inherit; cursor:pointer; font-weight:600; font-size:0.85rem;"><i class="ph-bold ph-check-circle"></i> บันทึกชำระงวดที่ ${paidMonths + 1}</button>`;
     }

     let historyArr = [];
     try { historyArr = JSON.parse(o.instHistory || "[]"); } catch(e){}
     if (!Array.isArray(historyArr)) historyArr = [];

     let historyHtml = historyArr.map(h => {
         let dObj = new Date(h.date); let safeDateObj = isNaN(dObj.getTime()) ? new Date() : dObj;
         const amountStr = h.amount != null ? ` — <strong>€${Number(h.amount).toFixed(2)}</strong>` : '';
         return `<div style="font-size:0.8rem; color:#666; margin-top:4px;">งวด ${h.term}: ${safeDateObj.toLocaleDateString('th-TH')} (${h.method})${amountStr}</div>`;
     }).join('');

     const displayId = o.orderNumber || o.id;

     return `
      <div style="padding: 20px; border-bottom: 1px solid var(--border);">
        <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
           <div>
              <div style="font-weight:700; color:var(--primary-dk); font-size:1.1rem; margin-bottom:5px;">👤 ${o.customer} ${typeBadge}</div>
              <div style="font-size:0.85rem; color:var(--text-muted);"><i class="ph-fill ph-receipt"></i> บิล: ${displayId} | ยอดรวม: €${totalPrice.toFixed(2)} | ${o.instTerms} เดือน <span style="color:var(--primary-lt); font-weight:600;">(งวดถัดไป €${nextMonthly.toFixed(2)})</span></div>
           </div>
           <div style="text-align:right;">${statusText}</div>
        </div>
        <div style="background:#E2E8F0; height:8px; border-radius:4px; margin-bottom:15px; overflow:hidden;">
           <div style="background:var(--success); height:100%; width:${progress.toFixed(1)}%; transition:width 0.5s;"></div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:flex-end;">
           <div>${historyHtml}</div><div>${actionBtn}</div>
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
         let payload = { instHistory: hist, instPaid: newInstPaid };
         if (newInstPaid >= totalPrice) payload.paymentStatus = 'จ่ายแล้ว';

         try {
            await pb.collection('orders').update(orderId, payload);
            Swal.fire({ toast: true, position: 'top-end', showConfirmButton: false, timer: 1500, icon: 'success', title: `บันทึกชำระ €${amount.toFixed(2)} สำเร็จ` });
         } catch(e) { Swal.fire('Error', e.message, 'error'); }
      }
   });
}


