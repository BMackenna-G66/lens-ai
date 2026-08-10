// MANTENEDOR de campos del case-update de Salesforce.
// Única fuente de verdad de los campos, nombres de API, tipos y valores válidos
// (picklists). El formulario "Responder en Salesforce" (CasosInbox) se genera
// desde acá. Para agregar/cambiar un valor, editar SOLO este archivo.
//
// Los valores de los picklists deben coincidir EXACTO con los labels de Salesforce
// (incluye emojis, tildes y espacios). Un valor que no matchee → VALIDATION_ERROR.

export type SFFieldType = 'text' | 'textarea' | 'picklist' | 'checkbox';

export interface SFFieldDef {
  apiName: string;      // key exacta en el payload del PATCH
  label: string;        // nombre visible
  type: SFFieldType;
  options?: string[];   // solo picklist
  readOnlyHint?: string;
}

// Orden = orden en que se muestran en el formulario.
export const SF_CASE_FIELDS: SFFieldDef[] = [
  { apiName: 'CaseNumber', label: 'Número del caso', type: 'text' },

  {
    apiName: 'C_Review__c', label: '[C] Review', type: 'picklist',
    options: [
      '(K) - AUDITORIA B2B', '(K) - AUDITORIA LISTAS', '(K) - BF MIGRACIÓN',
      '(K) - CAMBIO DATOS PERFIL', '(K) - CONCURSO', '(K) - ELIMINACIÓN DE CUENTA',
      '(K) - KYC1 B2B [ONBOARDING]', '(K) - KYC2 B2C', '(K) - KYE', '(K) - OFAC',
      '(K) - OFAC BENEFICIARIO', '(K) - PEP', '(M) ALERTAS B2B', '(M) ALERTAS B2C',
      '(M) CARTERA CONTROLADA', '(M) CUENTA DUPLICADA', '(M) RECUPERACIÓN DE CUENTA',
      '(M) VALIDACIONES HR', '(P) AUDITORIA PARTNER', '(P) DOC. ESPECÍFICA',
      '(P) KYC III_PARTNER', 'COBRO DE TERCEROS', 'Cuenta B2C', 'CUIL no coincide',
      'KYC1 B2B + UCR', 'KYC1 B2C [DNI]', 'KYC2 B2C', 'KYC2 Gmoney', 'KYC3 B2B',
      'KYC3 B2C', 'KYC3 B2C +20k', 'Transacciones Bot', '(K) Cliente institucional',
      'Actualización de datos b2b', 'MIGRACIÓN', '(K)-Multiusuario', 'Notificación interna',
    ],
  },

  {
    apiName: 'Senales_de_Alerta__c', label: '[C] Señales de Alerta', type: 'picklist',
    options: [
      'A DISCRECION DEL O.C', 'FRAUDBOT', 'REPORTADO OPS', 'CONTROL ECUADOR',
      'RFP_8K_30D', 'REMESA_1K_10Q_7D', 'REMESA_IN_9K_1D_A', 'REMESA_IN_12K_1D_M',
      'REMESA_IN_16K_30D_PEP', 'REMESA_IN_34K_30D_B', 'REMESA_IN_15K_1D',
      'REMESA_IN_30K_30D', 'REMESA_IN_7K_1D_pep', 'REMESA_IN_B2B_150K_90D',
      'REMESA_IN_B2B_80K_30D', 'HIGH RISK', 'HIGH RISK IBAN B2C', 'HIGH RISK IBAN B2B',
      'REMESA_IN_35K_30D_M', 'ZF_5K_30D', 'REMESA_IN_50K_30D_A', 'PAYIN_200K_1D',
      'PAYIN_300K_30D', 'PAYIN_20K_30D_PEP', 'P2P_200K_1D', 'P2P_300K_30D',
      'P2P_20K_30D_pep', 'P2P_200K_1D_BENEF', 'PSE_25K_1D', 'PSE_50K_30D',
      'P2P_300K_30D_BENEF', 'REMESA_IN_B2B_400K_30D', 'REMESA_IN_B2B_600K_90D',
      'PAYIN_90K_90D', 'PAYIN_T_5000_90D', 'UCR B2B - ONBOARDING', 'UCR B2B - PERFIL TX',
    ],
  },

  {
    apiName: 'C_Status__c', label: '[C] Status', type: 'picklist',
    options: ['Approved', 'Blocked', 'Fully Blocked', 'Partner Review', 'Rejected', 'Requested', 'Warning'],
  },

  {
    apiName: 'Status', label: 'Estado', type: 'picklist',
    options: ['New', 'Escalated', 'In Progress', 'Stand By', 'Merged', 'Resolved', 'Closed'],
  },

  {
    apiName: 'CAT_CMPL__c', label: 'CAT CMPL', type: 'picklist',
    options: [
      '(K) Bloqueo preventivo (Ok pendiente del OC para vinculación',
      '(K) Bloqueo preventivo form PEP',
      '(K) Escalado OC: Hasta 3 Delitos precedentes (culpable o con medidas cautelares)',
      '(K) Escalado OC: Hasta 5 Delito No precedentes',
      '(K) Escalados OC', '(K) Incidente de dependencia interna',
      '(K) No escalado: 4 o + Delitos precedentes',
      '(K) No escalado: 5 o + Delitos No precedentes',
      '(M) Identificación de transacciones atipicas - con terceros o intermediarios no relacionados',
      '(M) Identificación de transacciones atipicas - documentadas de manera irregular',
      '(M) Identificación de transacciones atipicas - fuera del perfil económico',
      '(M) Identificación de transacciones atipicas - por frecuencia o estructura',
      '(M) Partners', '(M) Posible empresa fachada', '(M) Presta - cuenta',
      '(M) Remesadora informal', '(M) Ruletero', '(M) Señales de Alerta/Cartera Controlada',
      'Escalado a Account', 'Escalado a CX', 'Escalado a Fraude', 'Gestión legal',
    ],
  },

  {
    apiName: 'Sleep__c', label: '💤 Snooze', type: 'picklist',
    options: ['2 Horas', '4 Horas', '6 Horas', '12 Horas', '24 Horas', '48 Horas',
      '72 Horas', '96 Horas', '120 Horas', '144 Horas'],
  },

  {
    apiName: 'Country__c', label: 'País Origen', type: 'picklist',
    options: ['Argentina 🇦🇷', 'Brasil 🇧🇷', 'Chile 🇨🇱', 'Colombia 🇨🇴', 'Costa Rica 🇨🇷',
      'Ecuador 🇪🇨', 'España 🇪🇸', 'Estados Unidos 🇺🇸', 'México 🇲🇽', 'Paraguay 🇵🇾',
      'Perú 🇵🇪', 'Otro 🌐'],
  },

  {
    apiName: 'Product__c', label: 'Producto', type: 'picklist',
    // ⚠️ En el sandbox probado, Salesforce devolvió "💳 Tarjeta Digital" (no "Virtual").
    // Se usa el valor de la tabla oficial; si SF rechaza, alinear picklist/tabla.
    options: ['👤 Cuenta Perfil', '💰 Cuenta Global', '💵  Exchange', '💸 Transferencias',
      '👥 Pagos', '💳 Tarjeta Virtual', '💳 Tarjeta Física', '❌ S/ Producto'],
  },

  {
    apiName: 'Tipo_de_Caso_Compliance__c', label: 'Tipo de Caso Compliance', type: 'picklist',
    options: [
      'Evaluación simple - sin contacto', 'Evaluación simple - con contacto',
      'Evaluación compleja - sin contacto', 'Evaluación compleja - con contacto',
      'No requiere contacto', 'Requiere contacto (1era instancia)', 'Requiere contacto (recurrente)',
      'B2C Client + coinc c/delito + escalado', 'B2C Client + coinc c/delito + no escalado',
      'B2B Client + coinc c/delito + escalado', 'B2B Client + coinc c/delito + no escalado',
      'B2C Benef + coinc + sin contacto', 'B2C Benef + coinc + con contacto',
      'B2B Benef + coinc + sin contacto', 'B2B Benef + coinc + con contacto',
      'OFAC + Coinc c/delito escalado', 'OFAC + Coinc c/delito no escalado',
      'DIRECTO - G81', 'INDIRECTO G81', 'DIRECTO SEDPE Y OTROS PAISES', 'INDIRECTO SEDPE Y OTROS PAISES',
      'MIG + Coinc c/delito escalado', 'MIG + Coinc c/delito no escalado', 'MIG + Coinc PEP',
      'ONB simple', 'ONB EDD', 'ONB Fundaciones / otras soc.', 'ONB + Coinc PEP', 'ONB + Coinc c/delito',
      'AUD simple', 'AUD + Coinc c/delito escalado', 'AUD + Coinc c/delito no escalado', 'AUD + Coinc PEP',
      'B2C BENEF + Coinc c/delito escalado', 'B2C BENEF + Coinc c/delito no escalado',
      'B2B BENEF + Coinc c/delito escalado', 'B2B BENEF + Coinc c/delito no escalado',
      'OFAC + Coinc alcance de nombre', 'OFAC + Coinc país GAFI / RFP', 'OFAC + Coinc Func Público',
      'OFAC + Sin antecedentes', 'B2C BENEF + Alcance de nombre', 'B2C BENEF + Coinc país GAFI / RFP',
      'B2C BENEF + Func Público', 'B2C BENEF + Sin antecedentes', 'B2B BENEF + Alcance de nombre',
      'B2B BENEF + Coinc país GAFI / RFP', 'B2B BENEF + Func Público', 'B2B BENEF + Sin antecedentes',
    ],
  },

  {
    apiName: 'Type', label: 'Tipo del caso', type: 'picklist',
    options: ['B2C', 'B2B', 'SEC', 'ONB', 'CS', 'ADV', 'Partner', 'CMPL', 'Fraude', 'OP', 'WTS COM', 'Whatsapp duplicado'],
  },

  { apiName: 'PEP__c', label: 'PEP (Persona Expuesta)', type: 'checkbox' },
  { apiName: 'Customer ID', label: 'Customer ID', type: 'text' },
  { apiName: 'Comments', label: 'Comentarios internos', type: 'textarea' },
  { apiName: 'razon_3_dias__c', label: '♻️ Razón/Justificación No Cierre', type: 'textarea' },
];
