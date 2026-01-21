const path = require('path');
const express = require('express');
const dotenv = require('dotenv');
const pool = require('./db');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', async (req, res) => {
  const [[clienteCount], [mascotaCount], [usuarioCount], [historiaCount]] =
    await Promise.all([
      pool.query('SELECT COUNT(*) AS total FROM clientes'),
      pool.query('SELECT COUNT(*) AS total FROM mascotas'),
      pool.query('SELECT COUNT(*) AS total FROM usuarios'),
      pool.query('SELECT COUNT(*) AS total FROM historia_clinica'),
    ]);

  res.render('index', {
    counts: {
      clientes: clienteCount.total,
      mascotas: mascotaCount.total,
      usuarios: usuarioCount.total,
      historias: historiaCount.total,
    },
  });
});

app.get('/clientes', async (req, res) => {
  const [clientes] = await pool.query('SELECT * FROM clientes ORDER BY id DESC');
  res.render('clientes', { clientes });
});

app.post('/clientes', async (req, res) => {
  const { nombre, telefono, email, direccion } = req.body;
  await pool.query(
    'INSERT INTO clientes (nombre, telefono, email, direccion) VALUES (?, ?, ?, ?)',
    [nombre, telefono, email, direccion]
  );
  res.redirect('/clientes');
});

app.get('/mascotas', async (req, res) => {
  const [mascotas] = await pool.query(
    `SELECT mascotas.*, clientes.nombre AS cliente_nombre
     FROM mascotas
     JOIN clientes ON clientes.id = mascotas.cliente_id
     ORDER BY mascotas.id DESC`
  );
  const [clientes] = await pool.query('SELECT id, nombre FROM clientes ORDER BY nombre');
  res.render('mascotas', { mascotas, clientes });
});

app.post('/mascotas', async (req, res) => {
  const { nombre, especie, raza, fecha_nacimiento, cliente_id } = req.body;
  await pool.query(
    `INSERT INTO mascotas (nombre, especie, raza, fecha_nacimiento, cliente_id)
     VALUES (?, ?, ?, ?, ?)`,
    [nombre, especie, raza, fecha_nacimiento || null, cliente_id]
  );
  res.redirect('/mascotas');
});

app.get('/usuarios', async (req, res) => {
  const [usuarios] = await pool.query('SELECT * FROM usuarios ORDER BY id DESC');
  res.render('usuarios', { usuarios });
});

app.post('/usuarios', async (req, res) => {
  const { nombre, rol, email } = req.body;
  await pool.query('INSERT INTO usuarios (nombre, rol, email) VALUES (?, ?, ?)', [
    nombre,
    rol,
    email,
  ]);
  res.redirect('/usuarios');
});

app.get('/historia-clinica', async (req, res) => {
  const [historias] = await pool.query(
    `SELECT historia_clinica.*, mascotas.nombre AS mascota_nombre
     FROM historia_clinica
     JOIN mascotas ON mascotas.id = historia_clinica.mascota_id
     ORDER BY historia_clinica.fecha DESC`
  );
  const [mascotas] = await pool.query('SELECT id, nombre FROM mascotas ORDER BY nombre');
  res.render('historia', { historias, mascotas });
});

app.post('/historia-clinica', async (req, res) => {
  const { mascota_id, fecha, motivo, diagnostico, tratamiento } = req.body;
  await pool.query(
    `INSERT INTO historia_clinica (mascota_id, fecha, motivo, diagnostico, tratamiento)
     VALUES (?, ?, ?, ?, ?)`,
    [mascota_id, fecha, motivo, diagnostico, tratamiento]
  );
  res.redirect('/historia-clinica');
});

app.listen(PORT, () => {
  console.log(`Servidor iniciado en http://localhost:${PORT}`);
});
