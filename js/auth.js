import { pb } from './api.js';

export function checkAuth() {
    if (!pb.authStore.isValid || !pb.authStore.model) return false;
    
    if (pb.authStore.model.approved !== true) {
        pb.authStore.clear(); 
        return false;
    }
    return true;
}

export async function loginWithEmail() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) {
        Swal.fire({ icon: 'warning', title: 'กรุณากรอกข้อมูล', text: 'ต้องระบุอีเมลและรหัสผ่าน', confirmButtonColor: '#1a5336' });
        return false;
    }

    Swal.fire({ title: 'กำลังเข้าสู่ระบบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    try {
        const authData = await pb.collection('users').authWithPassword(email, password);
        
        if (authData.record.approved !== true) {
            pb.authStore.clear();
            Swal.fire({ icon: 'warning', title: 'รอการอนุมัติ', text: 'บัญชีของคุณกำลังรอการตรวจสอบและอนุมัติจากผู้ดูแลระบบ', confirmButtonColor: '#F59E0B' });
            return false;
        }

        Swal.close();
        return true;
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'เข้าสู่ระบบล้มเหลว', text: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง', confirmButtonColor: '#1a5336' });
        return false;
    }
}

export async function loginWithOAuth2Redirect(providerName) {
    Swal.fire({ title: 'กำลังพาไปยังหน้าล็อกอิน...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        const authMethods = await pb.collection('users').listAuthMethods();
        const provider = authMethods.authProviders.find(p => p.name === providerName);

        if (!provider) throw new Error(`ไม่พบระบบล็อกอิน ${providerName}`);

        const redirectUrl = window.location.origin + window.location.pathname;
        localStorage.setItem('oauth2Provider', JSON.stringify(provider));

        let finalUrl = provider.authUrl + redirectUrl;

        // 🔥 เพิ่มคำสั่งให้ Google บังคับโชว์หน้าต่าง "เลือกบัญชี" เสมอ
        if (providerName === 'google') {
            finalUrl += '&prompt=select_account';
        }

        window.location.href = finalUrl;
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: err.message, confirmButtonColor: '#1a5336' });
    }
}

export async function handleOAuth2Callback() {
    const params = new URLSearchParams(window.location.search);
    const state = params.get('state');
    const code = params.get('code');

    if (state && code) {
        Swal.fire({ title: 'กำลังยืนยันตัวตน...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            const providerRaw = localStorage.getItem('oauth2Provider');
            if (!providerRaw) throw new Error('ไม่พบข้อมูลผู้ให้บริการ กรุณาล็อกอินใหม่');

            const provider = JSON.parse(providerRaw);
            if (provider.state !== state) throw new Error('รหัสยืนยันความปลอดภัยไม่ตรงกัน');

            const redirectUrl = window.location.origin + window.location.pathname;

            const authData = await pb.collection('users').authWithOAuth2Code(
                provider.name,
                code,
                provider.codeVerifier,
                redirectUrl
            );

            localStorage.removeItem('oauth2Provider');
            window.history.replaceState({}, document.title, window.location.pathname);
            
            if (authData.record.approved !== true) {
                pb.authStore.clear(); 
                Swal.fire({ 
                    icon: 'info', 
                    title: 'ลงทะเบียนสำเร็จ', 
                    html: `บัญชี Google ของคุณเชื่อมต่อสำเร็จแล้ว<br><br><span style="color:var(--danger); font-weight:600;">แต่ยังไม่สามารถเข้าใช้งานได้</span><br><br>กรุณารอผู้ดูแลระบบอนุมัติบัญชีของคุณครับ`, 
                    confirmButtonColor: '#2D6A4F' 
                });
                return false;
            }

            Swal.close();
            return true;
        } catch (err) {
            console.error("OAuth2 Error:", err);
            localStorage.removeItem('oauth2Provider');
            window.history.replaceState({}, document.title, window.location.pathname);
            
            if (err.status === 400 || err.status === 403) {
                Swal.fire({ icon: 'error', title: 'ไม่ได้รับอนุญาต', text: 'บัญชีนี้ไม่มีสิทธิ์เข้าใช้งาน กรุณาติดต่อผู้ดูแล', confirmButtonColor: '#1a5336' });
            } else {
                Swal.fire({ icon: 'error', title: 'ยืนยันตัวตนล้มเหลว', text: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ', confirmButtonColor: '#1a5336' });
            }
            return false;
        }
    }
    return false;
}

export function logout() {
    Swal.fire({
        title: 'ยืนยันการออกจากระบบ?',
        text: "คุณต้องการออกจากระบบ G2C POS ใช่หรือไม่",
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'ออกจากระบบ',
        cancelButtonText: 'ยกเลิก'
    }).then((result) => {
        if (result.isConfirmed) {
            pb.authStore.clear();
            window.location.reload();
        }
    });
}

export function updateSidebarProfile() {
    if (pb.authStore.isValid && pb.authStore.model) {
        const user = pb.authStore.model;
        const nameEl = document.getElementById('sidebar-user-name');
        const emailEl = document.getElementById('sidebar-user-email');
        
        if (nameEl) nameEl.innerText = user.name || 'ผู้ใช้งานระบบ';
        if (emailEl) emailEl.innerText = user.email || 'ไม่มีอีเมล';
    }
}

window.sendPasswordResetEmail = async function() {
    const user = pb.authStore.model;
    if (!user || !user.email) return Swal.fire('ข้อผิดพลาด', 'ไม่พบอีเมลในระบบ', 'error');
    
    Swal.fire({ title: 'กำลังส่งอีเมล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        await pb.collection('users').requestPasswordReset(user.email);
        Swal.fire({
            icon: 'success',
            title: 'ส่งอีเมลสำเร็จ!',
            html: `ระบบได้ส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปที่ <br><b style="color:var(--primary);">${user.email}</b><br><br><span style="font-size:0.85rem; color:var(--text-muted);">กรุณาตรวจสอบกล่องจดหมาย (และกล่องจดหมายขยะ) ของคุณ</span>`,
            confirmButtonColor: '#2D6A4F'
        });
    } catch (err) {
        Swal.fire('ส่งอีเมลล้มเหลว', 'ไม่สามารถส่งอีเมลได้ กรุณาติดต่อผู้ดูแลระบบ', 'error');
    }
};

export async function showProfileModal() {
    const user = pb.authStore.model;
    if (!user) return;

    // Parse existing business_info safely (supports both string and object)
    let bi = {};
    try {
      const raw = user.business_info;
      if (typeof raw === 'string') { bi = JSON.parse(raw); }
      else if (raw && typeof raw === 'object') { bi = raw; }
    } catch (e) { bi = {}; }

    // Helper: emit value for a form field, HTML-escaped
    const val = (key) => String(bi[key] == null ? '' : bi[key])
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    Swal.fire({
        title: `<div style="font-family: 'Sarabun', sans-serif; color: var(--primary-dk); font-weight: 700; font-size: 1.3rem;"><i class="ph-fill ph-user-gear" style="font-size: 2.5rem; color: var(--primary-lt); display: block; margin-bottom: 10px;"></i>บัญชีผู้ใช้</div>`,
        html: `
            <div style="text-align: left; padding-top: 10px; font-family: 'Sarabun', sans-serif;">
                <div style="margin-bottom: 15px;">
                    <label style="display: block; font-size: 0.9rem; font-weight: 600; color: var(--text-muted); margin-bottom: 6px;">ชื่อแสดงผล</label>
                    <input type="text" id="prof-name" class="c-input" value="${(user.name || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}" placeholder="ชื่อของคุณ" style="margin:0;">
                </div>
                <div style="margin-bottom: 15px;">
                    <label style="display: block; font-size: 0.9rem; font-weight: 600; color: var(--text-muted); margin-bottom: 6px;">อีเมล</label>
                    <input type="email" id="prof-account-email" class="c-input" value="${user.email || ''}" disabled style="margin:0; background: #E2E8F0; cursor: not-allowed; color: #64748B;">
                    <div style="font-size: 0.75rem; color: #D97706; margin-top: 4px;"><i class="ph-fill ph-warning-circle"></i> การเปลี่ยนอีเมลต้องติดต่อผู้ดูแลระบบ</div>
                </div>

                <!-- 🧾 Rechnung Info -->
                <div style="margin-top: 20px; padding-top: 15px; border-top: 1px dashed var(--border);">
                    <div style="font-weight: 700; color: var(--primary-dk); margin-bottom: 15px; font-size: 0.95rem;">
                        🧾 Rechnung Info
                    </div>

                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label style="display:block; font-size:0.8rem; font-weight:600; color:var(--text-muted); margin-bottom:4px;">Firma</label>
                            <input type="text" id="prof-company" class="c-input" value="${val('company_name')}" placeholder="ชื่อบริษัท" style="margin:0; font-size:0.85rem;">
                        </div>
                        <div>
                            <label style="display:block; font-size:0.8rem; font-weight:600; color:var(--text-muted); margin-bottom:4px;">Geschäftsführer</label>
                            <input type="text" id="prof-manager" class="c-input" value="${val('manager_name')}" placeholder="ชื่อผู้จัดการ" style="margin:0; font-size:0.85rem;">
                        </div>

                        <div class="col-span-2">
                            <label style="display:block; font-size:0.8rem; font-weight:600; color:var(--text-muted); margin-bottom:4px;">Straße und Hausnummer</label>
                            <input type="text" id="prof-street" class="c-input" value="${val('street')}" placeholder="เช่น Musterstraße 123" style="margin:0; font-size:0.85rem;">
                        </div>
                        <div class="col-span-2">
                            <label style="display:block; font-size:0.8rem; font-weight:600; color:var(--text-muted); margin-bottom:4px;">Adresszeile 2 (Optional)</label>
                            <input type="text" id="prof-addr2" class="c-input" value="${val('address_line2')}" placeholder="เช่น c/o, Stockwerk" style="margin:0; font-size:0.85rem;">
                        </div>

                        <div>
                            <label style="display:block; font-size:0.8rem; font-weight:600; color:var(--text-muted); margin-bottom:4px;">PLZ</label>
                            <input type="text" id="prof-plz" class="c-input" value="${val('plz')}" placeholder="เช่น 12345" style="margin:0; font-size:0.85rem;">
                        </div>
                        <div>
                            <label style="display:block; font-size:0.8rem; font-weight:600; color:var(--text-muted); margin-bottom:4px;">Stadt</label>
                            <input type="text" id="prof-city" class="c-input" value="${val('city')}" placeholder="เช่น Berlin" style="margin:0; font-size:0.85rem;">
                        </div>

                        <div>
                            <label style="display:block; font-size:0.8rem; font-weight:600; color:var(--text-muted); margin-bottom:4px;">Steuernummer</label>
                            <input type="text" id="prof-tax" class="c-input" value="${val('tax_id')}" placeholder="เลขประจำตัวผู้เสียภาษี" style="margin:0; font-size:0.85rem;">
                        </div>
                        <div>
                            <label style="display:block; font-size:0.8rem; font-weight:600; color:var(--text-muted); margin-bottom:4px;">USt.-IDNr.</label>
                            <input type="text" id="prof-vat" class="c-input" value="${val('vat_id')}" placeholder="DE123456789" style="margin:0; font-size:0.85rem;">
                        </div>

                        <div>
                            <label style="display:block; font-size:0.8rem; font-weight:600; color:var(--text-muted); margin-bottom:4px;">Geschäfts-E-Mail</label>
                            <input type="text" id="prof-email" class="c-input" value="${val('company_email')}" placeholder="info@ihrefirma.de" style="margin:0; font-size:0.85rem;">
                        </div>
                        <div>
                            <label style="display:block; font-size:0.8rem; font-weight:600; color:var(--text-muted); margin-bottom:4px;">Telefon</label>
                            <input type="text" id="prof-phone" class="c-input" value="${val('company_phone')}" placeholder="+49 123 456789" style="margin:0; font-size:0.85rem;">
                        </div>

                        <div class="col-span-2">
                            <label style="display:block; font-size:0.8rem; font-weight:600; color:var(--text-muted); margin-bottom:4px;">Bankname</label>
                            <input type="text" id="prof-bank" class="c-input" value="${val('bank_name')}" placeholder="ชื่อธนาคาร" style="margin:0; font-size:0.85rem;">
                        </div>

                        <div>
                            <label style="display:block; font-size:0.8rem; font-weight:600; color:var(--text-muted); margin-bottom:4px;">IBAN</label>
                            <input type="text" id="prof-iban" class="c-input" value="${val('iban')}" placeholder="DE..." style="margin:0; font-size:0.85rem;">
                        </div>
                        <div>
                            <label style="display:block; font-size:0.8rem; font-weight:600; color:var(--text-muted); margin-bottom:4px;">BIC</label>
                            <input type="text" id="prof-bic" class="c-input" value="${val('bic')}" placeholder="เช่น GENODEXXXX" style="margin:0; font-size:0.85rem;">
                        </div>
                    </div>
                </div>

                <div style="margin-top: 20px; padding-top: 15px; border-top: 1px dashed var(--border);">
                    <div style="font-weight: 700; color: var(--primary-dk); margin-bottom: 10px; font-size: 0.95rem;">🔒 รหัสผ่าน</div>
                    <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 10px;">หากต้องการเปลี่ยนรหัสผ่าน หรือตั้งรหัสผ่านใหม่สำหรับบัญชี Google ให้กดปุ่มด้านล่างเพื่อรับลิงก์ทางอีเมล</p>
                    <button type="button" onclick="sendPasswordResetEmail()" style="width: 100%; padding: 10px; background: #F1F5F9; color: #334155; border: 1px solid #CBD5E1; border-radius: 8px; font-family: inherit; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: 0.2s;" onmouseover="this.style.background='#E2E8F0'" onmouseout="this.style.background='#F1F5F9'">
                        <i class="ph-bold ph-envelope-simple" style="font-size: 1.1rem;"></i> ส่งอีเมลสำหรับตั้งรหัสผ่านใหม่
                    </button>
                </div>

                <div style="margin-top: 20px; padding-top: 15px; border-top: 1px dashed var(--border);">
                    <button type="button" onclick="logout()" style="width: 100%; padding: 10px; background: #FEF2F2; color: #DC2626; border: 1px solid #FECACA; border-radius: 8px; font-family: inherit; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;">
                        <i class="ph-bold ph-sign-out" style="font-size: 1.1rem;"></i> ออกจากระบบ
                    </button>
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'บันทึกข้อมูล',
        cancelButtonText: 'ปิดหน้าต่าง',
        confirmButtonColor: '#2D6A4F',
        preConfirm: () => {
            const name = document.getElementById('prof-name').value.trim();
            // Collect Rechnung Info fields into a structured object
            const biNew = {
                company_name:  document.getElementById('prof-company').value.trim(),
                manager_name:  document.getElementById('prof-manager').value.trim(),
                street:        document.getElementById('prof-street').value.trim(),
                address_line2: document.getElementById('prof-addr2').value.trim(),
                plz:           document.getElementById('prof-plz').value.trim(),
                city:          document.getElementById('prof-city').value.trim(),
                tax_id:        document.getElementById('prof-tax').value.trim(),
                vat_id:        document.getElementById('prof-vat').value.trim(),
                company_email: document.getElementById('prof-email').value.trim(),
                company_phone: document.getElementById('prof-phone').value.trim(),
                bank_name:     document.getElementById('prof-bank').value.trim(),
                iban:          document.getElementById('prof-iban').value.trim(),
                bic:           document.getElementById('prof-bic').value.trim(),
            };
            return { name, business_info: biNew };
        }
    }).then(async (res) => {
        if (res.isConfirmed) {
            try {
                Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
                const updated = await pb.collection('users').update(user.id, {
                    name: res.value.name,
                    business_info: res.value.business_info
                });
                // Keep the local auth-store model in sync.
                // PocketBase may return business_info as a string (text field) or
                // already-parsed object (json field). Normalize so the modal can
                // read it back on next open.
                pb.authStore.model.name = updated.name || res.value.name;
                let freshBi = updated.business_info;
                if (typeof freshBi === 'string') {
                  try { freshBi = JSON.parse(freshBi); } catch (e) { freshBi = null; }
                }
                if (!freshBi || typeof freshBi !== 'object') {
                  freshBi = res.value.business_info;
                }
                pb.authStore.model.business_info = freshBi;
                updateSidebarProfile();
                Swal.fire({ toast: true, position: 'top-end', showConfirmButton: false, timer: 1500, icon: 'success', title: 'อัปเดตข้อมูลสำเร็จ!' });
            } catch (err) {
                Swal.fire('อัปเดตล้มเหลว', err.message, 'error');
            }
        }
    });
}


