# ใช้ Nginx แบบ Alpine เพราะไฟล์มีขนาดเล็กและทำงานเร็วมาก
FROM nginx:alpine

# ลบไฟล์หน้าเว็บเริ่มต้นของ Nginx ทิ้ง
RUN rm -rf /usr/share/nginx/html/*

# นำไฟล์หน้าเว็บ (G2C POS) ของเราทั้งหมดไปใส่แทนที่
COPY ./frontend /usr/share/nginx/html

# นำไฟล์ตั้งค่า Reverse Proxy ไปวางทับของเดิม
# (เพื่อให้ Nginx รู้ว่าต้องโยน API ไปหา PocketBase)
COPY ./nginx.conf /etc/nginx/conf.d/default.conf

# เปิดพอร์ต 80 ให้ภายนอกเข้ามาใช้งานได้
EXPOSE 80

# สั่งให้ Nginx ทำงานแบบไม่หยุด (Foreground)
CMD ["nginx", "-g", "daemon off;"]
