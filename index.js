const path = require('path');
const express = require('express');
const dotenv = require('dotenv');

dotenv.config();

const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

app.get(
  '/',
  asyncHandler(async (req, res) => {
    const [
      [clienteCount],
      [mascotaCount],
      [usuarioCount],
      [historiaCount],
      [turnoCount],
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) AS total FROM clientes'),
      pool.query('SELECT COUNT(*) AS total FROM mascotas'),
      pool.query('SELECT COUNT(*) AS total FROM usuarios'),
      pool.query('SELECT COUNT(*) AS total FROM historia_clinica'),
      pool.query('SELECT COUNT(*) AS total FROM turnos'),
    ]);

    res.render('index', {
      counts: {
        clientes: clienteCount.total,
        mascotas: mascotaCount.total,
        usuarios: usuarioCount.total,
        historias: historiaCount.total,
        turnos: turnoCount.total,
      },
    });
  })
);

app.get(
  '/clientes',
  asyncHandler(async (req, res) => {
    const [clientes] = await pool.query('SELECT * FROM clientes ORDER BY id DESC');
    res.render('clientes', { clientes });
  })
);

app.post(
  '/clientes',
  asyncHandler(async (req, res) => {
    const { nombre, telefono, email, direccion } = req.body;
    await pool.query(
      'INSERT INTO clientes (nombre, telefono, email, direccion) VALUES (?, ?, ?, ?)',
      [nombre, telefono, email, direccion]
    );
    res.redirect('/clientes');
  })
);

app.get(
  '/mascotas',
  asyncHandler(async (req, res) => {
    const [mascotas] = await pool.query(
      `SELECT mascotas.*, clientes.nombre AS cliente_nombre
       FROM mascotas
       JOIN clientes ON clientes.id = mascotas.cliente_id
       ORDER BY mascotas.id DESC`
    );
    const [clientes] = await pool.query('SELECT id, nombre FROM clientes ORDER BY nombre');
    res.render('mascotas', { mascotas, clientes });
  })
);

app.post(
  '/mascotas',
  asyncHandler(async (req, res) => {
    const { nombre, especie, raza, fecha_nacimiento, cliente_id } = req.body;
    await pool.query(
      `INSERT INTO mascotas (nombre, especie, raza, fecha_nacimiento, cliente_id)
       VALUES (?, ?, ?, ?, ?)`,
      [nombre, especie, raza, fecha_nacimiento || null, cliente_id]
    );
    res.redirect('/mascotas');
  })
);

app.get(
  '/usuarios',
  asyncHandler(async (req, res) => {
    const [usuarios] = await pool.query('SELECT * FROM usuarios ORDER BY id DESC');
    res.render('usuarios', { usuarios });
  })
);

app.post(
  '/usuarios',
  asyncHandler(async (req, res) => {
    const { nombre, rol, email } = req.body;
    await pool.query('INSERT INTO usuarios (nombre, rol, email) VALUES (?, ?, ?)', [
      nombre,
      rol,
      email,
    ]);
    res.redirect('/usuarios');
  })
);

app.get(
  '/historia-clinica',
  asyncHandler(async (req, res) => {
    const [historias] = await pool.query(
      `SELECT historia_clinica.*, mascotas.nombre AS mascota_nombre
       FROM historia_clinica
       JOIN mascotas ON mascotas.id = historia_clinica.mascota_id
       ORDER BY historia_clinica.fecha DESC`
    );
    const [mascotas] = await pool.query('SELECT id, nombre FROM mascotas ORDER BY nombre');
    res.render('historia', { historias, mascotas });
  })
);

app.post(
  '/historia-clinica',
  asyncHandler(async (req, res) => {
    const { mascota_id, fecha, motivo, diagnostico, tratamiento } = req.body;
    await pool.query(
      `INSERT INTO historia_clinica (mascota_id, fecha, motivo, diagnostico, tratamiento)
       VALUES (?, ?, ?, ?, ?)`,
      [mascota_id, fecha, motivo, diagnostico, tratamiento]
    );
    res.redirect('/historia-clinica');
  })
);

app.get(
  '/turnos',
  asyncHandler(async (req, res) => {
    const [turnos] = await pool.query(
      `SELECT turnos.*, clientes.nombre AS cliente_nombre, mascotas.nombre AS mascota_nombre
       FROM turnos
       JOIN clientes ON clientes.id = turnos.cliente_id
       JOIN mascotas ON mascotas.id = turnos.mascota_id
       ORDER BY turnos.fecha DESC, turnos.hora DESC`
    );
    const [clientes] = await pool.query('SELECT id, nombre FROM clientes ORDER BY nombre');
    const [mascotas] = await pool.query(
      `SELECT mascotas.id, mascotas.nombre, clientes.nombre AS cliente_nombre
       FROM mascotas
       JOIN clientes ON clientes.id = mascotas.cliente_id
       ORDER BY mascotas.nombre`
    );
    res.render('turnos', { turnos, clientes, mascotas });
  })
);

app.post(
  '/turnos',
  asyncHandler(async (req, res) => {
    const { cliente_id, mascota_id, fecha, hora, motivo } = req.body;
    await pool.query(
      `INSERT INTO turnos (cliente_id, mascota_id, fecha, hora, motivo)
       VALUES (?, ?, ?, ?, ?)`,
      [cliente_id, mascota_id, fecha, hora, motivo]
    );
    res.redirect('/turnos');
  })
);

app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Página no encontrada | TomesVet',
    heading: 'Página no encontrada',
    message: 'La ruta solicitada no existe. Verifica la dirección e intenta nuevamente.',
  });
});

app.use((err, req, res, next) => {
  console.error('Error inesperado:', err);
  res.status(500).render('error', {
    title: 'Error del servidor | TomesVet',
    heading: 'Ocurrió un problema',
    message:
      'No pudimos completar la solicitud. Intenta nuevamente o revisa los registros del servidor.',
  });
});

app.listen(PORT, () => {
  console.log(`Servidor iniciado en http://localhost:${PORT}`);
});
