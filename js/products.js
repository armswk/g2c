// frontend/js/products.js
import { state } from './state.js';
import { pb } from './api.js';
import { getBrandStyle } from './utils.js';
import { filterProducts } from './pos.js';

export function setProdBrand(brand, btnEl) {
  state.currentProdBrand = brand;
  document.getElementById('prodCatTabs').querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  btnEl.classList.add('active'); 
  filterManageProducts();
}

export function filterManageProducts() {
  const q = document.getElementById('searchProdInput').value.toLowerCase();
  if(state.currentProdBrand === 'Set') {
      const filteredSets = state.allSets.filter(s => s.name.toLowerCase().includes(q)); 
      renderSetsManage(filteredSets);
  } else {
      const filtered = state.allProducts.filter(p => (state.currentProdBrand === 'All' || (p.brand || '') === state.currentProdBrand) && ((p.name || '').toLowerCase().includes(q) || (p.brand || '').toLowerCase().includes(q)));
      renderProductManage(filtered);
  }
}

export function renderProductManage(list = state.allProducts) {
  const grid = document.getElementById('productManageGrid');
  if(!grid) return;
  if (list.length === 0) { grid.innerHTML = '<div style="grid-column:1/-1; padding:40px;text-align:center;color:#999;font-size:1.1rem;">ไม่พบข้อมูลสินค้า</div>'; return; }
  grid.innerHTML = list.map(p => {
    const style = getBrandStyle(p.brand);
    return `<div class="product-card no-hover">
        <div class="p-img ${style.class}"><i class="ph-fill ${style.icon}"></i><div class="pv-badge">${(Number(p.pv)||0).toFixed(2)} PV</div></div>
        <div class="p-info" style="display:flex; flex-direction:column; flex: 1;">
          <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-align:left; margin-bottom:4px; text-transform:uppercase; letter-spacing:0.5px;">${p.brand}</div>
          <div class="p-name" style="margin-bottom:auto;">${p.name}</div>
          <div style="text-align:right; margin-top:8px; margin-bottom:12px;">
            <div class="p-price" style="font-size:1rem; color:var(--primary); font-weight:700;">สม. €${(Number(p.price)||0).toFixed(2)}</div>
            <div style="color: var(--text-muted); font-size: 0.85rem; margin-top:2px;">ปลีก: €${(Number(p.retailPrice)||Number(p.price)||0).toFixed(2)}</div>
          </div>
          <div style="display:flex; justify-content: space-between; border-top: 1px solid var(--border); padding-top: 12px;">
            <span style="font-size:0.85rem; color:var(--primary-lt); cursor:pointer; font-weight:600; display:flex; align-items:center; gap:5px;" onclick="showProductModal('${p.id}')"><i class="ph ph-pencil-simple" style="font-size:1.1rem;"></i> แก้ไข</span>
            <span style="font-size:0.85rem; color:var(--danger); cursor:pointer; font-weight:600; display:flex; align-items:center; gap:5px;" onclick="delProduct('${p.id}')"><i class="ph ph-trash" style="font-size:1.1rem;"></i> ลบ</span>
          </div>
        </div>
      </div>`;
  }).join('');
}

export function showProductModal(id = null) {
  let pName = '', pBrand = 'Nutrilite', pPrice = '', pRetailPrice = '', pPv = '';
  let modalTitle = 'เพิ่มสินค้าใหม่', icon = 'ph-package';
  if (id) {
    const p = state.allProducts.find(x => x.id === id);
    if (p) { pName = p.name; pBrand = p.brand; pPrice = p.price; pRetailPrice = p.retailPrice || p.price; pPv = p.pv; modalTitle = 'แก้ไขสินค้า'; icon = 'ph-pencil-simple'; }
  }
  const safeValName = pName.replace(/"/g, '&quot;');
  Swal.fire({
    title: `<div style="font-family: 'Sarabun', sans-serif; color: var(--primary-dk); font-weight: 700; font-size: 1.4rem;"><i class="ph-fill ${icon}" style="font-size: 2.5rem; color: var(--primary-lt); display: block; margin-bottom: 10px;"></i>${modalTitle}</div>`,
    html: `<div style="text-align: left; padding-top: 15px; font-family: 'Sarabun', sans-serif;">
        <div style="margin-bottom: 15px;"><label style="display: block; font-size: 0.9rem; font-weight: 600; color: var(--text-muted); margin-bottom: 6px;">ชื่อสินค้า <span style="color: var(--danger);">*</span></label><input type="text" id="swal-prod-name" class="c-input" value="${safeValName}" style="margin:0;"></div>
        <div style="margin-bottom: 15px;"><label style="display: block; font-size: 0.9rem; font-weight: 600; color: var(--text-muted); margin-bottom: 6px;">แบรนด์</label>
          <select id="swal-prod-brand" class="c-input" style="margin:0; cursor:pointer;">
            <option value="Nutrilite" ${pBrand === 'Nutrilite' ? 'selected' : ''}>Nutrilite</option>
            <option value="Artistry" ${pBrand === 'Artistry' ? 'selected' : ''}>Artistry</option>
            <option value="Amway Home" ${pBrand === 'Amway Home' ? 'selected' : ''}>Amway Home</option>
            <option value="Personal Care" ${pBrand === 'Personal Care' ? 'selected' : ''}>Personal Care</option>
            <option value="ทั่วไป" ${pBrand === 'ทั่วไป' ? 'selected' : ''}>ทั่วไป</option>
          </select></div>
        <div style="display: flex; gap: 10px; margin-bottom: 15px;">
          <div style="flex: 1;"><label style="display: block; font-size: 0.9rem; font-weight: 600; color: var(--text-muted); margin-bottom: 6px;">ราคาสมาชิก (€)</label><input type="number" step="0.01" id="swal-prod-price" class="c-input" value="${pPrice}" style="margin:0;"></div>
          <div style="flex: 1;"><label style="display: block; font-size: 0.9rem; font-weight: 600; color: #D97706; margin-bottom: 6px;">ราคาปลีก (€)</label><input type="number" step="0.01" id="swal-prod-retail" class="c-input" value="${pRetailPrice}" style="margin:0; border-color: #FCD34D;"></div>
        </div>
        <div>
          <label style="display: block; font-size: 0.9rem; font-weight: 600; color: var(--text-muted); margin-bottom: 6px;">คะแนน PV</label><input type="number" step="0.01" id="swal-prod-pv" class="c-input" value="${pPv}" style="margin:0;">
        </div>
      </div>`,
    showCancelButton: true, confirmButtonText: 'บันทึกข้อมูล', cancelButtonText: 'ยกเลิก', confirmButtonColor: '#2D6A4F',
    preConfirm: () => {
      const name = document.getElementById('swal-prod-name').value.trim();
      const brand = document.getElementById('swal-prod-brand').value;
      const price = parseFloat(document.getElementById('swal-prod-price').value);
      const retailPrice = parseFloat(document.getElementById('swal-prod-retail').value) || price;
      const pv = parseFloat(document.getElementById('swal-prod-pv').value);
      if (!name || isNaN(price) || isNaN(pv)) { Swal.showValidationMessage('⚠️ กรุณากรอกข้อมูลให้ครบ'); return false; }
      return { name, brand, price, retailPrice, pv };
    }
  }).then((result) => { if (result.isConfirmed) saveProduct(result.value, id); });
}

export async function saveProduct(data, id) {
  try {
    if (id) await pb.collection('products').update(id, data);
    else await pb.collection('products').create(data);
    Swal.fire({ toast: true, position: 'top-end', showConfirmButton: false, timer: 1500, icon: 'success', title: 'บันทึกสำเร็จ' });
  } catch (e) { Swal.fire('Error', e.message, 'error'); }
}

export function delProduct(id) {
  Swal.fire({ title: 'ยืนยันการลบ?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#DC3545' }).then(async res => {
    if (res.isConfirmed) {
      try {
          await pb.collection('products').delete(id);
          Swal.fire({ toast: true, position: 'top-end', showConfirmButton: false, timer: 1500, icon: 'success', title: 'ลบสำเร็จ' });
      } catch(e) { Swal.fire('Error', e.message, 'error'); }
    }
  });
}

export function renderSetsManage(list = state.allSets) {
  const grid = document.getElementById('productManageGrid');
  if(!grid) return;
  if (list.length === 0) { grid.innerHTML = '<div style="grid-column:1/-1; padding:40px;text-align:center;color:#999;">ไม่พบข้อมูลเซ็ตสินค้า</div>'; return; }
  grid.innerHTML = list.map(s => {
    const style = getBrandStyle('Set');
    return `<div class="product-card no-hover">
        <div class="p-img ${style.class}"><i class="ph-fill ${style.icon}"></i><div class="pv-badge">${(Number(s.pv)||0).toFixed(2)} PV</div></div>
        <div class="p-info" style="display:flex; flex-direction:column; flex: 1;">
          <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-align:left; margin-bottom:4px; text-transform:uppercase; letter-spacing:0.5px;">จัดเซ็ต</div>
          <div class="p-name" style="margin-bottom:auto;">${s.name}</div>
          <div style="text-align:right; margin-top:8px; margin-bottom:12px;">
            <div class="p-price" style="font-size:1rem; color:var(--primary); font-weight:700;">สม. €${(Number(s.price)||0).toFixed(2)}</div>
            <div style="color: var(--text-muted); font-size: 0.85rem; margin-top:2px;">ปลีก: €${(Number(s.retailPrice)||Number(s.price)||0).toFixed(2)}</div>
          </div>
          <div style="display:flex; justify-content: space-between; border-top: 1px solid var(--border); padding-top: 12px;">
            <span style="font-size:0.85rem; color:var(--primary-lt); cursor:pointer; font-weight:600; display:flex; align-items:center; gap:5px;" onclick="showSetModal('${s.id}')"><i class="ph ph-pencil-simple" style="font-size:1.1rem;"></i> แก้ไขเซ็ต</span>
            <span style="font-size:0.85rem; color:var(--danger); cursor:pointer; font-weight:600; display:flex; align-items:center; gap:5px;" onclick="delProductSet('${s.id}')"><i class="ph ph-trash" style="font-size:1.1rem;"></i> ลบเซ็ต</span>
          </div>
        </div>
      </div>`;
  }).join('');
}

export function showSetModal(id = null) {
  let sName = '', sPrice = '', sRetailPrice = '', sPv = '', sItemsMap = {};
  let modalTitle = 'จัดเซ็ตสินค้าใหม่', icon = 'ph-gift';
  if (id) {
    const s = state.allSets.find(x => x.id === id);
    if (s) { 
       sName = s.name; sPrice = s.price; sRetailPrice = s.retailPrice || s.price; sPv = s.pv; 
       s.items.split(',').forEach(i => {
           let match = i.trim().match(/^(\d+)x\s+(.+)$/); 
           if (match) sItemsMap[match[2]] = parseInt(match[1], 10); else sItemsMap[i.trim()] = 1;
       });
       modalTitle = 'แก้ไขเซ็ตสินค้า';
    }
  }
  let checkboxesHtml = state.allProducts.map(p => {
     let qty = sItemsMap[p.name] || 0; let isChecked = qty > 0 ? 'checked' : ''; let displayQty = qty > 0 ? qty : 1;
     return `<div class="set-item-row" style="margin-bottom: 5px; display: flex; align-items: center; justify-content: space-between;">
               <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:0.85rem; flex:1;">
                 <input type="checkbox" class="set-item-cb" value="${p.name.replace(/"/g, '&quot;')}" data-price="${p.price}" data-retail="${p.retailPrice||p.price}" data-pv="${p.pv}" onchange="toggleSetItemQty(this); calcSetTotal()" ${isChecked}>
                 ${p.name} <span style="color:var(--text-muted);">[สม. €${Number(p.price).toFixed(2)}]</span>
               </label>
               <input type="number" class="set-item-qty c-input" min="1" value="${displayQty}" style="width: 60px; padding: 2px 5px; margin: 0; text-align: center; display: ${isChecked ? 'block' : 'none'};" onchange="calcSetTotal()">
             </div>`;
  }).join('');

  Swal.fire({
    title: `<div style="font-family: 'Sarabun', sans-serif; color: var(--primary-dk); font-weight: 700; font-size: 1.4rem;"><i class="ph-fill ${icon}" style="font-size: 2.5rem; color: var(--accent); display: block; margin-bottom: 10px;"></i>${modalTitle}</div>`,
    html: `
      <div style="text-align: left; padding-top: 10px; font-family: 'Sarabun', sans-serif;">
        <div style="margin-bottom: 15px;"><label style="display: block; font-size: 0.9rem; font-weight: 600; color: var(--text-muted); margin-bottom: 6px;">ชื่อเซ็ตสินค้า <span style="color: var(--danger);">*</span></label><input type="text" id="swal-set-name" class="c-input" value="${sName.replace(/"/g, '&quot;')}" style="margin:0;"></div>
        <div style="margin-bottom: 15px; border: 1px solid var(--border); border-radius: 8px; padding: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
             <label style="font-size: 0.9rem; font-weight: 600; color: var(--primary-dk); margin: 0;">เลือกสินค้าที่จะมัดรวม</label>
             <input type="text" id="swal-set-search" onkeyup="filterSetItems()" placeholder="🔍 ค้นหาสินค้า..." style="padding: 4px 8px; border: 1px solid #D1D5DB; border-radius: 4px; font-size: 0.8rem; outline: none; width: 140px;">
          </div>
          <div style="max-height: 150px; overflow-y: auto; padding-right: 5px; background: #F8FAFC; border-radius: 6px; padding: 8px;">${checkboxesHtml}</div>
        </div>
        <div style="display: flex; gap: 10px; margin-bottom: 15px;">
          <div style="flex: 1;"><label style="display: block; font-size: 0.9rem; font-weight: 600; color: var(--text-muted); margin-bottom: 6px;">ราคาสมาชิก (€)</label><input type="number" step="0.01" id="swal-set-price" class="c-input" value="${sPrice}" style="margin:0;"></div>
          <div style="flex: 1;"><label style="display: block; font-size: 0.9rem; font-weight: 600; color: #D97706; margin-bottom: 6px;">ราคาปลีก (€)</label><input type="number" step="0.01" id="swal-set-retail" class="c-input" value="${sRetailPrice}" style="margin:0; border-color:#FCD34D;"></div>
        </div>
        <div>
           <label style="display: block; font-size: 0.9rem; font-weight: 600; color: var(--text-muted); margin-bottom: 6px;">คะแนน PVรวม</label><input type="number" step="0.01" id="swal-set-pv" class="c-input" value="${sPv}" style="margin:0;">
        </div>
      </div>`,
    showCancelButton: true, confirmButtonText: 'บันทึกเซ็ต', cancelButtonText: 'ยกเลิก', confirmButtonColor: '#2D6A4F',
    preConfirm: () => {
      const name = document.getElementById('swal-set-name').value.trim();
      const price = parseFloat(document.getElementById('swal-set-price').value);
      const retailPrice = parseFloat(document.getElementById('swal-set-retail').value) || price;
      const pv = parseFloat(document.getElementById('swal-set-pv').value);
      const rows = document.querySelectorAll('.set-item-row');
      const selectedItems = [];
      rows.forEach(row => {
         const cb = row.querySelector('.set-item-cb');
         if(cb.checked) {
            const qty = parseInt(row.querySelector('.set-item-qty').value) || 1;
            selectedItems.push(`${qty}x ${cb.value}`); 
         }
      });
      if (!name || isNaN(price) || isNaN(pv) || selectedItems.length === 0) { Swal.showValidationMessage('⚠️ กรุณาใส่ชื่อเซ็ต ราคา และเลือกสินค้า'); return false; }
      return { name, price, retailPrice, pv, items: selectedItems.join(', ') };
    }
  }).then((result) => { if (result.isConfirmed) saveProductSet(result.value, id); });
}

export function toggleSetItemQty(cb) {
   const qtyInput = cb.closest('.set-item-row').querySelector('.set-item-qty');
   qtyInput.style.display = cb.checked ? 'block' : 'none';
   if(cb.checked && qtyInput.value < 1) qtyInput.value = 1;
}

export function filterSetItems() {
    const q = document.getElementById('swal-set-search').value.toLowerCase();
    document.querySelectorAll('.set-item-row').forEach(row => { row.style.display = row.innerText.toLowerCase().includes(q) ? 'flex' : 'none'; });
}

export function calcSetTotal() {
    let totalP = 0, totalRetail = 0, totalPv = 0;
    document.querySelectorAll('.set-item-row').forEach(row => {
       const cb = row.querySelector('.set-item-cb');
       if (cb.checked) {
           const qty = parseInt(row.querySelector('.set-item-qty').value) || 1;
           totalP += (parseFloat(cb.getAttribute('data-price')) || 0) * qty; 
           totalRetail += (parseFloat(cb.getAttribute('data-retail')) || 0) * qty; 
           totalPv += (parseFloat(cb.getAttribute('data-pv')) || 0) * qty;
       }
    });
    document.getElementById('swal-set-price').value = totalP > 0 ? totalP.toFixed(2) : '';
    document.getElementById('swal-set-retail').value = totalRetail > 0 ? totalRetail.toFixed(2) : '';
    document.getElementById('swal-set-pv').value = totalPv > 0 ? totalPv.toFixed(2) : '';
}

export async function saveProductSet(data, id) {
  try {
    if (id) await pb.collection('product_sets').update(id, data);
    else await pb.collection('product_sets').create(data);
    Swal.fire({ toast: true, position: 'top-end', showConfirmButton: false, timer: 1500, icon: 'success', title: 'บันทึกเซ็ตสำเร็จ' });
  } catch (e) { Swal.fire('Error', e.message, 'error'); }
}

export function delProductSet(id) {
  Swal.fire({ title: 'ยืนยันการลบเซ็ต?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#DC3545' }).then(async res => {
    if (res.isConfirmed) {
      try {
          await pb.collection('product_sets').delete(id);
          Swal.fire({ toast: true, position: 'top-end', showConfirmButton: false, timer: 1500, icon: 'success', title: 'ลบสำเร็จ' });
      } catch(e) { Swal.fire('Error', e.message, 'error'); }
    }
  });
}


