# Building Docker images

```
#login
docker login ghcr.io -u armswk

#build the image
docker build -t ghcr.io/armswk/g2c-web:latest -t ghcr.io/armswk/g2c-web:v1.1.0 .

#push the image
docker push ghcr.io/armswk/g2c-web:v1.1.0
docker push ghcr.io/armswk/g2c-web:latest

#pull the image
docker pull ghcr.io/armswk/g2c-pos-web:latest
```

# Versioning in Docker images
นี่คือวิธีที่เป็นสากลและเข้าใจง่ายที่สุด โดยใช้รูปแบบ Major.Minor.Patch

Major (เวอร์ชันหลัก): เปลี่ยนเมื่อมีการรื้อระบบใหม่ หรือแก้โค้ดที่ทำให้ของเก่าพัง (Breaking Changes) เช่น จาก v1 เป็น v2

Minor (เวอร์ชันรอง): เปลี่ยนเมื่อเพิ่มฟีเจอร์ใหม่ๆ เข้าไป แต่ของเก่ายังทำงานได้ปกติ เช่น จาก v1.0 เป็น v1.1

Patch (เวอร์ชันแก้ไข): เปลี่ยนเมื่อแค่แก้บั๊กเล็กๆ น้อยๆ โดยไม่มีฟีเจอร์ใหม่ เช่น จาก v1.0.0 เป็น v1.0.1

# K3S Update
kubectl rollout restart deployment <deployment-name> -n g2c
