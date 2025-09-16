# 📘 Project Setup for Dockerize Jarvis Web

## 🚀 Project Overview

Project ini terdiri dari **3 service utama**:

- **Backend** → Node.js Express
- **Frontend** → Vue.js 3
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
├── workers/ # repo workers (bitbucket branch master)
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

- Frontend → [http://localhost:8084](http://localhost:8084)
- Backend → [http://localhost:7002](http://localhost:7002)
- Rabbitmq → [http://localhost:15674](http://localhost:15674)

## 📜 Makefile Commands

| Command           | Deskripsi                                  |
| ----------------- | ------------------------------------------ |
| `make uat`        | Jalankan container di mode **development** |
| `make uat-new`    | untuk Docker version terbaru               |
| `make master`     | Jalankan container di mode **prod**        |
| `make master-new` | untuk Docker version terbaru               |

---

## 🛠 Logs & Debugging

Lalu buka [http://localhost:15674](http://localhost:15674)
(default login: `guest` / `guest`).

---

## ✅ Rekomendasi Workflow

1. Install Node.js, NVM (Node Version Manager), Docker dan Git di local. Jalankan cek version ini:

   ```bash
   node -v
   nvm -v
   docker -v
   git -v
   ```

   → Pastikan Node.js, NVM, Docker dan Git sudah terinstall di local

   NVM (Node Version Manager) ini digunakan untuk bisa switch ke Node version yang ingin digunakan

3. Jalankan ini:

   ```bash
   git clone git@github.com:batosayjeycode/jarvis-dockerize.git
   cd jarvis-dockerize
   git checkout feature/sanctum-dockerize
   ```

   → Ini adalah clone repo ini, lalu pindah ke folder clone, kemudian pilih branch "feature/sanctum-dockerize"

4. Jalankan ini:

   ```bash
   git clone git@bitbucket.org:Sociolla/sanctum-api.git backend-temp
   rsync -av backend-temp/ backend/
   rm -rf backend-temp
   ```

   → Ini adalah clone repo sanctum-api, lalu timpa isi file yang ada di folder backend

5. Jalankan ini:

   ```bash
   git clone git@bitbucket.org:Sociolla/sanctum-web.git frontend-temp
   rsync -av frontend-temp/ frontend/
   rm -rf frontend-temp
   ```

   → Ini adalah clone repo sanctum-web, lalu timpa isi file yang ada di folder frontend

6. Jalankan ini:

   ```bash
   git clone git@bitbucket.org:Sociolla/workers.git workers-temp
   rsync -av workers-temp/ workers/
   rm -rf workers-temp
   ```

   → Ini adalah clone repo workers, lalu timpa isi file yang ada di folder workers

7. Cek node version dengan menjalankan ini:

   ```bash
   node -v
   ```

   → pastikan menggunakan node versi "**v16.14.2**"

8. Jalankan ini:

   ```bash
   cd backend
   git checkout uat
   ```

   Tidak perlu melakukan "npm install" di local folder backend karena sudah ditambahkan "npm install" pada file "Makefile"

   Lalu Buat file ".env" di folder backend (copy paste dari .env uat), lalu sesuaikan isinya dengan yang ada di file ".env-local"

9. Jalankan ini:

   ```bash
   cd ..
   cd frontend
   git checkout uat
   ```

   Tidak perlu melakukan "npm install" di local folder frontend (karna tidak support untuk copy paste folder node_modules), ini akan dilakukan di dalam Dockerfile di container

   Cek file "config/default.env.js" di folder frontend, lalu sesuaikan isinya dengan yang ada di file "config/default-local.env.js"

   Cek file "config/web.env.js" di folder frontend, lalu sesuaikan isinya dengan yang ada di file "config/web-local.env.js"

   Cek juga di file "package.json", lalu sesuaikan isinya dengan yang ada di file "package-local.json"

   Cek juga di file ".dockerignore", lalu sesuaikan isinya dengan yang ada di file ".dockerignore-local"

10. Jalankan ini:

   ```bash
   cd workers
   git checkout master
   ```

   Tidak perlu melakukan "npm install" di local folder backend karena sudah ditambahkan "npm install" pada file "Makefile"

   Lalu Buat file ".env" di folder backend (copy paste dari .env uat), lalu sesuaikan isinya dengan yang ada di file ".env-local"

   Cek file "send-email/index.js", pada branch master (prod) kita hanya diberikan access readonly di Mongodb, sehingga proses insert / update pada script untuk Mongodb harus di-comment/di nonaktifkan agar proses send email bisa berjalan dengan baik. Sesuaikan isinya dengan yang ada di file "send-email/index-local-prod.js"

11. Jalankan:

```bash
docker pull redis:6
docker pull rabbitmq:3-management
docker pull node:16.14.2-alpine
```

→ Ini dilakukan untuk download image Docker yang digunakan terlebih dahulu. Image ini digunakan di file docker-compose.dev.yml dan Dockerfile

11. Jalankan:

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
