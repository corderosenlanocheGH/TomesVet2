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
VALUES
  ('Carolina López', '555-1234', 'carolina@example.com', 'Av. Siempre Viva 123'),
  ('Miguel Rojas', '555-9876', 'miguel@example.com', 'Calle 45 #10-20');

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
VALUES
  ('Nala', 'Perro', 'Golden Retriever', 'Hembra', 'Grande', 'Dorado', 'Mancha blanca en el pecho', '2021-04-12', 1),
  ('Milo', 'Gato', 'Siamés', 'Macho', 'Pequeño', 'Crema', 'Ojos azules y cola oscura', '2020-09-05', 2);

INSERT INTO usuarios (nombre, rol, email)
VALUES
  ('Dra. Isabel Torres', 'Veterinario', 'isabel@example.com'),
  ('Juan Pérez', 'Asistente', 'juan@example.com');

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
VALUES
  (
    1,
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
  ),
  (
    2,
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
  );

INSERT INTO vacunas_tipos (nombre)
VALUES
  ('Antirrábica'),
  ('Quíntuple');

INSERT INTO vacunas_nombres_comerciales (nombre, tipo_id)
VALUES
  ('Rabivac', 1),
  ('Quintuple Vet', 2);

INSERT INTO vacunas (
  mascota_id,
  nombre_comercial_id,
  tipo_id,
  fecha_aplicacion,
  proxima_fecha_aplicacion,
  numero_serie
)
VALUES
  (1, 1, 1, '2024-08-20', '2025-08-20', 'RB-2024-001'),
  (2, 2, 2, '2024-07-15', '2025-01-15', 'QV-2024-014');

INSERT INTO turnos (cliente_id, mascota_id, fecha, hora, motivo, estado)
VALUES
  (1, 1, '2024-10-02', '09:30:00', 'Consulta general', 'Pendiente'),
  (2, 2, '2024-10-03', '11:00:00', 'Control postoperatorio', 'Terminado');

INSERT INTO motivos_turno (nombre)
VALUES
  ('Consulta general'),
  ('Vacunación'),
  ('Control postoperatorio'),
  ('Urgencia');

INSERT INTO mascotas_especies (nombre)
VALUES
  ('Perro'),
  ('Gato');

INSERT INTO mascotas_razas (nombre, especie_id)
VALUES
  ('Golden Retriever', (SELECT id FROM mascotas_especies WHERE nombre = 'Perro')),
  ('Siamés', (SELECT id FROM mascotas_especies WHERE nombre = 'Gato'));
