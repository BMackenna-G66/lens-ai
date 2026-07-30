
import * as XLSX from 'xlsx';
import { PersonProfile, Crime, CatalogData, CatalogItem, DecisionRule } from '../types/criminalTypes';

// Normaliza el texto de un delito para el match contra el catálogo Chile:
// minúscula, sin tildes, y solo alfanumérico + espacios (colapsados). El catálogo
// (Catalogo_delitos_2207) ya viene normalizado así; se aplica lo mismo al delito
// entrante para maximizar la coincidencia.
export const normalizeDelito = (s: unknown): string =>
  String(s ?? '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

const isHighRisk = (risk: string): boolean => {
  const r = String(risk || '').toLowerCase().trim();
  return r === 'high' || r === 'critical' || r === 'alto' || r === 'crítico' || r === 'critico';
};

const calculateHighestRisk = (crimes: Crime[]): string => {
  if (crimes.length === 0) return 'N/A';
  const riskWeights: Record<string, number> = {
    'critical': 4, 'crítico': 4, 'critico': 4, 'high': 3, 'alto': 3, 'medium': 2, 'medio': 2, 'low': 1, 'bajo': 1, 'n/a': 0
  };
  let maxWeight = -1;
  let highest = 'n/a';
  crimes.forEach(c => {
    const r = String(c.riesgo || '').toLowerCase().trim();
    const weight = riskWeights[r] || 0;
    if (weight > maxWeight) {
      maxWeight = weight;
      highest = r;
    }
  });
  return highest;
};

// ── Helpers shared by both flows ─────────────────────────────────────────────

/** Normalise any identifier: remove dots/dashes, uppercase */
const normaliseId = (raw: string) =>
  raw.replace(/\./g, '').replace(/-/g, '').toUpperCase();

/** Extract PEP flag from a Coincidencias row (handles multiple column-name variants) */
const extractPepFromRow = (row: any): boolean => {
  const val =
    row['Coincidencia_PEP Chile'] ??
    row['Coincidencia PEP Chile'] ??
    row['PEP Chile'] ??
    row['Es PEP'] ??
    row['es_pep'] ??
    row['Es_pep'] ??
    row['PEP'] ??
    '';
  return (
    val === true || val === 1 ||
    String(val).toLowerCase() === 'true' ||
    String(val).toLowerCase() === 'si' ||
    String(val).toLowerCase() === 'sí' ||
    String(val).toLowerCase() === 'verdadero'
  );
};

/** Build a minimal PersonProfile from a Coincidencias row (name may be absent) */
const profileFromCoincidenciasRow = (
  row: any, dni: string, rawId: string, isPep: boolean, catalog?: CatalogData | null
): PersonProfile => {
  const fullName = String(
    row['Nombre'] || row['nombre'] || row['Nombre Completo'] || row['NombreCompleto'] ||
    row['Imputado'] || row['Imputado (API)'] || ''
  ).trim();
  const words = fullName.split(/\s+/).filter(Boolean);
  const profile: PersonProfile = {
    rut: dni,
    nombre: words.length > 1 ? words.slice(0, -1).join(' ') : (fullName || `ID: ${rawId}`),
    apellido: words.length > 1 ? words[words.length - 1] : '',
    nombreCuenta: fullName || rawId,
    customerId: rawId,
    conInfo: false,
    isPep,
    crimes: [],
    totalCrimes: 0,
    totalHighRiskCrimes: 0,
    highestRisk: 'n/a',
    status: 'Pendiente',
    selectedAction: '',
  };
  if (catalog) applyEvaluationToProfile(profile, catalog);
  return profile;
};

// ─────────────────────────────────────────────────────────────────────────────

export const processExcelFile = async (file: File, catalog?: CatalogData | null): Promise<PersonProfile[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" }) as any[];
        const profilesMap = new Map<string, PersonProfile>();

        jsonData.forEach((row) => {
          // Identificación: Prioridad DNI, luego RUT
          let idRaw = String(row['DNI'] || row['dni'] || row['rut'] || row['RUT'] || row['IDENTIDAD'] || '').trim();
          if (!idRaw || idRaw === "0" || idRaw === "") return;

          const idClean = normaliseId(idRaw);

          const conInfoRaw = String(row['Con Info'] || row['con info'] || row['Con info'] || row['INFO'] || '').toLowerCase();
          const conInfo = conInfoRaw === 'si' || conInfoRaw === 'sí' || row['Con Info'] === 1 || row['con info'] === 1;

          // isPep from main sheet (fallback — Coincidencias sheet overrides below)
          const isPepRaw = String(row['Es_pep'] || row['es_pep'] || row['Es Pep'] || row['es pep'] || '').toLowerCase().trim();
          const isPep = isPepRaw === 'verdadero' || isPepRaw === 'true' || isPepRaw === 'si' || isPepRaw === 'sí' || isPepRaw === '1';

          if (!profilesMap.has(idClean)) {
            profilesMap.set(idClean, {
              rut: idClean,
              nombre: String(row['Nombre'] || row['nombre'] || row['NAME'] || 'S/N').trim(),
              apellido: String(row['Apellido'] || row['apellido'] || row['LASTNAME'] || '').trim(),
              nombreCuenta: String(row['Nombre de la cuenta'] || row['nombre de la cuenta'] || row['CUENTA'] || 'CLIENTE GENERAL').trim(),
              customerId: String(row['Id interno del usuario'] || row['id interno del usuario'] || row['ID'] || 'N/A').trim(),
              conInfo,
              isPep,
              crimes: [],
              totalCrimes: 0,
              totalHighRiskCrimes: 0,
              highestRisk: 'n/a',
              status: 'Pendiente',
              selectedAction: ''
            });
          }

          const profile = profilesMap.get(idClean)!;
          if (isPep) profile.isPep = true;

          const keys = Object.keys(row);
          const indices = new Set<number>();
          keys.forEach(key => {
            const match = key.match(/crimen_(\d+)/i);
            if (match) indices.add(parseInt(match[1]));
          });

          indices.forEach(i => {
            const crimeType = String(row[`crimen_${i}`] || row[`Crimen_${i}`] || '').trim();
            if (crimeType && crimeType !== "0" && crimeType !== "undefined" && crimeType !== "") {
              const ruc = String(row[`ruc_${i}`] || row[`RUC_${i}`] || "").trim();
              const rit = String(row[`rit_${i}`] || row[`RIT_${i}`] || "").trim();
              const uniqueCrimeId = ruc || rit || `${idClean}_${crimeType}_${i}`;
              if (!profile.crimes.some(c => c.id === uniqueCrimeId)) {
                profile.crimes.push({
                  id: uniqueCrimeId,
                  tipo: crimeType,
                  estado: String(row[`estado_${i}`] || row[`Estado_${i}`] || 'S/E').trim(),
                  fecha: String(row[`fecha_${i}`] || row[`Fecha_${i}`] || '').trim(),
                  riesgo: String(row[`riesgo_${i}`] || row[`Riesgo_${i}`] || 'N/A').trim(),
                  rit,
                  ruc,
                  tribunal: String(row[`tribunal_${i}`] || row[`Tribunal_${i}`] || '').trim()
                });
              }
            }
          });

          profile.totalCrimes = profile.crimes.length;
          profile.totalHighRiskCrimes = profile.crimes.filter(c => isHighRisk(c.riesgo)).length;
          profile.highestRisk = calculateHighestRisk(profile.crimes);
          if (catalog) applyEvaluationToProfile(profile, catalog);
        });

        // ── Read "Coincidencias" sheet (emergency files may include it) ──────
        // This is the authoritative source for PEP flags and list matches.
        // It also adds profiles for people who appear there but not in sheet 1.
        const coincSheetName = workbook.SheetNames.find(s =>
          s.toLowerCase().includes('coincidencia')
        );
        if (coincSheetName) {
          (XLSX.utils.sheet_to_json(workbook.Sheets[coincSheetName], { defval: '' }) as any[])
            .forEach(row => {
              const rawId = String(
                row['DNI'] || row['RUT'] || row['rut'] || row['dni'] || row['IDENTIDAD'] || ''
              ).trim();
              if (!rawId) return;
              const id = normaliseId(rawId);
              const isPepFromCoincidencias = extractPepFromRow(row);

              if (profilesMap.has(id)) {
                // Update existing profile's PEP flag (Coincidencias is authoritative)
                if (isPepFromCoincidencias) profilesMap.get(id)!.isPep = true;
              } else {
                // New person found only in Coincidencias — add them regardless of PEP
                profilesMap.set(
                  id,
                  profileFromCoincidenciasRow(row, id, rawId, isPepFromCoincidencias, catalog)
                );
              }
            });
        }

        const finalProfiles = Array.from(profilesMap.values());
        if (finalProfiles.length === 0) {
          reject("No se encontraron registros válidos. Verifique que la columna 'DNI' o 'RUT' esté presente.");
        } else {
          resolve(finalProfiles);
        }
      } catch (err) {
        console.error("Error crítico en el procesador:", err);
        reject("Error de formato en el archivo de clientes.");
      }
    };
    reader.onerror = () => reject("Error al leer el archivo.");
    reader.readAsArrayBuffer(file);
  });
};

export const processCatalogFile = async (file: File): Promise<CatalogData> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        // Detección flexible de hojas
        const findSheet = (names: string[]) => {
          const found = workbook.SheetNames.find(s => names.some(n => s.toLowerCase().includes(n.toLowerCase())));
          return found ? workbook.Sheets[found] : null;
        };

        const delictSheet = findSheet(['Catalogo_Delitos', 'Delitos', 'Matriz']) || workbook.Sheets[workbook.SheetNames[0]];
        const paramSheet = findSheet(['Parametros', 'Configuracion', 'Params']);
        const decisionSheet = findSheet(['Tabla_Decision', 'Decision', 'Reglas']);

        const delictJson = XLSX.utils.sheet_to_json(delictSheet, { defval: "" }) as any[];
        const items: CatalogItem[] = delictJson.map(row => ({
          nombre: String(row['Nombre Delito / Crimen'] || row['Nombre'] || row['Delito'] || '').trim().toLowerCase(),
          riesgoG66: String(row['RIESGO G66'] || row['Riesgo'] || row['Peligrosidad'] || ''),
          valor: parseFloat(row['Valor / Conteo'] || row['Valor'] || row['Puntaje'] || 0),
          tipo: String(row['Tipo de delito'] || row['Tipo'] || 'General')
        })).filter(i => i.nombre);

        const parameters: Record<string, any> = {};
        if (paramSheet) {
          XLSX.utils.sheet_to_json(paramSheet, { defval: "" }).forEach((row: any) => {
            const key = String(row['Parametro'] || row['Clave'] || row['Variable'] || '').trim();
            if (key) parameters[key] = row['Valor'];
          });
        }

        const decisionTable: DecisionRule[] = [];
        if (decisionSheet) {
          XLSX.utils.sheet_to_json(decisionSheet, { defval: "" }).forEach((row: any) => {
            const totalEquiv = parseFloat(row['Total_equivalente'] || row['Score_Min'] || row['Puntaje_Min'] || 0);
            if (!isNaN(totalEquiv)) {
              decisionTable.push({
                precedentesCount: parseInt(row['Precedentes_count'] || 0) || 0,
                noPrecedentesCount: parseInt(row['NoPrecedentes_count'] || 0) || 0,
                preEquivalente: parseFloat(row['Pre_equivalente'] || 0) || 0,
                noPreEquivalente: parseFloat(row['NoPre_equivalente'] || 0) || 0,
                totalEquivalente: totalEquiv,
                decision: String(row['Decision'] || row['Accion'] || row['Resultado'] || 'Revisar'),
                razon: String(row['Razón'] || row['Razon'] || row['Logica'] || 'Basado en score')
              });
            }
          });
        }
        
        // Validación menos estricta para permitir carga parcial
        if (items.length === 0 && decisionTable.length === 0) {
          reject("El catálogo no contiene datos válidos en las hojas esperadas.");
        } else {
          resolve({ items, parameters, decisionTable });
        }
      } catch (err) {
        console.error("Error al procesar catálogo:", err);
        reject("Error interno al procesar el catálogo.");
      }
    };
    reader.readAsArrayBuffer(file);
  });
};

export const applyEvaluationToProfile = (profile: PersonProfile, catalog: CatalogData) => {
  let scoreTotal = 0;
  const catalogMap = new Map(catalog.items.map(i => [normalizeDelito(i.nombre), i]));

  profile.crimes.forEach(crime => {
    const match = catalogMap.get(normalizeDelito(crime.tipo));
    if (match) {
      crime.catalogValue = match.valor;
      crime.catalogType = match.tipo;
      scoreTotal += match.valor;
    }
  });

  const sortedRules = [...catalog.decisionTable].sort((a, b) => b.totalEquivalente - a.totalEquivalente);
  const match = sortedRules.find(rule => scoreTotal >= rule.totalEquivalente);

  if (match) {
    profile.preEvaluation = { 
      decision: match.decision, 
      razon: match.razon, 
      scoreTotal 
    };
  } else {
    profile.preEvaluation = { 
      decision: 'Sin Riesgo Significativo', 
      razon: 'El perfil no alcanza los umbrales mínimos de riesgo.', 
      scoreTotal 
    };
  }
};

// ─── Format auto-detection ───────────────────────────────────────────────────
export const detectCriminalFileFormat = async (file: File): Promise<'regcheq' | 'emergency'> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', sheetRows: 1 }); // only read headers
        const isRegcheq = workbook.SheetNames.some(s =>
          s.toLowerCase().includes('causas penales')
        );
        resolve(isRegcheq ? 'regcheq' : 'emergency');
      } catch {
        resolve('emergency');
      }
    };
    reader.onerror = () => resolve('emergency');
    reader.readAsArrayBuffer(file);
  });
};

// ─── Flujo Masivo: Regcheq format ────────────────────────────────────────────
// Expects Excel with sheets "Causas Penales Chile" and "Coincidencias".
// Strategy:
//   1. Read "Coincidencias" first → create a profile for EVERY person (PEP or not)
//   2. Read "Causas Penales Chile" → enrich existing profiles with crime data
// This ensures people who are PEP but have no criminal record are still captured.
export const processRegcheqFile = async (file: File, catalog?: CatalogData | null): Promise<PersonProfile[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });

        const findSheet = (keywords: string[]) => {
          const found = workbook.SheetNames.find(s =>
            keywords.some(k => s.toLowerCase().includes(k.toLowerCase()))
          );
          return found ? workbook.Sheets[found] : null;
        };

        const causasSheet    = findSheet(['Causas Penales Chile', 'Causas Penales', 'Causas']);
        const coincidenciasSheet = findSheet(['Coincidencias']);

        if (!causasSheet && !coincidenciasSheet) {
          reject('No se encontró la hoja "Causas Penales Chile" ni "Coincidencias" en el archivo.');
          return;
        }

        const profilesMap = new Map<string, PersonProfile>();

        // ── PASO 1: Construir perfil base para TODOS desde "Coincidencias" ──
        // Coincidencias is the authoritative list of all evaluated people.
        if (coincidenciasSheet) {
          (XLSX.utils.sheet_to_json(coincidenciasSheet, { defval: '' }) as any[]).forEach(row => {
            const rawId = String(row['DNI'] || row['RUT'] || row['dni'] || '').trim();
            if (!rawId) return;
            const dni = normaliseId(rawId);
            const isPep = extractPepFromRow(row);

            if (!profilesMap.has(dni)) {
              profilesMap.set(
                dni,
                profileFromCoincidenciasRow(row, dni, rawId, isPep, catalog)
              );
            } else {
              if (isPep) profilesMap.get(dni)!.isPep = true;
            }
          });
        }

        // ── PASO 2: Enriquecer con delitos desde "Causas Penales Chile" ──────
        if (causasSheet) {
          (XLSX.utils.sheet_to_json(causasSheet, { defval: '' }) as any[]).forEach(row => {
            const rawId = String(row['DNI'] || '').trim();
            if (!rawId) return;
            const dni = normaliseId(rawId);

            // Create profile if not yet present (file without Coincidencias sheet)
            if (!profilesMap.has(dni)) {
              const fullName = String(row['Imputado (API)'] || row['Imputado'] || '').trim();
              const words = fullName.split(/\s+/).filter(Boolean);
              profilesMap.set(dni, {
                rut: dni,
                nombre: words.length > 1 ? words.slice(0, -1).join(' ') : fullName,
                apellido: words.length > 1 ? words[words.length - 1] : '',
                nombreCuenta: fullName,
                customerId: rawId,
                conInfo: true,
                isPep: false,
                crimes: [],
                totalCrimes: 0,
                totalHighRiskCrimes: 0,
                highestRisk: 'n/a',
                status: 'Pendiente',
                selectedAction: '',
              });
            } else {
              // Improve name data if Coincidencias didn't have it
              const profile = profilesMap.get(dni)!;
              if (profile.nombre.startsWith('ID:') || profile.nombre === 'N/D') {
                const fullName = String(row['Imputado (API)'] || row['Imputado'] || '').trim();
                if (fullName) {
                  const words = fullName.split(/\s+/).filter(Boolean);
                  profile.nombre   = words.length > 1 ? words.slice(0, -1).join(' ') : fullName;
                  profile.apellido = words.length > 1 ? words[words.length - 1] : '';
                  profile.nombreCuenta = fullName;
                }
              }
            }

            const profile = profilesMap.get(dni)!;
            const crimeType = String(row['Delito'] || '').trim();
            if (crimeType && crimeType !== '0') {
              const ruc = String(row['RUC'] || '').trim();
              const rit = String(row['RIT'] || '').trim();
              const uniqueId = ruc || rit || `${dni}_${crimeType}_${profile.crimes.length}`;
              if (!profile.crimes.some(c => c.id === uniqueId)) {
                profile.crimes.push({
                  id: uniqueId,
                  tipo: crimeType,
                  estado: String(row['Estado'] || 'S/E').trim(),
                  fecha: String(row['Fecha'] || '').trim(),
                  riesgo: String(row['Riesgo Delito'] || 'N/A').trim(),
                  rit,
                  ruc,
                  tribunal: String(row['Tribunal'] || '').trim(),
                });
              }
            }

            profile.totalCrimes = profile.crimes.length;
            profile.totalHighRiskCrimes = profile.crimes.filter(c => isHighRisk(c.riesgo)).length;
            profile.highestRisk = calculateHighestRisk(profile.crimes);
            if (catalog) applyEvaluationToProfile(profile, catalog);
          });
        }

        // ── PASO 3: Asegurarse de que perfiles sin delitos tienen evaluación ──
        profilesMap.forEach(profile => {
          if (!profile.preEvaluation && catalog) applyEvaluationToProfile(profile, catalog);
        });

        const result = Array.from(profilesMap.values());
        if (result.length === 0) {
          reject('No se encontraron registros válidos. Verifique que el archivo tenga las hojas esperadas.');
        } else {
          resolve(result);
        }
      } catch (err) {
        console.error('Error al procesar archivo Regcheq:', err);
        reject('Error de formato en el archivo Regcheq. Verifique que tenga las hojas esperadas.');
      }
    };
    reader.onerror = () => reject('Error al leer el archivo.');
    reader.readAsArrayBuffer(file);
  });
};

const profileRow = (p: PersonProfile) => ({
  'IDENTIDAD (DNI/RUT)': p.rut,
  'Nombre Completo': `${p.nombre} ${p.apellido}`,
  'ID Usuario': p.customerId,
  'Es PEP': p.isPep ? 'VERDADERO' : 'FALSO',
  'Sugerencia Motor': p.preEvaluation?.decision || 'N/A',
  'Score Acumulado': p.preEvaluation?.scoreTotal || 0,
  'Estatus': p.status,
  'Acción Manual': p.selectedAction || '',
  'Gravedad Máx': p.highestRisk,
  'Cant. Delitos': p.totalCrimes,
});

export const exportToExcel = (profiles: PersonProfile[]) => {
  const workbook = XLSX.utils.book_new();

  // Hoja 1 — Consolidado completo
  const wsAll = XLSX.utils.json_to_sheet(profiles.map(profileRow));
  XLSX.utils.book_append_sheet(workbook, wsAll, 'Consolidado');

  // Hoja 2 — Listas de Sanciones (con antecedentes, no PEP)
  const sanciones = profiles.filter(p => !p.isPep && p.totalCrimes > 0);
  const wsSanciones = XLSX.utils.json_to_sheet(sanciones.length ? sanciones.map(profileRow) : [{ Nota: 'Sin registros' }]);
  XLSX.utils.book_append_sheet(workbook, wsSanciones, 'Listas de Sanciones');

  // Hoja 3 — Coincidencias PEP
  const peps = profiles.filter(p => p.isPep === true);
  const wsPeps = XLSX.utils.json_to_sheet(peps.length ? peps.map(profileRow) : [{ Nota: 'Sin registros' }]);
  XLSX.utils.book_append_sheet(workbook, wsPeps, 'Coincidencias PEP');

  // Hoja 4 — Sin Antecedentes (sin delitos, no PEP)
  const sinAnt = profiles.filter(p => !p.isPep && p.totalCrimes === 0);
  const wsSinAnt = XLSX.utils.json_to_sheet(sinAnt.length ? sinAnt.map(profileRow) : [{ Nota: 'Sin registros' }]);
  XLSX.utils.book_append_sheet(workbook, wsSinAnt, 'Sin Antecedentes');

  XLSX.writeFile(workbook, `Reporte_Analisis_${new Date().toISOString().split('T')[0]}.xlsx`);
};