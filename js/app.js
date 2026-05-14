// frontend/js/app.js
import { pb } from './api.js';
import { state } from './state.js';
import { toggleSidebar, toggleCart, closeAllPanels, copyCustomerLink, togglePaymentOptions } from './ui.js';
import { setBrand, filterProducts, renderProducts, renderSets, addToCartByIndex, addSetToCart, updateQty, clearCart, updateCart, togglePriceMode } from './pos.js';
import { setProdBrand, filterManageProducts, renderProductManage, renderSetsManage, showProductModal, saveProduct, delProduct, showSetModal, toggleSetItemQty, filterSetItems, calcSetTotal, saveProductSet, delProductSet } from './products.js';
import { populateSelects, renderCustomers, addSwalSocialRow, showCustomerModal, saveCustomer, delCustomer, cusState, goToCustomerDetail, goBackCustomer, goToOrderDetail, updateCusSearch } from './customers.js';
import { submitOrder, cancelEdit, resetForm, updateDashboard, loadHistory, printReceipt, editOrder, delOrder, renderInstallments, payInstallment, markAsPaid, updateInstallmentCalc, editInstallmentAmount, editInstallmentTerms, showInstallmentHistory, deleteInstallmentPayment } from './orders.js';
import { checkAuth, loginWithEmail, loginWithOAuth2Redirect, handleOAuth2Callback, logout, updateSidebarProfile, showProfileModal } from './auth.js';

function switchView(view) {
  document.querySelectorAll('.view-container').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.bottom-nav-item').forEach(el => el.classList.remove('active'));
  const topCartIcon = document.getElementById('topCartIcon');
  const viewMap = {
    'pos': { idx: 0, title: 'หน้าขาย (POS)' },
    'prod': { idx: 1, title: 'จัดการสินค้า & เซ็ต' },
    'cus': { idx: 2, title: 'ทะเบียนลูกค้า' },
    'inst': { idx: 3, title: 'ระบบผ่อนชำระ' },
    'dash': { idx: 4, title: 'รายงาน & ประวัติ' }
  };

  if(document.getElementById('view-' + view)) document.getElementById('view-' + view).classList.add('active');
  if(document.querySelectorAll('.nav-item')[viewMap[view].idx]) document.querySelectorAll('.nav-item')[viewMap[view].idx].classList.add('active');
  if(document.querySelectorAll('.bottom-nav-item')[viewMap[view].idx]) document.querySelectorAll('.bottom-nav-item')[viewMap[view].idx].classList.add('active');
  if(document.getElementById('header-title')) document.getElementById('header-title').innerText = viewMap[view].title;

  if(view === 'pos') { if(topCartIcon) topCartIcon.style.display = window.innerWidth <= 900 ? 'block' : 'none'; } 
  else { if(topCartIcon) topCartIcon.style.display = 'none'; }

  if (view === 'prod') filterManageProducts();
  if (view === 'cus') renderCustomers();
  if (view === 'dash') updateDashboard();
  if (view === 'inst') renderInstallments();
  closeAllPanels();
}

function setupRealtime() {
  pb.collection('orders').subscribe('*', function (e) {
    const record = { ...e.record, date: e.record.orderDate, customer: e.record.customerName };
    if (e.action === 'create') {
      if (!state.allOrders.find(o => o.id === record.id)) state.allOrders.unshift(record);
    } else if (e.action === 'update') {
      const idx = state.allOrders.findIndex(o => o.id === record.id);
      if (idx > -1) state.allOrders[idx] = record;
    } else if (e.action === 'delete') {
      state.allOrders = state.allOrders.filter(o => o.id !== record.id);
    }
    updateDashboard(); renderInstallments(); renderCustomers(); 
  });

  pb.collection('customers').subscribe('*', function (e) {
    if (e.action === 'create') {
      if (!state.allCustomers.find(c => c.id === e.record.id)) state.allCustomers.unshift(e.record);
    } else if (e.action === 'update') {
      const idx = state.allCustomers.findIndex(c => c.id === e.record.id);
      if (idx > -1) state.allCustomers[idx] = e.record;
    } else if (e.action === 'delete') {
      state.allCustomers = state.allCustomers.filter(c => c.id !== e.record.id);
    }
    populateSelects(); renderCustomers(); updateDashboard(); renderInstallments();
  });

  pb.collection('products').subscribe('*', function (e) {
    if (e.action === 'create') {
      if (!state.allProducts.find(p => p.id === e.record.id)) state.allProducts.push(e.record);
    } else if (e.action === 'update') {
      const idx = state.allProducts.findIndex(p => p.id === e.record.id);
      if (idx > -1) state.allProducts[idx] = e.record;
    } else if (e.action === 'delete') {
      state.allProducts = state.allProducts.filter(p => p.id !== e.record.id);
    }
    filterManageProducts(); filterProducts();
  });

  pb.collection('product_sets').subscribe('*', function (e) {
    if (e.action === 'create') {
      if (!state.allSets.find(s => s.id === e.record.id)) state.allSets.push(e.record);
    } else if (e.action === 'update') {
      const idx = state.allSets.findIndex(s => s.id === e.record.id);
      if (idx > -1) state.allSets[idx] = e.record;
    } else if (e.action === 'delete') {
      state.allSets = state.allSets.filter(s => s.id !== e.record.id);
    }
    filterManageProducts(); filterProducts();
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  await handleOAuth2Callback();

  if (!checkAuth()) {
      document.getElementById('login-screen').style.display = 'flex';
      document.getElementById('app-screen').style.display = 'none';
      return; 
  }

  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'flex';
  updateSidebarProfile(); // 🔥 เพิ่มบรรทัดนี้ เพื่อให้มันดึงชื่อมาแปะตอนโหลดเว็บเสร็จ 

  if(document.getElementById('orderDate')) document.getElementById('orderDate').valueAsDate = new Date();
  const today = new Date();
  const defaultMonth = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
  if(document.getElementById('dashMonth')) document.getElementById('dashMonth').value = defaultMonth;

  Swal.fire({ title: 'กำลังโหลดข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

  try {
    const [pRes, sRes, cRes, oRes] = await Promise.all([
        pb.collection('products').getFullList({ sort: 'name' }),
        pb.collection('product_sets').getFullList({ sort: 'name' }),
        pb.collection('customers').getFullList({ sort: '-created' }),
        pb.collection('orders').getFullList({ sort: '-created' })
    ]);
    
    state.allProducts = pRes || []; state.allSets = sRes || [];
    state.allCustomers = cRes || []; 
    state.allOrders = (oRes || []).map(o => ({ ...o, date: o.orderDate, customer: o.customerName }));

    populateSelects(); renderProducts(); filterManageProducts(); renderCustomers(); updateDashboard(); renderInstallments();
    setupRealtime();
    Swal.close();
  } catch (err) {
    Swal.fire('ข้อผิดพลาดการเชื่อมต่อ', 'ไม่สามารถเชื่อมต่อฐานข้อมูลได้<br><br>' + err.message, 'error');
  }
});

window.handleLoginEmail = async function() { const success = await loginWithEmail(); if(success) window.location.reload(); };
window.handleLoginGoogle = function() { loginWithOAuth2Redirect('google'); };

Object.assign(window, {
  toggleSidebar, toggleCart, closeAllPanels, switchView, copyCustomerLink, togglePaymentOptions,
  setBrand, filterProducts, renderProducts, renderSets, addToCartByIndex, addSetToCart, updateQty, clearCart, updateCart, togglePriceMode,
  setProdBrand, filterManageProducts, renderProductManage, renderSetsManage, showProductModal, saveProduct, delProduct, showSetModal, toggleSetItemQty, filterSetItems, calcSetTotal, saveProductSet, delProductSet,
  populateSelects, renderCustomers, addSwalSocialRow, showCustomerModal, saveCustomer, delCustomer,
  goToCustomerDetail, goBackCustomer, goToOrderDetail, updateCusSearch,
  submitOrder, cancelEdit, resetForm, updateDashboard, loadHistory, printReceipt, editOrder, delOrder, renderInstallments, payInstallment,
  markAsPaid, updateInstallmentCalc, editInstallmentAmount, editInstallmentTerms, showInstallmentHistory, deleteInstallmentPayment, showProfileModal, logout
});


