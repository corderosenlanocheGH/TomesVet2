const path = require('path');
const fs = require('fs/promises');
const express = require('express');
const dotenv = require('dotenv');
//const formidable = require('express/node_modules/formidable');

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
const CONFIG_UPLOAD_DIR = path.join(__dirname, 'public', 'uploads', 'configuracion');
const CERTIFICADO_LEISHMANIASIS_RESULTADO = 'NEGATIVO';
const CERTIFICADO_TIPO_DEFAULT = 'leishmaniasis';
const CERTIFICADO_FOOTER = 'Versión 29.11.2021 – www.senasa.gob.ar';
const CERTIFICATE_TYPE_LABELS = {
  leishmaniasis: 'Leishmaniasis',
  tratamiento_antiparasitario: 'Tratamiento antiparasitario',
  implantacion_microchip_tatuaje: 'Implantación de microchip / tatuaje',
  lectura_microchip_tatuaje: 'Lectura de microchip / tatuaje',
  libre_miasis: 'Libre de miasis',
};

const getFieldValue = (field) => (Array.isArray(field) ? field[0] : field);

const normalizeText = (value) => (value || '').toString().trim();

const formatShortDate = (value = '') => {
  if (!value) return '';
  const normalized = value.toString().split('T')[0];
  const [year, month, day] = normalized.split('-');
  if (year && month && day) {
    return `${day}/${month}/${year}`;
  }
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString('es-AR');
  }
  return value;
};

const PDF_WIN_ANSI_EXTRA_BYTES = {
  '€': 0x80,
  '‚': 0x82,
  'ƒ': 0x83,
  '„': 0x84,
  '…': 0x85,
  '†': 0x86,
  '‡': 0x87,
  'ˆ': 0x88,
  '‰': 0x89,
  'Š': 0x8a,
  '‹': 0x8b,
  'Œ': 0x8c,
  'Ž': 0x8e,
  '‘': 0x91,
  '’': 0x92,
  '“': 0x93,
  '”': 0x94,
  '•': 0x95,
  '–': 0x96,
  '—': 0x97,
  '˜': 0x98,
  '™': 0x99,
  'š': 0x9a,
  '›': 0x9b,
  'œ': 0x9c,
  'ž': 0x9e,
  'Ÿ': 0x9f,
};

const encodePdfText = (value = '') => {
  const normalized = (value || '').toString().normalize('NFC');
  let encoded = '';

  for (const char of normalized) {
    const codePoint = char.codePointAt(0);
    const mappedByte = PDF_WIN_ANSI_EXTRA_BYTES[char];
    const byte = mappedByte ?? (codePoint <= 0xff ? codePoint : null);

    if (byte === null) {
      encoded += '?';
      continue;
    }

    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) {
      encoded += `\\${String.fromCharCode(byte)}`;
      continue;
    }

    if (byte < 0x20 || byte > 0x7e) {
      encoded += `\\${byte.toString(8).padStart(3, '0')}`;
      continue;
    }

    encoded += String.fromCharCode(byte);
  }

  return encoded;
};

const formatDateTimeValue = (value = '') => {
  if (!value) return '';
  const normalized = value.toString();
  const match = normalized.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})/);
  if (match) {
    return `${formatShortDate(match[1])} ${match[2]}`;
  }
  return normalized;
};

const buildSimplePdf = ({ width = 595.28, height = 841.89, content = '' }) => {
  const objects = [];
  const addObject = (body) => {
    objects.push(body);
    return objects.length;
  };

  const contentBuffer = Buffer.from(content, 'binary');
  const catalogId = addObject('<< /Type /Catalog /Pages 2 0 R >>');
  const pagesId = addObject('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  const pageId = addObject(
    `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`
  );
  const fontRegularId = addObject(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
  );
  const fontBoldId = addObject(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
  );
  const contentId = addObject(`<< /Length ${contentBuffer.length} >>\nstream\n${content}\nendstream`);

  const ordered = [catalogId, pagesId, pageId, fontRegularId, fontBoldId, contentId];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];

  ordered.forEach((objectId) => {
    offsets[objectId] = Buffer.byteLength(pdf, 'binary');
    pdf += `${objectId} 0 obj\n${objects[objectId - 1]}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, 'binary');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'binary');
};

const createPdfCanvas = () => {
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const cmds = [];
  const toPdfY = (topY) => pageHeight - topY;
  const text = (x, topY, value, options = {}) => {
    const { font = 'F1', size = 10, align = 'left' } = options;
    const rawText = encodePdfText(value || '');
    if (!rawText) {
      return;
    }
    const estimatedWidth = rawText.length * size * 0.45;
    const adjustedX =
      align === 'center' ? x - estimatedWidth / 2 : align === 'right' ? x - estimatedWidth : x;
    cmds.push(
      `BT /${font} ${size} Tf 1 0 0 1 ${adjustedX.toFixed(2)} ${toPdfY(topY).toFixed(2)} Tm (${rawText}) Tj ET`
    );
  };
  const line = (x1, topY1, x2, topY2, width = 1) => {
    cmds.push(
      `${width} w ${x1.toFixed(2)} ${toPdfY(topY1).toFixed(2)} m ${x2.toFixed(2)} ${toPdfY(topY2).toFixed(2)} l S`
    );
  };
  const rect = (x, topY, w, h, width = 1) => {
    cmds.push(
      `${width} w ${x.toFixed(2)} ${toPdfY(topY + h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S`
    );
  };
  const paragraph = (x, topY, value, options = {}) => {
    const { maxChars = 88, lineHeight = 12, ...textOptions } = options;
    const words = (value || '').split(/\s+/).filter(Boolean);
    if (!words.length) {
      return topY;
    }
    let currentLine = '';
    let currentY = topY;
    words.forEach((word) => {
      const nextLine = currentLine ? `${currentLine} ${word}` : word;
      if (nextLine.length > maxChars && currentLine) {
        text(x, currentY, currentLine, textOptions);
        currentLine = word;
        currentY += lineHeight;
        return;
      }
      currentLine = nextLine;
    });
    if (currentLine) {
      text(x, currentY, currentLine, textOptions);
    }
    return currentY;
  };

  return { pageWidth, pageHeight, cmds, text, line, rect, paragraph };
};

const getCertificateBranding = (configuracionClinica) => {
  const clinicName = normalizeText(configuracionClinica?.veterinaria_nombre);
  const medicaNombre = normalizeText(configuracionClinica?.medica_nombre);
  const medicaMatricula = normalizeText(configuracionClinica?.medica_matricula);
  const professionalLine = [medicaNombre, medicaMatricula ? `Matrícula ${medicaMatricula}` : '']
    .filter(Boolean)
    .join(' · ');
  const clinicLine = clinicName || 'Clínica Veterinaria';

  return {
    professionalLine: professionalLine || 'Profesional veterinaria',
    clinicLine,
  };
};

const drawCertificateHeader = ({
  text,
  line,
  rect,
  configuracionClinica,
  titleLines,
  brandingBox = { x: 34, y: 33, width: 210, height: 26 },
}) => {
  const { professionalLine, clinicLine } = getCertificateBranding(configuracionClinica);

  rect(20, 18, 555, 805, 1);
  rect(brandingBox.x, brandingBox.y, brandingBox.width, brandingBox.height, 0.8);
  text(brandingBox.x + 8, brandingBox.y + 12, professionalLine, {
    size: 8,
  });
  text(brandingBox.x + 8, brandingBox.y + 22, clinicLine, {
    size: 8,
  });

  let currentY = 110;
  titleLines.forEach((title) => {
    text(297.5, currentY, title, { font: 'F2', size: 11, align: 'center' });
    currentY += 14;
  });
  line(100, currentY - 5, 495, currentY - 5, 1);
};

const drawCertificateOwnerAnimalSection = ({
  text,
  line,
  certificado,
  showFieldLines = true,
  databaseOnly = false,
}) => {
  const sexo = normalizeText(certificado.animal_sexo);
  const condicion = normalizeText(certificado.animal_condicion_reproductiva);
  const safeLine = (...args) => {
    if (showFieldLines) {
      line(...args);
    }
  };
  const buildInlineValue = (label, value) => {
    const normalized = normalizeText(value);
    return normalized ? `${label}: ${normalized}` : '';
  };
  const buildJoinedInlineValue = (entries) => entries.filter(Boolean).join('    ');
  const ownerDocumentValue = [
    normalizeText(certificado.propietario_documento_tipo),
    normalizeText(certificado.propietario_documento_numero),
  ]
    .filter(Boolean)
    .join(' ');
  const animalIdentityValues = [
    normalizeText(certificado.animal_especie).toUpperCase(),
    sexo.toUpperCase(),
    condicion.toUpperCase(),
  ].filter(Boolean);
  const ageBirthLine = buildJoinedInlineValue([
    buildInlineValue('Edad (Años y meses)', certificado.animal_edad),
    buildInlineValue('Fecha de nacimiento', formatShortDate(certificado.animal_fecha_nacimiento)),
  ]);
  const breedCoatLine = buildJoinedInlineValue([
    buildInlineValue('Raza', certificado.animal_raza),
    buildInlineValue('Pelaje', certificado.animal_pelaje),
  ]);

  text(55, 176, buildInlineValue('Nombre y Apellido del propietario', certificado.propietario_nombre), {
    size: 9,
  });
  safeLine(245, 179, 540, 179, 0.7);
  text(
    55,
    196,
    buildInlineValue('Tipo y N° de Documento de Identidad o Pasaporte', ownerDocumentValue),
    { size: 9 }
  );
  safeLine(290, 199, 540, 199, 0.7);
  text(55, 216, buildInlineValue('Dirección', certificado.propietario_direccion), { size: 9 });
  safeLine(100, 219, 540, 219, 0.7);

  text(55, 250, 'Datos del animal:', { font: 'F2', size: 10 });
  text(55, 272, buildInlineValue('Nombre', certificado.animal_nombre), { size: 9 });
  safeLine(95, 275, 540, 275, 0.7);
  if (animalIdentityValues.length) {
    text(84, 297, animalIdentityValues.join(' / '), { size: 9 });
  }
  if (!databaseOnly) {
    text(355, 313, '(Tachar lo que no corresponda)', { size: 7, align: 'center' });
  }
  text(55, 340, ageBirthLine, { size: 9 });
  safeLine(162, 343, 335, 343, 0.7);
  safeLine(445, 343, 540, 343, 0.7);
  text(55, 360, buildInlineValue('Peso', certificado.animal_peso), { size: 9 });
  safeLine(85, 363, 205, 363, 0.7);
  text(55, 380, breedCoatLine, {
    size: 9,
  });
  safeLine(84, 383, 292, 383, 0.7);
  safeLine(338, 383, 540, 383, 0.7);
  text(55, 400, buildInlineValue('N° de Microchip (si corresponde)', certificado.animal_microchip), {
    size: 9,
  });
  safeLine(200, 403, 540, 403, 0.7);
};

const drawCertificateFooter = ({ text, line, footerText = CERTIFICADO_FOOTER }) => {
  line(34, 795, 555, 795, 0.8);
  text(40, 807, footerText, { size: 7 });
};

const finalizeCertificatePdf = ({ pageWidth, pageHeight, cmds }) =>
  buildSimplePdf({
    width: pageWidth,
    height: pageHeight,
    content: cmds.join('\n'),
  });

const generateLeishmaniasisCertificatePdf = ({ certificado, configuracionClinica }) => {
  const { pageWidth, pageHeight, cmds, text, line, rect, paragraph } = createPdfCanvas();
  const buildInlineValue = (label, value) => {
    const normalized = normalizeText(value);
    return normalized ? `${label}: ${normalized}` : '';
  };
  const resultadoFinal = (certificado.resultado || CERTIFICADO_LEISHMANIASIS_RESULTADO).toUpperCase();

  drawCertificateHeader({
    text,
    line,
    rect,
    configuracionClinica,
    titleLines: [
      'CERTIFICADO PARA PRUEBA DETECCIÓN DE LA RESPUESTA',
      'INMUNITARIA NEGATIVA A LEISHMANIASIS',
    ],
    brandingBox: { x: 34, y: 28, width: 235, height: 50 },
  });
  drawCertificateOwnerAnimalSection({
    text,
    line,
    certificado,
    showFieldLines: false,
    databaseOnly: true,
  });

  text(55, 435, 'DATOS DE LA MUESTRA', { font: 'F2', size: 10 });
  text(55, 463, buildInlineValue('Fecha de toma de muestra', formatShortDate(certificado.fecha_toma_muestra)), {
    size: 9,
  });
  text(55, 485, buildInlineValue('Método diagnóstico empleado', certificado.metodo_diagnostico), { size: 9 });
  text(55, 505, buildInlineValue('Laboratorio diagnóstico', certificado.laboratorio_diagnostico), { size: 9 });

  text(55, 545, 'RESULTADO', { font: 'F2', size: 10 });
  text(55, 575, buildInlineValue('Fecha de Resultado', formatShortDate(certificado.fecha_resultado)), {
    size: 9,
  });
  rect(50, 595, 490, 28, 0.8);
  paragraph(
    58,
    608,
    `Por medio de la presente se certifica que el análisis de Leishmaniasis arrojó resultado ${resultadoFinal}.`,
    {
      font: 'F2',
      size: 9,
      lineHeight: 11,
      maxChars: 82,
    }
  );

  text(55, 648, buildInlineValue('Lugar y fecha', certificado.lugar_fecha), { size: 9 });
  text(400, 705, 'Firma y Sello del Profesional Actuante', { size: 9, align: 'center' });
  line(340, 692, 520, 692, 0.7);
  drawCertificateFooter({ text, line });

  return finalizeCertificatePdf({ pageWidth, pageHeight, cmds });
};

const generateTratamientoAntiparasitarioCertificatePdf = ({ certificado, configuracionClinica }) => {
  const { pageWidth, pageHeight, cmds, text, line, rect, paragraph } = createPdfCanvas();

  drawCertificateHeader({
    text,
    line,
    rect,
    configuracionClinica,
    titleLines: ['CERTIFICADO DE TRATAMIENTO ANTIPARASITARIO'],
  });
  drawCertificateOwnerAnimalSection({ text, line, certificado });

  text(55, 435, 'ANTIPARASITARIO INTERNO:', { font: 'F2', size: 10 });
  text(55, 463, `Fecha y Hora: ${formatDateTimeValue(certificado.interno_fecha_hora)}`, { size: 9 });
  line(118, 466, 240, 466, 0.7);
  text(
    55,
    483,
    `Nombre comercial y laboratorio elaborador: ${certificado.interno_nombre_comercial || ''}`,
    { size: 9 }
  );
  line(240, 486, 540, 486, 0.7);
  text(55, 503, `Composición (Drogas): ${certificado.interno_composicion || ''}`, { size: 9 });
  line(155, 506, 540, 506, 0.7);
  text(
    55,
    523,
    `Dosis administrada: ${certificado.interno_dosis || ''}    Vía de administración: ${certificado.interno_via || ''}`,
    { size: 9 }
  );
  line(138, 526, 300, 526, 0.7);
  line(410, 526, 540, 526, 0.7);

  text(55, 555, 'ANTIPARASITARIO EXTERNO:', { font: 'F2', size: 10 });
  text(55, 583, `Fecha y Hora: ${formatDateTimeValue(certificado.externo_fecha_hora)}`, { size: 9 });
  line(118, 586, 240, 586, 0.7);
  text(
    55,
    603,
    `Nombre comercial y laboratorio elaborador: ${certificado.externo_nombre_comercial || ''}`,
    { size: 9 }
  );
  line(240, 606, 540, 606, 0.7);
  text(55, 623, `Composición (Drogas): ${certificado.externo_composicion || ''}`, { size: 9 });
  line(155, 626, 540, 626, 0.7);
  text(
    55,
    643,
    `Dosis administrada: ${certificado.externo_dosis || ''}    Vía de administración: ${certificado.externo_via || ''}`,
    { size: 9 }
  );
  line(138, 646, 300, 646, 0.7);
  line(410, 646, 540, 646, 0.7);

  text(55, 675, 'Observaciones:', { size: 9 });
  const observacionBottom = paragraph(125, 675, certificado.observaciones || '', {
    size: 9,
    maxChars: 74,
    lineHeight: 11,
  });
  line(125, 678, 540, 678, 0.7);
  if (observacionBottom > 675) {
    line(125, observacionBottom + 3, 540, observacionBottom + 3, 0.7);
  }

  text(55, 725, `${certificado.lugar_fecha || 'LUGAR Y FECHA'} `, { size: 9 });
  line(150, 728, 275, 728, 0.7);
  text(400, 760, 'Firma y Sello del Profesional Actuante', { size: 9, align: 'center' });
  line(340, 747, 520, 747, 0.7);
  drawCertificateFooter({ text, line });

  return finalizeCertificatePdf({ pageWidth, pageHeight, cmds });
};

const generateImplantacionMicrochipCertificatePdf = ({ certificado, configuracionClinica }) => {
  const { pageWidth, pageHeight, cmds, text, line, rect, paragraph } = createPdfCanvas();

  drawCertificateHeader({
    text,
    line,
    rect,
    configuracionClinica,
    titleLines: ['CERTIFICADO DE IMPLANTACIÓN DE MICROCHIP Y/O TATUAJE'],
  });
  drawCertificateOwnerAnimalSection({ text, line, certificado });

  text(55, 440, 'DATOS DE IMPLANTACIÓN / TATUAJE', { font: 'F2', size: 10 });
  text(
    55,
    468,
    `Fecha de implantación de microchip / tatuaje: ${formatShortDate(certificado.fecha_implantacion) || '....../....../..........'}`,
    { size: 9 }
  );
  line(245, 471, 395, 471, 0.7);
  text(55, 500, 'Lugar / región anatómica de implantación o tatuaje:', { size: 9 });
  paragraph(55, 515, certificado.lugar_implantacion || '', {
    size: 9,
    maxChars: 88,
    lineHeight: 11,
  });
  line(55, 528, 540, 528, 0.7);
  rect(45, 555, 500, 28, 0.8);
  paragraph(
    52,
    569,
    'Los MICROCHIPS deberán ser compatibles con las normas ISO Nº 11784 o 11785 y en caso de tatuaje deberá ser CLARAMENTE VISIBLE',
    { font: 'F2', size: 7, maxChars: 90, lineHeight: 9 }
  );

  text(55, 630, `${certificado.lugar_fecha || 'LUGAR Y FECHA'} `, { size: 9 });
  line(150, 633, 275, 633, 0.7);
  text(400, 690, 'Firma y Sello del Profesional Actuante', { size: 9, align: 'center' });
  line(340, 677, 520, 677, 0.7);
  drawCertificateFooter({ text, line });

  return finalizeCertificatePdf({ pageWidth, pageHeight, cmds });
};

const generateLecturaMicrochipCertificatePdf = ({ certificado, configuracionClinica }) => {
  const { pageWidth, pageHeight, cmds, text, line, rect, paragraph } = createPdfCanvas();

  drawCertificateHeader({
    text,
    line,
    rect,
    configuracionClinica,
    titleLines: ['CERTIFICADO DE LECTURA DE MICROCHIP Y/O TATUAJE'],
  });
  drawCertificateOwnerAnimalSection({ text, line, certificado });

  text(55, 440, 'DECLARACIÓN DE LECTURA', { font: 'F2', size: 10 });
  const lecturaDetalle = normalizeText(certificado.detalle_lectura);
  const declaracion =
    'Por medio de la presente certifico que el día de la fecha se realizó la lectura del MICROCHIP / TATUAJE del CANINO/FELINO detallado en la presente y el mismo se encuentra ubicado en ' +
    (lecturaDetalle ? `${lecturaDetalle}.` : '(..... de lugar / región anatómica).');
  paragraph(55, 472, declaracion, { size: 9, maxChars: 92, lineHeight: 12 });

  text(55, 610, `${certificado.lugar_fecha || 'LUGAR Y FECHA'} `, { size: 9 });
  line(150, 613, 275, 613, 0.7);
  text(400, 670, 'Firma y Sello del Profesional Actuante', { size: 9, align: 'center' });
  line(340, 657, 520, 657, 0.7);
  drawCertificateFooter({ text, line });

  return finalizeCertificatePdf({ pageWidth, pageHeight, cmds });
};

const generateLibreMiasisCertificatePdf = ({ certificado, configuracionClinica }) => {
  const { pageWidth, pageHeight, cmds, text, line, rect, paragraph } = createPdfCanvas();

  drawCertificateHeader({
    text,
    line,
    rect,
    configuracionClinica,
    titleLines: ['CERTIFICADO DE LIBRE DE MIASIS'],
  });
  drawCertificateOwnerAnimalSection({ text, line, certificado });

  text(55, 440, 'DECLARACIÓN', { font: 'F2', size: 10 });
  paragraph(
    55,
    475,
    'Por medio de la presente CERTIFICO QUE AL DÍA DE LA FECHA dicho animal se encuentra libre de miasis provocada por el Gusano Barrenador o Cochliomyia hominivorax.',
    { font: 'F2', size: 9, maxChars: 84, lineHeight: 14 }
  );

  text(55, 600, `${certificado.lugar_fecha || 'LUGAR Y FECHA'} `, { size: 9 });
  line(150, 603, 275, 603, 0.7);
  text(400, 660, 'Firma y Sello del Profesional Actuante', { size: 9, align: 'center' });
  line(340, 647, 520, 647, 0.7);
  drawCertificateFooter({ text, line });

  return finalizeCertificatePdf({ pageWidth, pageHeight, cmds });
};

const ensureConfiguracionClinicaTable = async () => {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS configuracion_clinica (
      id INT PRIMARY KEY,
      veterinaria_nombre VARCHAR(255) NULL,
      medica_nombre VARCHAR(255) NULL,
      medica_matricula VARCHAR(120) NULL,
      logo_ruta VARCHAR(255) NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`
  );

  await pool.query(
    `INSERT INTO configuracion_clinica (id)
     SELECT 1
     FROM DUAL
     WHERE NOT EXISTS (SELECT 1 FROM configuracion_clinica WHERE id = 1)`
  );
};

const ensureCertificadosLeishmaniasisTable = async () => {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS certificados_leishmaniasis (
      id INT AUTO_INCREMENT PRIMARY KEY,
      mascota_id INT NOT NULL,
      propietario_nombre VARCHAR(255) NOT NULL,
      propietario_documento_tipo VARCHAR(80) NULL,
      propietario_documento_numero VARCHAR(80) NULL,
      propietario_direccion VARCHAR(255) NULL,
      animal_nombre VARCHAR(120) NOT NULL,
      animal_especie VARCHAR(80) NOT NULL DEFAULT 'Canino',
      animal_sexo VARCHAR(20) NULL,
      animal_condicion_reproductiva VARCHAR(20) NULL,
      animal_edad VARCHAR(80) NULL,
      animal_fecha_nacimiento DATE NULL,
      animal_peso VARCHAR(40) NULL,
      animal_raza VARCHAR(120) NULL,
      animal_pelaje VARCHAR(120) NULL,
      animal_microchip VARCHAR(120) NULL,
      fecha_toma_muestra DATE NULL,
      metodo_diagnostico VARCHAR(255) NULL,
      laboratorio_diagnostico VARCHAR(255) NULL,
      fecha_resultado DATE NULL,
      resultado VARCHAR(80) NOT NULL DEFAULT 'NEGATIVO',
      lugar_fecha VARCHAR(255) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_certificado_leishmaniasis_mascota
        FOREIGN KEY (mascota_id) REFERENCES mascotas(id)
        ON DELETE CASCADE
    )`
  );
};

const ensureCertificadosTratamientosAntiparasitariosTable = async () => {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS certificados_tratamientos_antiparasitarios (
      id INT AUTO_INCREMENT PRIMARY KEY,
      mascota_id INT NOT NULL,
      propietario_nombre VARCHAR(255) NOT NULL,
      propietario_documento_tipo VARCHAR(80) NULL,
      propietario_documento_numero VARCHAR(80) NULL,
      propietario_direccion VARCHAR(255) NULL,
      animal_nombre VARCHAR(120) NOT NULL,
      animal_especie VARCHAR(80) NOT NULL DEFAULT 'Canino',
      animal_sexo VARCHAR(20) NULL,
      animal_condicion_reproductiva VARCHAR(20) NULL,
      animal_edad VARCHAR(80) NULL,
      animal_fecha_nacimiento DATE NULL,
      animal_peso VARCHAR(40) NULL,
      animal_raza VARCHAR(120) NULL,
      animal_pelaje VARCHAR(120) NULL,
      animal_microchip VARCHAR(120) NULL,
      interno_fecha_hora VARCHAR(80) NULL,
      interno_nombre_comercial VARCHAR(255) NULL,
      interno_composicion VARCHAR(255) NULL,
      interno_dosis VARCHAR(255) NULL,
      interno_via VARCHAR(120) NULL,
      externo_fecha_hora VARCHAR(80) NULL,
      externo_nombre_comercial VARCHAR(255) NULL,
      externo_composicion VARCHAR(255) NULL,
      externo_dosis VARCHAR(255) NULL,
      externo_via VARCHAR(120) NULL,
      observaciones TEXT NULL,
      lugar_fecha VARCHAR(255) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_certificado_tratamiento_antiparasitario_mascota
        FOREIGN KEY (mascota_id) REFERENCES mascotas(id)
        ON DELETE CASCADE
    )`
  );
};

const ensureCertificadosImplantacionMicrochipTable = async () => {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS certificados_implantacion_microchip_tatuaje (
      id INT AUTO_INCREMENT PRIMARY KEY,
      mascota_id INT NOT NULL,
      propietario_nombre VARCHAR(255) NOT NULL,
      propietario_documento_tipo VARCHAR(80) NULL,
      propietario_documento_numero VARCHAR(80) NULL,
      propietario_direccion VARCHAR(255) NULL,
      animal_nombre VARCHAR(120) NOT NULL,
      animal_especie VARCHAR(80) NOT NULL DEFAULT 'Canino',
      animal_sexo VARCHAR(20) NULL,
      animal_condicion_reproductiva VARCHAR(20) NULL,
      animal_edad VARCHAR(80) NULL,
      animal_fecha_nacimiento DATE NULL,
      animal_peso VARCHAR(40) NULL,
      animal_raza VARCHAR(120) NULL,
      animal_pelaje VARCHAR(120) NULL,
      animal_microchip VARCHAR(120) NULL,
      fecha_implantacion DATE NULL,
      lugar_implantacion VARCHAR(255) NULL,
      lugar_fecha VARCHAR(255) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_certificado_implantacion_microchip_mascota
        FOREIGN KEY (mascota_id) REFERENCES mascotas(id)
        ON DELETE CASCADE
    )`
  );
};

const ensureCertificadosLecturaMicrochipTable = async () => {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS certificados_lectura_microchip_tatuaje (
      id INT AUTO_INCREMENT PRIMARY KEY,
      mascota_id INT NOT NULL,
      propietario_nombre VARCHAR(255) NOT NULL,
      propietario_documento_tipo VARCHAR(80) NULL,
      propietario_documento_numero VARCHAR(80) NULL,
      propietario_direccion VARCHAR(255) NULL,
      animal_nombre VARCHAR(120) NOT NULL,
      animal_especie VARCHAR(80) NOT NULL DEFAULT 'Canino',
      animal_sexo VARCHAR(20) NULL,
      animal_condicion_reproductiva VARCHAR(20) NULL,
      animal_edad VARCHAR(80) NULL,
      animal_fecha_nacimiento DATE NULL,
      animal_peso VARCHAR(40) NULL,
      animal_raza VARCHAR(120) NULL,
      animal_pelaje VARCHAR(120) NULL,
      animal_microchip VARCHAR(120) NULL,
      detalle_lectura VARCHAR(255) NULL,
      lugar_fecha VARCHAR(255) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_certificado_lectura_microchip_mascota
        FOREIGN KEY (mascota_id) REFERENCES mascotas(id)
        ON DELETE CASCADE
    )`
  );
};

const ensureCertificadosLibreMiasisTable = async () => {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS certificados_libre_miasis (
      id INT AUTO_INCREMENT PRIMARY KEY,
      mascota_id INT NOT NULL,
      propietario_nombre VARCHAR(255) NOT NULL,
      propietario_documento_tipo VARCHAR(80) NULL,
      propietario_documento_numero VARCHAR(80) NULL,
      propietario_direccion VARCHAR(255) NULL,
      animal_nombre VARCHAR(120) NOT NULL,
      animal_especie VARCHAR(80) NOT NULL DEFAULT 'Canino',
      animal_sexo VARCHAR(20) NULL,
      animal_condicion_reproductiva VARCHAR(20) NULL,
      animal_edad VARCHAR(80) NULL,
      animal_fecha_nacimiento DATE NULL,
      animal_peso VARCHAR(40) NULL,
      animal_raza VARCHAR(120) NULL,
      animal_pelaje VARCHAR(120) NULL,
      animal_microchip VARCHAR(120) NULL,
      lugar_fecha VARCHAR(255) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_certificado_libre_miasis_mascota
        FOREIGN KEY (mascota_id) REFERENCES mascotas(id)
        ON DELETE CASCADE
    )`
  );
};

const getConfiguracionClinica = async () => {

  const [rows] = await pool.query(
    `SELECT veterinaria_nombre, medica_nombre, medica_matricula, logo_ruta
     FROM configuracion_clinica
     WHERE id = 1
     LIMIT 1`
  );

  if (!rows.length) {
    return {
      veterinaria_nombre: '',
      medica_nombre: '',
      medica_matricula: '',
      logo_ruta: '',
    };
  }

  return rows[0];
};

app.use(
  asyncHandler(async (req, res, next) => {
    res.locals.configuracionClinica = await getConfiguracionClinica();
    next();
  })
);

const extractJpegLogoFromBody = (body) => {
  const originalName = (body.logo_nombre || '').trim();
  const jpegBase64Value = body.logo_base64 || '';

  if (!jpegBase64Value) {
    return null;
  }

  const normalizedName = originalName.toLowerCase();
  const hasJpegExtension =
    normalizedName.endsWith('.jpg') || normalizedName.endsWith('.jpeg');
  const hasJpegPrefix =
    jpegBase64Value.startsWith('data:image/jpeg;base64,') ||
    jpegBase64Value.startsWith('data:image/jpg;base64,');

  if (!hasJpegExtension || !hasJpegPrefix) {
    throw new Error('El logo debe ser una imagen JPEG (.jpg o .jpeg).');
  }

  const base64Data = jpegBase64Value.replace(/^data:image\/(jpeg|jpg);base64,/, '');
  return {
    imageBuffer: Buffer.from(base64Data, 'base64'),
  };
};

const saveJpegLogo = async ({ imageBuffer }) => {
  const uniqueFileName = `${Date.now()}-${Math.round(Math.random() * 1e9)}.jpeg`;
  const targetFilePath = path.join(CONFIG_UPLOAD_DIR, uniqueFileName);
  await fs.writeFile(targetFilePath, imageBuffer);
  return `/uploads/configuracion/${uniqueFileName}`;
};

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

const ensureMascotasHasColorAndSenasParticulares = async () => {
  const [columns] = await pool.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'mascotas'
       AND COLUMN_NAME IN ('color', 'senias_particulares')`
  );

  const columnNames = new Set(columns.map((column) => column.COLUMN_NAME));

  if (!columnNames.has('color')) {
    await pool.query("ALTER TABLE mascotas ADD COLUMN color VARCHAR(120) NULL AFTER tamanio");
  }

  if (!columnNames.has('senias_particulares')) {
    await pool.query(
      'ALTER TABLE mascotas ADD COLUMN senias_particulares TEXT NULL AFTER color'
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

const ensureVacunasHasWhatsappReminderFlag = async () => {
  const [columns] = await pool.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'vacunas'
       AND COLUMN_NAME = 'recordatorio_whatsapp_enviado'`
  );

  if (!columns.length) {
    await pool.query(
      'ALTER TABLE vacunas ADD COLUMN recordatorio_whatsapp_enviado TINYINT(1) NOT NULL DEFAULT 0 AFTER numero_serie'
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

const extractPdfAttachmentsFromBody = (body) => {
  const attachments = [];
  const attachmentsJson = (body.documentaciones_adjuntas_json || '').trim();

  if (attachmentsJson) {
    let parsedAttachments;
    try {
      parsedAttachments = JSON.parse(attachmentsJson);
    } catch (error) {
      throw new Error('No se pudieron procesar los PDFs adjuntos.');
    }

    if (!Array.isArray(parsedAttachments)) {
      throw new Error('No se pudieron procesar los PDFs adjuntos.');
    }

    for (const attachment of parsedAttachments) {
      const parsed = extractPdfAttachmentFromBody({
        documentacion_adjunta_nombre: attachment?.nombre || '',
        documentacion_adjunta_base64: attachment?.base64 || '',
      });
      if (parsed) {
        attachments.push(parsed);
      }
    }
  }

  if (!attachments.length) {
    const singleAttachment = extractPdfAttachmentFromBody(body);
    if (singleAttachment) {
      attachments.push(singleAttachment);
    }
  }

  return attachments;
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
    const {
      nombre,
      especie,
      raza,
      sexo,
      tamanio,
      color,
      senias_particulares,
      fecha_nacimiento,
      cliente_id,
    } = req.body;
    const razaValidada = await validateBreedBySpecies(especie, raza);
    const sexoValidado = validateMascotaSexo(sexo);
    const tamanioValidado = validateMascotaTamanio(tamanio);
    await pool.query(
      `INSERT INTO mascotas (
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
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nombre,
        especie,
        razaValidada,
        sexoValidado,
        tamanioValidado,
        (color || '').trim() || null,
        (senias_particulares || '').trim() || null,
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
    const {
      nombre,
      especie,
      raza,
      sexo,
      tamanio,
      color,
      senias_particulares,
      fecha_nacimiento,
      cliente_id,
    } = req.body;
    const razaValidada = await validateBreedBySpecies(especie, raza);
    const sexoValidado = validateMascotaSexo(sexo);
    const tamanioValidado = validateMascotaTamanio(tamanio);
    await pool.query(
      `UPDATE mascotas
       SET nombre = ?,
           especie = ?,
           raza = ?,
           sexo = ?,
           tamanio = ?,
           color = ?,
           senias_particulares = ?,
           fecha_nacimiento = ?,
           cliente_id = ?
       WHERE id = ?`,
      [
        nombre,
        especie,
        razaValidada,
        sexoValidado,
        tamanioValidado,
        (color || '').trim() || null,
        (senias_particulares || '').trim() || null,
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

    const configuracionClinica = await getConfiguracionClinica();
    return res.render('historia-detalle-print', {
      historia: historias[0],
      configuracionClinica,
    });
  })
);

app.get(
  '/historia-clinica/mascota/:mascotaId/imprimir',
  asyncHandler(async (req, res) => {
    const mascotaId = Number(req.params.mascotaId);

    if (!Number.isInteger(mascotaId) || mascotaId <= 0) {
      return res.status(400).render('error', {
        message: 'La mascota indicada no es válida.',
      });
    }

    const [mascotas] = await pool.query(
      `SELECT id, nombre, especie, raza, sexo, tamanio
       FROM mascotas
       WHERE id = ?`,
      [mascotaId]
    );

    if (!mascotas.length) {
      return res.status(404).render('error', {
        message: 'La mascota solicitada no existe.',
      });
    }

    const [historias] = await pool.query(
      `SELECT *
       FROM historia_clinica
       WHERE mascota_id = ?
       ORDER BY fecha DESC, id DESC`,
      [mascotaId]
    );

    const configuracionClinica = await getConfiguracionClinica();
    return res.render('historia-mascota-print', {
      mascota: mascotas[0],
      historias,
      configuracionClinica,
    });
  })
);

const getCommonCertificatePayload = (body) => ({
  mascota_id: body.mascota_id,
  propietario_nombre: normalizeText(body.propietario_nombre),
  propietario_documento_tipo: normalizeText(body.propietario_documento_tipo) || null,
  propietario_documento_numero: normalizeText(body.propietario_documento_numero) || null,
  propietario_direccion: normalizeText(body.propietario_direccion) || null,
  animal_nombre: normalizeText(body.animal_nombre),
  animal_especie: normalizeText(body.animal_especie) || 'Canino',
  animal_sexo: normalizeText(body.animal_sexo) || null,
  animal_condicion_reproductiva: normalizeText(body.animal_condicion_reproductiva) || null,
  animal_edad: normalizeText(body.animal_edad) || null,
  animal_fecha_nacimiento: body.animal_fecha_nacimiento || null,
  animal_peso: normalizeText(body.animal_peso) || null,
  animal_raza: normalizeText(body.animal_raza) || null,
  animal_pelaje: normalizeText(body.animal_pelaje) || null,
  animal_microchip: normalizeText(body.animal_microchip) || null,
  lugar_fecha: normalizeText(body.lugar_fecha) || null,
});

const getCertificateListQuery = (tableName) =>
  `SELECT ${tableName}.*,
          mascotas.nombre AS mascota_nombre,
          clientes.nombre AS cliente_nombre
   FROM ${tableName}
   JOIN mascotas ON mascotas.id = ${tableName}.mascota_id
   JOIN clientes ON clientes.id = mascotas.cliente_id`;

const loadCertificateRows = async (tableName, selectedMascotaId) => {
  let query = getCertificateListQuery(tableName);
  const params = [];
  if (selectedMascotaId) {
    query += ` WHERE ${tableName}.mascota_id = ?`;
    params.push(selectedMascotaId);
  }
  query += ` ORDER BY ${tableName}.created_at DESC, ${tableName}.id DESC`;
  const [rows] = await pool.query(query, params);
  return rows;
};

const loadCertificateRecordById = async (tableName, id) => {
  const [rows] = await pool.query(
    `SELECT ${tableName}.*,
            mascotas.nombre AS mascota_nombre,
            mascotas.especie AS mascota_especie,
            mascotas.raza AS mascota_raza,
            mascotas.sexo AS mascota_sexo,
            clientes.nombre AS cliente_nombre
     FROM ${tableName}
     JOIN mascotas ON mascotas.id = ${tableName}.mascota_id
     JOIN clientes ON clientes.id = mascotas.cliente_id
     WHERE ${tableName}.id = ?`,
    [id]
  );

  return rows[0] || null;
};

const redirectToCertificates = (res, tipo, mascotaId = '') => {
  const params = new URLSearchParams();
  if (tipo) {
    params.set('tipo', tipo);
  }
  if (mascotaId) {
    params.set('mascota_id', mascotaId);
  }
  const suffix = params.toString();
  res.redirect(suffix ? `/certificados?${suffix}` : '/certificados');
};

app.get(
  '/certificados',
  asyncHandler(async (req, res) => {
    const selectedMascotaId = req.query.mascota_id ? String(req.query.mascota_id) : '';
    const selectedCertificateType =
      req.query.tipo && CERTIFICATE_TYPE_LABELS[req.query.tipo]
        ? req.query.tipo
        : CERTIFICADO_TIPO_DEFAULT;

    const [mascotas] = await pool.query(
      `SELECT mascotas.id,
              mascotas.nombre,
              mascotas.especie,
              mascotas.raza,
              mascotas.sexo,
              mascotas.color,
              mascotas.fecha_nacimiento,
              clientes.nombre AS cliente_nombre,
              clientes.direccion AS cliente_direccion
       FROM mascotas
       JOIN clientes ON clientes.id = mascotas.cliente_id
       ORDER BY mascotas.nombre`
    );

    const [
      certificadosLeishmaniasis,
      certificadosTratamientosAntiparasitarios,
      certificadosImplantacionMicrochip,
      certificadosLecturaMicrochip,
      certificadosLibreMiasis,
    ] = await Promise.all([
      loadCertificateRows('certificados_leishmaniasis', selectedMascotaId),
      loadCertificateRows('certificados_tratamientos_antiparasitarios', selectedMascotaId),
      loadCertificateRows('certificados_implantacion_microchip_tatuaje', selectedMascotaId),
      loadCertificateRows('certificados_lectura_microchip_tatuaje', selectedMascotaId),
      loadCertificateRows('certificados_libre_miasis', selectedMascotaId),
    ]);

    res.render('certificados', {
      mascotas,
      selectedMascotaId,
      selectedCertificateType,
      certificadoResultadoDefault: CERTIFICADO_LEISHMANIASIS_RESULTADO,
      certificadosLeishmaniasis,
      certificadosTratamientosAntiparasitarios,
      certificadosImplantacionMicrochip,
      certificadosLecturaMicrochip,
      certificadosLibreMiasis,
      certificateTypeLabels: CERTIFICATE_TYPE_LABELS,
    });
  })
);

app.post(
  '/certificados/leishmaniasis',
  asyncHandler(async (req, res) => {
    const common = getCommonCertificatePayload(req.body);
    await pool.query(
      `INSERT INTO certificados_leishmaniasis (
        mascota_id,
        propietario_nombre,
        propietario_documento_tipo,
        propietario_documento_numero,
        propietario_direccion,
        animal_nombre,
        animal_especie,
        animal_sexo,
        animal_condicion_reproductiva,
        animal_edad,
        animal_fecha_nacimiento,
        animal_peso,
        animal_raza,
        animal_pelaje,
        animal_microchip,
        fecha_toma_muestra,
        metodo_diagnostico,
        laboratorio_diagnostico,
        fecha_resultado,
        resultado,
        lugar_fecha
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        common.mascota_id,
        common.propietario_nombre,
        common.propietario_documento_tipo,
        common.propietario_documento_numero,
        common.propietario_direccion,
        common.animal_nombre,
        common.animal_especie,
        common.animal_sexo,
        common.animal_condicion_reproductiva,
        common.animal_edad,
        common.animal_fecha_nacimiento,
        common.animal_peso,
        common.animal_raza,
        common.animal_pelaje,
        common.animal_microchip,
        req.body.fecha_toma_muestra || null,
        normalizeText(req.body.metodo_diagnostico) || null,
        normalizeText(req.body.laboratorio_diagnostico) || null,
        req.body.fecha_resultado || null,
        normalizeText(req.body.resultado) || CERTIFICADO_LEISHMANIASIS_RESULTADO,
        common.lugar_fecha,
      ]
    );

    redirectToCertificates(res, 'leishmaniasis', common.mascota_id);
  })
);

app.post(
  '/certificados/tratamiento-antiparasitario',
  asyncHandler(async (req, res) => {
    const common = getCommonCertificatePayload(req.body);
    await pool.query(
      `INSERT INTO certificados_tratamientos_antiparasitarios (
        mascota_id,
        propietario_nombre,
        propietario_documento_tipo,
        propietario_documento_numero,
        propietario_direccion,
        animal_nombre,
        animal_especie,
        animal_sexo,
        animal_condicion_reproductiva,
        animal_edad,
        animal_fecha_nacimiento,
        animal_peso,
        animal_raza,
        animal_pelaje,
        animal_microchip,
        interno_fecha_hora,
        interno_nombre_comercial,
        interno_composicion,
        interno_dosis,
        interno_via,
        externo_fecha_hora,
        externo_nombre_comercial,
        externo_composicion,
        externo_dosis,
        externo_via,
        observaciones,
        lugar_fecha
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        common.mascota_id,
        common.propietario_nombre,
        common.propietario_documento_tipo,
        common.propietario_documento_numero,
        common.propietario_direccion,
        common.animal_nombre,
        common.animal_especie,
        common.animal_sexo,
        common.animal_condicion_reproductiva,
        common.animal_edad,
        common.animal_fecha_nacimiento,
        common.animal_peso,
        common.animal_raza,
        common.animal_pelaje,
        common.animal_microchip,
        normalizeText(req.body.interno_fecha_hora) || null,
        normalizeText(req.body.interno_nombre_comercial) || null,
        normalizeText(req.body.interno_composicion) || null,
        normalizeText(req.body.interno_dosis) || null,
        normalizeText(req.body.interno_via) || null,
        normalizeText(req.body.externo_fecha_hora) || null,
        normalizeText(req.body.externo_nombre_comercial) || null,
        normalizeText(req.body.externo_composicion) || null,
        normalizeText(req.body.externo_dosis) || null,
        normalizeText(req.body.externo_via) || null,
        normalizeText(req.body.observaciones) || null,
        common.lugar_fecha,
      ]
    );

    redirectToCertificates(res, 'tratamiento_antiparasitario', common.mascota_id);
  })
);

app.post(
  '/certificados/implantacion-microchip-tatuaje',
  asyncHandler(async (req, res) => {
    const common = getCommonCertificatePayload(req.body);
    await pool.query(
      `INSERT INTO certificados_implantacion_microchip_tatuaje (
        mascota_id,
        propietario_nombre,
        propietario_documento_tipo,
        propietario_documento_numero,
        propietario_direccion,
        animal_nombre,
        animal_especie,
        animal_sexo,
        animal_condicion_reproductiva,
        animal_edad,
        animal_fecha_nacimiento,
        animal_peso,
        animal_raza,
        animal_pelaje,
        animal_microchip,
        fecha_implantacion,
        lugar_implantacion,
        lugar_fecha
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        common.mascota_id,
        common.propietario_nombre,
        common.propietario_documento_tipo,
        common.propietario_documento_numero,
        common.propietario_direccion,
        common.animal_nombre,
        common.animal_especie,
        common.animal_sexo,
        common.animal_condicion_reproductiva,
        common.animal_edad,
        common.animal_fecha_nacimiento,
        common.animal_peso,
        common.animal_raza,
        common.animal_pelaje,
        common.animal_microchip,
        req.body.fecha_implantacion || null,
        normalizeText(req.body.lugar_implantacion) || null,
        common.lugar_fecha,
      ]
    );

    redirectToCertificates(res, 'implantacion_microchip_tatuaje', common.mascota_id);
  })
);

app.post(
  '/certificados/lectura-microchip-tatuaje',
  asyncHandler(async (req, res) => {
    const common = getCommonCertificatePayload(req.body);
    await pool.query(
      `INSERT INTO certificados_lectura_microchip_tatuaje (
        mascota_id,
        propietario_nombre,
        propietario_documento_tipo,
        propietario_documento_numero,
        propietario_direccion,
        animal_nombre,
        animal_especie,
        animal_sexo,
        animal_condicion_reproductiva,
        animal_edad,
        animal_fecha_nacimiento,
        animal_peso,
        animal_raza,
        animal_pelaje,
        animal_microchip,
        detalle_lectura,
        lugar_fecha
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        common.mascota_id,
        common.propietario_nombre,
        common.propietario_documento_tipo,
        common.propietario_documento_numero,
        common.propietario_direccion,
        common.animal_nombre,
        common.animal_especie,
        common.animal_sexo,
        common.animal_condicion_reproductiva,
        common.animal_edad,
        common.animal_fecha_nacimiento,
        common.animal_peso,
        common.animal_raza,
        common.animal_pelaje,
        common.animal_microchip,
        normalizeText(req.body.detalle_lectura) || null,
        common.lugar_fecha,
      ]
    );

    redirectToCertificates(res, 'lectura_microchip_tatuaje', common.mascota_id);
  })
);

app.post(
  '/certificados/libre-miasis',
  asyncHandler(async (req, res) => {
    const common = getCommonCertificatePayload(req.body);
    await pool.query(
      `INSERT INTO certificados_libre_miasis (
        mascota_id,
        propietario_nombre,
        propietario_documento_tipo,
        propietario_documento_numero,
        propietario_direccion,
        animal_nombre,
        animal_especie,
        animal_sexo,
        animal_condicion_reproductiva,
        animal_edad,
        animal_fecha_nacimiento,
        animal_peso,
        animal_raza,
        animal_pelaje,
        animal_microchip,
        lugar_fecha
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        common.mascota_id,
        common.propietario_nombre,
        common.propietario_documento_tipo,
        common.propietario_documento_numero,
        common.propietario_direccion,
        common.animal_nombre,
        common.animal_especie,
        common.animal_sexo,
        common.animal_condicion_reproductiva,
        common.animal_edad,
        common.animal_fecha_nacimiento,
        common.animal_peso,
        common.animal_raza,
        common.animal_pelaje,
        common.animal_microchip,
        common.lugar_fecha,
      ]
    );

    redirectToCertificates(res, 'libre_miasis', common.mascota_id);
  })
);

app.get(
  '/certificados/leishmaniasis/:id/pdf',
  asyncHandler(async (req, res) => {
    const certificado = await loadCertificateRecordById('certificados_leishmaniasis', req.params.id);

    if (!certificado) {
      return res.status(404).render('error', {
        message: 'El certificado solicitado no existe.',
      });
    }

    const configuracionClinica = await getConfiguracionClinica();
    const pdfBuffer = generateLeishmaniasisCertificatePdf({ certificado, configuracionClinica });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="certificado-leishmaniasis-${certificado.id}.pdf"`);
    res.send(pdfBuffer);
  })
);

app.get(
  '/certificados/tratamiento-antiparasitario/:id/pdf',
  asyncHandler(async (req, res) => {
    const certificado = await loadCertificateRecordById(
      'certificados_tratamientos_antiparasitarios',
      req.params.id
    );

    if (!certificado) {
      return res.status(404).render('error', {
        message: 'El certificado solicitado no existe.',
      });
    }

    const configuracionClinica = await getConfiguracionClinica();
    const pdfBuffer = generateTratamientoAntiparasitarioCertificatePdf({
      certificado,
      configuracionClinica,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="certificado-tratamiento-antiparasitario-${certificado.id}.pdf"`
    );
    res.send(pdfBuffer);
  })
);

app.get(
  '/certificados/implantacion-microchip-tatuaje/:id/pdf',
  asyncHandler(async (req, res) => {
    const certificado = await loadCertificateRecordById(
      'certificados_implantacion_microchip_tatuaje',
      req.params.id
    );

    if (!certificado) {
      return res.status(404).render('error', {
        message: 'El certificado solicitado no existe.',
      });
    }

    const configuracionClinica = await getConfiguracionClinica();
    const pdfBuffer = generateImplantacionMicrochipCertificatePdf({
      certificado,
      configuracionClinica,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="certificado-implantacion-microchip-${certificado.id}.pdf"`
    );
    res.send(pdfBuffer);
  })
);

app.get(
  '/certificados/lectura-microchip-tatuaje/:id/pdf',
  asyncHandler(async (req, res) => {
    const certificado = await loadCertificateRecordById(
      'certificados_lectura_microchip_tatuaje',
      req.params.id
    );

    if (!certificado) {
      return res.status(404).render('error', {
        message: 'El certificado solicitado no existe.',
      });
    }

    const configuracionClinica = await getConfiguracionClinica();
    const pdfBuffer = generateLecturaMicrochipCertificatePdf({
      certificado,
      configuracionClinica,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="certificado-lectura-microchip-${certificado.id}.pdf"`
    );
    res.send(pdfBuffer);
  })
);

app.get(
  '/certificados/libre-miasis/:id/pdf',
  asyncHandler(async (req, res) => {
    const certificado = await loadCertificateRecordById('certificados_libre_miasis', req.params.id);

    if (!certificado) {
      return res.status(404).render('error', {
        message: 'El certificado solicitado no existe.',
      });
    }

    const configuracionClinica = await getConfiguracionClinica();
    const pdfBuffer = generateLibreMiasisCertificatePdf({ certificado, configuracionClinica });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="certificado-libre-miasis-${certificado.id}.pdf"`);
    res.send(pdfBuffer);
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
      documentaciones_adjuntas_json,
    } = Object.fromEntries(
      Object.entries(req.body).map(([key, value]) => [key, getFieldValue(value)])
    );

    const pdfAttachments = extractPdfAttachmentsFromBody({
      documentacion_adjunta_nombre,
      documentacion_adjunta_base64,
      documentaciones_adjuntas_json,
    });

    const savedAttachments = [];
    for (const pdfAttachment of pdfAttachments) {
      const attachmentData = await savePdfAttachment(pdfAttachment);
      savedAttachments.push(attachmentData);
    }

    if (savedAttachments.length) {
      documentoAdjuntoNombre = savedAttachments[0].nombreOriginal;
      documentoAdjuntoRuta = savedAttachments[0].rutaPublica;
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

    for (const attachmentData of savedAttachments) {
      await pool.query(
        `INSERT INTO historia_clinica_documentos (historia_clinica_id, nombre_original, ruta_publica)
         VALUES (?, ?, ?)`,
        [insertResult.insertId, attachmentData.nombreOriginal || 'Documento PDF', attachmentData.rutaPublica]
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

app.get(
  '/vacunas/proximas',
  asyncHandler(async (req, res) => {
    const [recordatorios] = await pool.query(
      `SELECT vacunas.id,
              vacunas.proxima_fecha_aplicacion,
              vacunas.recordatorio_whatsapp_enviado,
              vacunas_tipos.nombre AS tipo,
              vacunas_nombres_comerciales.nombre AS nombre_comercial,
              mascotas.nombre AS mascota_nombre,
              clientes.nombre AS cliente_nombre,
              clientes.telefono AS cliente_telefono
       FROM vacunas
       JOIN mascotas ON mascotas.id = vacunas.mascota_id
       JOIN clientes ON clientes.id = mascotas.cliente_id
       JOIN vacunas_tipos ON vacunas_tipos.id = vacunas.tipo_id
       JOIN vacunas_nombres_comerciales
         ON vacunas_nombres_comerciales.id = vacunas.nombre_comercial_id
       WHERE vacunas.proxima_fecha_aplicacion IS NOT NULL
         AND vacunas.proxima_fecha_aplicacion BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 1 MONTH)
       ORDER BY vacunas.proxima_fecha_aplicacion ASC, mascotas.nombre ASC`
    );

    res.render('vacunas-proximas', { recordatorios });
  })
);

app.post(
  '/vacunas/:id/recordatorio-whatsapp',
  asyncHandler(async (req, res) => {
    const recordatorioEnviado = req.body.recordatorio_whatsapp_enviado === '1' ? 1 : 0;

    await pool.query(
      `UPDATE vacunas
       SET recordatorio_whatsapp_enviado = ?
       WHERE id = ?`,
      [recordatorioEnviado, req.params.id]
    );

    res.redirect('/vacunas/proximas');
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
      `SELECT turnos.*, clientes.nombre AS cliente_nombre, clientes.telefono AS cliente_telefono, mascotas.nombre AS mascota_nombre
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
    const configuracionClinica = await getConfiguracionClinica();
    res.render('configuracion', { configuracionClinica });
  })
);

app.post(
  '/configuracion/clinica',
  asyncHandler(async (req, res) => {
    const veterinariaNombre = (req.body.veterinaria_nombre || '').trim();
    const medicaNombre = (req.body.medica_nombre || '').trim();
    const medicaMatricula = (req.body.medica_matricula || '').trim();

    let logoRuta = req.body.logo_actual || null;
    const logoAdjunto = extractJpegLogoFromBody(req.body);

    if (logoAdjunto) {
      logoRuta = await saveJpegLogo(logoAdjunto);
    }

    await pool.query(
      `UPDATE configuracion_clinica
       SET veterinaria_nombre = ?,
           medica_nombre = ?,
           medica_matricula = ?,
           logo_ruta = ?
       WHERE id = 1`,
      [
        veterinariaNombre || null,
        medicaNombre || null,
        medicaMatricula || null,
        logoRuta,
      ]
    );

    res.redirect('/configuracion');
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
  await fs.mkdir(CONFIG_UPLOAD_DIR, { recursive: true });
  await ensureMascotasRazasHasEspecieRelation();
  await ensureMascotasHasSexoAndTamanio();
  await ensureMascotasHasColorAndSenasParticulares();
  await ensureHistoriaClinicaHasOtrosDatos();
  await ensureHistoriaClinicaHasDocumentoAdjunto();
  await ensureHistoriaClinicaDocumentosTable();
  await ensureConfiguracionClinicaTable();
  await ensureCertificadosLeishmaniasisTable();
  await ensureCertificadosTratamientosAntiparasitariosTable();
  await ensureCertificadosImplantacionMicrochipTable();
  await ensureCertificadosLecturaMicrochipTable();
  await ensureCertificadosLibreMiasisTable();
  await ensureVacunasHasWhatsappReminderFlag();
  app.listen(PORT, () => {
    console.log(`Servidor iniciado en http://localhost:${PORT}`);
  });
};

startServer().catch((error) => {
  console.error('No se pudo iniciar el servidor:', error);
  process.exit(1);
});
