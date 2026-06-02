// frontend/js/state.js
export const state = {
    allProducts: [],
    allSets: [],
    allCustomers: [],
    allOrders: [],
    amwayInvoices: [], // incoming Amway invoice PDFs (Documents view, Tab 1)
    downlines: [], // users where upline === current user id (for "order owner" selection)
    cart: [],
    currentBrand: 'All',
    currentProdBrand: 'All',
    currentEditId: null,
    priceMode: 'member' // ค่าเริ่มต้นคือ 'member' (ราคาสมาชิก), อีกค่าคือ 'retail' (ราคาลูกค้า)
};


