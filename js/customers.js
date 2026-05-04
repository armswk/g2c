// frontend/js/customers.js
import { state } from './state.js';
import { pb } from './api.js';
import { parseCustomerData } from './utils.js';
import { updateDashboard, renderInstallments } from './orders.js';

export function populateSelects() {
  const cSel = document.getElementById('customerSelect'); const dSel = document.getElementById('dashCustomerSelect');
  if(!cSel || !dSel) return;
  cSel.innerHTML = '<option value="">-- เลือกลูกค้าที่มีอยู่ --</option>'; dSel.innerHTML = '<option value="ALL">ลูกค้าทั้งหมด</option>';
  state.allCustomers.forEach(c => {
    const parsed = parseCustomerData(c); const displayName = parsed.phone ? `${c.name} (${parsed.phone})` : c.name;
    cSel.innerHTML += `<option value="${c.name}">${displayName}</option>`; dSel.innerHTML += `<option value="${c.name}">${displayName}</option>`;
  });
}

export function renderCustomers() {
  const monthVal = document.getElementById('cusMonth').value;
  if (!monthVal) return;
  const [filterY, filterM] = monthVal.split('-'); const targetYear = parseInt(filterY), targetMonth = parseInt(filterM) - 1;
  const stats = {}; state.allCustomers.forEach(c => { stats[c.name] = { total: 0, pv: 0 }; });
  state.allOrders.forEach(o => {
    let safeDateObj = new Date(o.date); if(isNaN(safeDateObj.getTime())) safeDateObj = new Date();
    if(safeDateObj.getMonth() === targetMonth && safeDateObj.getFullYear() === targetYear) {
      if(stats[o.customer]) { stats[o.customer].total += Number(o.totalPrice) || 0; stats[o.customer].pv += Number(o.totalPV) || 0; }
    }
  });
  const list = document.getElementById('customerList'); if (!list) return;
  if (state.allCustomers.length === 0) { list.innerHTML = '<div style="grid-column:1/-1; padding:40px;text-align:center;color:#999;font-size:1.1rem;">ยังไม่มีข้อมูลลูกค้าในระบบ</div>'; return; }

  list.innerHTML = state.allCustomers.map(c => {
    const s = stats[c.name] || { total: 0, pv: 0 }; const initial = c.name ? c.name.charAt(0).toUpperCase() : '?';
    const { socials, phone } = parseCustomerData(c);
    const socialHtml = socials.map(soc => {
       let icon = 'ph-link', color = '#6B7280';
       if(soc.type === 'Line') { icon = 'ph-chat-circle-text'; color = '#00B900'; }
       if(soc.type === 'Facebook') { icon = 'ph-facebook-logo'; color = '#1877F2'; }
       if(soc.type === 'Whatsapp') { icon = 'ph-whatsapp-logo'; color = '#25D366'; }
       if(soc.type === 'Instagram') { icon = 'ph-instagram-logo'; color = '#E4405F'; }
       let isLink = soc.value.startsWith('http') || soc.value.includes('.com') || soc.value.includes('.me') || soc.value.includes('fb.com') || soc.value.includes('ig.me');
       let href = soc.value.startsWith('http') ? soc.value : 'https://' + soc.value;
       return isLink ? `<a href="${href}" target="_blank" style="display:inline-flex; align-items:center; gap:4px; margin-right:12px; margin-bottom:8px; font-size:0.8rem; color:${color}; text-decoration:none; font-weight:600; background: ${color}15; padding: 4px 10px; border-radius: 12px;"><i class="ph-fill ${icon}"></i> ${soc.value.length > 25 ? 'ดูโปรไฟล์' : soc.value}</a>` : `<div style="display:inline-flex; align-items:center; gap:4px; margin-right:12px; margin-bottom:8px; font-size:0.85rem; color:var(--text-muted);"><i class="ph-fill ${icon}" style="color:${color};"></i> ${soc.value}</div>`;
    }).join('');
    const phoneHtml = phone ? `<div style="font-size:0.85rem; color:var(--text-muted); margin-bottom:6px; display:flex; align-items:center; gap:6px;"><i class="ph-fill ph-phone" style="color:var(--primary); font-size:1.1rem;"></i> ${phone}</div>` : '';
    const remarkHtml = c.remark ? `<div style="font-size:0.85rem; color:#92400E; margin-top:8px; padding: 8px 12px; background: #FEF3C7; border-radius: 6px;"><i class="ph-fill ph-note-pencil"></i> ${c.remark}</div>` : '';
    const mapHtml = c.mapUrl ? `<a href="${c.mapUrl}" target="_blank" style="display:inline-flex; align-items:center; gap:6px; margin-top:8px; margin-right:8px; font-size:0.85rem; color:#fff; background:var(--primary-lt); text-decoration:none; padding:6px 12px; border-radius:6px; font-weight:600;"><i class="ph-fill ph-map-pin-line"></i> นำทางแผนที่</a>` : '';
    let dobHtml = '';
    if (c.dob) {
        let d = new Date(c.dob); if (!isNaN(d.getTime())) dobHtml = `<div style="font-size:0.85rem; color:var(--text-muted); margin-bottom:6px; display:flex; align-items:center; gap:6px;"><i class="ph-fill ph-cake" style="color:#F59E0B; font-size:1.1rem;"></i> วันเกิด: ${d.toLocaleDateString('th-TH', {day:'numeric', month:'long', year:'numeric'})}</div>`;
    }
    let addressHtml = c.address ? `<div style="font-size:0.85rem; color:var(--text-muted); margin-top:8px; background:#F8FAFC; padding:8px 12px; border-radius:6px; border:1px solid var(--border); display:flex; gap:6px;"><i class="ph-fill ph-map-pin" style="color:var(--danger); flex-shrink:0;"></i> <span>${c.address}</span></div>` : '';
    
    let statusBadge = c.status === 'ABO' ? `<span style="background:var(--primary-lt); color:#fff; padding:2px 8px; border-radius:12px; font-size:0.75rem; margin-left:8px;">ABO</span>` : 
                      c.status === 'Pending' ? `<span style="background:var(--warning); color:#fff; padding:2px 8px; border-radius:12px; font-size:0.75rem; margin-left:8px;">รอสมัคร</span>` : 
                      `<span style="background:#E2E8F0; color:#475569; padding:2px 8px; border-radius:12px; font-size:0.75rem; margin-left:8px;">Member</span>`;

    return `
      <div class="customer-card" style="padding: 20px;">
        <div style="display: flex; align-items: flex-start; gap: 15px; margin-bottom: 15px;"><div style="width: 50px; height: 50px; border-radius: 50%; background: var(--primary-lt); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: 700; flex-shrink: 0;">${initial}</div><div style="flex:1; overflow:hidden;"><div style="font-weight:700; font-size:1.15rem; color:var(--primary-dk); margin-bottom: 6px;">${c.name} ${statusBadge}</div>${phoneHtml}${dobHtml}<div style="display:flex; flex-wrap:wrap; margin-top:4px;">${socialHtml}</div>${addressHtml}${remarkHtml}${mapHtml}</div></div>
        <div style="background: #F8FAFC; padding: 15px; border-radius: 8px; margin-bottom: 15px; border: 1px solid var(--border);"><div style="display:flex; justify-content:space-between; margin-bottom:8px; align-items: center;"><span style="font-size:0.85rem; color:var(--text-muted); font-weight:600;">ยอดซื้อเดือนที่เลือก</span><span style="font-size:1.2rem; font-weight:700; color:var(--primary);">€${s.total.toFixed(2)}</span></div><div style="display:flex; justify-content:space-between; align-items: center;"><span style="font-size:0.85rem; color:var(--text-muted); font-weight:600;">PV รวม</span><span style="font-size:1rem; font-weight:700; color:var(--accent);">${s.pv.toFixed(2)} PV</span></div></div>
        <div style="display: flex; justify-content: flex-end; gap: 20px; border-top: 1px solid var(--border); padding-top: 15px;"><span style="font-size:0.85rem; color:var(--primary-lt); cursor:pointer; font-weight:600; display:flex; align-items:center; gap:5px;" onclick="showCustomerModal('${c.id}')"><i class="ph ph-pencil-simple"></i> แก้ไข</span><span style="font-size:0.85rem; color:var(--danger); cursor:pointer; font-weight:600; display:flex; align-items:center; gap:5px;" onclick="delCustomer('${c.id}')"><i class="ph ph-trash"></i> ลบ</span></div>
      </div>`;
  }).join('');
}

export function addSwalSocialRow(type = 'Line', val = '') {
  const container = document.getElementById('swal-socials-container');
  const div = document.createElement('div'); div.className = 'social-row'; div.style.display = 'flex'; div.style.gap = '8px'; div.style.marginBottom = '10px';
  div.innerHTML = `<select class="c-input social-type" style="margin:0; width:35%; cursor:pointer;"><option value="Line" ${type==='Line'?'selected':''}>Line</option><option value="Facebook" ${type==='Facebook'?'selected':''}>Facebook</option><option value="Whatsapp" ${type==='Whatsapp'?'selected':''}>Whatsapp</option><option value="Instagram" ${type==='Instagram'?'selected':''}>Instagram</option></select><input type="text" class="c-input social-val" placeholder="ID หรือ ลิงก์โปรไฟล์" value="${val}" style="margin:0; flex:1;"><button type="button" onclick="this.parentElement.remove()" style="background:none; border:none; color:var(--danger); cursor:pointer; font-size:1.2rem; padding:0 5px;"><i class="ph-bold ph-trash"></i></button>`;
  container.appendChild(div);
}

export function showCustomerModal(id = null) {
  let cName = '', cPhone = '', cRemark = '', cMap = '', cDob = '', cAddress = '', cSocials = [], cStatus = 'Member', modalTitle = 'เพิ่มลูกค้าใหม่', icon = 'ph-user-plus';
  if (id) {
    const c = state.allCustomers.find(x => x.id === id);
    if (c) { 
       cName = c.name; const parsed = parseCustomerData(c); cPhone = parsed.phone; cSocials = parsed.socials; 
       cRemark = c.remark || ''; cMap = c.mapUrl || ''; 
       cDob = c.dob ? new Date(c.dob).toISOString().split('T')[0] : '';
       cAddress = c.address || ''; cStatus = c.status || 'Member';
       modalTitle = 'แก้ไขข้อมูลลูกค้า'; icon = 'ph-pencil-simple'; 
    }
  }
  Swal.fire({
    title: `<div style="font-family: 'Sarabun', sans-serif; color: var(--primary-dk); font-weight: 700; font-size: 1.4rem;"><i class="ph-fill ${icon}" style="font-size: 2.5rem; color: var(--primary-lt); display: block; margin-bottom: 10px;"></i>${modalTitle}</div>`,
    html: `
      <div style="text-align: left; padding-top: 15px; font-family: 'Sarabun', sans-serif;">
        <div style="margin-bottom: 15px;"><label style="display: block; font-size: 0.9rem; font-weight: 600; color: var(--text-muted); margin-bottom: 6px;">ชื่อ-นามสกุล <span style="color: var(--danger);">*</span></label><input type="text" id="swal-cus-name" class="c-input" placeholder="เช่น คุณสมชาย ใจดี" value="${cName}" style="margin:0;"></div>
        <div style="display: flex; gap: 10px; margin-bottom: 15px;">
           <div style="flex: 1;"><label style="display: block; font-size: 0.9rem; font-weight: 600; color: var(--text-muted); margin-bottom: 6px;">เบอร์โทรศัพท์</label><input type="tel" id="swal-cus-phone" class="c-input" placeholder="081XXXXXXX" value="${cPhone}" style="margin:0;"></div>
           <div style="flex: 1;"><label style="display: block; font-size: 0.9rem; font-weight: 600; color: var(--text-muted); margin-bottom: 6px;">วันเดือนปีเกิด</label><input type="date" id="swal-cus-dob" class="c-input" value="${cDob}" style="margin:0;"></div>
        </div>
        <div style="margin-bottom: 15px;"><label style="display: flex; justify-content: space-between; align-items: center; font-size: 0.9rem; font-weight: 600; color: var(--text-muted); margin-bottom: 10px; padding-top: 15px; border-top: 1px solid var(--border);">ช่องทางติดต่ออื่นๆ (Social)<span onclick="addSwalSocialRow()" style="color: var(--primary); font-size: 0.8rem; cursor: pointer; font-weight: 700; background: #E8F5E9; padding: 4px 10px; border-radius: 12px;">+ เพิ่มช่องทาง</span></label><div id="swal-socials-container"></div></div>
        <div style="margin-bottom: 15px;"><label style="display: block; font-size: 0.9rem; font-weight: 600; color: var(--text-muted); margin-bottom: 6px;">ที่อยู่จัดส่ง</label><textarea id="swal-cus-address" class="c-input" placeholder="ระบุที่อยู่..." rows="2" style="margin:0; resize: vertical;">${cAddress}</textarea></div>
        <div style="margin-bottom: 15px;"><label style="display: block; font-size: 0.9rem; font-weight: 600; color: var(--text-muted); margin-bottom: 6px;">หมายเหตุ / ข้อมูลเพิ่มเติม</label><textarea id="swal-cus-remark" class="c-input" placeholder="เช่น ลูกค้า VIP..." rows="2" style="margin:0; resize: vertical;">${cRemark}</textarea></div>
        <div style="display: flex; gap: 10px; margin-bottom: 10px;">
            <div style="flex: 1;"><label style="display: block; font-size: 0.9rem; font-weight: 600; color: var(--text-muted); margin-bottom: 6px;">ลิงก์ Google Maps</label><input type="url" id="swal-cus-map" class="c-input" placeholder="วางลิงก์แผนที่ร้านที่นี่..." value="${cMap}" style="margin:0;"></div>
            <div style="flex: 1;"><label style="display: block; font-size: 0.9rem; font-weight: 600; color: var(--text-muted); margin-bottom: 6px;">สถานะลูกค้า</label>
                <select id="swal-cus-status" class="c-select" style="margin:0;">
                    <option value="Member" ${cStatus==='Member'?'selected':''}>ลูกค้าราคาเต็ม (Member)</option>
                    <option value="Pending" ${cStatus==='Pending'?'selected':''}>รอสมัคร ABO</option>
                    <option value="ABO" ${cStatus==='ABO'?'selected':''}>นักธุรกิจ (ABO)</option>
                </select>
            </div>
        </div>
      </div>`,
    didOpen: () => { if(cSocials.length > 0) { cSocials.forEach(s => addSwalSocialRow(s.type, s.value)); } else { addSwalSocialRow(); } },
    focusConfirm: false, showCancelButton: true, confirmButtonText: 'บันทึกข้อมูล', cancelButtonText: 'ยกเลิก', confirmButtonColor: '#2D6A4F',
    preConfirm: () => {
      const name = document.getElementById('swal-cus-name').value.trim(); const phone = document.getElementById('swal-cus-phone').value.trim(); const remark = document.getElementById('swal-cus-remark').value.trim(); const mapUrl = document.getElementById('swal-cus-map').value.trim();
      const dob = document.getElementById('swal-cus-dob').value; const address = document.getElementById('swal-cus-address').value.trim();
      const status = document.getElementById('swal-cus-status').value;
      const socialRows = document.querySelectorAll('.social-row'); const socials = [];
      socialRows.forEach(row => { const type = row.querySelector('.social-type').value; const val = row.querySelector('.social-val').value.trim(); if(val) socials.push({ type, value: val }); });
      if (!name) { Swal.showValidationMessage('⚠️ กรุณากรอกชื่อลูกค้า'); return false; }
      return { name, channel: socials, phone, remark, mapUrl, dob: dob ? new Date(dob).toISOString() : null, address, status };
    }
  }).then((result) => { if (result.isConfirmed) saveCustomer(result.value, id); });
}

export async function saveCustomer(data, id) {
  try {
    // 🔥 แนบไอดีเจ้าของ (Owner) ไปด้วย ถ้าเป็นการสร้างใหม่
    if(!id && pb.authStore.model) {
        data.owner = pb.authStore.model.id;
    }

    if(id) {
        await pb.collection('customers').update(id, data);
    } else {
        await pb.collection('customers').create(data);
    }
    Swal.fire({ toast: true, position: 'top-end', showConfirmButton: false, timer: 1500, icon: 'success', title: 'บันทึกสำเร็จ' });
  } catch (e) { Swal.fire('Error', e.message, 'error'); }
}

export function delCustomer(id) {
  Swal.fire({ title: 'ยืนยันการลบ?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#DC3545' }).then(async res => {
    if (res.isConfirmed) {
      try {
        await pb.collection('customers').delete(id);
        Swal.fire({ toast: true, position: 'top-end', showConfirmButton: false, timer: 1500, icon: 'success', title: 'ลบสำเร็จ' });
      } catch(e) { Swal.fire('Error', e.message, 'error'); }
    }
  });
}


