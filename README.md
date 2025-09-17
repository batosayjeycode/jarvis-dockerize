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
make uat
```

Akses:

- Frontend → [http://localhost:8083](http://localhost:8083)
- Backend → [http://localhost:8990](http://localhost:8990)
- Rabbitmq → [http://localhost:15673](http://localhost:15673)

## 📜 Makefile Commands

| Command               | Deskripsi                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| `make uat`            | Jalankan container di mode **development** (menjalankan "remove node_modules" dan "npm install") |
| `make uat-new`        | untuk Docker version terbaru (menjalankan "remove node_modules" dan "npm install")               |
| `make master`         | Jalankan container di mode **prod** (menjalankan "remove node_modules" dan "npm install")        |
| `make master-new`     | untuk Docker version terbaru (menjalankan "remove node_modules" dan "npm install")               |
| `make dev-uat`        | Jalankan container di mode **development**                                                       |
| `make dev-uat-new`    | untuk Docker version terbaru                                                                     |
| `make dev-master`     | Jalankan container di mode **prod**                                                              |
| `make dev-master-new` | untuk Docker version terbaru                                                                     |

---

## 🛠 Logs & Debugging

Lalu buka [http://localhost:15673](http://localhost:15672)
(default login: `guest` / `guest`).

---

## ✅ Rekomendasi Workflow

1. Install Node.js, NVM(Node Version Manager), Docker dan Git di local. Jalankan cek version ini:

   ```bash
   node -v
   nvm -v
   docker -v
   git -v
   ```

   → Pastikan Node.js, NVM(Node Version Manager), Docker dan Git sudah terinstall di local

   NVM (Node Version Manager) ini digunakan untuk bisa switch ke Node version yang ingin digunakan

2. Jalankan ini:

   ```bash
   git clone git@github.com:batosayjeycode/jarvis-dockerize.git
   cd jarvis-dockerize
   git checkout feature/dockerize
   ```

   → Ini adalah clone repo ini, lalu pindah ke folder clone, lalu pilih branch "feature/dockerize"

3. Jalankan ini:

   ```bash
   git clone git@bitbucket.org:Sociolla/jarvis-api.git backend-temp
   rsync -av backend-temp/ backend/
   rm -rf backend-temp
   ```

   → Ini adalah clone repo jarvis-api, lalu menimpa isi file yang ada di folder backend

4. Jalankan ini:

   ```bash
   git clone git@bitbucket.org:Sociolla/jarvis-web.git frontend-temp
   rsync -av frontend-temp/ frontend/
   rm -rf frontend-temp
   ```

   → Ini adalah clone repo jarvis-web, lalu menimpa isi file yang ada di folder frontend

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

   Lalu Buat file ".env" di folder backend (copy paste dari .env uat), lalu sesuaikan isinya dengan yang ada di file ".env-local"

   Noted: Jika melakukan git switch branch di folder backend, jangan lupa service "workers" ini di-restart di Docker ya

7. Jalankan ini:

   ```bash
   cd ..
   cd frontend
   git checkout uat
   ```

   Cek file "config/default.env.js" di folder frontend, lalu sesuaikan isinya dengan yang ada di file "config/default-local.env.js".

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
   make uat
   ```

   atau untuk Docker version terbaru, menggunakan perintah `docker compose`, bukan `docker-compose`. Jalankan ini:

   ```bash
   cd ..
   make uat-new
   ```

   → Pindah ke root folder, kemudian jalankan container

---

⚡ Dengan setup ini:

- Redis & RabbitMQ hanya internal (lebih aman)
- Backend & Frontend bisa auto update dari branch `uat`
- Development & Production environment bisa dipilih dengan mudah

---
