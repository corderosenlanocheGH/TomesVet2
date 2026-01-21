# TomesVet

Aplicación web para gestión veterinaria con Node.js, MySQL y Bootstrap. Incluye módulos de clientes, mascotas, usuarios e historia clínica.

## Requisitos

- Node.js 18+
- MySQL 8+

## Configuración rápida

1. Crear la base de datos e importar el esquema:

   ```bash
   mysql -u root -p < database.sql
   ```

2. Crear el archivo `.env` (puedes copiar de `.env.example`) y ajustar credenciales.

3. Instalar dependencias e iniciar:

   ```bash
   npm install
   npm run start
   ```

4. Abrir `http://localhost:3000`.

## Estructura

- `index.js`: servidor Express y rutas.
- `views/`: vistas con Bootstrap.
- `database.sql`: esquema y datos de ejemplo.
