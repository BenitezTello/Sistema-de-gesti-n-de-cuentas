# ABT Streaming — Documentación del Sistema
**Versión:** 1.0  
**Fecha:** Mayo 2026  
**Responsable:** Carlos Aldair Benitez Tello  

---

## 1. Descripción General

**ABT Streaming** es un sistema web de gestión de cuentas de streaming desarrollado a medida. Permite administrar cuentas de plataformas (Netflix, Disney+, etc.), asignar perfiles a clientes, controlar vencimientos y enviar cobros masivos por WhatsApp.

### Acceso al sistema
| Dato | Valor |
|---|---|
| URL principal | https://www.abtstreaming.site |
| URL alternativa | https://abtstreaming.site |
| Usuarios | Solo usuarios registrados manualmente (sin registro público) |

---

## 2. Infraestructura y Pagos

### 2.1 Servidor VPS — Hetzner
| Campo | Detalle |
|---|---|
| Proveedor | Hetzner Cloud (Alemania) |
| Plan | CX23 — Shared Cost-Optimized |
| Especificaciones | 4 GB RAM / 2 vCPU / 40 GB SSD |
| Sistema Operativo | Ubuntu 24.04 LTS |
| IP pública | 46.224.238.114 |
| Ubicación | Nuremberg, Alemania |
| Costo | $5.59 USD/mes (servidor $4.99 + IPv4 $0.60) |
| Backup activado | Sí (20% adicional ≈ $1.00/mes) |
| **Total mensual** | **~$6.59 USD/mes** |
| URL de gestión | hetzner.com → Cloud Console |

### 2.2 Dominio — Namecheap
| Campo | Detalle |
|---|---|
| Proveedor | Namecheap |
| Dominio | abtstreaming.site |
| Costo | $1.18 USD/año (dominio $0.98 + ICANN fee $0.20) |
| Vencimiento | Mayo 2027 |
| Auto-renovación | Activada |
| URL de gestión | namecheap.com → Domain List |

### 2.3 Certificado SSL
| Campo | Detalle |
|---|---|
| Proveedor | Let's Encrypt (gratuito) |
| Gestión | Certbot (renovación automática cada 90 días) |
| Costo | $0.00 |
| Vencimiento actual | Agosto 2026 (renueva solo) |

### 2.4 Resumen de Costos
| Concepto | Costo |
|---|---|
| Servidor Hetzner | $6.59 USD/mes |
| Dominio | $0.10 USD/mes ($1.18/año) |
| SSL | Gratis |
| **TOTAL MENSUAL** | **~$6.69 USD/mes** |
| **TOTAL ANUAL** | **~$80.28 USD/año** |

---

## 3. Arquitectura del Sistema

```
Internet
    │
    ▼
[Nginx — Puerto 80/443]
    │  Redirige HTTP→HTTPS y sin-www→www
    │
    ▼
[Node.js App — Puerto 3000]  (Contenedor Docker: streammanager-app)
    │
    ├── Sirve frontend React (archivos estáticos /dist)
    ├── API REST /api/data/*  →  SQLite (streammanager.db)
    └── Proxy /api/wa/*  ──────► [Node.js WA — Puerto 3001]
                                  (Contenedor Docker: streammanager-wa)
                                       │
                                       └── Chrome + WhatsApp Web
                                           (puppeteer + whatsapp-web.js)
```

### Red Docker
- Red interna: `stream-net` (bridge)
- El contenedor WA no es accesible desde internet, solo desde el contenedor App

---

## 4. Stack Tecnológico

### Frontend
| Tecnología | Versión | Uso |
|---|---|---|
| React | 19 | Framework UI |
| Vite | 8 | Build tool |
| Tailwind CSS | 4 | Estilos |
| Framer Motion | 12 | Animaciones |
| date-fns | 4 | Manejo de fechas |

### Backend — App
| Tecnología | Versión | Uso |
|---|---|---|
| Node.js | 20 | Runtime |
| Express | 4 | Servidor HTTP |
| better-sqlite3 | 12 | Base de datos |
| jsonwebtoken | 9 | Autenticación JWT |
| bcryptjs | 2 | Hash de contraseñas |

### Backend — WhatsApp
| Tecnología | Versión | Uso |
|---|---|---|
| Node.js | 20 | Runtime |
| Express | 4 | Servidor HTTP |
| whatsapp-web.js | 1.26 | Cliente WhatsApp |
| puppeteer | 22 | Navegador Chrome |
| qrcode | 1 | Generación QR |

### Infraestructura
| Tecnología | Uso |
|---|---|
| Docker + Docker Compose | Contenedores |
| Nginx | Proxy reverso + SSL |
| Certbot | Certificados SSL automáticos |
| Ubuntu 24.04 | Sistema operativo del servidor |

---

## 5. Base de Datos

**Motor:** SQLite (archivo: `/streammanager.db`)  
**Ubicación en servidor:** Volumen Docker `streammanager_db_data` → `/app/server/data/`  
**Modo:** WAL (Write-Ahead Logging) — optimizado para concurrencia

### Tablas

#### `users` — Usuarios del sistema
| Columna | Tipo | Descripción |
|---|---|---|
| id | TEXT PK | ID único |
| username | TEXT UNIQUE | Nombre de usuario |
| password_hash | TEXT | Contraseña encriptada (bcrypt) |

#### `suppliers` — Proveedores de cuentas
| Columna | Tipo | Descripción |
|---|---|---|
| id | TEXT PK | ID único |
| name | TEXT | Nombre del proveedor |
| contact | TEXT | Número de contacto |

#### `accounts` — Cuentas de streaming
| Columna | Tipo | Descripción |
|---|---|---|
| id | TEXT PK | ID único |
| platform | TEXT | Plataforma (Netflix, Disney+, etc.) |
| email | TEXT | Correo de la cuenta |
| password | TEXT | Contraseña de la cuenta |
| supplier_id | TEXT | FK → suppliers |
| cost | REAL | Costo de la cuenta |
| expiry_date | TEXT | Fecha de vencimiento (YYYY-MM-DD) |
| max_profiles | INTEGER | Número máximo de perfiles |
| password_changed | INTEGER | Flag: contraseña cambiada (0/1) |
| is_full_account | INTEGER | Flag: cuenta completa (0/1) |
| full_client | TEXT | JSON con datos del cliente (cuenta completa) |

#### `profiles` — Perfiles dentro de cada cuenta
| Columna | Tipo | Descripción |
|---|---|---|
| id | TEXT PK | ID único |
| account_id | TEXT FK | FK → accounts (CASCADE DELETE) |
| number | INTEGER | Número de perfil (1, 2, 3...) |
| pin | TEXT | PIN del perfil |
| client_name | TEXT | Nombre del cliente asignado |
| phone | TEXT | Teléfono del cliente |
| status | TEXT | Estado: available / active |
| expiry_date | TEXT | Fecha de vencimiento del cliente |

### Capacidad estimada
| Métrica | Tu uso | Límite práctico |
|---|---|---|
| Cuentas | 80 | +100,000 |
| Perfiles | ~400 | +500,000 |
| Clientes | 1,000 | +1,000,000 |
| Tamaño DB | ~10 MB | Sin límite real |

---

## 6. Contenedores Docker

### `streammanager-app`
| Campo | Valor |
|---|---|
| Imagen | Dockerfile (2 stages: build React + Node server) |
| Puerto expuesto | 3000 (interno, nginx hace proxy) |
| Variables de entorno | NODE_ENV, PORT, WA_HOST, WA_PORT, JWT_SECRET |
| Volumen datos | `db_data` → /app/server/data |
| Restart policy | unless-stopped |

### `streammanager-wa`
| Campo | Valor |
|---|---|
| Imagen | Dockerfile.wa (Node + Chrome) |
| Puerto | 3001 (solo red interna Docker) |
| Volumen sesión | `wa_session` → /app/server/.wwebjs_auth |
| Shared memory | 1 GB (requerido por Chrome) |
| Restart policy | unless-stopped |
| Tamaño imagen | ~2.5 GB |

---

## 7. Funcionalidades del Sistema

| Módulo | Funcionalidad |
|---|---|
| **Dashboard** | Resumen general, métricas de cuentas y clientes |
| **Ventas** | Asignar perfiles a clientes, gestionar vencimientos |
| **Cuentas** | CRUD de cuentas de streaming |
| **Clientes** | Vista por cliente con todos sus perfiles |
| **Cobros WA** | Envío masivo de mensajes de cobro por WhatsApp |
| **Proveedores** | CRUD de proveedores de cuentas |
| **Login** | Autenticación segura con JWT (7 días de sesión) |
| **Export CSV** | Exportar suscripciones activas |

---

## 8. Autenticación y Seguridad

- **Sistema:** JWT (JSON Web Token) con expiración de 7 días
- **Contraseñas:** Hash bcrypt con factor 12 (irreversible)
- **Sin registro público:** Solo el administrador puede crear usuarios
- **HTTPS:** Todo el tráfico encriptado con SSL
- **Firewall UFW:** Solo puertos 22 (SSH), 80 (HTTP), 443 (HTTPS) abiertos
- **Red Docker:** WhatsApp no accesible desde internet

---

## 9. Acceso al Servidor

### Conexión SSH
```bash
ssh root@46.224.238.114
```
Contraseña: (la que se configuró al crear el servidor)

### Comandos de gestión
```bash
# Ver estado de contenedores
docker compose ps

# Ver logs del app
docker compose logs -f app

# Ver logs de WhatsApp
docker compose logs -f wa

# Reiniciar solo el app
docker compose restart app

# Reiniciar todo
docker compose restart

# Apagar todo
docker compose down

# Levantar todo
docker compose up -d
```

### Agregar nuevo usuario al sistema
```bash
docker exec streammanager-app node server/scripts/add-user.js <usuario> <contraseña>
```
Ejemplo:
```bash
docker exec streammanager-app node server/scripts/add-user.js maria mipassword123
```

---

## 10. Actualizar el Código

Cuando se hagan cambios en el código:

**Paso 1 — Desde tu PC (PowerShell):**
```powershell
scp "C:\Users\51929\Documents\SISTEMA DE GESTIÓN DE CUENTAS\server\index.js" root@46.224.238.114:/root/streammanager/server/
```

**Paso 2 — En el servidor (SSH):**
```bash
cd /root/streammanager
docker compose build --no-cache app
docker compose up -d app
```

---

## 11. Plan de Mantenimiento

### Mensual
- [ ] Verificar que WhatsApp sigue conectado
- [ ] Revisar logs: `docker compose logs --tail 50 app`
- [ ] Verificar uso de disco: `df -h`
- [ ] Verificar uso de RAM: `free -h`

### Anual
- [ ] Renovar dominio `abtstreaming.site` en Namecheap ($1.18)
- [ ] Revisar factura de Hetzner
- [ ] Actualizar contraseñas de usuarios si es necesario

### Automático (no requiere acción)
- ✅ SSL se renueva solo cada 90 días (certbot)
- ✅ Contenedores se reinician solos si fallan (unless-stopped)
- ✅ Backups de Hetzner (diarios, retención 7 días)

---

## 12. Recuperación ante Fallos

### El sistema no carga
```bash
ssh root@46.224.238.114
docker compose ps                    # Ver estado
docker compose logs --tail 30 app    # Ver errores
docker compose restart app           # Reiniciar
```

### WhatsApp se desconecta
1. Entrar a https://www.abtstreaming.site
2. Ir a "Cobros WA"
3. Click en "Conectar"
4. Escanear QR con el celular

### Restaurar desde backup (Hetzner)
1. Entrar a hetzner.com → Cloud Console
2. Proyecto → Servidor `abtstreaming`
3. Backups → Seleccionar fecha → Restore

---

## 13. Archivos del Proyecto

```
/root/streammanager/              ← Raíz en el servidor
├── docker-compose.yml            ← Configuración de contenedores
├── Dockerfile                    ← Imagen del App
├── Dockerfile.wa                 ← Imagen de WhatsApp
├── .dockerignore                 ← Archivos excluidos del build
├── index.html                    ← HTML base del frontend
├── package.json                  ← Dependencias frontend
├── vite.config.js                ← Configuración Vite
├── public/
│   └── logo.png                  ← Logo ABT Zone
├── src/                          ← Código fuente React
│   ├── App.jsx                   ← Componente raíz + autenticación
│   ├── index.css                 ← Estilos globales
│   ├── components/               ← Vistas y componentes UI
│   ├── context/AppContext.jsx    ← Estado global + llamadas API
│   ├── hooks/useWAEvents.js      ← Conexión SSE WhatsApp
│   └── utils/whatsapp.js         ← Utilidades WhatsApp
└── server/                       ← Código fuente backend
    ├── index.js                  ← Servidor principal (Express)
    ├── auth.js                   ← Autenticación JWT
    ├── db.js                     ← Base de datos SQLite
    ├── wa.js                     ← Servidor WhatsApp
    ├── package-app.json          ← Deps del servidor App
    ├── package-wa.json           ← Deps del servidor WA
    ├── routes/data.js            ← Rutas API REST
    └── scripts/add-user.js       ← Script para crear usuarios
```

---

## 14. Contacto y Soporte

| Campo | Detalle |
|---|---|
| Desarrollador | Claude (Anthropic) — asistido por IA |
| Propietario | Carlos Aldair Benitez Tello |
| Email | carlos.benitez@unas.edu.pe |
| Teléfono | +51 929 614 643 |
| Ciudad | Tingo María, Huánuco, Perú |

---

*Documento generado en Mayo 2026 — ABT Streaming v1.0*
