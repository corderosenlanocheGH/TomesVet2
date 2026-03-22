CREATE DATABASE IF NOT EXISTS tomesvet;
USE tomesvet;

CREATE TABLE IF NOT EXISTS clientes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  telefono VARCHAR(40) NOT NULL,
  email VARCHAR(120),
  direccion VARCHAR(180)
);

CREATE TABLE IF NOT EXISTS mascotas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  especie VARCHAR(80) NOT NULL,
  raza VARCHAR(80),
  sexo VARCHAR(20) NOT NULL,
  tamanio VARCHAR(20) NOT NULL,
  color VARCHAR(120),
  senias_particulares TEXT,
  fecha_nacimiento DATE,
  cliente_id INT NOT NULL,
  CONSTRAINT fk_mascota_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id)
);

-- Las tablas de certificados deben declararse después de mascotas por la FK mascota_id.

CREATE TABLE IF NOT EXISTS certificados_leishmaniasis (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mascota_id INT NOT NULL,
  propietario_nombre VARCHAR(255) NOT NULL,
  propietario_documento_tipo VARCHAR(80),
  propietario_documento_numero VARCHAR(80),
  propietario_direccion VARCHAR(255),
  animal_nombre VARCHAR(120) NOT NULL,
  animal_especie VARCHAR(80) NOT NULL DEFAULT 'Canino',
  animal_sexo VARCHAR(20),
  animal_condicion_reproductiva VARCHAR(20),
  animal_edad VARCHAR(80),
  animal_fecha_nacimiento DATE,
  animal_peso VARCHAR(40),
  animal_raza VARCHAR(120),
  animal_pelaje VARCHAR(120),
  animal_microchip VARCHAR(120),
  fecha_toma_muestra DATE,
  metodo_diagnostico VARCHAR(255),
  laboratorio_diagnostico VARCHAR(255),
  fecha_resultado DATE,
  resultado VARCHAR(80) NOT NULL DEFAULT 'NEGATIVO',
  lugar_fecha VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_certificado_leishmaniasis_mascota
    FOREIGN KEY (mascota_id) REFERENCES mascotas(id)
    ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS certificados_tratamientos_antiparasitarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mascota_id INT NOT NULL,
  propietario_nombre VARCHAR(255) NOT NULL,
  propietario_documento_tipo VARCHAR(80),
  propietario_documento_numero VARCHAR(80),
  propietario_direccion VARCHAR(255),
  animal_nombre VARCHAR(120) NOT NULL,
  animal_especie VARCHAR(80) NOT NULL DEFAULT 'Canino',
  animal_sexo VARCHAR(20),
  animal_condicion_reproductiva VARCHAR(20),
  animal_edad VARCHAR(80),
  animal_fecha_nacimiento DATE,
  animal_peso VARCHAR(40),
  animal_raza VARCHAR(120),
  animal_pelaje VARCHAR(120),
  animal_microchip VARCHAR(120),
  interno_fecha_hora VARCHAR(80),
  interno_nombre_comercial VARCHAR(255),
  interno_composicion VARCHAR(255),
  interno_dosis VARCHAR(255),
  interno_via VARCHAR(120),
  externo_fecha_hora VARCHAR(80),
  externo_nombre_comercial VARCHAR(255),
  externo_composicion VARCHAR(255),
  externo_dosis VARCHAR(255),
  externo_via VARCHAR(120),
  observaciones TEXT,
  lugar_fecha VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_certificado_tratamiento_antiparasitario_mascota
    FOREIGN KEY (mascota_id) REFERENCES mascotas(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS certificados_implantacion_microchip_tatuaje (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mascota_id INT NOT NULL,
  propietario_nombre VARCHAR(255) NOT NULL,
  propietario_documento_tipo VARCHAR(80),
  propietario_documento_numero VARCHAR(80),
  propietario_direccion VARCHAR(255),
  animal_nombre VARCHAR(120) NOT NULL,
  animal_especie VARCHAR(80) NOT NULL DEFAULT 'Canino',
  animal_sexo VARCHAR(20),
  animal_condicion_reproductiva VARCHAR(20),
  animal_edad VARCHAR(80),
  animal_fecha_nacimiento DATE,
  animal_peso VARCHAR(40),
  animal_raza VARCHAR(120),
  animal_pelaje VARCHAR(120),
  animal_microchip VARCHAR(120),
  fecha_implantacion DATE,
  lugar_implantacion VARCHAR(255),
  lugar_fecha VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_certificado_implantacion_microchip_mascota
    FOREIGN KEY (mascota_id) REFERENCES mascotas(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS certificados_lectura_microchip_tatuaje (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mascota_id INT NOT NULL,
  propietario_nombre VARCHAR(255) NOT NULL,
  propietario_documento_tipo VARCHAR(80),
  propietario_documento_numero VARCHAR(80),
  propietario_direccion VARCHAR(255),
  animal_nombre VARCHAR(120) NOT NULL,
  animal_especie VARCHAR(80) NOT NULL DEFAULT 'Canino',
  animal_sexo VARCHAR(20),
  animal_condicion_reproductiva VARCHAR(20),
  animal_edad VARCHAR(80),
  animal_fecha_nacimiento DATE,
  animal_peso VARCHAR(40),
  animal_raza VARCHAR(120),
  animal_pelaje VARCHAR(120),
  animal_microchip VARCHAR(120),
  detalle_lectura VARCHAR(255),
  lugar_fecha VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_certificado_lectura_microchip_mascota
    FOREIGN KEY (mascota_id) REFERENCES mascotas(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS certificados_libre_miasis (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mascota_id INT NOT NULL,
  propietario_nombre VARCHAR(255) NOT NULL,
  propietario_documento_tipo VARCHAR(80),
  propietario_documento_numero VARCHAR(80),
  propietario_direccion VARCHAR(255),
  animal_nombre VARCHAR(120) NOT NULL,
  animal_especie VARCHAR(80) NOT NULL DEFAULT 'Canino',
  animal_sexo VARCHAR(20),
  animal_condicion_reproductiva VARCHAR(20),
  animal_edad VARCHAR(80),
  animal_fecha_nacimiento DATE,
  animal_peso VARCHAR(40),
  animal_raza VARCHAR(120),
  animal_pelaje VARCHAR(120),
  animal_microchip VARCHAR(120),
  lugar_fecha VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_certificado_libre_miasis_mascota
    FOREIGN KEY (mascota_id) REFERENCES mascotas(id)
    ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  rol VARCHAR(80) NOT NULL,
  email VARCHAR(120)
);

CREATE TABLE IF NOT EXISTS historia_clinica (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mascota_id INT NOT NULL,
  fecha DATE NOT NULL,
  motivo VARCHAR(180) NOT NULL,
  aspecto_general TEXT,
  estado_nutricion VARCHAR(30),
  ultima_desparacitacion DATE,
  frecuencia_cardiaca VARCHAR(120),
  frecuencia_respiratoria VARCHAR(120),
  hidratacion VARCHAR(120),
  temperatura VARCHAR(120),
  mucosa_palpebral VARCHAR(20),
  mucosa_escleral VARCHAR(20),
  mucosa_bucal VARCHAR(20),
  mucosa_vulpen VARCHAR(20),
  diagnostico_presuntivo TEXT,
  diagnostico_diferencial TEXT,
  diagnostico_definitivo TEXT,
  analisis_solicitados TEXT,
  tratamiento TEXT,
  otros_datos TEXT,
  documento_adjunto_nombre VARCHAR(255),
  documento_adjunto_ruta VARCHAR(255),
  CONSTRAINT fk_historia_mascota FOREIGN KEY (mascota_id) REFERENCES mascotas(id)
);

CREATE TABLE IF NOT EXISTS historia_clinica_documentos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  historia_clinica_id INT NOT NULL,
  nombre_original VARCHAR(255) NOT NULL,
  ruta_publica VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_historia_documento_historia
    FOREIGN KEY (historia_clinica_id) REFERENCES historia_clinica(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS vacunas_tipos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(80) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS vacunas_nombres_comerciales (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(140) NOT NULL UNIQUE,
  tipo_id INT NOT NULL,
  CONSTRAINT fk_vacuna_nombre_tipo FOREIGN KEY (tipo_id) REFERENCES vacunas_tipos(id)
);

CREATE TABLE IF NOT EXISTS vacunas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mascota_id INT NOT NULL,
  nombre_comercial_id INT NOT NULL,
  tipo_id INT NOT NULL,
  fecha_aplicacion DATE NOT NULL,
  proxima_fecha_aplicacion DATE,
  numero_serie VARCHAR(120),
  recordatorio_whatsapp_enviado TINYINT(1) NOT NULL DEFAULT 0,
  CONSTRAINT fk_vacuna_mascota FOREIGN KEY (mascota_id) REFERENCES mascotas(id),
  CONSTRAINT fk_vacuna_nombre_comercial
    FOREIGN KEY (nombre_comercial_id) REFERENCES vacunas_nombres_comerciales(id),
  CONSTRAINT fk_vacuna_tipo FOREIGN KEY (tipo_id) REFERENCES vacunas_tipos(id)
);

CREATE TABLE IF NOT EXISTS turnos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cliente_id INT NOT NULL,
  mascota_id INT NOT NULL,
  fecha DATE NOT NULL,
  hora TIME NOT NULL,
  motivo VARCHAR(180) NOT NULL,
  estado VARCHAR(60) NOT NULL DEFAULT 'Pendiente',
  CONSTRAINT fk_turno_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  CONSTRAINT fk_turno_mascota FOREIGN KEY (mascota_id) REFERENCES mascotas(id)
);

CREATE TABLE IF NOT EXISTS motivos_turno (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS mascotas_especies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS mascotas_razas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  especie_id INT NOT NULL,
  CONSTRAINT fk_mascota_raza_especie FOREIGN KEY (especie_id) REFERENCES mascotas_especies(id),
  CONSTRAINT uq_mascota_raza_especie UNIQUE (nombre, especie_id)
);

INSERT INTO clientes (nombre, telefono, email, direccion)
SELECT 'Carolina López', '555-1234', 'carolina@example.com', 'Av. Siempre Viva 123'
WHERE NOT EXISTS (
  SELECT 1 FROM clientes WHERE email = 'carolina@example.com'
);

INSERT INTO clientes (nombre, telefono, email, direccion)
SELECT 'Miguel Rojas', '555-9876', 'miguel@example.com', 'Calle 45 #10-20'
WHERE NOT EXISTS (
  SELECT 1 FROM clientes WHERE email = 'miguel@example.com'
);

INSERT INTO mascotas (
  nombre,
  especie,
  raza,
  sexo,
  tamanio,
  color,
  senias_particulares,
  fecha_nacimiento,
  cliente_id
)
SELECT
  'Nala',
  'Perro',
  'Golden Retriever',
  'Hembra',
  'Grande',
  'Dorado',
  'Mancha blanca en el pecho',
  '2021-04-12',
  (SELECT id FROM clientes WHERE email = 'carolina@example.com' LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1
  FROM mascotas
  WHERE nombre = 'Nala'
    AND cliente_id = (SELECT id FROM clientes WHERE email = 'carolina@example.com' LIMIT 1)
);

INSERT INTO mascotas (
  nombre,
  especie,
  raza,
  sexo,
  tamanio,
  color,
  senias_particulares,
  fecha_nacimiento,
  cliente_id
)
SELECT
  'Milo',
  'Gato',
  'Siamés',
  'Macho',
  'Pequeño',
  'Crema',
  'Ojos azules y cola oscura',
  '2020-09-05',
  (SELECT id FROM clientes WHERE email = 'miguel@example.com' LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1
  FROM mascotas
  WHERE nombre = 'Milo'
    AND cliente_id = (SELECT id FROM clientes WHERE email = 'miguel@example.com' LIMIT 1)
);

INSERT INTO usuarios (nombre, rol, email)
SELECT 'Dra. Isabel Torres', 'Veterinario', 'isabel@example.com'
WHERE NOT EXISTS (
  SELECT 1 FROM usuarios WHERE email = 'isabel@example.com'
);

INSERT INTO usuarios (nombre, rol, email)
SELECT 'Juan Pérez', 'Asistente', 'juan@example.com'
WHERE NOT EXISTS (
  SELECT 1 FROM usuarios WHERE email = 'juan@example.com'
);

INSERT INTO historia_clinica (
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
  otros_datos
)
SELECT
  (SELECT id FROM mascotas WHERE nombre = 'Nala' LIMIT 1),
  '2024-09-15',
  'Vacunación anual',
  'Activo y alerta',
  'Normal',
  '2024-08-01',
  '90 lpm',
  '24 rpm',
  'Adecuada',
  '38.4°C',
  'Bien',
  'Bien',
  'Bien',
  'Bien',
  'Plan sanitario anual',
  'Control parasitario pendiente',
  'Paciente estable',
  'No requiere',
  'Reposo 24 horas',
  'Sin antecedentes relevantes'
WHERE NOT EXISTS (
  SELECT 1
  FROM historia_clinica
  WHERE mascota_id = (SELECT id FROM mascotas WHERE nombre = 'Nala' LIMIT 1)
    AND fecha = '2024-09-15'
    AND motivo = 'Vacunación anual'
);

INSERT INTO historia_clinica (
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
  otros_datos
)
SELECT
  (SELECT id FROM mascotas WHERE nombre = 'Milo' LIMIT 1),
  '2024-09-18',
  'Control general',
  'Tranquilo y reactivo',
  'Delgado',
  '2024-07-20',
  '110 lpm',
  '28 rpm',
  'Leve deshidratación',
  '38.9°C',
  'Bien',
  'Mal',
  'Bien',
  'Bien',
  'Gastritis',
  'Intolerancia alimentaria',
  'Gastritis leve',
  'Hemograma',
  'Continuar dieta balanceada',
  'Control en 7 días'
WHERE NOT EXISTS (
  SELECT 1
  FROM historia_clinica
  WHERE mascota_id = (SELECT id FROM mascotas WHERE nombre = 'Milo' LIMIT 1)
    AND fecha = '2024-09-18'
    AND motivo = 'Control general'
);

INSERT INTO vacunas_tipos (nombre)
SELECT 'Antirrábica'
WHERE NOT EXISTS (
  SELECT 1 FROM vacunas_tipos WHERE nombre = 'Antirrábica'
);

INSERT INTO vacunas_tipos (nombre)
SELECT 'Quíntuple'
WHERE NOT EXISTS (
  SELECT 1 FROM vacunas_tipos WHERE nombre = 'Quíntuple'
);

INSERT INTO vacunas_nombres_comerciales (nombre, tipo_id)
SELECT 'Rabivac', (SELECT id FROM vacunas_tipos WHERE nombre = 'Antirrábica' LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1 FROM vacunas_nombres_comerciales WHERE nombre = 'Rabivac'
);

INSERT INTO vacunas_nombres_comerciales (nombre, tipo_id)
SELECT 'Quintuple Vet', (SELECT id FROM vacunas_tipos WHERE nombre = 'Quíntuple' LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1 FROM vacunas_nombres_comerciales WHERE nombre = 'Quintuple Vet'
);

INSERT INTO vacunas (
  mascota_id,
  nombre_comercial_id,
  tipo_id,
  fecha_aplicacion,
  proxima_fecha_aplicacion,
  numero_serie
)
SELECT
  (SELECT id FROM mascotas WHERE nombre = 'Nala' LIMIT 1),
  (SELECT id FROM vacunas_nombres_comerciales WHERE nombre = 'Rabivac' LIMIT 1),
  (SELECT id FROM vacunas_tipos WHERE nombre = 'Antirrábica' LIMIT 1),
  '2024-08-20',
  '2025-08-20',
  'RB-2024-001'
WHERE NOT EXISTS (
  SELECT 1 FROM vacunas WHERE numero_serie = 'RB-2024-001'
);

INSERT INTO vacunas (
  mascota_id,
  nombre_comercial_id,
  tipo_id,
  fecha_aplicacion,
  proxima_fecha_aplicacion,
  numero_serie
)
SELECT
  (SELECT id FROM mascotas WHERE nombre = 'Milo' LIMIT 1),
  (SELECT id FROM vacunas_nombres_comerciales WHERE nombre = 'Quintuple Vet' LIMIT 1),
  (SELECT id FROM vacunas_tipos WHERE nombre = 'Quíntuple' LIMIT 1),
  '2024-07-15',
  '2025-01-15',
  'QV-2024-014'
WHERE NOT EXISTS (
  SELECT 1 FROM vacunas WHERE numero_serie = 'QV-2024-014'
);

INSERT INTO turnos (cliente_id, mascota_id, fecha, hora, motivo, estado)
SELECT
  (SELECT id FROM clientes WHERE email = 'carolina@example.com' LIMIT 1),
  (SELECT id FROM mascotas WHERE nombre = 'Nala' LIMIT 1),
  '2024-10-02',
  '09:30:00',
  'Consulta general',
  'Pendiente'
WHERE NOT EXISTS (
  SELECT 1
  FROM turnos
  WHERE cliente_id = (SELECT id FROM clientes WHERE email = 'carolina@example.com' LIMIT 1)
    AND mascota_id = (SELECT id FROM mascotas WHERE nombre = 'Nala' LIMIT 1)
    AND fecha = '2024-10-02'
    AND hora = '09:30:00'
);

INSERT INTO turnos (cliente_id, mascota_id, fecha, hora, motivo, estado)
SELECT
  (SELECT id FROM clientes WHERE email = 'miguel@example.com' LIMIT 1),
  (SELECT id FROM mascotas WHERE nombre = 'Milo' LIMIT 1),
  '2024-10-03',
  '11:00:00',
  'Control postoperatorio',
  'Terminado'
WHERE NOT EXISTS (
  SELECT 1
  FROM turnos
  WHERE cliente_id = (SELECT id FROM clientes WHERE email = 'miguel@example.com' LIMIT 1)
    AND mascota_id = (SELECT id FROM mascotas WHERE nombre = 'Milo' LIMIT 1)
    AND fecha = '2024-10-03'
    AND hora = '11:00:00'
);

INSERT INTO motivos_turno (nombre)
SELECT 'Consulta general'
WHERE NOT EXISTS (
  SELECT 1 FROM motivos_turno WHERE nombre = 'Consulta general'
);

INSERT INTO motivos_turno (nombre)
SELECT 'Vacunación'
WHERE NOT EXISTS (
  SELECT 1 FROM motivos_turno WHERE nombre = 'Vacunación'
);

INSERT INTO motivos_turno (nombre)
SELECT 'Control postoperatorio'
WHERE NOT EXISTS (
  SELECT 1 FROM motivos_turno WHERE nombre = 'Control postoperatorio'
);

INSERT INTO motivos_turno (nombre)
SELECT 'Urgencia'
WHERE NOT EXISTS (
  SELECT 1 FROM motivos_turno WHERE nombre = 'Urgencia'
);

INSERT INTO mascotas_especies (nombre)
SELECT 'Perro'
WHERE NOT EXISTS (
  SELECT 1 FROM mascotas_especies WHERE nombre = 'Perro'
);

INSERT INTO mascotas_especies (nombre)
SELECT 'Gato'
WHERE NOT EXISTS (
  SELECT 1 FROM mascotas_especies WHERE nombre = 'Gato'
);

INSERT INTO mascotas_razas (nombre, especie_id)
SELECT 'Golden Retriever', (SELECT id FROM mascotas_especies WHERE nombre = 'Perro' LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1
  FROM mascotas_razas
  WHERE nombre = 'Golden Retriever'
    AND especie_id = (SELECT id FROM mascotas_especies WHERE nombre = 'Perro' LIMIT 1)
);

INSERT INTO mascotas_razas (nombre, especie_id)
SELECT 'Siamés', (SELECT id FROM mascotas_especies WHERE nombre = 'Gato' LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1
  FROM mascotas_razas
  WHERE nombre = 'Siamés'
    AND especie_id = (SELECT id FROM mascotas_especies WHERE nombre = 'Gato' LIMIT 1)
);
