# 📘 Project Setup for Dockerize Jarvis Web

## 🚀 Project Overview

Project ini terdiri dari **3 service utama**:

- **Backend** → Node.js Express
- **Frontend** → Vue.js 2
- **Worker** → RabbitMQ consumer di dalam folder backend

Tambahan service internal:

- **Redis** (cache & queue)
- **RabbitMQ** (message broker)

---

## 📂 Struktur Folder

```

project-root/
├── backend/ # repo backend (bitbucket branch uat)
├── frontend/ # repo frontend (bitbucket branch uat)
├── docker-compose.dev.yml # config untuk development
├── Makefile # shortcut command
└── README.md

```

---

## 🐳 Docker Compose

### Development Mode

Menjalankan backend, frontend, worker dengan **hot reload** (mount volume ke host)

```bash
make dev
```

Akses:

- Frontend → [http://localhost:8084](http://localhost:8084)
- Backend → [http://localhost:7002](http://localhost:7002)
- Rabbitmq → [http://localhost:15674](http://localhost:15674)

## 📜 Makefile Commands

| Command        | Deskripsi                                  |
| -------------- | ------------------------------------------ |
| `make dev`     | Jalankan container di mode **development** |
| `make dev-new` | untuk Docker version terbaru               |

---

## 🛠 Logs & Debugging

Lalu buka [http://localhost:15674](http://localhost:15674)
(default login: `guest` / `guest`).

---

## ✅ Rekomendasi Workflow

1. Install Docker dan Git di local. Jalankan cek version ini:

   ```bash
   docker -v
   git -v
   ```

   → Pastikan Docker dan Git sudah terinstall di local

2. Jalankan ini:

   ```bash
   git clone git@github.com:batosayjeycode/jarvis-dockerize.git
   cd jarvis-dockerize
   git checkout feature/sanctum-dockerize
   ```

   → Ini adalah clone repo ini, lalu pindah ke folder clone, kemudian pilih brand "feature/sanctum-dockerize"

3. Jalankan ini:

   ```bash
   git clone git@bitbucket.org:Sociolla/sanctum-api.git backend-temp
   rsync -av backend-temp/ backend/
   rm -rf backend-temp
   ```

   → Ini adalah clone repo sanctum-api, lalu timpa isi file yang ada di folder backend

4. Jalankan ini:

   ```bash
   git clone git@bitbucket.org:Sociolla/sanctum-web.git frontend-temp
   rsync -av frontend-temp/ frontend/
   rm -rf frontend-temp
   ```

   → Ini adalah clone repo sanctum-web, lalu timpa isi file yang ada di folder frontend

5. Cek node version dengan menjalankan ini:

   ```bash
   node -v
   ```

   → pastikan menggunakan node versi "**v16.14.2**"

6. Jalankan ini:

   ```bash
   cd backend
   git checkout uat
   ```

   Tidak perlu melakukan "npm install" di local folder backend karena sudah ditambahkan "npm install" pada file "Makefile"

   Lalu Buat file ".env" di folder backend (copy paste dari .env uat), lalu sesuaikan isinya dengan yang ada di file ".env-local"

7. Jalankan ini:

   ```bash
   cd ..
   cd frontend
   git checkout uat
   ```

   Tidak perlu melakukan "npm install" di local folder frontend (karna tidak support untuk copy paste folder node_modules), ini akan dilakukan di dalam Dockerfile di container

   Cek file "config/default.env.js" di folder frontend, lalu sesuaikan isinya dengan yang ada di file "config/default-local.env.js".

   Cek file "config/web.env.js" di folder frontend, lalu sesuaikan isinya dengan yang ada di file "config/web-local.env.js".

   Cek juga di file "package.json", lalu sesuaikan isinya dengan yang ada di file "package-local.json".

8. Jalankan:

   ```bash
   docker pull redis:6
   docker pull rabbitmq:3-management
   docker pull node:16.14.2-alpine
   ```

   → Ini dilakukan untuk download image Docker yang digunakan terlebih dahulu. Image ini digunakan di file docker-compose.dev.yml dan Dockerfile

9. Jalankan:

   untuk Docker version lama, menggunakan perintah `docker-compose`. Jalankan ini:

   ```bash
   cd ..
   make dev
   ```

   atau untuk Docker version terbaru, menggunakan perintah `docker compose`, bukan `docker-compose`. Jalankan ini:

   ```bash
   cd ..
   make dev-new
   ```

   → Pindah ke root folder, kemudian jalankan container

---

⚡ Dengan setup ini:

- Redis & RabbitMQ hanya internal (lebih aman)
- Backend & Frontend bisa auto update dari branch `uat`
- Development & Production environment bisa dipilih dengan mudah

---
