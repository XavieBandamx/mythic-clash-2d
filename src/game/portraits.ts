// ==========================================================================
// FUNCIÓN RENDERIZADORA DE ICONOS DE ROSTROS MITOLÓGICOS (CANVAS PURO)
// ==========================================================================
export function drawDeityPortraitIcon(ctx: CanvasRenderingContext2D, deityId: string, cx: number, cy: number, size: number) {
  ctx.save();
  ctx.translate(cx, cy);

  const r = size / 2;

  // Fondo circular recortado
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r - 2, 0, Math.PI * 2);
  ctx.clip();

  // Fondo del icono según la deidad
  const bgGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, r);
  if (deityId === 'zeus') {
    bgGrad.addColorStop(0, '#0284c7');
    bgGrad.addColorStop(1, '#082f49');
  } else if (deityId === 'hades') {
    bgGrad.addColorStop(0, '#581c87');
    bgGrad.addColorStop(1, '#090514');
  } else if (deityId === 'poseidon') {
    bgGrad.addColorStop(0, '#0d9488');
    bgGrad.addColorStop(1, '#042f2e');
  } else if (deityId === 'ra') {
    bgGrad.addColorStop(0, '#f97316');
    bgGrad.addColorStop(1, '#431407');
  } else if (deityId === 'anubis') {
    bgGrad.addColorStop(0, '#475569');
    bgGrad.addColorStop(1, '#0f172a');
  } else if (deityId === 'osiris') {
    bgGrad.addColorStop(0, '#15803d');
    bgGrad.addColorStop(1, '#052e16');
  } else if (deityId === 'quetzalcoatl') {
    bgGrad.addColorStop(0, '#059669');
    bgGrad.addColorStop(1, '#022c22');
  } else if (deityId === 'huitzilopochtli') {
    bgGrad.addColorStop(0, '#ea580c');
    bgGrad.addColorStop(1, '#3a1103');
  } else if (deityId === 'mictlantecuhtli') {
    bgGrad.addColorStop(0, '#64748b');
    bgGrad.addColorStop(1, '#1e1b4b');
  } else if (deityId === 'amaterasu') {
    bgGrad.addColorStop(0, '#f43f5e');
    bgGrad.addColorStop(1, '#4c0519');
  } else if (deityId === 'susanoo') {
    bgGrad.addColorStop(0, '#4338ca');
    bgGrad.addColorStop(1, '#1e1b4b');
  } else {
    // raijin
    bgGrad.addColorStop(0, '#dc2626');
    bgGrad.addColorStop(1, '#450a0a');
  }

  ctx.fillStyle = bgGrad;
  ctx.fillRect(-r, -r, size, size);

  // --- DIBUJADO ESPECÍFICO DEL ROSTRO / EMBLEMA MITOLÓGICO ---

  // 1. ZEUS: Rostro noble griego, barba blanca esculpida, ojos de rayo y corona de laureles
  if (deityId === 'zeus') {
    // Relámpagos traseros
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-15, -28);
    ctx.lineTo(-5, -12);
    ctx.lineTo(-18, 0);
    ctx.lineTo(8, -10);
    ctx.lineTo(25, -25);
    ctx.stroke();

    // Rostro esculpido
    ctx.fillStyle = '#fed7aa';
    ctx.beginPath();
    ctx.arc(0, -2, 16, 0, Math.PI * 2);
    ctx.fill();

    // Cabellera y Barba plateada majestuosa
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.arc(0, -6, 18, Math.PI, Math.PI * 2);
    ctx.lineTo(18, 6);
    ctx.quadraticCurveTo(0, 24, -18, 6);
    ctx.closePath();
    ctx.fill();

    // Corona de laurel dorada
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, -10, 19, -Math.PI * 0.8, -Math.PI * 0.2);
    ctx.stroke();

    // Ojos eléctricos resplandecientes
    ctx.fillStyle = '#38bdf8';
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 8;
    ctx.fillRect(-7, -4, 4, 3);
    ctx.fillRect(4, -4, 4, 3);
    ctx.shadowBlur = 0;
  }

  // 2. HADES: Casco sombrío con cuernos de obsidiana y ojos espectrales
  else if (deityId === 'hades') {
    ctx.fillStyle = '#18181b';
    ctx.beginPath();
    ctx.arc(0, 2, 17, 0, Math.PI * 2);
    ctx.fill();

    // Cuernos del inframundo
    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-12, -4);
    ctx.quadraticCurveTo(-22, -22, -15, -26);
    ctx.moveTo(12, -4);
    ctx.quadraticCurveTo(22, -22, 15, -26);
    ctx.stroke();

    // Rostro pálido cadavérico
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.arc(0, 2, 12, 0, Math.PI * 2);
    ctx.fill();

    // Ojos amatistas espectrales
    ctx.fillStyle = '#a855f7';
    ctx.shadowColor = '#a855f7';
    ctx.shadowBlur = 10;
    ctx.fillRect(-6, 0, 4, 3);
    ctx.fillRect(3, 0, 4, 3);
    ctx.shadowBlur = 0;
  }

  // 3. POSEIDÓN: Corona de corales oceánicos, tridente y cabellera marina
  else if (deityId === 'poseidon') {
    // Tridente de fondo
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, 25);
    ctx.lineTo(0, -26);
    ctx.moveTo(-9, -15);
    ctx.lineTo(-9, -24);
    ctx.moveTo(9, -15);
    ctx.lineTo(9, -24);
    ctx.stroke();

    ctx.fillStyle = '#14b8a6';
    ctx.beginPath();
    ctx.arc(0, -4, 18, Math.PI, Math.PI * 2);
    ctx.lineTo(16, 8);
    ctx.quadraticCurveTo(0, 22, -16, 8);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(-6, -2, 4, 3);
    ctx.fillRect(3, -2, 4, 3);
  }

  // 4. RA: Halcón sagrado dorado egipcio con disco solar ardiente
  else if (deityId === 'ra') {
    // Disco solar superior
    ctx.fillStyle = '#ef4444';
    ctx.shadowColor = '#facc15';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(0, -18, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Cabeza de halcón dorado
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.moveTo(-14, 12);
    ctx.lineTo(10, 12);
    ctx.lineTo(16, -2);
    ctx.lineTo(6, -8);
    ctx.lineTo(-12, -6);
    ctx.closePath();
    ctx.fill();

    // Pico curvado de halcón
    ctx.fillStyle = '#ca8a04';
    ctx.beginPath();
    ctx.moveTo(10, -2);
    ctx.lineTo(24, 2);
    ctx.lineTo(14, 8);
    ctx.closePath();
    ctx.fill();

    // Ojo de Horus / Ojo Solar
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(2, -2, 7, 3);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(4, -2, 3, 3);
  }

  // 5. ANUBIS: Cabeza de chacal negro egipcio con orejas puntiagudas doradas
  else if (deityId === 'anubis') {
    ctx.fillStyle = '#18181b';
    ctx.beginPath();
    // Orejas largas
    ctx.moveTo(-16, -4);
    ctx.lineTo(-20, -28);
    ctx.lineTo(-8, -12);
    ctx.moveTo(16, -4);
    ctx.lineTo(20, -28);
    ctx.lineTo(8, -12);
    ctx.fill();

    // Interior dorado de las orejas
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.moveTo(-14, -8);
    ctx.lineTo(-18, -24);
    ctx.lineTo(-10, -12);
    ctx.moveTo(14, -8);
    ctx.lineTo(18, -24);
    ctx.lineTo(10, -12);
    ctx.fill();

    // Hocico chacal
    ctx.fillStyle = '#18181b';
    ctx.beginPath();
    ctx.arc(0, -2, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.lineTo(20, 4);
    ctx.lineTo(0, 14);
    ctx.closePath();
    ctx.fill();

    // Ojo dorado místico
    ctx.fillStyle = '#fde047';
    ctx.fillRect(2, 0, 5, 3);
  }

  // 6. OSIRIS: Faraón verde sagrado con corona Atef blanca y plumas
  else if (deityId === 'osiris') {
    // Corona Atef alta
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.moveTo(-9, -2);
    ctx.lineTo(0, -26);
    ctx.lineTo(9, -2);
    ctx.closePath();
    ctx.fill();

    // Rostro verde de resurrección
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.arc(0, 6, 13, 0, Math.PI * 2);
    ctx.fill();

    // Barba faraónica dorada
    ctx.fillStyle = '#facc15';
    ctx.fillRect(-3, 16, 6, 10);

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-6, 4, 3, 2);
    ctx.fillRect(3, 4, 3, 2);
  }

  // 7. QUETZALCÓATL: Serpiente de jade emplumada con plumaje rojo y verde
  else if (deityId === 'quetzalcoatl') {
    // Cresta de plumas quetzal
    ctx.fillStyle = '#10b981';
    for (let p = -3; p <= 3; p++) {
      ctx.beginPath();
      ctx.ellipse(p * 5, -16 + Math.abs(p) * 2, 4, 12, (p * Math.PI) / 12, 0, Math.PI * 2);
      ctx.fill();
    }

    // Puntas rojas de las plumas
    ctx.fillStyle = '#f43f5e';
    ctx.beginPath();
    ctx.arc(0, -22, 6, 0, Math.PI * 2);
    ctx.fill();

    // Cabeza de serpiente dragón
    ctx.fillStyle = '#059669';
    ctx.beginPath();
    ctx.arc(0, 2, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-6, -4);
    ctx.lineTo(18, 6);
    ctx.lineTo(0, 14);
    ctx.closePath();
    ctx.fill();

    // Ojo de jade y colmillo
    ctx.fillStyle = '#fde047';
    ctx.fillRect(4, 0, 4, 3);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(12, 8);
    ctx.lineTo(15, 14);
    ctx.lineTo(9, 10);
    ctx.fill();
  }

  // 8. HUITZILOPOCHTLI: Casco colibrí mexica de turquesa y fuego
  else if (deityId === 'huitzilopochtli') {
    // Casco de colibrí
    ctx.fillStyle = '#0891b2';
    ctx.beginPath();
    ctx.arc(0, -4, 16, 0, Math.PI * 2);
    ctx.fill();

    // Pico largo de colibrí
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.moveTo(8, -2);
    ctx.lineTo(24, 6);
    ctx.lineTo(6, 6);
    ctx.closePath();
    ctx.fill();

    // Plumas de fuego guerrero
    ctx.fillStyle = '#ea580c';
    ctx.beginPath();
    ctx.moveTo(-10, -14);
    ctx.lineTo(-4, -26);
    ctx.lineTo(4, -14);
    ctx.fill();

    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(0, -2, 5, 3);
  }

  // 9. MICTLANTECUHTLI: Calavera sagrada de la muerte con adornos de papel
  else if (deityId === 'mictlantecuhtli') {
    // Tocado de papel ritual
    ctx.fillStyle = '#f87171';
    ctx.beginPath();
    ctx.arc(0, -10, 18, Math.PI, Math.PI * 2);
    ctx.fill();

    // Cráneo de obsidiana y hueso
    ctx.fillStyle = '#f1f5f9';
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-8, 6, 16, 10);

    // Cuencas oculares rojas siniestras
    ctx.fillStyle = '#991b1b';
    ctx.beginPath();
    ctx.arc(-4, 0, 3.5, 0, Math.PI * 2);
    ctx.arc(4, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Dientes de calavera
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-6, 12, 12, 2);
  }

  // 10. AMATERASU: Diosa del sol naciente con halo de espejo sagrado
  else if (deityId === 'amaterasu') {
    // Halo del espejo sagrado Yata con rayos
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.stroke();

    // Joyas Magatama en el halo
    ctx.fillStyle = '#e11d48';
    ctx.beginPath();
    ctx.arc(0, -20, 3, 0, Math.PI * 2);
    ctx.arc(18, 0, 3, 0, Math.PI * 2);
    ctx.arc(-18, 0, 3, 0, Math.PI * 2);
    ctx.fill();

    // Cabellera oscura elegante
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(0, -2, 15, Math.PI, Math.PI * 2);
    ctx.lineTo(14, 12);
    ctx.lineTo(-14, 12);
    ctx.fill();

    // Rostro noble con maquillaje kumadori
    ctx.fillStyle = '#fff1f2';
    ctx.beginPath();
    ctx.arc(0, 2, 11, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#e11d48';
    ctx.fillRect(-5, 2, 4, 2);
    ctx.fillRect(2, 2, 4, 2);
  }

  // 11. SUSANOO: Guerrero samurai de tormentas con kabuto y luna creciente
  else if (deityId === 'susanoo') {
    // Luna creciente dorada del casco Kabuto
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(0, -10, 16, -Math.PI * 0.85, -Math.PI * 0.15);
    ctx.stroke();

    // Casco Kabuto índigo
    ctx.fillStyle = '#312e81';
    ctx.beginPath();
    ctx.arc(0, -2, 16, Math.PI, Math.PI * 2);
    ctx.lineTo(14, 10);
    ctx.lineTo(-14, 10);
    ctx.fill();

    // Máscara Menpo feroz
    ctx.fillStyle = '#1e1b4b';
    ctx.fillRect(-10, 4, 20, 10);

    ctx.fillStyle = '#67e8f9';
    ctx.fillRect(-6, 0, 4, 2.5);
    ctx.fillRect(3, 0, 4, 2.5);
  }

  // 12. RAIJIN: Demonio Oni del Trueno con cuernos y tambores Taiko
  else {
    // Tambores Taiko con tomoe
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(-18, -14, 5, 0, Math.PI * 2);
    ctx.arc(18, -14, 5, 0, Math.PI * 2);
    ctx.arc(0, -22, 5, 0, Math.PI * 2);
    ctx.fill();

    // Cabeza roja de Oni
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.arc(0, 0, 15, 0, Math.PI * 2);
    ctx.fill();

    // Cuernos dorados
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.moveTo(-10, -8);
    ctx.lineTo(-14, -20);
    ctx.lineTo(-6, -10);
    ctx.moveTo(10, -8);
    ctx.lineTo(14, -20);
    ctx.lineTo(6, -10);
    ctx.fill();

    // Ojos y colmillos
    ctx.fillStyle = '#facc15';
    ctx.fillRect(-6, -2, 4, 3);
    ctx.fillRect(3, -2, 4, 3);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-4, 6, 2, 4);
    ctx.fillRect(3, 6, 2, 4);
  }

  ctx.restore(); // Deshacer clip

  // Marco circular dorado/bronce exterior
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, r - 2, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}
