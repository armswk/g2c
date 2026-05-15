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

    const biz = (user.business_info && typeof user.business_info === 'object') ? user.business_info : {};
    const esc = (v) => String(v ?? '').replace(/"/g, '&quot;');

    const inputCls = "w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-[#2D6A4F] focus:ring-2 focus:ring-[#2D6A4F]/15 text-sm bg-white transition";
    const labelCls = "block text-xs font-semibold text-gray-600 mb-1";

    Swal.fire({
        width: 640,
        title: `<div style="font-family: 'Sarabun', sans-serif; color: var(--primary-dk); font-weight: 700; font-size: 1.3rem;"><i class="ph-fill ph-user-gear" style="font-size: 2.5rem; color: var(--primary-lt); display: block; margin-bottom: 10px;"></i>บัญชีผู้ใช้</div>`,
        html: `
            <div style="text-align: left; padding-top: 10px; font-family: 'Sarabun', sans-serif;">
                <div style="margin-bottom: 15px;">
                    <label style="display: block; font-size: 0.9rem; font-weight: 600; color: var(--text-muted); margin-bottom: 6px;">ชื่อแสดงผล</label>
                    <input type="text" id="prof-name" class="c-input" value="${esc(user.name)}" placeholder="ชื่อของคุณ" style="margin:0;">
                </div>
                <div style="margin-bottom: 15px;">
                    <label style="display: block; font-size: 0.9rem; font-weight: 600; color: var(--text-muted); margin-bottom: 6px;">อีเมล</label>
                    <input type="email" id="prof-email" class="c-input" value="${esc(user.email)}" disabled style="margin:0; background: #E2E8F0; cursor: not-allowed; color: #64748B;">
                    <div style="font-size: 0.75rem; color: #D97706; margin-top: 4px;"><i class="ph-fill ph-warning-circle"></i> การเปลี่ยนอีเมลต้องติดต่อผู้ดูแลระบบ</div>
                </div>

                <div style="margin-top: 20px; padding-top: 15px; border-top: 1px dashed var(--border);">
                    <div style="font-weight: 700; color: var(--primary-dk); margin-bottom: 12px; font-size: 0.95rem;">
                        <i class="ph-fill ph-receipt" style="color: var(--primary-lt);"></i> Rechnung Info
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                        <div>
                            <label class="${labelCls}">Firma</label>
                            <input type="text" id="biz-company_name" class="${inputCls}" value="${esc(biz.company_name)}" placeholder="z.B. Muster GmbH">
                        </div>
                        <div>
                            <label class="${labelCls}">Geschäftsführer</label>
                            <input type="text" id="biz-manager_name" class="${inputCls}" value="${esc(biz.manager_name)}" placeholder="Vor- und Nachname">
                        </div>
                    </div>

                    <div class="mb-3">
                        <label class="${labelCls}">Straße und Hausnummer</label>
                        <input type="text" id="biz-street" class="${inputCls}" value="${esc(biz.street)}" placeholder="z.B. Hauptstraße 12">
                    </div>
                    <div class="mb-3">
                        <label class="${labelCls}">Adresszeile 2 <span class="text-gray-400 font-normal">(Optional)</span></label>
                        <input type="text" id="biz-address_line2" class="${inputCls}" value="${esc(biz.address_line2)}" placeholder="c/o, Gebäude, Etage…">
                    </div>
                    <div class="grid grid-cols-3 gap-3 mb-3">
                        <div class="col-span-1">
                            <label class="${labelCls}">PLZ</label>
                            <input type="text" id="biz-plz" class="${inputCls}" value="${esc(biz.plz)}" placeholder="12345" maxlength="5" inputmode="numeric" pattern="\\d{5}">
                        </div>
                        <div class="col-span-2">
                            <label class="${labelCls}">Stadt</label>
                            <input type="text" id="biz-city" class="${inputCls}" value="${esc(biz.city)}" placeholder="z.B. Berlin">
                        </div>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                        <div>
                            <label class="${labelCls}">Steuernummer</label>
                            <input type="text" id="biz-tax_id" class="${inputCls}" value="${esc(biz.tax_id)}" placeholder="z.B. 12/345/67890">
                        </div>
                        <div>
                            <label class="${labelCls}">USt.-IDNr.</label>
                            <input type="text" id="biz-vat_id" class="${inputCls}" value="${esc(biz.vat_id)}" placeholder="z.B. DE123456789">
                        </div>
                    </div>

                    <div class="mb-3">
                        <label class="${labelCls}">Bankname</label>
                        <input type="text" id="biz-bank_name" class="${inputCls}" value="${esc(biz.bank_name)}" placeholder="z.B. Sparkasse Berlin">
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div class="sm:col-span-2">
                            <label class="${labelCls}">IBAN</label>
                            <input type="text" id="biz-iban" class="${inputCls}" value="${esc(biz.iban)}" placeholder="DE00 0000 0000 0000 0000 00">
                        </div>
                        <div>
                            <label class="${labelCls}">BIC</label>
                            <input type="text" id="biz-bic" class="${inputCls}" value="${esc(biz.bic)}" placeholder="z.B. BELADEBEXXX">
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
        confirmButtonText: 'บันทึก',
        cancelButtonText: 'ปิดหน้าต่าง',
        confirmButtonColor: '#2D6A4F',
        focusConfirm: false,
        preConfirm: () => {
            const val = (id) => (document.getElementById(id)?.value || '').trim();
            return {
                name: val('prof-name'),
                business_info: {
                    company_name:   val('biz-company_name'),
                    manager_name:   val('biz-manager_name'),
                    street:         val('biz-street'),
                    address_line2: val('biz-address_line2'),
                    plz:            val('biz-plz'),
                    city:           val('biz-city'),
                    tax_id:         val('biz-tax_id'),
                    vat_id:         val('biz-vat_id'),
                    bank_name:      val('biz-bank_name'),
                    iban:           val('biz-iban'),
                    bic:            val('biz-bic'),
                }
            };
        }
    }).then(async (res) => {
        if (!res.isConfirmed) return;
        try {
            Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            const updated = await pb.collection('users').update(user.id, {
                name: res.value.name,
                business_info: res.value.business_info,
            });
            pb.authStore.save(pb.authStore.token, updated);
            updateSidebarProfile();
            Swal.fire({ toast: true, position: 'top-end', showConfirmButton: false, timer: 1800, icon: 'success', title: 'บันทึกข้อมูลสำเร็จ!' });
        } catch (err) {
            Swal.fire('อัปเดตล้มเหลว', err.message, 'error');
        }
    });
}


