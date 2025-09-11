# jarvis-dockerize

Dockerize Jarvis Web

```markdown
# 📘 Project Setup with Docker Compose

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

````

---

## 🐳 Docker Compose

### Development Mode
Menjalankan backend, frontend, worker dengan **hot reload** (mount volume ke host).
```bash
make dev
````

Akses:

- Frontend → [http://localhost:8083](http://localhost:8081)
- Backend → [http://localhost:5000](http://localhost:5000)
- Rabbitmq → [http://localhost:15673](http://localhost:15672)

## 📜 Makefile Commands

| Command    | Deskripsi                                  |
| ---------- | ------------------------------------------ |
| `make dev` | Jalankan container di mode **development** |

---

## 🛠 Logs & Debugging

Lalu buka [http://localhost:15673](http://localhost:15672)
(default login: `guest` / `guest`).

---

## ✅ Rekomendasi Workflow

1. Install Docker di local.
2. Clone repo jarvis-api, lalu timpa isi file yang ada di folder backend
3. Clone repo jarvis-web, lalu timpa isi file yang ada di folder frontend
4. Buat file ".env" di folder backend (copy paste dari .env uat), lalu sesuaikan isinya dengan yang ada di file ".env-local"
5. Cek file "config/default.env.js" di folder frontend, lalu sesuaikan isinya dengan yang ada di file "config/default-local.env.js"
6. Lakukan

   ```bash
   node -v
   ```

   → pastikan menggunakan node versi "v16.14.2".

7. Jalankan "npm install" di folder backend & frontend.
8. Jalankan:

   ```bash
   make dev
   ```

   → otomatis update repo + jalankan container.

---

⚡ Dengan setup ini:

- Redis & RabbitMQ hanya internal (lebih aman).
- Backend & Frontend bisa auto update dari branch `uat`.
- Development & Production environment bisa dipilih dengan mudah.

```

---
```
