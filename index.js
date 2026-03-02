const path = require('path');
const fs = require('fs/promises');
const express = require('express');
const dotenv = require('dotenv');

dotenv.config();

const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: false, limit: '20mb' }));
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
const SEXOS_MASCOTA = new Set(['Macho', 'Hembra']);
const TAMANIOS_MASCOTA = new Set(['Grande', 'Mediano', 'Pequeño']);
const HISTORIA_UPLOAD_DIR = path.join(__dirname, 'public', 'uploads', 'historia-clinica');

const getFieldValue = (field) => (Array.isArray(field) ? field[0] : field);

const ensureMascotasRazasHasEspecieRelation = async () => {
  const [columns] = await pool.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'mascotas_razas'
       AND COLUMN_NAME = 'especie_id'`
  );

  if (!columns.length) {
    await pool.query('ALTER TABLE mascotas_razas ADD COLUMN especie_id INT NULL AFTER nombre');
    await pool.query(
      `ALTER TABLE mascotas_razas
       ADD CONSTRAINT fk_mascotas_raza_especie
       FOREIGN KEY (especie_id) REFERENCES mascotas_especies(id)
       ON DELETE CASCADE`
    );
    await pool.query(
      `ALTER TABLE mascotas_razas
       ADD CONSTRAINT uq_mascotas_raza_especie UNIQUE (nombre, especie_id)`
    );

    await pool.query(
      `UPDATE mascotas_razas mr
       JOIN mascotas m ON m.raza = mr.nombre
       JOIN mascotas_especies me ON me.nombre = m.especie
       SET mr.especie_id = me.id
       WHERE mr.especie_id IS NULL`
    );
  }
};

const ensureMascotasHasSexoAndTamanio = async () => {
  const [columns] = await pool.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'mascotas'
       AND COLUMN_NAME IN ('sexo', 'tamanio')`
  );

  const columnNames = new Set(columns.map((column) => column.COLUMN_NAME));

  if (!columnNames.has('sexo')) {
    await pool.query("ALTER TABLE mascotas ADD COLUMN sexo VARCHAR(20) NULL AFTER raza");
  }

  if (!columnNames.has('tamanio')) {
    await pool.query(
      "ALTER TABLE mascotas ADD COLUMN tamanio VARCHAR(20) NULL AFTER sexo"
    );
  }
};

const ensureHistoriaClinicaHasOtrosDatos = async () => {
  const [columns] = await pool.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'historia_clinica'
       AND COLUMN_NAME = 'otros_datos'`
  );

  if (!columns.length) {
    await pool.query('ALTER TABLE historia_clinica ADD COLUMN otros_datos TEXT NULL AFTER tratamiento');
  }
};

const ensureHistoriaClinicaHasDocumentoAdjunto = async () => {
  const [columns] = await pool.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'historia_clinica'
       AND COLUMN_NAME IN ('documento_adjunto_nombre', 'documento_adjunto_ruta')`
  );

  const columnNames = new Set(columns.map((column) => column.COLUMN_NAME));

  if (!columnNames.has('documento_adjunto_nombre')) {
    await pool.query(
      `ALTER TABLE historia_clinica
       ADD COLUMN documento_adjunto_nombre VARCHAR(255) NULL AFTER otros_datos`
    );
  }

  if (!columnNames.has('documento_adjunto_ruta')) {
    await pool.query(
      `ALTER TABLE historia_clinica
       ADD COLUMN documento_adjunto_ruta VARCHAR(255) NULL AFTER documento_adjunto_nombre`
    );
  }
};

const ensureHistoriaClinicaDocumentosTable = async () => {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS historia_clinica_documentos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      historia_clinica_id INT NOT NULL,
      nombre_original VARCHAR(255) NOT NULL,
      ruta_publica VARCHAR(255) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_historia_documento_historia
        FOREIGN KEY (historia_clinica_id) REFERENCES historia_clinica(id)
        ON DELETE CASCADE
    )`
  );

  const [legacyRows] = await pool.query(
    `SELECT id, documento_adjunto_nombre, documento_adjunto_ruta
     FROM historia_clinica
     WHERE documento_adjunto_ruta IS NOT NULL`
  );

  for (const row of legacyRows) {
    await pool.query(
      `INSERT INTO historia_clinica_documentos (historia_clinica_id, nombre_original, ruta_publica)
       SELECT ?, ?, ?
       FROM DUAL
       WHERE NOT EXISTS (
         SELECT 1
         FROM historia_clinica_documentos
         WHERE historia_clinica_id = ?
           AND ruta_publica = ?
       )`,
      [
        row.id,
        row.documento_adjunto_nombre || 'Documento PDF',
        row.documento_adjunto_ruta,
        row.id,
        row.documento_adjunto_ruta,
      ]
    );
  }
};

const extractPdfAttachmentFromBody = (body) => {
  const originalName = (body.documentacion_adjunta_nombre || '').trim();
  const pdfBase64Value = body.documentacion_adjunta_base64 || '';

  if (!pdfBase64Value) {
    return null;
  }

  const hasPdfExtension = originalName.toLowerCase().endsWith('.pdf');
  const hasPdfPrefix = pdfBase64Value.startsWith('data:application/pdf;base64,');
  if (!hasPdfExtension || !hasPdfPrefix) {
    throw new Error('La documentación adjunta debe ser un archivo PDF válido.');
  }

  const base64Data = pdfBase64Value.replace('data:application/pdf;base64,', '');
  return {
    originalName,
    pdfBuffer: Buffer.from(base64Data, 'base64'),
  };
};

const savePdfAttachment = async ({ originalName, pdfBuffer }) => {
  const uniqueFileName = `${Date.now()}-${Math.round(Math.random() * 1e9)}.pdf`;
  const targetFilePath = path.join(HISTORIA_UPLOAD_DIR, uniqueFileName);
  await fs.writeFile(targetFilePath, pdfBuffer);
  return {
    nombreOriginal: originalName,
    rutaPublica: `/uploads/historia-clinica/${uniqueFileName}`,
  };
};

const validateMascotaSexo = (sexo) => {
  const sexoValue = (sexo || '').trim();
  if (!sexoValue || !SEXOS_MASCOTA.has(sexoValue)) {
    throw new Error('El sexo seleccionado no es válido');
  }
  return sexoValue;
};

const validateMascotaTamanio = (tamanio) => {
  const tamanioValue = (tamanio || '').trim();
  if (!tamanioValue || !TAMANIOS_MASCOTA.has(tamanioValue)) {
    throw new Error('El tamaño seleccionado no es válido');
  }
  return tamanioValue;
};

const validateBreedBySpecies = async (especie, raza) => {
  const especieNombre = (especie || '').trim();
  const razaNombre = (raza || '').trim();

  if (!especieNombre || !razaNombre) {
    return razaNombre;
  }

  const [rows] = await pool.query(
    `SELECT mr.nombre
     FROM mascotas_razas mr
     JOIN mascotas_especies me ON me.id = mr.especie_id
     WHERE me.nombre = ? AND mr.nombre = ?
     LIMIT 1`,
    [especieNombre, razaNombre]
  );

  if (!rows.length) {
    throw new Error('La raza seleccionada no corresponde a la especie elegida');
  }

  return razaNombre;
};

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
    const [mascotas] = await pool.query(
      `SELECT mascotas.id,
              mascotas.nombre,
              mascotas.cliente_id,
              clientes.nombre AS cliente_nombre
       FROM mascotas
       JOIN clientes ON clientes.id = mascotas.cliente_id
       ORDER BY mascotas.nombre`
    );
    const selectedMascotaId = req.query.mascota_id ? String(req.query.mascota_id) : '';
    let clienteEditar = null;
    const showForm = Boolean(req.query.editar || req.query.nuevo);
    if (req.query.editar) {
      const [rows] = await pool.query('SELECT * FROM clientes WHERE id = ?', [
        req.query.editar,
      ]);
      [clienteEditar] = rows;
    }
    res.render('clientes', {
      clientes,
      mascotas,
      selectedMascotaId,
      clienteEditar,
      showForm,
    });
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
    const [especiesMascota] = await pool.query(
      'SELECT id, nombre FROM mascotas_especies ORDER BY nombre'
    );
    const [razasMascota] = await pool.query(
      `SELECT mascotas_razas.id,
              mascotas_razas.nombre,
              mascotas_razas.especie_id,
              mascotas_especies.nombre AS especie_nombre
       FROM mascotas_razas
       LEFT JOIN mascotas_especies ON mascotas_especies.id = mascotas_razas.especie_id
       ORDER BY mascotas_especies.nombre, mascotas_razas.nombre`
    );
    const selectedClienteId = req.query.cliente_id ? String(req.query.cliente_id) : '';
    let mascotaEditar = null;
    const showForm = Boolean(req.query.editar || req.query.nuevo);
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
    res.render('mascotas', {
      mascotas,
      clientes,
      especiesMascota,
      razasMascota,
      sexosMascota: Array.from(SEXOS_MASCOTA),
      tamaniosMascota: Array.from(TAMANIOS_MASCOTA),
      selectedClienteId,
      mascotaEditar,
      showForm,
    });
  })
);

app.post(
  '/mascotas',
  asyncHandler(async (req, res) => {
    const { nombre, especie, raza, sexo, tamanio, fecha_nacimiento, cliente_id } = req.body;
    const razaValidada = await validateBreedBySpecies(especie, raza);
    const sexoValidado = validateMascotaSexo(sexo);
    const tamanioValidado = validateMascotaTamanio(tamanio);
    await pool.query(
      `INSERT INTO mascotas (nombre, especie, raza, sexo, tamanio, fecha_nacimiento, cliente_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        nombre,
        especie,
        razaValidada,
        sexoValidado,
        tamanioValidado,
        fecha_nacimiento || null,
        cliente_id,
      ]
    );
    res.redirect('/mascotas');
  })
);

app.post(
  '/mascotas/:id(\\d+)',
  asyncHandler(async (req, res) => {
    const { nombre, especie, raza, sexo, tamanio, fecha_nacimiento, cliente_id } = req.body;
    const razaValidada = await validateBreedBySpecies(especie, raza);
    const sexoValidado = validateMascotaSexo(sexo);
    const tamanioValidado = validateMascotaTamanio(tamanio);
    await pool.query(
      `UPDATE mascotas
       SET nombre = ?, especie = ?, raza = ?, sexo = ?, tamanio = ?, fecha_nacimiento = ?, cliente_id = ?
       WHERE id = ?`,
      [
        nombre,
        especie,
        razaValidada,
        sexoValidado,
        tamanioValidado,
        fecha_nacimiento || null,
        cliente_id,
        req.params.id,
      ]
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
    const selectedMascotaId = req.query.mascota_id ? String(req.query.mascota_id) : '';
    let historiaQuery =
      `SELECT historia_clinica.*, mascotas.nombre AS mascota_nombre
       FROM historia_clinica
       JOIN mascotas ON mascotas.id = historia_clinica.mascota_id`;
    const historiaParams = [];
    if (selectedMascotaId) {
      historiaQuery += ' WHERE historia_clinica.mascota_id = ?';
      historiaParams.push(selectedMascotaId);
    }
    historiaQuery += ' ORDER BY historia_clinica.fecha DESC';
    const [historias] = await pool.query(
      historiaQuery,
      historiaParams
    );
    const [mascotas] = await pool.query('SELECT id, nombre FROM mascotas ORDER BY nombre');
    const showForm = Boolean(req.query.nuevo);
    res.render('historia', { historias, mascotas, showForm, selectedMascotaId });
  })
);

app.get(
  '/historia-clinica/:id',
  asyncHandler(async (req, res) => {
    const [historias] = await pool.query(
      `SELECT historia_clinica.*,
              mascotas.nombre AS mascota_nombre,
              mascotas.especie AS mascota_especie,
              mascotas.raza AS mascota_raza,
              mascotas.sexo AS mascota_sexo,
              mascotas.tamanio AS mascota_tamanio
       FROM historia_clinica
       JOIN mascotas ON mascotas.id = historia_clinica.mascota_id
       WHERE historia_clinica.id = ?`,
      [req.params.id]
    );

    if (!historias.length) {
      return res.status(404).render('error', {
        message: 'La historia clínica solicitada no existe.',
      });
    }

    const historia = historias[0];
    const [documentos] = await pool.query(
      `SELECT id, historia_clinica_id, nombre_original, ruta_publica, created_at
       FROM historia_clinica_documentos
       WHERE historia_clinica_id = ?
       ORDER BY created_at DESC, id DESC`,
      [historia.id]
    );

    return res.render('historia-detalle', {
      historia,
      documentos,
    });
  })
);

app.get(
  '/historia-clinica/:id/imprimir',
  asyncHandler(async (req, res) => {
    const [historias] = await pool.query(
      `SELECT historia_clinica.*,
              mascotas.nombre AS mascota_nombre,
              mascotas.especie AS mascota_especie,
              mascotas.raza AS mascota_raza,
              mascotas.sexo AS mascota_sexo,
              mascotas.tamanio AS mascota_tamanio
       FROM historia_clinica
       JOIN mascotas ON mascotas.id = historia_clinica.mascota_id
       WHERE historia_clinica.id = ?`,
      [req.params.id]
    );

    if (!historias.length) {
      return res.status(404).render('error', {
        message: 'La historia clínica solicitada no existe.',
      });
    }

    return res.render('historia-detalle-print', { historia: historias[0] });
  })
);

app.post(
  '/historia-clinica',
  asyncHandler(async (req, res) => {
    let documentoAdjuntoNombre = null;
    let documentoAdjuntoRuta = null;

    const {
      mascota_id,
      fecha,
      motivo,
      aspecto_general,
      estado_nutricion,
      ultima_desparacitacion,
      frecuencia_cardiaca,
      frecuencia_respiratoria,
      hidratacion,
      temperatura,
      mucosa_palpebral,
      mucosa_escleral,
      mucosa_bucal,
      mucosa_vulpen,
      diagnostico_presuntivo,
      diagnostico_diferencial,
      diagnostico_definitivo,
      analisis_solicitados,
      tratamiento,
      otros_datos,
      documentacion_adjunta_nombre,
      documentacion_adjunta_base64,
    } = Object.fromEntries(
      Object.entries(req.body).map(([key, value]) => [key, getFieldValue(value)])
    );

    const pdfAttachment = extractPdfAttachmentFromBody({
      documentacion_adjunta_nombre,
      documentacion_adjunta_base64,
    });

    if (pdfAttachment) {
      const attachmentData = await savePdfAttachment(pdfAttachment);
      documentoAdjuntoNombre = attachmentData.nombreOriginal;
      documentoAdjuntoRuta = attachmentData.rutaPublica;
    }
    const [insertResult] = await pool.query(
      `INSERT INTO historia_clinica (
        mascota_id,
        fecha,
        motivo,
        aspecto_general,
        estado_nutricion,
        ultima_desparacitacion,
        frecuencia_cardiaca,
        frecuencia_respiratoria,
        hidratacion,
        temperatura,
        mucosa_palpebral,
        mucosa_escleral,
        mucosa_bucal,
        mucosa_vulpen,
        diagnostico_presuntivo,
        diagnostico_diferencial,
        diagnostico_definitivo,
        analisis_solicitados,
        tratamiento,
        otros_datos,
        documento_adjunto_nombre,
        documento_adjunto_ruta
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        mascota_id,
        fecha,
        motivo,
        aspecto_general || null,
        estado_nutricion || null,
        ultima_desparacitacion || null,
        frecuencia_cardiaca || null,
        frecuencia_respiratoria || null,
        hidratacion || null,
        temperatura || null,
        mucosa_palpebral || null,
        mucosa_escleral || null,
        mucosa_bucal || null,
        mucosa_vulpen || null,
        diagnostico_presuntivo || null,
        diagnostico_diferencial || null,
        diagnostico_definitivo || null,
        analisis_solicitados || null,
        tratamiento || null,
        otros_datos || null,
        documentoAdjuntoNombre,
        documentoAdjuntoRuta,
      ]
    );

    if (documentoAdjuntoRuta) {
      await pool.query(
        `INSERT INTO historia_clinica_documentos (historia_clinica_id, nombre_original, ruta_publica)
         VALUES (?, ?, ?)`,
        [insertResult.insertId, documentoAdjuntoNombre || 'Documento PDF', documentoAdjuntoRuta]
      );
    }

    res.redirect('/historia-clinica');
  })
);

app.post(
  '/historia-clinica/:id/documentos',
  asyncHandler(async (req, res) => {
    const historiaId = Number(req.params.id);
    if (!Number.isInteger(historiaId) || historiaId <= 0) {
      return res.status(400).render('error', {
        message: 'La historia clínica indicada no es válida.',
      });
    }

    const [historias] = await pool.query('SELECT id FROM historia_clinica WHERE id = ?', [historiaId]);
    if (!historias.length) {
      return res.status(404).render('error', {
        message: 'La historia clínica solicitada no existe.',
      });
    }

    const payload = Object.fromEntries(
      Object.entries(req.body).map(([key, value]) => [key, getFieldValue(value)])
    );
    const pdfAttachment = extractPdfAttachmentFromBody(payload);
    if (!pdfAttachment) {
      throw new Error('Debes adjuntar un archivo PDF para agregar documentación.');
    }

    const attachmentData = await savePdfAttachment(pdfAttachment);
    await pool.query(
      `INSERT INTO historia_clinica_documentos (historia_clinica_id, nombre_original, ruta_publica)
       VALUES (?, ?, ?)`,
      [historiaId, attachmentData.nombreOriginal || 'Documento PDF', attachmentData.rutaPublica]
    );

    res.redirect(`/historia-clinica/${historiaId}`);
  })
);

app.get(
  '/vacunas',
  asyncHandler(async (req, res) => {
    const selectedMascotaId = req.query.mascota_id ? String(req.query.mascota_id) : '';
    let vacunasQuery =
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
       JOIN clientes ON clientes.id = mascotas.cliente_id`;
    const vacunasParams = [];
    if (selectedMascotaId) {
      vacunasQuery += ' WHERE vacunas.mascota_id = ?';
      vacunasParams.push(selectedMascotaId);
    }
    vacunasQuery += ' ORDER BY vacunas.fecha_aplicacion DESC';
    const [vacunas] = await pool.query(
      vacunasQuery,
      vacunasParams
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
    const showForm = Boolean(req.query.editar || req.query.nuevo);
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
      showForm,
      selectedMascotaId,
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
      `UPDATE vacunas
       SET proxima_fecha_aplicacion = NULL
       WHERE mascota_id = ?
         AND nombre_comercial_id = ?
         AND tipo_id = ?
         AND proxima_fecha_aplicacion IS NOT NULL`,
      [mascota_id, nombre_comercial_id, tipo_id]
    );
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
    if (proxima_fecha_aplicacion) {
      await pool.query(
        `UPDATE vacunas
         SET proxima_fecha_aplicacion = NULL
         WHERE mascota_id = ?
           AND nombre_comercial_id = ?
           AND tipo_id = ?
           AND id <> ?
           AND proxima_fecha_aplicacion IS NOT NULL`,
        [mascota_id, nombre_comercial_id, tipo_id, req.params.id]
      );
    }
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
    const showForm = Boolean(req.query.nuevo);
    res.render('turnos', { turnos, clientes, mascotas, motivosTurno, showForm });
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

app.get(
  '/mascotas/valores',
  asyncHandler(async (req, res) => {
    const [especiesMascota] = await pool.query(
      'SELECT id, nombre FROM mascotas_especies ORDER BY nombre'
    );
    const [razasMascota] = await pool.query(
      `SELECT mascotas_razas.id,
              mascotas_razas.nombre,
              mascotas_razas.especie_id,
              mascotas_especies.nombre AS especie_nombre
       FROM mascotas_razas
       LEFT JOIN mascotas_especies ON mascotas_especies.id = mascotas_razas.especie_id
       ORDER BY mascotas_especies.nombre, mascotas_razas.nombre`
    );
    res.render('mascotas-valores', { especiesMascota, razasMascota });
  })
);

app.post(
  '/mascotas/especie',
  asyncHandler(async (req, res) => {
    const { nombre } = req.body;
    if (nombre && nombre.trim()) {
      await pool.query('INSERT IGNORE INTO mascotas_especies (nombre) VALUES (?)', [
        nombre.trim(),
      ]);
    }
    res.redirect('/mascotas/valores');
  })
);

app.post(
  '/mascotas/especie/editar',
  asyncHandler(async (req, res) => {
    const { id, nombre } = req.body;
    if (id && nombre && nombre.trim()) {
      await pool.query('UPDATE mascotas_especies SET nombre = ? WHERE id = ?', [
        nombre.trim(),
        id,
      ]);
    }
    res.redirect('/mascotas/valores');
  })
);

app.post(
  '/mascotas/raza',
  asyncHandler(async (req, res) => {
    const { nombre, especie_id } = req.body;
    if (nombre && nombre.trim() && especie_id) {
      await pool.query('INSERT IGNORE INTO mascotas_razas (nombre, especie_id) VALUES (?, ?)', [
        nombre.trim(),
        especie_id,
      ]);
    }
    res.redirect('/mascotas/valores');
  })
);

app.post(
  '/mascotas/raza/editar',
  asyncHandler(async (req, res) => {
    const { id, nombre, especie_id } = req.body;
    if (id && nombre && nombre.trim() && especie_id) {
      await pool.query('UPDATE mascotas_razas SET nombre = ?, especie_id = ? WHERE id = ?', [
        nombre.trim(),
        especie_id,
        id,
      ]);
    }
    res.redirect('/mascotas/valores');
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

const startServer = async () => {
  await fs.mkdir(HISTORIA_UPLOAD_DIR, { recursive: true });
  await ensureMascotasRazasHasEspecieRelation();
  await ensureMascotasHasSexoAndTamanio();
  await ensureHistoriaClinicaHasOtrosDatos();
  await ensureHistoriaClinicaHasDocumentoAdjunto();
  await ensureHistoriaClinicaDocumentosTable();
  app.listen(PORT, () => {
    console.log(`Servidor iniciado en http://localhost:${PORT}`);
  });
};

startServer().catch((error) => {
  console.error('No se pudo iniciar el servidor:', error);
  process.exit(1);
});
