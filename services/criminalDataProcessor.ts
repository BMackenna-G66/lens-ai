
import * as XLSX from 'xlsx';
import { PersonProfile, Crime, CatalogData, CatalogItem, DecisionRule } from '../types/criminalTypes';

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
          
          const idClean = idRaw.replace(/\./g, '').replace(/-/g, '').toUpperCase();
          
          const conInfoRaw = String(row['Con Info'] || row['con info'] || row['Con info'] || row['INFO'] || '').toLowerCase();
          const conInfo = conInfoRaw === 'si' || conInfoRaw === 'sí' || row['Con Info'] === 1 || row['con info'] === 1;
          
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
          if (isPep) {
            profile.isPep = true;
          }

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
                  rit: rit,
                  ruc: ruc,
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
  const catalogMap = new Map(catalog.items.map(i => [i.nombre.toLowerCase(), i]));
  
  profile.crimes.forEach(crime => {
    const match = catalogMap.get(crime.tipo.toLowerCase());
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

export const exportToExcel = (profiles: PersonProfile[]) => {
  const exportData = profiles.map(p => ({
    'IDENTIDAD (DNI/RUT)': p.rut, 
    'Nombre Completo': `${p.nombre} ${p.apellido}`,
    'ID Usuario': p.customerId,
    'Es PEP': p.isPep ? 'VERDADERO' : 'FALSO',
    'Sugerencia Motor': p.preEvaluation?.decision || 'N/A', 
    'Score Acumulado': p.preEvaluation?.scoreTotal || 0,
    'Estatus': p.status, 
    'Acción Manual': p.selectedAction || '',
    'Gravedad Máx': p.highestRisk, 
    'Cant. Delitos': p.totalCrimes
  }));
  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Analítica Judicial');
  XLSX.writeFile(workbook, `Reporte_Analisis_${new Date().toISOString().split('T')[0]}.xlsx`);
};