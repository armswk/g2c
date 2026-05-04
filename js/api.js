// frontend/js/api.js
import PocketBase from 'https://cdn.jsdelivr.net/npm/pocketbase@0.21.1/dist/pocketbase.es.mjs';

// ใช้ '/' ได้เลย เพราะ Nginx default.conf จะช่วย Route ไปหา PocketBase ให้อัตโนมัติ
export const pbUrl = window.location.origin; 
export const pb = new PocketBase(pbUrl);
