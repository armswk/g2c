// frontend/js/utils.js
export function parseCustomerData(c) {
  let socials = [], phone = '';
  let chan = c.channel;
  if (Array.isArray(chan)) { 
      socials = chan; phone = c.phone || ''; 
  } else if (typeof chan === 'string' && chan.trim().startsWith('[')) { 
      try { socials = JSON.parse(chan); phone = c.phone || ''; } catch(e) {} 
  } else { 
      phone = c.phone || ''; 
  }
  return { socials, phone };
}

export function getBrandStyle(brand) {
  const b = (brand || '').toLowerCase();
  if(b.includes('nutri')) return { class: 'nutrilite', icon: 'ph-leaf' };
  if(b.includes('artist')) return { class: 'artistry', icon: 'ph-sparkle' };
  if(b.includes('amway home')) return { class: 'amwayhome', icon: 'ph-house' };
  if(b === 'set') return { class: 'artistry', icon: 'ph-gift' }; 
  return { class: 'personal', icon: 'ph-drop' };
}
