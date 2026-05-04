// frontend/js/pos.js
import { state } from './state.js';
import { getBrandStyle } from './utils.js';

export function toggleCart() {
  const cart = document.getElementById('posCart'); const overlay = document.getElementById('screenOverlay');
  if(!cart || !overlay) return;
  const isOpen = cart.classList.contains('open');
  if(isOpen) { cart.classList.remove('open'); overlay.style.display = 'none'; } 
  else { cart.classList.add('open'); overlay.style.display = 'block'; }
}

export function setBrand(brand, btnEl) {
  state.currentBrand = brand;
  document.getElementById('catTabs').querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  filterProducts();
}

// 🔥 อัปเดตฟังก์ชันนี้ ให้สลับสไตล์ (สี, เงา) ด้วย JavaScript โดยตรง แอนิเมชันถึงจะทำงาน
export function togglePriceMode(mode) {
    state.priceMode = mode;
    const btnM = document.getElementById('btn-price-member');
    const btnR = document.getElementById('btn-price-retail');
    
    if (mode === 'member') {
        // เปิดปุ่มสมาชิก
        btnM.style.background = '#fff';
        btnM.style.color = 'var(--primary-dk)';
        btnM.style.boxShadow = '0 1px 2px rgba(0,0,0,0.1)';
        // ปิดปุ่มราคาปลีก
        btnR.style.background = 'transparent';
        btnR.style.color = 'var(--text-muted)';
        btnR.style.boxShadow = 'none';
    } else {
        // เปิดปุ่มราคาปลีก
        btnR.style.background = '#fff';
        btnR.style.color = 'var(--primary-dk)';
        btnR.style.boxShadow = '0 1px 2px rgba(0,0,0,0.1)';
        // ปิดปุ่มสมาชิก
        btnM.style.background = 'transparent';
        btnM.style.color = 'var(--text-muted)';
        btnM.style.boxShadow = 'none';
    }
    
    // อัปเดตป้ายราคาสินค้าในหน้าจอ
    filterProducts(); 
}

export function filterProducts() {
  const q = document.getElementById('searchInput').value.toLowerCase();
  if (state.currentBrand === 'Set') {
    const filteredSets = state.allSets.filter(s => s.name.toLowerCase().includes(q));
    renderSets(filteredSets);
  } else {
    const filtered = state.allProducts.filter(p => (state.currentBrand === 'All' || (p.brand || '') === state.currentBrand) && ((p.name || '').toLowerCase().includes(q) || (p.brand || '').toLowerCase().includes(q)));
    renderProducts(filtered);
  }
}

export function renderProducts(list = state.allProducts) {
  const grid = document.getElementById('productGrid');
  if(!grid) return;
  if (list.length === 0) { grid.innerHTML = '<div style="grid-column:1/-1; padding:40px;text-align:center;color:#999;font-size:1.1rem;">ไม่พบสินค้า</div>'; return; }
  grid.innerHTML = list.map((p, i) => {
    const style = getBrandStyle(p.brand);
    const displayPrice = state.priceMode === 'retail' && p.retailPrice ? p.retailPrice : p.price;
    const priceLabel = state.priceMode === 'retail' ? '<span style="font-size:0.7rem; color:#F59E0B; background:#FEF3C7; padding:2px 4px; border-radius:4px; margin-left:4px;">ราคาปลีก</span>' : '';

    return `<div class="product-card" onclick="addToCartByIndex('${p.id}')">
        <div class="p-img ${style.class}"><i class="ph-fill ${style.icon}"></i><div class="pv-badge">${(Number(p.pv)||0).toFixed(2)} PV</div></div>
        <div class="p-info" style="display:flex; flex-direction:column; flex: 1;">
          <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-align:left; margin-bottom:4px; text-transform:uppercase; letter-spacing:0.5px;">${p.brand}</div>
          <div class="p-name" style="margin-bottom:auto;">${p.name}</div>
          <div style="text-align:right; margin-top:8px;">
            <div class="p-price" style="color:var(--primary); font-weight:700; font-size:1.15rem;">€${(Number(displayPrice)||0).toFixed(2)}${priceLabel}</div>
          </div>
        </div>
      </div>`;
  }).join('');
}

export function renderSets(list = state.allSets) {
  const grid = document.getElementById('productGrid');
  if(!grid) return;
  if (list.length === 0) { grid.innerHTML = '<div style="grid-column:1/-1; padding:40px;text-align:center;color:#999;font-size:1.1rem;">ไม่พบเซ็ตสินค้า</div>'; return; }
  grid.innerHTML = list.map((s, i) => {
    const style = getBrandStyle('Set');
    const displayPrice = state.priceMode === 'retail' && s.retailPrice ? s.retailPrice : s.price;
    const priceLabel = state.priceMode === 'retail' ? '<span style="font-size:0.7rem; color:#F59E0B; background:#FEF3C7; padding:2px 4px; border-radius:4px; margin-left:4px;">ราคาปลีก</span>' : '';

    return `<div class="product-card" onclick="addSetToCart('${s.id}')">
        <div class="p-img ${style.class}"><i class="ph-fill ${style.icon}"></i><div class="pv-badge">${(Number(s.pv)||0).toFixed(2)} PV</div></div>
        <div class="p-info" style="display:flex; flex-direction:column; flex: 1;">
          <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-align:left; margin-bottom:4px; text-transform:uppercase; letter-spacing:0.5px;">จัดเซ็ต</div>
          <div class="p-name" style="margin-bottom:auto;">${s.name}</div>
          <div style="text-align:right; margin-top:8px;">
            <div class="p-price" style="color:var(--primary); font-weight:700; font-size:1.15rem;">€${(Number(displayPrice)||0).toFixed(2)}${priceLabel}</div>
          </div>
        </div>
      </div>`;
  }).join('');
}

export function addToCartByIndex(id) {
  const p = state.allProducts.find(x => x.id === id); if(!p) return;
  const activePrice = state.priceMode === 'retail' && p.retailPrice ? p.retailPrice : p.price;
  const exist = state.cart.find(item => item.id === p.id && !item.isSet);
  if(exist) exist.qty++; else state.cart.unshift({ id: p.id, name: p.name, price: activePrice, pv: p.pv, qty: 1, isSet: false, remark: '' });
  updateCart();
}

export function addSetToCart(id) {
  const s = state.allSets.find(x => x.id === id); if(!s) return;
  const activePrice = state.priceMode === 'retail' && s.retailPrice ? s.retailPrice : s.price;
  const exist = state.cart.find(item => item.id === s.id && item.isSet);
  if(exist) exist.qty++; else state.cart.unshift({ id: s.id, name: s.name, price: activePrice, pv: s.pv, qty: 1, isSet: true, remark: s.items });
  updateCart();
}

export function updateQty(index, delta) {
  if(!state.cart[index]) return;
  state.cart[index].qty += delta;
  if (state.cart[index].qty <= 0) state.cart.splice(index, 1);
  updateCart();
}

export function clearCart() { state.cart = []; updateCart(); }

export function updateCart() {
  const itemsContainer = document.getElementById('cartItems'); const badge = document.getElementById('mobileCartBadge');
  if(!itemsContainer) return;
  if(state.cart.length === 0) {
    itemsContainer.innerHTML = '<div style="text-align:center; color:#cbd5e1; margin-top:60px;"><i class="ph ph-shopping-bag" style="font-size: 4rem; margin-bottom: 10px;"></i><div style="font-weight: 600; color: #94a3b8;">ยังไม่มีรายการ</div></div>';
    document.getElementById('cartTotal').innerText = '€0.00'; document.getElementById('cartTotalPV').innerText = '0.00 PV'; document.getElementById('checkoutBtn').disabled = true;
    if(badge) { badge.style.display = 'none'; badge.innerText = '0'; }
    return;
  }

  let totalEuro = 0, totalPv = 0;
  itemsContainer.innerHTML = state.cart.map((item, i) => {
    totalEuro += (Number(item.price) || 0) * item.qty; totalPv += (Number(item.pv) || 0) * item.qty;
    const isSetHtml = item.isSet ? '<span style="font-size:0.7rem; background:#FEF3C7; color:#D97706; padding:2px 4px; border-radius:4px; margin-left:4px;">SET</span>' : '';
    return `<div class="c-item">
        <div class="c-item-top"><div class="c-title">${item.name} ${isSetHtml}</div><i class="ph-bold ph-trash c-del" onclick="updateQty(${i}, -999)"></i></div>
        <div class="c-item-bot"><div class="c-price">€${((Number(item.price)||0)*item.qty).toFixed(2)} <span style="font-size:0.75rem; color:var(--text-muted); font-weight:normal;">/ ${(Number(item.pv)||0)*item.qty} PV</span></div>
        <div class="c-qty"><button class="qty-btn" onclick="updateQty(${i}, -1)">-</button><div class="qty-val">${item.qty}</div><button class="qty-btn" onclick="updateQty(${i}, 1)">+</button></div></div>
      </div>`;
  }).join('');
  
  document.getElementById('cartTotal').innerText = `€${totalEuro.toFixed(2)}`;
  document.getElementById('cartTotalPV').innerText = `${totalPv.toFixed(2)} PV`;
  document.getElementById('checkoutBtn').disabled = false;
  
  if(badge) { const sumQty = state.cart.reduce((s, i) => s + i.qty, 0); badge.innerText = sumQty; badge.style.display = sumQty > 0 ? 'block' : 'none'; }
}