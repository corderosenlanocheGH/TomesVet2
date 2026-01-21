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
  diagnostico TEXT NOT NULL,
  tratamiento TEXT NOT NULL,
  CONSTRAINT fk_historia_mascota FOREIGN KEY (mascota_id) REFERENCES mascotas(id)
);

INSERT INTO clientes (nombre, telefono, email, direccion)
VALUES
  ('Carolina López', '555-1234', 'carolina@example.com', 'Av. Siempre Viva 123'),
  ('Miguel Rojas', '555-9876', 'miguel@example.com', 'Calle 45 #10-20');

INSERT INTO mascotas (nombre, especie, raza, fecha_nacimiento, cliente_id)
VALUES
  ('Nala', 'Perro', 'Golden Retriever', '2021-04-12', 1),
  ('Milo', 'Gato', 'Siamés', '2020-09-05', 2);

INSERT INTO usuarios (nombre, rol, email)
VALUES
  ('Dra. Isabel Torres', 'Veterinario', 'isabel@example.com'),
  ('Juan Pérez', 'Asistente', 'juan@example.com');

INSERT INTO historia_clinica (mascota_id, fecha, motivo, diagnostico, tratamiento)
VALUES
  (1, '2024-09-15', 'Vacunación anual', 'Se aplica vacuna múltiple', 'Reposo 24 horas'),
  (2, '2024-09-18', 'Control general', 'Buen estado general', 'Continuar dieta balanceada');
