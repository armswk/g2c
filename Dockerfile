# ใช้ Nginx แบบ Alpine เพราะไฟล์มีขนาดเล็กและทำงานเร็ว
FROM nginx:alpine

# ลบไฟล์หน้าเว็บเริ่มต้นของ Nginx ทิ้ง
RUN rm -rf /usr/share/nginx/html/*

# ก๊อปปี้เฉพาะไฟล์และโฟลเดอร์ที่จำเป็นสำหรับหน้าเว็บ
COPY css/ /usr/share/nginx/html/css/
COPY icon/ /usr/share/nginx/html/icon/
COPY js/ /usr/share/nginx/html/js/
COPY index.html manifest.json sw.js /usr/share/nginx/html/

# ก๊อปปี้ไฟล์ default.conf ไปวางทับค่าเริ่มต้นของ Nginx
# (ตัวนี้คือไฟล์ที่ทำ Reverse Proxy ไปหา PocketBase)
COPY default.conf /etc/nginx/conf.d/default.conf

# เปิดพอร์ต 80
EXPOSE 80

# สั่งให้ Nginx ทำงานแบบ Foreground
CMD ["nginx", "-g", "daemon off;"]