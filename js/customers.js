// frontend/js/customers.js
import { state } from './state.js';
import { pb } from './api.js';
import { parseCustomerData } from './utils.js';
import { updateDashboard, renderInstallments, getOrderCustomerName } from './orders.js';

const TOM_SELECT_OPTS = {
  searchField: ['text'],
  allowEmptyOption: true,
  maxOptions: 500,
  placeholder: 'ค้นหาลูกค้า...'
};

// UI navigation state for the Customers view.
// view:      'list' | 'detail' | 'order'
// ownerView: 'mine' shows records owned by the logged-in user, 'team' shows the rest
export const cusState = {
  view: 'list',
  selectedCustomerId: null,
  selectedOrderId: null,
  search: '',
  ownerView: 'mine'
};

// Tailwind class strings for the Mine/Team toggle. Centralized so the static
// initial render and the dynamic re-style stay in lockstep.
const TOGGLE_BASE_CLASS    = 'px-3 py-1.5 text-xs font-semibold rounded-md flex items-center gap-1 transition';
const TOGGLE_ACTIVE_CLASS  = 'bg-green-700 text-white';
const TOGGLE_INACTIVE_CLASS = 'bg-transparent text-gray-500 hover:bg-gray-200';

export function setCusOwnerView(view) {
  if (view !== 'mine' && view !== 'team') return;
  cusState.ownerView = view;

  // Fast path: when we're already on the list, swap button styles in place and
  // re-render only the cards so the search input keeps focus.
  if (cusState.view === 'list') {
    const mineBtn = document.getElementById('cus-view-mine');
    const teamBtn = document.getElementById('cus-view-team');
    if (mineBtn && teamBtn) {
      mineBtn.className = `${TOGGLE_BASE_CLASS} ${view === 'mine' ? TOGGLE_ACTIVE_CLASS : TOGGLE_INACTIVE_CLASS}`;
      teamBtn.className = `${TOGGLE_BASE_CLASS} ${view === 'team' ? TOGGLE_ACTIVE_CLASS : TOGGLE_INACTIVE_CLASS}`;
    }
    const listArea = document.getElementById('cus-list-area');
    if (listArea) {
      listArea.innerHTML = getCustomerCardsHTML();
      return;
    }
  }
  renderCustomers();
}

export function populateSelects() {
  const cSel = document.getElementById('customerSelect');
  const dSel = document.getElementById('dashCustomerSelect');
  if (!cSel || !dSel) return;

  // Preserve the user's current pick so a re-populate (e.g. after adding a
  // customer) doesn't blow away an in-progress order or dashboard filter.
  const prevCusValue = cSel.tomselect ? cSel.tomselect.getValue() : cSel.value;
  const prevDashValue = dSel.tomselect ? dSel.tomselect.getValue() : dSel.value;

  // TomSelect mutates the DOM around the native <select>; tear it down before
  // we touch innerHTML so the next init starts from a clean element.
  if (cSel.tomselect) cSel.tomselect.destroy();
  if (dSel.tomselect) dSel.tomselect.destroy();

  cSel.innerHTML = '<option value="">-- เลือกลูกค้าที่มีอยู่ --</option>';
  dSel.innerHTML = '<option value="ALL">ลูกค้าทั้งหมด</option>';

  state.allCustomers.forEach(c => {
    // Strict nickname-first; no phone, no full-name suffix.
    const displayName = escapeHtml((c.nickname && c.nickname.trim()) || c.name || '');
    const safeId = escapeHtml(c.id);
    cSel.innerHTML += `<option value="${safeId}">${displayName}</option>`;
    dSel.innerHTML += `<option value="${safeId}">${displayName}</option>`;
  });

  if (typeof TomSelect !== 'undefined') {
    new TomSelect(cSel, TOM_SELECT_OPTS);
    new TomSelect(dSel, TOM_SELECT_OPTS);
    if (prevCusValue) cSel.tomselect.setValue(prevCusValue, true);
    if (prevDashValue) dSel.tomselect.setValue(prevDashValue, true);
  }
}

// Safe value writer for the POS customer select — works whether TomSelect has
// initialized yet or not. Use this from any code path that wants to programmatically
// change the selection (editOrder, resetForm, etc).
export function setCustomerSelectValue(value) {
  const el = document.getElementById('customerSelect');
  if (!el) return;
  if (el.tomselect) {
    el.tomselect.setValue(value || '', true);
  } else {
    el.value = value || '';
  }
}

// ===== Navigation helpers =====
export function goToCustomerDetail(id) {
  cusState.view = 'detail';
  cusState.selectedCustomerId = id;
  renderCustomers();
}

export function goBackCustomer() {
  if (cusState.view === 'order') {
    cusState.view = 'detail';
    cusState.selectedOrderId = null;
  } else if (cusState.view === 'detail') {
    cusState.view = 'list';
    cusState.selectedCustomerId = null;
  }
  renderCustomers();
}

export function goToOrderDetail(orderId) {
  cusState.view = 'order';
  cusState.selectedOrderId = orderId;
  renderCustomers();
}

export function updateCusSearch(value) {
  cusState.search = value || '';
  const root = document.getElementById('customer-app-root');
  if (!root) return;
  // Only re-render the list area to preserve input focus.
  const listArea = root.querySelector('#cus-list-area');
  if (listArea && cusState.view === 'list') {
    listArea.innerHTML = getCustomerCardsHTML();
  } else {
    renderCustomers();
  }
}

// ===== Main render entry =====
export function renderCustomers() {
  const root = document.getElementById('customer-app-root');
  if (!root) return;

  if (cusState.view === 'detail') {
    root.innerHTML = getCustomerDetailHTML();
  } else if (cusState.view === 'order') {
    root.innerHTML = getOrderDetailHTML();
  } else {
    root.innerHTML = getCustomerListHTML();
  }
}

// ===== Helpers =====
// Match orders by ID OR by legacy string name. The OR (not else-if) lets a
// pre-customerId order still surface for its customer until/unless that
// customer is renamed; new orders match strictly via customerId.
function getCustomerOrders(customer) {
  if (!customer) return [];
  const orders = state.allOrders.filter(o =>
    o.customerId === customer.id || o.customer === customer.name
  );
  orders.sort((a, b) => new Date(b.date) - new Date(a.date));
  return orders;
}

function getDownlines(customerId) {
  if (!customerId) return [];
  return state.allCustomers.filter(c => c.upline === customerId);
}

// BFS through the downline tree starting at rootId.
// Returns an array of generations: [gen1Customers, gen2Customers, ...].
// visited guards against accidental cycles (data shouldn't allow them, but be safe).
function getNetworkByGeneration(rootId) {
  if (!rootId) return [];
  const generations = [];
  const visited = new Set([rootId]);
  let current = state.allCustomers.filter(c => c.upline === rootId);
  while (current.length > 0) {
    current.forEach(c => visited.add(c.id));
    generations.push(current);
    const next = [];
    current.forEach(parent => {
      state.allCustomers.forEach(c => {
        if (c.upline === parent.id && !visited.has(c.id)) {
          visited.add(c.id);
          next.push(c);
        }
      });
    });
    current = next;
  }
  return generations;
}

function statusBadge(status) {
  if (status === 'ABO') return `<span class="ml-2 inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-green-600 text-white">ABO</span>`;
  if (status === 'Pending') return `<span class="ml-2 inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500 text-white">รอสมัคร</span>`;
  return `<span class="ml-2 inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-200 text-slate-700">Member</span>`;
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ===== Page: Customer LIST =====
function getCustomerListHTML() {
  const searchVal = escapeHtml(cusState.search);
  const mineActive = cusState.ownerView === 'mine';
  const mineClass = `${TOGGLE_BASE_CLASS} ${mineActive ? TOGGLE_ACTIVE_CLASS : TOGGLE_INACTIVE_CLASS}`;
  const teamClass = `${TOGGLE_BASE_CLASS} ${mineActive ? TOGGLE_INACTIVE_CLASS : TOGGLE_ACTIVE_CLASS}`;

  return `
    <div class="flex flex-col h-full">
      <!-- Header -->
      <div class="px-4 py-3 bg-white border-b border-gray-200 flex items-center justify-between shrink-0">
        <div class="flex items-center gap-2">
          <i class="ph-fill ph-users text-2xl text-emerald-700"></i>
          <h2 class="text-lg font-bold text-emerald-900">ทะเบียนลูกค้า</h2>
        </div>
        <div class="flex items-center gap-2">
          <button onclick="copyCustomerLink()" class="px-3 py-1.5 text-xs font-semibold rounded-md border border-emerald-600 text-emerald-700 bg-white hover:bg-emerald-50 flex items-center gap-1">
            <i class="ph ph-link"></i> ลิงก์ลูกค้า
          </button>
          <button onclick="showCustomerModal()" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-1">
            <i class="ph-bold ph-plus"></i> เพิ่มลูกค้า
          </button>
        </div>
      </div>

      <!-- Mine / Team toggle -->
      <div class="px-4 py-2 bg-white border-b border-gray-200 flex items-center shrink-0">
        <div class="inline-flex items-center gap-1 bg-gray-100 rounded-md p-1">
          <button id="cus-view-mine" type="button" onclick="setCusOwnerView('mine')" class="${mineClass}">
            <span>👤</span> ของฉัน (Mine)
          </button>
          <button id="cus-view-team" type="button" onclick="setCusOwnerView('team')" class="${teamClass}">
            <span>👥</span> ของทีม (Team)
          </button>
        </div>
      </div>

      <!-- Filters -->
      <div class="px-4 py-3 bg-white border-b border-gray-200 flex items-center gap-2 shrink-0">
        <div class="relative flex-1">
          <i class="ph ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
          <input type="text" id="cus-search-input" placeholder="ค้นหาชื่อลูกค้า / เบอร์โทร..."
            value="${searchVal}"
            oninput="updateCusSearch(this.value)"
            class="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
      </div>

      <!-- List area -->
      <div id="cus-list-area" class="flex-1 overflow-y-auto p-3">
        ${getCustomerCardsHTML()}
      </div>
    </div>
  `;
}

function renderCustomerCard(c) {
  const primary = (c.nickname && c.nickname.trim()) ? c.nickname : (c.name || '');
  const initial = primary ? primary.charAt(0).toUpperCase() : '?';
  const { phone } = parseCustomerData(c);
  const downlineCount = getDownlines(c.id).length;
  const safeId = escapeHtml(c.id);
  const safePrimary = escapeHtml(primary);
  const safeFullName = escapeHtml(c.name || '');
  const showFullName = c.nickname && c.nickname.trim() && c.name && c.nickname.trim() !== c.name;
  const safePhone = escapeHtml(phone || '');

  return `
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-3 hover:border-emerald-400 hover:shadow-md transition cursor-pointer"
         onclick="goToCustomerDetail('${safeId}')">
      <div class="flex items-center gap-3">
        <div class="w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xl font-bold shrink-0">${escapeHtml(initial)}</div>
        <div class="flex-1 min-w-0">
          <div class="font-bold text-emerald-900 text-base truncate">${safePrimary}${statusBadge(c.status)}</div>
          ${showFullName ? `<div class="text-xs text-gray-500 truncate">${safeFullName}</div>` : ''}
          ${safePhone ? `<div class="text-xs text-gray-500 flex items-center gap-1 mt-0.5"><i class="ph-fill ph-phone text-emerald-600"></i> ${safePhone}</div>` : ''}
          ${downlineCount > 0 ? `<div class="text-xs text-emerald-700 flex items-center gap-1 mt-0.5 font-semibold"><i class="ph-fill ph-share-network"></i> มีลูกทีม ${downlineCount} คน</div>` : ''}
        </div>
        <i class="ph-bold ph-caret-right text-gray-400 text-lg"></i>
      </div>
    </div>
  `;
}

function getCustomerCardsHTML() {
  if (!state.allCustomers || state.allCustomers.length === 0) {
    return `<div class="p-10 text-center text-gray-400 text-base">ยังไม่มีข้อมูลลูกค้าในระบบ</div>`;
  }

  // Scope by owner first ('mine' = mine, 'team' = everyone else).
  // Skip the scope filter entirely when we have no auth user — keeps the list
  // usable in any future unauthenticated preview without surprising blank states.
  const currentUserId = pb.authStore.model ? pb.authStore.model.id : null;
  const scoped = currentUserId
    ? state.allCustomers.filter(c =>
        cusState.ownerView === 'mine' ? c.owner === currentUserId : c.owner !== currentUserId)
    : state.allCustomers;

  if (scoped.length === 0) {
    const msg = cusState.ownerView === 'mine'
      ? 'ยังไม่มีลูกค้าของคุณ — ลองสลับไปดูข้อมูลของทีม'
      : 'ยังไม่มีข้อมูลลูกค้าของทีม';
    return `<div class="p-10 text-center text-gray-400 text-base">${msg}</div>`;
  }

  const q = (cusState.search || '').trim().toLowerCase();
  const filtered = scoped.filter(c => {
    if (!q) return true;
    const { phone } = parseCustomerData(c);
    return (c.name || '').toLowerCase().includes(q)
      || (c.nickname || '').toLowerCase().includes(q)
      || (phone || '').toLowerCase().includes(q);
  });

  if (filtered.length === 0) {
    return `<div class="p-10 text-center text-gray-400 text-base">ไม่พบลูกค้าที่ตรงกับการค้นหา</div>`;
  }

  const frontlines = filtered.filter(c => !c.upline);
  const downlines  = filtered.filter(c =>  c.upline);

  const frontSection = frontlines.length === 0 ? '' : `
    <h3 class="font-black text-lg text-emerald-800 mb-3 mt-2 flex items-center gap-2">
      <i class="ph-fill ph-star"></i> Frontline (ไม่มีผู้แนะนำ)
      <span class="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">${frontlines.length}</span>
    </h3>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      ${frontlines.map(renderCustomerCard).join('')}
    </div>
  `;

  const downSection = downlines.length === 0 ? '' : `
    <h3 class="font-black text-lg text-blue-800 mb-3 mt-8 flex items-center gap-2">
      <i class="ph-fill ph-users-three"></i> Downline (มีผู้แนะนำ)
      <span class="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">${downlines.length}</span>
    </h3>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      ${downlines.map(renderCustomerCard).join('')}
    </div>
  `;

  return frontSection + downSection;
}

// ===== Page: Customer DETAIL =====
function getCustomerDetailHTML() {
  const c = state.allCustomers.find(x => x.id === cusState.selectedCustomerId);
  if (!c) {
    return `
      <div class="flex flex-col h-full">
        <div class="px-4 py-3 bg-white border-b border-gray-200 flex items-center gap-2">
          <button onclick="goBackCustomer()" class="p-1 rounded hover:bg-gray-100"><i class="ph-bold ph-arrow-left text-xl"></i></button>
          <h2 class="text-lg font-bold text-emerald-900">ไม่พบข้อมูลลูกค้า</h2>
        </div>
      </div>`;
  }

  const { phone, socials } = parseCustomerData(c);
  const orders = getCustomerOrders(c);
  const generations = getNetworkByGeneration(c.id);
  const totalNetwork = generations.reduce((s, g) => s + g.length, 0);
  const upline = c.upline ? state.allCustomers.find(x => x.id === c.upline) : null;
  const primary = (c.nickname && c.nickname.trim()) ? c.nickname : (c.name || '');
  const initial = primary ? primary.charAt(0).toUpperCase() : '?';
  const safeId = escapeHtml(c.id);
  const safePrimary = escapeHtml(primary);
  const safeFullName = escapeHtml(c.name || '');
  const showFullName = c.nickname && c.nickname.trim() && c.name && c.nickname.trim() !== c.name;

  const socialChipsHtml = (socials || []).map(soc => {
    let icon = 'ph-link', color = 'text-gray-600 bg-gray-100';
    if (soc.type === 'Line') { icon = 'ph-chat-circle-text'; color = 'text-green-700 bg-green-100'; }
    if (soc.type === 'Facebook') { icon = 'ph-facebook-logo'; color = 'text-blue-700 bg-blue-100'; }
    if (soc.type === 'Whatsapp') { icon = 'ph-whatsapp-logo'; color = 'text-green-700 bg-green-100'; }
    if (soc.type === 'Instagram') { icon = 'ph-instagram-logo'; color = 'text-pink-700 bg-pink-100'; }
    const isLink = soc.value.startsWith('http') || soc.value.includes('.com') || soc.value.includes('.me');
    const href = soc.value.startsWith('http') ? soc.value : 'https://' + soc.value;
    const label = soc.value.length > 25 ? 'ดูโปรไฟล์' : escapeHtml(soc.value);
    return isLink
      ? `<a href="${escapeHtml(href)}" target="_blank" class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${color}"><i class="ph-fill ${icon}"></i> ${label}</a>`
      : `<span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${color}"><i class="ph-fill ${icon}"></i> ${label}</span>`;
  }).join('');

  let dobLine = '';
  if (c.dob) {
    const d = new Date(c.dob);
    if (!isNaN(d.getTime())) {
      dobLine = `<div class="flex items-center gap-2 text-sm text-gray-600"><i class="ph-fill ph-cake text-amber-500"></i> ${d.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}</div>`;
    }
  }

  const ordersHtml = orders.length === 0
    ? `<div class="p-6 text-center text-gray-400 text-sm">ยังไม่มีรายการสั่งซื้อ</div>`
    : orders.map(o => {
        const d = new Date(o.date);
        const dateStr = isNaN(d.getTime()) ? '-' : d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' });
        const itemCount = (o.items || []).reduce((s, i) => s + (Number(i.qty) || 0), 0);
        const safeOid = escapeHtml(o.id);
        return `
          <div class="bg-white rounded-lg border border-gray-200 p-3 flex items-center gap-3 cursor-pointer hover:border-emerald-400 hover:shadow-sm transition"
               onclick="goToOrderDetail('${safeOid}')">
            <div class="w-10 h-10 rounded-md bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <i class="ph-fill ph-receipt text-xl"></i>
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-semibold text-gray-800">${escapeHtml(dateStr)}</div>
              <div class="text-xs text-gray-500">${itemCount} รายการ · ${(Number(o.totalPV) || 0).toFixed(2)} PV</div>
            </div>
            <div class="text-right">
              <div class="text-base font-bold text-emerald-700">€${(Number(o.totalPrice) || 0).toFixed(2)}</div>
              <div class="text-[11px] text-gray-400">${escapeHtml(o.paymentStatus || '')}</div>
            </div>
            <i class="ph-bold ph-caret-right text-gray-400"></i>
          </div>`;
      }).join('');

  let uplineHtml = '';
  if (upline) {
    const upPrimary = (upline.nickname && upline.nickname.trim()) ? upline.nickname : (upline.name || '');
    uplineHtml = `
      <button onclick="goToCustomerDetail('${escapeHtml(upline.id)}')"
              class="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition">
        <i class="ph-fill ph-arrow-bend-left-up"></i>
        ผู้แนะนำ: ${escapeHtml(upPrimary)}
      </button>
    `;
  }

  // Per-generation color cycle. CDN Tailwind interprets these at runtime so
  // dynamic class names from template literals are picked up.
  const genColors = ['emerald', 'blue', 'amber', 'purple', 'rose', 'teal'];

  const networkHtml = generations.length === 0
    ? `<div class="p-6 text-center text-gray-400 text-sm">ยังไม่มีลูกทีมในเครือข่าย</div>`
    : generations.map((gen, idx) => {
        const level = idx + 1;
        const color = genColors[idx % genColors.length];
        const indent = Math.min(idx * 12, 36);
        const cardsHtml = gen.map(dl => {
          const dlPrimary = (dl.nickname && dl.nickname.trim()) ? dl.nickname : (dl.name || '');
          const dlInitial = dlPrimary ? dlPrimary.charAt(0).toUpperCase() : '?';
          const dlChildCount = getDownlines(dl.id).length;
          const dlShowFullName = dl.nickname && dl.nickname.trim() && dl.name && dl.nickname.trim() !== dl.name;
          const safeDlId = escapeHtml(dl.id);
          return `
            <div class="bg-white rounded-lg border border-gray-200 border-l-4 border-l-${color}-500 p-3 flex items-center gap-3 cursor-pointer hover:border-${color}-400 hover:shadow-sm transition"
                 onclick="goToCustomerDetail('${safeDlId}')">
              <div class="w-10 h-10 rounded-full bg-${color}-600 text-white flex items-center justify-center font-bold shrink-0">${escapeHtml(dlInitial)}</div>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-semibold text-emerald-900 truncate">${escapeHtml(dlPrimary)}${statusBadge(dl.status)}</div>
                ${dlShowFullName ? `<div class="text-xs text-gray-500 truncate">${escapeHtml(dl.name)}</div>` : ''}
                <div class="text-xs text-gray-500 mt-0.5"><i class="ph-fill ph-share-network text-${color}-600"></i> มีลูกทีม ${dlChildCount} คน</div>
              </div>
              <i class="ph-bold ph-caret-right text-gray-400"></i>
            </div>`;
        }).join('');
        return `
          <div style="margin-left: ${indent}px;" class="space-y-2">
            <div class="px-1 py-1 text-xs font-bold uppercase tracking-wide text-${color}-700 flex items-center gap-2">
              <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-${color}-100 text-${color}-700 text-[11px]">${level}</span>
              ชั้นที่ ${level} • Gen ${level} (${gen.length} คน)
            </div>
            ${cardsHtml}
          </div>`;
      }).join('<div class="h-2"></div>');

  return `
    <div class="flex flex-col h-full">
      <!-- Header -->
      <div class="px-4 py-3 bg-white border-b border-gray-200 flex items-center justify-between shrink-0">
        <div class="flex items-center gap-2">
          <button onclick="goBackCustomer()" class="p-1 rounded hover:bg-gray-100"><i class="ph-bold ph-arrow-left text-xl"></i></button>
          <h2 class="text-lg font-bold text-emerald-900">รายละเอียดลูกค้า</h2>
        </div>
        <div class="flex items-center gap-1">
          <button onclick="showCustomerModal('${safeId}')" class="p-2 rounded hover:bg-gray-100 text-emerald-700" title="แก้ไข">
            <i class="ph ph-pencil-simple text-lg"></i>
          </button>
          <button onclick="delCustomer('${safeId}')" class="p-2 rounded hover:bg-gray-100 text-red-600" title="ลบ">
            <i class="ph ph-trash text-lg"></i>
          </button>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto p-3 space-y-3">
        <!-- Profile card -->
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div class="flex items-center gap-3">
            <div class="w-16 h-16 rounded-full bg-emerald-600 text-white flex items-center justify-center text-2xl font-bold">${escapeHtml(initial)}</div>
            <div class="flex-1 min-w-0">
              <div class="text-lg font-bold text-emerald-900">${safePrimary}${statusBadge(c.status)}</div>
              ${showFullName ? `<div class="text-sm text-gray-500 mt-0.5">${safeFullName}</div>` : ''}
              ${uplineHtml}
              ${phone ? `<div class="flex items-center gap-2 text-sm text-gray-600 mt-1"><i class="ph-fill ph-phone text-emerald-600"></i> ${escapeHtml(phone)}</div>` : ''}
              ${dobLine}
            </div>
          </div>
          ${socialChipsHtml ? `<div class="mt-3 flex flex-wrap gap-2">${socialChipsHtml}</div>` : ''}
          ${c.address ? `<div class="mt-3 text-sm text-gray-600 bg-slate-50 border border-slate-200 rounded-md p-2 flex gap-2"><i class="ph-fill ph-map-pin text-red-500 shrink-0"></i><span>${escapeHtml(c.address)}</span></div>` : ''}
          ${c.remark ? `<div class="mt-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2 flex gap-2"><i class="ph-fill ph-note-pencil shrink-0"></i><span>${escapeHtml(c.remark)}</span></div>` : ''}
          ${c.mapUrl ? `<a href="${escapeHtml(c.mapUrl)}" target="_blank" class="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"><i class="ph-fill ph-map-pin-line"></i> นำทางแผนที่</a>` : ''}
        </div>

        <!-- Downline Network -->
        <div>
          <div class="px-1 py-2 text-sm font-bold text-emerald-900 flex items-center justify-between gap-2">
            <span class="flex items-center gap-2"><i class="ph-fill ph-share-network"></i> เครือข่ายดาวน์ไลน์ (My Network)</span>
            <span class="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">รวม ${totalNetwork} คน • ${generations.length} ชั้น</span>
          </div>
          <div class="space-y-2">
            ${networkHtml}
          </div>
        </div>

        <!-- Orders -->
        <div>
          <div class="px-1 py-2 text-sm font-bold text-emerald-900 flex items-center gap-2">
            <i class="ph-fill ph-clock-counter-clockwise"></i> ประวัติการสั่งซื้อ (${orders.length})
          </div>
          <div class="space-y-2">
            ${ordersHtml}
          </div>
        </div>
      </div>
    </div>
  `;
}

// ===== Page: Order DETAIL =====
function getOrderDetailHTML() {
  const o = state.allOrders.find(x => x.id === cusState.selectedOrderId);
  if (!o) {
    return `
      <div class="flex flex-col h-full">
        <div class="px-4 py-3 bg-white border-b border-gray-200 flex items-center gap-2">
          <button onclick="goBackCustomer()" class="p-1 rounded hover:bg-gray-100"><i class="ph-bold ph-arrow-left text-xl"></i></button>
          <h2 class="text-lg font-bold text-emerald-900">ไม่พบรายการ</h2>
        </div>
      </div>`;
  }

  const d = new Date(o.date);
  const dateStr = isNaN(d.getTime()) ? '-' : d.toLocaleDateString('th-TH', { day: '2-digit', month: 'long', year: 'numeric' });
  const items = o.items || [];
  const itemsHtml = items.length === 0
    ? `<div class="p-4 text-center text-gray-400 text-sm">ไม่มีรายการสินค้า</div>`
    : items.map(i => `
        <div class="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0">
          <div class="flex-1 min-w-0">
            <div class="text-sm font-semibold text-gray-800 truncate">${escapeHtml(i.name)}</div>
            <div class="text-xs text-gray-500">€${(Number(i.price) || 0).toFixed(2)} × ${Number(i.qty) || 0}</div>
          </div>
          <div class="text-sm font-bold text-emerald-700 ml-2">€${((Number(i.price) || 0) * (Number(i.qty) || 0)).toFixed(2)}</div>
        </div>
      `).join('');

  const safeOid = escapeHtml(o.id);

  return `
    <div class="flex flex-col h-full">
      <div class="px-4 py-3 bg-white border-b border-gray-200 flex items-center justify-between shrink-0">
        <div class="flex items-center gap-2">
          <button onclick="goBackCustomer()" class="p-1 rounded hover:bg-gray-100"><i class="ph-bold ph-arrow-left text-xl"></i></button>
          <h2 class="text-lg font-bold text-emerald-900">รายละเอียดออเดอร์</h2>
        </div>
        <button onclick="printReceipt('${safeOid}')" class="p-2 rounded hover:bg-gray-100 text-emerald-700" title="พิมพ์">
          <i class="ph ph-printer text-lg"></i>
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-3 space-y-3">
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div class="flex items-center justify-between">
            <div>
              <div class="text-xs uppercase tracking-wide text-gray-500 font-semibold">ลูกค้า</div>
              <div class="text-base font-bold text-emerald-900">${escapeHtml(getOrderCustomerName(o))}</div>
            </div>
            <div class="text-right">
              <div class="text-xs uppercase tracking-wide text-gray-500 font-semibold">วันที่</div>
              <div class="text-sm font-semibold text-gray-700">${escapeHtml(dateStr)}</div>
            </div>
          </div>
          ${o.paymentStatus ? `<div class="mt-3 inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700"><i class="ph-fill ph-credit-card"></i> ${escapeHtml(o.paymentStatus)}</div>` : ''}
        </div>

        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div class="text-sm font-bold text-emerald-900 mb-2 flex items-center gap-1"><i class="ph-fill ph-shopping-bag"></i> รายการสินค้า</div>
          ${itemsHtml}
        </div>

        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-2">
          <div class="flex items-center justify-between text-sm">
            <span class="text-gray-600">ยอดรวมสุทธิ</span>
            <span class="text-xl font-bold text-emerald-700">€${(Number(o.totalPrice) || 0).toFixed(2)}</span>
          </div>
          <div class="flex items-center justify-between text-sm">
            <span class="text-gray-600">PV รวม</span>
            <span class="text-base font-bold text-amber-600">${(Number(o.totalPV) || 0).toFixed(2)} PV</span>
          </div>
          ${Number(o.ar_balance) > 0 ? `<div class="flex items-center justify-between text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-md p-2"><span><i class="ph-fill ph-bank"></i> AR Balance</span><span class="font-bold">-€${Number(o.ar_balance).toFixed(2)}</span></div>` : ''}
        </div>
      </div>
    </div>
  `;
}

// ===== Modal helpers (DB logic preserved verbatim from original) =====
export function addSwalSocialRow(type = 'Line', val = '') {
  const container = document.getElementById('swal-socials-container');
  const div = document.createElement('div'); div.className = 'social-row'; div.style.display = 'flex'; div.style.gap = '8px'; div.style.marginBottom = '10px';
  div.innerHTML = `<select class="c-input social-type" style="margin:0; width:35%; cursor:pointer;"><option value="Line" ${type==='Line'?'selected':''}>Line</option><option value="Facebook" ${type==='Facebook'?'selected':''}>Facebook</option><option value="Whatsapp" ${type==='Whatsapp'?'selected':''}>Whatsapp</option><option value="Instagram" ${type==='Instagram'?'selected':''}>Instagram</option></select><input type="text" class="c-input social-val" placeholder="ID หรือ ลิงก์โปรไฟล์" value="${val}" style="margin:0; flex:1;"><button type="button" onclick="this.parentElement.remove()" style="background:none; border:none; color:var(--danger); cursor:pointer; font-size:1.2rem; padding:0 5px;"><i class="ph-bold ph-trash"></i></button>`;
  container.appendChild(div);
}

export function showCustomerModal(id = null) {
  let cNickname = '', cName = '', cPhone = '', cRemark = '', cMap = '', cDob = '', cAddress = '', cSocials = [], cStatus = 'Member', cUpline = '', modalTitle = 'เพิ่มลูกค้าใหม่', icon = 'ph-user-plus';
  if (id) {
    const c = state.allCustomers.find(x => x.id === id);
    if (c) {
       cNickname = c.nickname || '';
       cName = c.name; const parsed = parseCustomerData(c); cPhone = parsed.phone; cSocials = parsed.socials;
       cRemark = c.remark || ''; cMap = c.mapUrl || '';
       cDob = c.dob ? new Date(c.dob).toISOString().split('T')[0] : '';
       cAddress = c.address || ''; cStatus = c.status || 'Member';
       cUpline = c.upline || '';
       modalTitle = 'แก้ไขข้อมูลลูกค้า'; icon = 'ph-pencil-simple';
    }
  }

  const uplineOptions = state.allCustomers
    .filter(x => x.id !== id)
    .map(x => {
      const primary = (x.nickname && x.nickname.trim()) ? x.nickname : (x.name || '');
      const suffix = x.nickname && x.nickname.trim() && x.name && x.nickname.trim() !== x.name ? ` — ${x.name}` : '';
      const label = escapeHtml(`${primary}${suffix}`);
      const selected = x.id === cUpline ? 'selected' : '';
      return `<option value="${escapeHtml(x.id)}" ${selected}>${label}</option>`;
    }).join('');
  Swal.fire({
    title: `<div style="font-family: 'Sarabun', sans-serif; color: var(--primary-dk); font-weight: 700; font-size: 1.4rem;"><i class="ph-fill ${icon}" style="font-size: 2.5rem; color: var(--primary-lt); display: block; margin-bottom: 10px;"></i>${modalTitle}</div>`,
    html: `
      <div style="text-align: left; padding-top: 15px; font-family: 'Sarabun', sans-serif;">
        <div style="display: flex; gap: 10px; margin-bottom: 15px;">
           <div style="flex: 1;"><label style="display: block; font-size: 0.9rem; font-weight: 600; color: var(--text-muted); margin-bottom: 6px;">ชื่อเล่น (Nickname) <span style="color: var(--danger);">*</span></label><input type="text" id="swal-cus-nickname" class="c-input" placeholder="เช่น สมชาย" value="${cNickname}" style="margin:0;"></div>
           <div style="flex: 1.5;"><label style="display: block; font-size: 0.9rem; font-weight: 600; color: var(--text-muted); margin-bottom: 6px;">ชื่อ-นามสกุล (Full Name)</label><input type="text" id="swal-cus-name" class="c-input" placeholder="เช่น คุณสมชาย ใจดี" value="${cName}" style="margin:0;"></div>
        </div>
        <div style="display: flex; gap: 10px; margin-bottom: 15px;">
           <div style="flex: 1;"><label style="display: block; font-size: 0.9rem; font-weight: 600; color: var(--text-muted); margin-bottom: 6px;">เบอร์โทรศัพท์</label><input type="tel" id="swal-cus-phone" class="c-input" placeholder="081XXXXXXX" value="${cPhone}" style="margin:0;"></div>
           <div style="flex: 1;"><label style="display: block; font-size: 0.9rem; font-weight: 600; color: var(--text-muted); margin-bottom: 6px;">วันเดือนปีเกิด</label><input type="date" id="swal-cus-dob" class="c-input" value="${cDob}" style="margin:0;"></div>
        </div>
        <div style="margin-bottom: 15px;"><label style="display: flex; justify-content: space-between; align-items: center; font-size: 0.9rem; font-weight: 600; color: var(--text-muted); margin-bottom: 10px; padding-top: 15px; border-top: 1px solid var(--border);">ช่องทางติดต่ออื่นๆ (Social)<span onclick="addSwalSocialRow()" style="color: var(--primary); font-size: 0.8rem; cursor: pointer; font-weight: 700; background: #E8F5E9; padding: 4px 10px; border-radius: 12px;">+ เพิ่มช่องทาง</span></label><div id="swal-socials-container"></div></div>
        <div style="margin-bottom: 15px;"><label style="display: block; font-size: 0.9rem; font-weight: 600; color: var(--text-muted); margin-bottom: 6px;">ที่อยู่จัดส่ง</label><textarea id="swal-cus-address" class="c-input" placeholder="ระบุที่อยู่..." rows="2" style="margin:0; resize: vertical;">${cAddress}</textarea></div>
        <div style="margin-bottom: 15px;"><label style="display: block; font-size: 0.9rem; font-weight: 600; color: var(--text-muted); margin-bottom: 6px;">หมายเหตุ / ข้อมูลเพิ่มเติม</label><textarea id="swal-cus-remark" class="c-input" placeholder="เช่น ลูกค้า VIP..." rows="2" style="margin:0; resize: vertical;">${cRemark}</textarea></div>
        <div style="display: flex; gap: 10px; margin-bottom: 15px;">
            <div style="flex: 1;"><label style="display: block; font-size: 0.9rem; font-weight: 600; color: var(--text-muted); margin-bottom: 6px;">ลิงก์ Google Maps</label><input type="url" id="swal-cus-map" class="c-input" placeholder="วางลิงก์แผนที่ร้านที่นี่..." value="${cMap}" style="margin:0;"></div>
            <div style="flex: 1;"><label style="display: block; font-size: 0.9rem; font-weight: 600; color: var(--text-muted); margin-bottom: 6px;">สถานะลูกค้า</label>
                <select id="swal-cus-status" class="c-select" style="margin:0;">
                    <option value="Member" ${cStatus==='Member'?'selected':''}>ลูกค้าราคาเต็ม (Member)</option>
                    <option value="Pending" ${cStatus==='Pending'?'selected':''}>รอสมัคร ABO</option>
                    <option value="ABO" ${cStatus==='ABO'?'selected':''}>นักธุรกิจ (ABO)</option>
                </select>
            </div>
        </div>
        <div style="margin-bottom: 10px;">
            <label style="display: block; font-size: 0.9rem; font-weight: 600; color: var(--text-muted); margin-bottom: 6px;">
                <i class="ph-fill ph-share-network" style="color: var(--primary);"></i> ผู้แนะนำ (Upline / Sponsor)
            </label>
            <select id="swal-cus-upline" class="c-select" style="margin:0;">
                <option value="">— ไม่มีผู้แนะนำ —</option>
                ${uplineOptions}
            </select>
        </div>
      </div>`,
    didOpen: () => { if(cSocials.length > 0) { cSocials.forEach(s => addSwalSocialRow(s.type, s.value)); } else { addSwalSocialRow(); } },
    focusConfirm: false, showCancelButton: true, confirmButtonText: 'บันทึกข้อมูล', cancelButtonText: 'ยกเลิก', confirmButtonColor: '#2D6A4F',
    preConfirm: () => {
      const nickname = document.getElementById('swal-cus-nickname').value.trim();
      const name = document.getElementById('swal-cus-name').value.trim(); const phone = document.getElementById('swal-cus-phone').value.trim(); const remark = document.getElementById('swal-cus-remark').value.trim(); const mapUrl = document.getElementById('swal-cus-map').value.trim();
      const dob = document.getElementById('swal-cus-dob').value; const address = document.getElementById('swal-cus-address').value.trim();
      const status = document.getElementById('swal-cus-status').value;
      const upline = document.getElementById('swal-cus-upline').value;
      const socialRows = document.querySelectorAll('.social-row'); const socials = [];
      socialRows.forEach(row => { const type = row.querySelector('.social-type').value; const val = row.querySelector('.social-val').value.trim(); if(val) socials.push({ type, value: val }); });
      if (!nickname) { Swal.showValidationMessage('⚠️ กรุณากรอกชื่อเล่น (Nickname)'); return false; }
      // Fall back to nickname when full name is left blank, so order linkage (which uses `name`) always has a value.
      const finalName = name || nickname;
      return { nickname, name: finalName, channel: socials, phone, remark, mapUrl, dob: dob ? new Date(dob).toISOString() : null, address, status, upline: upline || null };
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
        // If we were viewing the deleted customer, go back to list.
        if (cusState.selectedCustomerId === id) {
          cusState.view = 'list';
          cusState.selectedCustomerId = null;
          cusState.selectedOrderId = null;
          renderCustomers();
        }
      } catch(e) { Swal.fire('Error', e.message, 'error'); }
    }
  });
}
