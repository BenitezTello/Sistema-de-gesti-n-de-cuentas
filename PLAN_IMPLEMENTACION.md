# ABT Streaming — Plan de Implementación TPS
**Documento de continuidad para nuevo chat con Claude**  
**Fecha:** Mayo 2026  
**Propietario:** Carlos Aldair Benitez Tello

---

## CONTEXTO: Qué es este proyecto

**ABT Streaming** es un sistema web de gestión de cuentas de streaming (Netflix, Disney+, HBO Max, Prime Video, Crunchyroll, Movistar+) desplegado en producción en https://www.abtstreaming.site

Es un negocio real: el propietario compra cuentas de streaming a proveedores y revende perfiles individuales a sus clientes. El sistema gestiona asignaciones, vencimientos y cobra por WhatsApp.

---

## STACK ACTUAL

```
Frontend:  React 19 + Vite 8 + Tailwind CSS 4 + Framer Motion 12
Backend:   Node.js 20 + Express 4
Base datos: SQLite (better-sqlite3) con WAL mode + FK habilitadas
Auth:      JWT (jsonwebtoken) + bcrypt (salt 12)
Cifrado:   AES-256-GCM para contraseñas de cuentas
WhatsApp:  whatsapp-web.js 1.26 + puppeteer 22
Docker:    2 contenedores (app:3000, wa:3001) + Nginx + Certbot SSL
Servidor:  Hetzner VPS CX23 (4GB RAM / 2vCPU / 40GB SSD) Ubuntu 24.04
```

---

## ESTRUCTURA DE ARCHIVOS

```
raíz/
├── src/                          ← Frontend React
│   ├── App.jsx                   ← Routing principal + auth guard
│   ├── context/AppContext.jsx    ← Estado global + todas las llamadas API
│   ├── components/
│   │   ├── Dashboard.jsx         ← Métricas y resumen general
│   │   ├── AccountsView.jsx      ← Crear/editar cuentas y perfiles
│   │   ├── AccountsListView.jsx  ← Lista detallada de cuentas
│   │   ├── ClientsView.jsx       ← Gestión de clientes
│   │   ├── WhatsAppView.jsx      ← Envío masivo de cobros WA
│   │   ├── SuppliersView.jsx     ← CRUD de proveedores
│   │   ├── Login.jsx             ← Pantalla de login
│   │   ├── Modals.jsx            ← Componentes modal reutilizables
│   │   ├── Toast.jsx             ← Sistema de notificaciones
│   │   └── Pagination.jsx        ← Paginación
│   ├── hooks/useWAEvents.js      ← SSE para estado WhatsApp
│   └── utils/whatsapp.js
│
├── server/
│   ├── index.js                  ← Servidor Express principal (puerto 3000)
│   ├── wa.js                     ← Servidor WhatsApp separado (puerto 3001)
│   ├── db.js                     ← Toda la lógica de SQLite: schema, migrations, seed
│   ├── auth.js                   ← Middleware JWT + rate limiting
│   ├── crypto-utils.js           ← AES-256-GCM encrypt/decrypt
│   ├── routes/data.js            ← Todas las rutas API /api/data/*
│   └── scripts/
│       ├── add-user.js           ← Crear usuarios por CLI
│       └── import-excel.js       ← Importar datos desde CSV
│
├── docker-compose.yml
├── Dockerfile                    ← Build multietapa React + Node
├── Dockerfile.wa                 ← Node + Chrome para WhatsApp
└── nginx.conf
```

---

## ESQUEMA DE BASE DE DATOS ACTUAL

```sql
-- Usuarios del sistema (solo admin crea usuarios, no hay registro público)
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL
);

-- Proveedores de cuentas de streaming
CREATE TABLE suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  contact TEXT
);

-- Cuentas de streaming
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,           -- Netflix, Disney+, HBO Max, Prime Video, etc.
  email TEXT NOT NULL,
  password TEXT NOT NULL,           -- Cifrada con AES-256-GCM
  supplier_id TEXT REFERENCES suppliers(id),
  cost REAL,                        -- Lo que le cuesta al dueño (egreso)
  expiry_date TEXT,                 -- YYYY-MM-DD
  max_profiles INTEGER DEFAULT 5,
  password_changed INTEGER DEFAULT 0,
  is_full_account INTEGER DEFAULT 0,
  full_client TEXT,                 -- JSON con datos del cliente si es cuenta completa
  is_down INTEGER DEFAULT 0,        -- Cuenta caída/con problemas
  access TEXT
);

-- Perfiles dentro de cada cuenta
CREATE TABLE profiles (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,          -- 1, 2, 3...
  pin TEXT,
  client_name TEXT,
  phone TEXT,
  status TEXT DEFAULT 'available',  -- 'available' | 'active'
  expiry_date TEXT,                 -- YYYY-MM-DD del cliente
  needs_pin_change INTEGER DEFAULT 0
);

-- Historial de clientes (sin suscripción activa pero guardados)
CREATE TABLE saved_clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT
);
```

---

## API ROUTES ACTUALES

```
POST   /api/auth/login                    ← Rate limited (5 intentos / 15min)
GET    /api/auth/verify
GET    /api/auth/sse-token                ← Token corto (5min) para SSE
POST   /api/auth/logout

GET    /api/data/accounts                 ← Lista todas las cuentas con perfiles
POST   /api/data/accounts                 ← Crear cuenta + perfiles
PUT    /api/data/accounts/:id             ← Actualizar cuenta
DELETE /api/data/accounts/:id             ← Eliminar cuenta (cascade perfiles)

POST   /api/data/accounts/:id/profiles    ← Agregar perfil a cuenta
PUT    /api/data/profiles/:id             ← Actualizar perfil (asignar cliente, renovar, liberar)
DELETE /api/data/profiles/:id

POST   /api/data/clients/update           ← Actualizar cliente en todos sus perfiles
POST   /api/data/clients/extend           ← Renovar todos los perfiles de un cliente
GET    /api/data/clients                  ← Historial de clientes guardados
POST   /api/data/clients
DELETE /api/data/clients/:id

GET    /api/data/suppliers
POST   /api/data/suppliers
PUT    /api/data/suppliers/:id
DELETE /api/data/suppliers/:id

GET    /api/wa/events                     ← SSE estado WhatsApp
POST   /api/wa/connect
POST   /api/wa/disconnect
POST   /api/wa/send-bulk                  ← Envío masivo con delay 25-35s
```

---

## FUNCIONALIDADES QUE YA EXISTEN (NO TOCAR)

- CRUD completo de cuentas, perfiles, proveedores, clientes
- Asignar/liberar perfiles a clientes con fecha de vencimiento
- Renovar perfiles individuales o en combo (todos los del mismo cliente)
- Dashboard con métricas: vencidos, vence hoy, próximos, activos
- Exportar CSV de suscripciones activas
- WhatsApp: conectar vía QR, envío masivo con plantillas personalizadas
- Login con JWT + rate limiting + HTTPS en producción
- Cifrado AES-256-GCM de contraseñas en BD
- Docker containerizado con persistencia en volúmenes

---

## LO QUE FALTA IMPLEMENTAR (las 4 mejoras TPS)

---

### FEATURE 1: Sistema de Roles y Permisos por Plataforma

**Objetivo:** El admin puede crear usuarios con permisos limitados a plataformas específicas. Ejemplo: usuario "juan" solo ve y gestiona cuentas de HBO Max y Prime Video.

**Cambios en BD:**
```sql
-- Agregar columna a users
ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user';
-- role: 'admin' | 'user'

ALTER TABLE users ADD COLUMN permissions TEXT DEFAULT '["all"]';
-- JSON array: ["all"] para admin, o ["Netflix", "HBO Max"] para user restringido

ALTER TABLE users ADD COLUMN created_at TEXT DEFAULT (datetime('now'));
ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1;
```

**Lógica de negocio:**
- Solo usuarios con `role = 'admin'` pueden: crear/eliminar usuarios, ver audit log, ver la vista de proveedores, ver costos de cuentas
- Usuarios con `role = 'user'` solo ven las cuentas cuya `platform` esté en su array `permissions`
- Si `permissions = ["all"]` → ve todo (solo admin debería tener esto)
- El JWT debe incluir `{ id, username, role, permissions }` en el payload
- El backend filtra en `GET /api/data/accounts` según los permisos del token

**Nuevas rutas necesarias:**
```
GET    /api/data/users              ← Solo admin
POST   /api/data/users              ← Crear usuario (solo admin)
PUT    /api/data/users/:id          ← Editar permisos/estado (solo admin)
DELETE /api/data/users/:id          ← Desactivar usuario (solo admin)
```

**Frontend:**
- Nueva vista "Usuarios" en sidebar, visible solo para admin
- Formulario: username, contraseña, selección múltiple de plataformas permitidas (checkboxes)
- El sidebar debe ocultar "Proveedores" para usuarios no-admin
- Los costos de cuentas no deben ser visibles para usuarios no-admin

---

### FEATURE 2: Audit Log (Quién hizo qué y cuándo)

**Objetivo:** El admin ve un historial completo de todas las acciones realizadas en el sistema: quién asignó, editó o eliminó qué, con timestamp e IP.

**Nueva tabla:**
```sql
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,           -- Guardarlo directo (si borran user, el log persiste)
  action TEXT NOT NULL,             -- 'CREATE' | 'UPDATE' | 'DELETE'
  entity TEXT NOT NULL,             -- 'account' | 'profile' | 'supplier' | 'client' | 'user' | 'payment'
  entity_id TEXT,                   -- ID del registro afectado
  description TEXT NOT NULL,        -- Texto legible: "Asignó perfil #2 de Netflix a Juan Pérez"
  ip_address TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

**Implementación:**
- Crear función helper `logAction(db, userId, username, action, entity, entityId, description, ip)` en `db.js`
- Llamar esta función en cada ruta que muta datos (POST/PUT/DELETE en `routes/data.js`)
- El IP se extrae de `req.ip` o `req.headers['x-forwarded-for']` (importante con Nginx)

**Ejemplos de `description` a generar:**
- `"Creó cuenta Netflix (email@gmail.com) con 5 perfiles"`
- `"Asignó perfil #3 de HBO Max a María García (tel: +51...)"` 
- `"Renovó perfil #1 de Disney+ de Juan Pérez hasta 2026-07-01"`
- `"Liberó perfil #2 de Prime Video (cliente anterior: Pedro Ruiz)"`
- `"Eliminó cuenta Netflix (email@gmail.com)"`
- `"Creó usuario 'juan' con permisos: HBO Max, Prime Video"`

**Nueva ruta:**
```
GET /api/data/audit?page=1&limit=50&user=&entity=&from=&to=  ← Solo admin
```

**Frontend:**
- Nueva vista "Auditoría" en sidebar, visible solo para admin
- Tabla con filtros: por usuario, por tipo de entidad, por rango de fechas
- Paginación
- Cada fila muestra: fecha/hora, usuario, acción (badge coloreado), descripción, IP

---

### FEATURE 3: Registro de Pagos (Ingresos y Egresos)

**Objetivo:** Registrar automáticamente cada cobro a cliente (ingreso) y cada compra de cuenta a proveedor (egreso). El dashboard muestra ganancia neta.

**Nuevas tablas:**
```sql
-- Precios por defecto por plataforma (editables para promos)
CREATE TABLE platform_prices (
  id TEXT PRIMARY KEY,
  platform TEXT UNIQUE NOT NULL,    -- 'Netflix', 'Disney+', 'HBO Max', 'Prime Video', etc.
  price REAL NOT NULL,              -- Precio de venta por defecto
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Seed inicial de precios
INSERT INTO platform_prices (id, platform, price) VALUES
  ('pp1', 'Netflix', 13.0),
  ('pp2', 'Disney+', 6.5),
  ('pp3', 'HBO Max', 6.0),
  ('pp4', 'Prime Video', 6.0),
  ('pp5', 'Crunchyroll', 5.0),
  ('pp6', 'Movistar+', 5.0);

-- Registro de transacciones
CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,               -- 'income' | 'expense'
  category TEXT NOT NULL,           -- Ver categorías abajo
  platform TEXT,                    -- Plataforma relacionada
  amount REAL NOT NULL,
  client_name TEXT,                 -- Para ingresos
  client_phone TEXT,                -- Para ingresos
  profile_id TEXT,                  -- FK referencial (no constraint, puede ser null si se borra)
  account_id TEXT,                  -- FK referencial
  supplier_id TEXT,                 -- Para egresos (compra a proveedor)
  notes TEXT,                       -- Notas opcionales
  user_id TEXT NOT NULL,            -- Quién registró
  username TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
```

**Categorías de transacciones:**
```
INGRESOS (type: 'income'):
  'sale'        → Asignación nueva de perfil (cliente paga)
  'renewal'     → Renovación de perfil existente
  -- 'gift' NO registra transacción (es regalo, monto $0)
  -- 'replacement' NO registra transacción (es reemplazo/corrección)

EGRESOS (type: 'expense'):
  'account_purchase'  → Compra de cuenta nueva a proveedor
  'account_renewal'   → Renovación de cuenta existente con proveedor
```

**Flujo de asignación de perfil (ya existe en PUT /api/data/profiles/:id):**
Cuando se asigna un cliente a un perfil, el frontend debe preguntar el tipo:
- **Compra** → registra ingreso automáticamente con el precio default de la plataforma (editable en el modal)
- **Reemplazo** → no registra nada
- **Regalo** → no registra nada

**Flujo de renovación de perfil (ya existe en PUT /api/data/profiles/:id):**
Cuando se renueva, siempre registra ingreso con precio default (editable).

**Flujo de compra/renovación de cuenta (ya existe en POST y PUT /api/data/accounts):**
Cuando se crea una cuenta nueva o se renueva (cambia expiry_date de la cuenta), registra egreso con el campo `cost` de la cuenta.

**Nuevas rutas:**
```
GET  /api/data/transactions?from=&to=&type=&platform=   ← Con filtros
GET  /api/data/platform-prices                          ← Lista precios
PUT  /api/data/platform-prices/:platform                ← Actualizar precio default
GET  /api/data/summary?from=&to=                        ← Totales para dashboard
```

**Respuesta de /api/data/summary:**
```json
{
  "income_total": 1450.50,
  "expense_total": 320.00,
  "net_profit": 1130.50,
  "by_platform": [
    { "platform": "Netflix", "income": 650, "expense": 120, "profit": 530 }
  ],
  "period": { "from": "2026-05-01", "to": "2026-05-31" }
}
```

**Cambios en Dashboard.jsx:**
- Agregar sección de métricas financieras: Ingresos / Egresos / Ganancia Neta del mes
- Selector de período (este mes, mes pasado, rango personalizado)
- Gráfico de barras: ingresos vs egresos por plataforma

---

### FEATURE 4: Reportes Exportables por Período

**Objetivo:** Exportar reportes detallados de transacciones en Excel/CSV con filtros de fecha y plataforma. Cierra el componente "salida formal" del TPS.

**Nuevas rutas:**
```
GET /api/data/reports/transactions?from=&to=&type=&platform=&format=csv
GET /api/data/reports/subscriptions?status=&platform=&format=csv  ← Ya existe parcialmente
```

**Reporte de transacciones (CSV):**
```
Fecha,Tipo,Categoría,Plataforma,Monto,Cliente,Teléfono,Registrado por
2026-05-15,Ingreso,Venta,Netflix,13.00,María García,+51929...,admin
2026-05-16,Egreso,Compra cuenta,HBO Max,45.00,,, admin
```

**Reporte de suscripciones activas (mejorado del CSV actual):**
```
Cliente,Teléfono,Plataforma,Perfil,Vencimiento,Estado,Días restantes
Juan Pérez,+51929...,Netflix,Perfil 2,2026-06-01,Activo,8
```

**Frontend:**
- Nueva vista "Reportes" en sidebar (visible para todos los roles pero filtrado por permisos)
- Panel con dos tabs: "Transacciones" y "Suscripciones"
- Filtros: rango de fechas, plataforma (solo las que el usuario tiene permiso), tipo
- Botón "Exportar CSV" que llama a las rutas de reporte
- Vista previa de la tabla antes de exportar

---

## ORDEN DE IMPLEMENTACIÓN RECOMENDADO

```
1. FEATURE 3 (Pagos)  →  Impacto visual inmediato en dashboard
2. FEATURE 1 (Roles)  →  Requiere migración de users, hacerlo antes que auditoría
3. FEATURE 2 (Audit)  →  Depende de que los roles estén listos (necesita user_id correcto)
4. FEATURE 4 (Reportes) →  Depende de que las transacciones existan (Feature 3)
```

---

## REGLAS IMPORTANTES DEL PROYECTO

1. **NO implementar registro público de usuarios** — solo el admin crea usuarios por la interfaz
2. **NO tocar la integración de WhatsApp** — el envío masivo manual se queda como está
3. **NO migrar a PostgreSQL** — SQLite es suficiente para la escala actual (~80 cuentas, ~400 perfiles)
4. **Tailwind v4** — el proyecto usa Tailwind v4 (sintaxis distinta a v3, sin `tailwind.config.js`, configuración en CSS)
5. **React 19** — usar sintaxis moderna, sin legacy patterns
6. **Framer Motion** — ya instalado, usarlo para animaciones de nuevos componentes
7. **Consistencia visual** — el sistema tiene dark theme oscuro, glassmorphism, colores accent en violeta/púrpura. Respetar el estilo de los componentes existentes
8. **JWT payload** — actualmente es `{ id, username }`, al agregar roles debe ser `{ id, username, role, permissions }` y actualizar el middleware de auth
9. **IDs** — el proyecto usa `crypto.randomUUID()` para generar IDs (TEXT, no autoincrement)
10. **Fechas** — siempre en formato `YYYY-MM-DD` para SQLite, usar `date-fns` en frontend para display

---

## CÓMO HACER DEPLOY DE CAMBIOS AL SERVIDOR

Desde PowerShell local:
```powershell
# Copiar archivos modificados
scp "C:\Users\51929\Documents\SISTEMA DE GESTIÓN DE CUENTAS\server\db.js" root@46.224.238.114:/root/streammanager/server/
scp "C:\Users\51929\Documents\SISTEMA DE GESTIÓN DE CUENTAS\server\routes\data.js" root@46.224.238.114:/root/streammanager/server/routes/
```

Desde SSH en el servidor:
```bash
cd /root/streammanager
docker compose build --no-cache app
docker compose up -d app
```

---

## INSTRUCCIÓN PARA EL NUEVO CHAT

Hola Claude. Estoy desarrollando un sistema web llamado **ABT Streaming** que ya está en producción. Este documento tiene todo el contexto del proyecto y el plan de las 4 mejoras que hay que implementar para convertirlo en un TPS completo.

**Lo que necesito:** Implementar las 4 features descritas arriba en orden, empezando por la **Feature 3 (Registro de Pagos)**.

El proyecto está en `C:\Users\51929\Documents\SISTEMA DE GESTIÓN DE CUENTAS`. Antes de tocar cualquier archivo, léelos primero para entender el código existente y seguir el mismo estilo.

No hagas cambios destructivos en las tablas existentes — solo ALTER TABLE para agregar columnas nuevas y CREATE TABLE para las tablas nuevas. Las migraciones deben ser idempotentes (usar IF NOT EXISTS o checks).
