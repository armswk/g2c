// frontend/js/ui.js
export function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('screenOverlay');
  sidebar.classList.toggle('open');
  overlay.style.display = sidebar.classList.contains('open') ? 'block' : 'none';
  document.getElementById('posCart').classList.remove('open');
}

export function toggleCart() {
  const cart = document.getElementById('posCart');
  const overlay = document.getElementById('screenOverlay');
  cart.classList.toggle('open');
  overlay.style.display = cart.classList.contains('open') ? 'block' : 'none';
  document.getElementById('sidebar').classList.remove('open');
}

export function closeAllPanels() {
  if(document.getElementById('sidebar')) document.getElementById('sidebar').classList.remove('open');
  if(document.getElementById('posCart')) document.getElementById('posCart').classList.remove('open');
  if(document.getElementById('screenOverlay')) document.getElementById('screenOverlay').style.display = 'none';
}

export function copyCustomerLink() { 
  Swal.fire('ข้อผิดพลาด', 'ยังไม่รองรับใน Self-Hosted', 'info'); 
}

export function togglePaymentOptions() {
   const status = document.getElementById('paymentStatus').value;
   document.getElementById('paymentMethodFull').style.display = status === 'จ่ายแล้ว' ? 'block' : 'none';
   document.getElementById('installmentOptions').style.display = status === 'ผ่อน' ? 'block' : 'none';
}
