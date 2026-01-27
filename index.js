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

const formatDateInput = (value) => {
  if (!value) {
    return '';
  }
  if (value instanceof Date) {
    return value.toISOString().split('T')[0];
  }
  if (typeof value === 'string') {
    return value.split('T')[0];
  }
  return '';
};

const TURNOS_ESTADOS = new Set(['Pendiente', 'Terminado', 'Cancelado']);

app.get(
  '/',
  asyncHandler(async (req, res) => {
    const [
      [clienteCount],
      [mascotaCount],
      [usuarioCount],
      [historiaCount],
      [vacunaCount],
      [turnoCount],
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) AS total FROM clientes'),
      pool.query('SELECT COUNT(*) AS total FROM mascotas'),
      pool.query('SELECT COUNT(*) AS total FROM usuarios'),
      pool.query('SELECT COUNT(*) AS total FROM historia_clinica'),
      pool.query('SELECT COUNT(*) AS total FROM vacunas'),
      pool.query('SELECT COUNT(*) AS total FROM turnos'),
    ]);

    res.render('index', {
      counts: {
        clientes: clienteCount.total,
        mascotas: mascotaCount.total,
        usuarios: usuarioCount.total,
        historias: historiaCount.total,
        vacunas: vacunaCount.total,
        turnos: turnoCount.total,
      },
    });
  })
);

app.get(
  '/clientes',
  asyncHandler(async (req, res) => {
    const [clientes] = await pool.query('SELECT * FROM clientes ORDER BY id DESC');
    let clienteEditar = null;
    if (req.query.editar) {
      const [rows] = await pool.query('SELECT * FROM clientes WHERE id = ?', [
        req.query.editar,
      ]);
      [clienteEditar] = rows;
    }
    res.render('clientes', { clientes, clienteEditar });
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

app.post(
  '/clientes/:id',
  asyncHandler(async (req, res) => {
    const { nombre, telefono, email, direccion } = req.body;
    await pool.query(
      'UPDATE clientes SET nombre = ?, telefono = ?, email = ?, direccion = ? WHERE id = ?',
      [nombre, telefono, email, direccion, req.params.id]
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
    let mascotaEditar = null;
    if (req.query.editar) {
      const [rows] = await pool.query('SELECT * FROM mascotas WHERE id = ?', [
        req.query.editar,
      ]);
      if (rows[0]) {
        mascotaEditar = {
          ...rows[0],
          fecha_nacimiento: formatDateInput(rows[0].fecha_nacimiento),
        };
      }
    }
    res.render('mascotas', { mascotas, clientes, mascotaEditar });
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

app.post(
  '/mascotas/:id',
  asyncHandler(async (req, res) => {
    const { nombre, especie, raza, fecha_nacimiento, cliente_id } = req.body;
    await pool.query(
      `UPDATE mascotas
       SET nombre = ?, especie = ?, raza = ?, fecha_nacimiento = ?, cliente_id = ?
       WHERE id = ?`,
      [nombre, especie, raza, fecha_nacimiento || null, cliente_id, req.params.id]
    );
    res.redirect('/mascotas');
  })
);

app.get(
  '/usuarios',
  asyncHandler(async (req, res) => {
    const [usuarios] = await pool.query('SELECT * FROM usuarios ORDER BY id DESC');
    let usuarioEditar = null;
    if (req.query.editar) {
      const [rows] = await pool.query('SELECT * FROM usuarios WHERE id = ?', [
        req.query.editar,
      ]);
      [usuarioEditar] = rows;
    }
    res.render('usuarios', { usuarios, usuarioEditar });
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

app.post(
  '/usuarios/:id',
  asyncHandler(async (req, res) => {
    const { nombre, rol, email } = req.body;
    await pool.query('UPDATE usuarios SET nombre = ?, rol = ?, email = ? WHERE id = ?', [
      nombre,
      rol,
      email,
      req.params.id,
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
  '/vacunas',
  asyncHandler(async (req, res) => {
    const [vacunas] = await pool.query(
      `SELECT vacunas.*,
              vacunas_nombres_comerciales.nombre AS nombre_comercial,
              vacunas_tipos.nombre AS tipo,
              mascotas.nombre AS mascota_nombre,
              clientes.nombre AS cliente_nombre
       FROM vacunas
       JOIN vacunas_nombres_comerciales
         ON vacunas_nombres_comerciales.id = vacunas.nombre_comercial_id
       JOIN vacunas_tipos ON vacunas_tipos.id = vacunas.tipo_id
       JOIN mascotas ON mascotas.id = vacunas.mascota_id
       JOIN clientes ON clientes.id = mascotas.cliente_id
       ORDER BY vacunas.fecha_aplicacion DESC`
    );
    const [mascotas] = await pool.query(
      `SELECT mascotas.id,
              mascotas.nombre,
              clientes.nombre AS cliente_nombre
       FROM mascotas
       JOIN clientes ON clientes.id = mascotas.cliente_id
       ORDER BY mascotas.nombre`
    );
    const [nombresComerciales] = await pool.query(
      `SELECT vacunas_nombres_comerciales.id,
              vacunas_nombres_comerciales.nombre,
              vacunas_nombres_comerciales.tipo_id,
              vacunas_tipos.nombre AS tipo_nombre
       FROM vacunas_nombres_comerciales
       LEFT JOIN vacunas_tipos ON vacunas_tipos.id = vacunas_nombres_comerciales.tipo_id
       ORDER BY vacunas_nombres_comerciales.nombre`
    );
    const [tiposVacuna] = await pool.query('SELECT id, nombre FROM vacunas_tipos ORDER BY nombre');
    let vacunaEditar = null;
    if (req.query.editar) {
      const [rows] = await pool.query('SELECT * FROM vacunas WHERE id = ?', [
        req.query.editar,
      ]);
      if (rows[0]) {
        vacunaEditar = {
          ...rows[0],
          fecha_aplicacion: formatDateInput(rows[0].fecha_aplicacion),
          proxima_fecha_aplicacion: formatDateInput(rows[0].proxima_fecha_aplicacion),
        };
      }
    }
    res.render('vacunas', {
      vacunas,
      mascotas,
      vacunaEditar,
      nombresComerciales,
      tiposVacuna,
    });
  })
);

app.post(
  '/vacunas',
  asyncHandler(async (req, res) => {
    const {
      mascota_id,
      nombre_comercial_id,
      tipo_id,
      fecha_aplicacion,
      proxima_fecha_aplicacion,
      numero_serie,
    } = req.body;
    await pool.query(
      `INSERT INTO vacunas (
        mascota_id,
        nombre_comercial_id,
        tipo_id,
        fecha_aplicacion,
        proxima_fecha_aplicacion,
        numero_serie
      )
      VALUES (?, ?, ?, ?, ?, ?)`,
      [
        mascota_id,
        nombre_comercial_id,
        tipo_id,
        fecha_aplicacion,
        proxima_fecha_aplicacion || null,
        numero_serie || null,
      ]
    );
    res.redirect('/vacunas');
  })
);

app.post(
  '/vacunas/:id',
  asyncHandler(async (req, res) => {
    const {
      mascota_id,
      nombre_comercial_id,
      tipo_id,
      fecha_aplicacion,
      proxima_fecha_aplicacion,
      numero_serie,
    } = req.body;
    await pool.query(
      `UPDATE vacunas
       SET mascota_id = ?,
           nombre_comercial_id = ?,
           tipo_id = ?,
           fecha_aplicacion = ?,
           proxima_fecha_aplicacion = ?,
           numero_serie = ?
       WHERE id = ?`,
      [
        mascota_id,
        nombre_comercial_id,
        tipo_id,
        fecha_aplicacion,
        proxima_fecha_aplicacion || null,
        numero_serie || null,
        req.params.id,
      ]
    );
    res.redirect('/vacunas');
  })
);

app.post(
  '/vacunas/nombre-comercial',
  asyncHandler(async (req, res) => {
    const { nombre, tipo_id } = req.body;
    await pool.query(
      `INSERT INTO vacunas_nombres_comerciales (nombre, tipo_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), tipo_id = VALUES(tipo_id)`,
      [nombre, tipo_id]
    );
    res.redirect('/vacunas/valores');
  })
);

app.post(
  '/vacunas/nombre-comercial/editar',
  asyncHandler(async (req, res) => {
    const { id, nombre, tipo_id } = req.body;
    await pool.query('UPDATE vacunas_nombres_comerciales SET nombre = ?, tipo_id = ? WHERE id = ?', [
      nombre,
      tipo_id,
      id,
    ]);
    await pool.query('UPDATE vacunas SET tipo_id = ? WHERE nombre_comercial_id = ?', [
      tipo_id,
      id,
    ]);
    res.redirect('/vacunas/valores');
  })
);

app.post(
  '/vacunas/tipo',
  asyncHandler(async (req, res) => {
    const { nombre } = req.body;
    await pool.query(
      `INSERT INTO vacunas_tipos (nombre)
       VALUES (?)
       ON DUPLICATE KEY UPDATE nombre = VALUES(nombre)`,
      [nombre]
    );
    res.redirect('/vacunas/valores');
  })
);

app.post(
  '/vacunas/tipo/editar',
  asyncHandler(async (req, res) => {
    const { id, nombre } = req.body;
    await pool.query('UPDATE vacunas_tipos SET nombre = ? WHERE id = ?', [nombre, id]);
    res.redirect('/vacunas/valores');
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
      `SELECT mascotas.id,
              mascotas.nombre,
              mascotas.cliente_id,
              clientes.nombre AS cliente_nombre
       FROM mascotas
       JOIN clientes ON clientes.id = mascotas.cliente_id
       ORDER BY mascotas.nombre`
    );
    const [motivosTurno] = await pool.query(
      'SELECT id, nombre FROM motivos_turno ORDER BY nombre'
    );
    res.render('turnos', { turnos, clientes, mascotas, motivosTurno });
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

app.post(
  '/turnos/:id/estado',
  asyncHandler(async (req, res) => {
    const estado = (req.body.estado || '').trim();
    if (!TURNOS_ESTADOS.has(estado)) {
      return res.redirect('/turnos');
    }
    await pool.query('UPDATE turnos SET estado = ? WHERE id = ?', [
      estado,
      req.params.id,
    ]);
    res.redirect('/turnos');
  })
);

app.get(
  '/configuracion',
  asyncHandler(async (req, res) => {
    res.render('configuracion');
  })
);

app.get(
  '/motivos-turno',
  asyncHandler(async (req, res) => {
    const [motivosTurno] = await pool.query(
      'SELECT id, nombre FROM motivos_turno ORDER BY nombre'
    );
    res.render('motivos-turno', { motivosTurno });
  })
);

app.post(
  '/motivos-turno',
  asyncHandler(async (req, res) => {
    const { nombre } = req.body;
    if (nombre && nombre.trim()) {
      await pool.query('INSERT IGNORE INTO motivos_turno (nombre) VALUES (?)', [
        nombre.trim(),
      ]);
    }
    res.redirect('/motivos-turno');
  })
);

app.post(
  '/motivos-turno/:id/eliminar',
  asyncHandler(async (req, res) => {
    await pool.query('DELETE FROM motivos_turno WHERE id = ?', [req.params.id]);
    res.redirect('/motivos-turno');
  })
);

app.get(
  '/vacunas/valores',
  asyncHandler(async (req, res) => {
    const [nombresComerciales] = await pool.query(
      `SELECT vacunas_nombres_comerciales.id,
              vacunas_nombres_comerciales.nombre,
              vacunas_nombres_comerciales.tipo_id,
              vacunas_tipos.nombre AS tipo_nombre
       FROM vacunas_nombres_comerciales
       LEFT JOIN vacunas_tipos ON vacunas_tipos.id = vacunas_nombres_comerciales.tipo_id
       ORDER BY vacunas_nombres_comerciales.nombre`
    );
    const [tiposVacuna] = await pool.query('SELECT id, nombre FROM vacunas_tipos ORDER BY nombre');
    res.render('vacunas-valores', { nombresComerciales, tiposVacuna });
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
