# Matriz KYB — de dónde sale cada dato

> Documento de configuración. Todo lo de acá está verificado contra la API real de
> Admin con empresas de la cola en vivo, no contra documentación.
>
> Para cambiar pesos o estados: `types/kybMatriz.ts`. Para cambiar de dónde se lee
> un dato: `services/kyb/kybAdminMapper.ts` (Admin) o `kybLensMapper.ts` (documentos).

---

## 1. Cómo se arma la matriz

Tres pasos, y ninguno conoce al otro:

```
Admin  ──► kybAdminMapper ──┐
                             ├──► LadoCanonico ──► kybComparador ──► 12 componentes ──► kybCertaintyEngine ──► %
Documentos ──► kybLensMapper ┘
```

El **modelo canónico** existe para que el comparador nunca vea nombres de campo del
proveedor. Admin tiene 55 campos con nombres heredados (`indActivity`,
`nosisActivity`, `signatureAuthorizationLegalRepresentatives`); si mañana cambia
uno, se arregla en el mapper y el comparador no se entera.

---

## 2. Los 12 componentes: de dónde sale cada lado

| # | Componente | Peso | Lado Admin (campo real) | Lado Documentos (patrón que reconoce) |
|---|---|---|---|---|
| 1 | **Razón social** 🔑 | 12 | `name` | `RAZON SOCIAL`, `NOMBRE DE LA EMPRESA`, `DENOMINACION` |
| 2 | **Identificación tributaria** 🔑 | 12 | `identificationNumber` + `identificationType` | `RUT`, `NIT`, `RUC`, `IDENTIFICACION TRIBUTARIA` |
| 3 | **Representantes legales** 🔑 | 12 | `legalRepresentatives[]` → `name` + `lastName` + `identificationNumber` | `REPRESENTANTE(S) LEGAL` |
| 4 | **Accionistas / beneficiarios** | 11 | `shareholders` — **dict `{categoría: [personas]}`**, la clave es el rol | `ACCIONISTA`, `SOCIO`, `BENEFICIARIO FINAL`, `CONFORMACION SOCIEDAD` |
| 5 | **Forma legal** | 8 | `legalForm` | `FORMA LEGAL`, `TIPO SOCIETARIO`, `CLASIFICACION ENTIDAD` |
| 6 | **Constitución** | 8 | `constitutionDate` + `constitutionNumber` | `FECHA DE CONSTITUCION`, `NUMERO DE ESCRITURA`, `REPERTORIO` |
| 7 | **Domicilio** | 8 | `addressCountry` + `address` | `DOMICILIO`, `DIRECCION` |
| 8 | **Actividad económica** | 8 | `activity` + `indActivity` + `nosisActivity` + `companyFinancialActivity` + `industries` (se unifican) | `ACTIVIDAD ECONOMICA`, `GIRO`, `OBJETO SOCIAL`, `RUBRO` |
| 9 | **Facultades y firma** | 6 | `hasJointAdministration` + `signatureAuthorization` + `signatureAuthorizationLegalRepresentatives` | `FACULTADES`, `PODERES`, `FIRMA CONJUNTA/INDIVIDUAL` |
| 10 | **Perfil financiero** | 6 | `estimatedAnnualBillings`, `monthlyIncome`, `monthlyExpenses`, `totalAssets`, `totalLiabilities` | `FACTURACION ANUAL`, `INGRESOS MENSUALES`, `ACTIVOS`, `PASIVOS` |
| 11 | **Directorio** | 5 | `/company/bo/onboarding/board-member` — **hoy devuelve 403** ⚠️ | `DIRECTORIO`, `MIEMBROS DEL CONSEJO` |
| 12 | **Estructura societaria** | 4 | `/company/bo/relationships/{id}` — solo Admin | *(no aplica: fuente única)* |

🔑 = componente de **identidad**. Una discrepancia acá frena el flujo automático en
las dos direcciones: significa que los datos están mal, no la empresa.

**Total: 100.** El denominador es fijo: si un componente no aplica, su peso **no** se
redistribuye. Un 70% tiene que significar lo mismo entre dos empresas distintas.

---

## 3. Estados de comparación y cuánto aportan

| Estado | Cuándo | Factor | Aporte con peso 12 |
|---|---|---|---|
| `COINCIDE` | los dos lados dicen lo mismo | 1.00 | 12 |
| `PARCIAL` | se parecen (nombre similar, monto en tolerancia) | 0.60 | 7.2 |
| `SOLO_LENS` | está en documentos, no en Admin | 0.35 | 4.2 |
| `SOLO_ADMIN` | está en Admin, no en documentos | 0.35 | 4.2 |
| `DISCREPA` | los dos tienen dato y **no** coinciden | 0.00 | 0 |
| `SIN_DATOS` | ninguno lo aporta | 0.00 | 0 |

`SOLO_*` vale menos que `COINCIDE` porque **nadie corroboró el dato**, pero no es una
contradicción. `DISCREPA` es el único caso grave.

---

## 4. Cómo se comparan (no es igualdad de texto)

| Componente | Regla |
|---|---|
| Razón social | se quitan los sufijos societarios (SPA, LTDA, S.A.) y se compara; similitud ≥ 85% → `PARCIAL` |
| Identificación | RUT normalizado; además se valida **módulo 11** y un DV inválido se reporta como dato mal cargado, no como discrepancia |
| Forma legal | se canoniza a sigla: "Sociedad por Acciones" y "SpA" **coinciden** |
| Personas | emparejamiento en dos pasadas: **primero documento exacto**, después similitud de nombre ≥ 70%. El orden importa: si se empareja por nombre primero, un homónimo le roba el match a la persona correcta |
| Domicilio | **huella normalizada**: "Av. Providencia 1234, of. 501" coincide con "AVENIDA PROVIDENCIA N 1234 OFICINA 501" |
| Montos | tolerancia **relativa**: ≤5% coincide, ≤25% parcial. Nunca igualdad al peso |
| Actividad | solapamiento de conjuntos; ≥80% coincide. "TRANSPORTE DE CARGA" y "TRANSPORTE" solapan |
| Fechas | multiformato → ISO antes de comparar |

---

## 5. Hallazgos contra la API real — lo que hay que decidir

Verificados con empresas de la cola en vivo.

### 5.1 `board-member` devuelve **403** ⚠️

El endpoint del directorio no está autorizado con el token actual. Consecuencia: el
componente **Directorio (peso 5) va a salir `SIN_DATOS` siempre**, y le resta 5
puntos de certidumbre a **todas** las empresas por un motivo de permisos, no de
datos.

**Opciones:** conseguir el permiso, o bajar el peso a 0 / sacar el componente hasta
que exista. Hoy está penalizando a todas por igual, que es lo peor de los dos
mundos.

### 5.2 El `%` de participación **sí existe** ✅

Está dentro de cada accionista: `shareholders.{categoría}[].participationPercentage`.
Ya se lee y se muestra en la matriz junto al nombre. Esto cierra la pregunta que
quedó abierta en la Fase 0.

### 5.3 Admin trae datos de PEP y riesgo **por representante** ✅

El objeto del representante legal tiene `politicallyExposedPerson`, `pepType` y
`riskLevel` propios — 38 campos en total. **Hoy no se usan.** Son la base para
cruzar el PEP declarado en Admin contra el que devuelve el screening de Regcheq: si
Admin dice que no es PEP y Regcheq dice que sí, eso es un hallazgo.

### 5.4 No existe "última validación del partner" ✅ verificado

`/company/bo` devuelve **56 claves** y ninguna es una fecha de validación del
partner. Lo más cercano es el ciclo KYC de Global66, que ahora sí se extrae:
`kycStage1UploadedManualDate`, `kycStage1ApprovedDate`, `kycStage1RejectedDate`.
Son fechas **nuestras**, no del partner — la ficha lo dice así para que nadie las
lea como si fueran de Regcheq.

### 5.5 12 campos de Admin que antes no se leían — ya se extraen ✅

Estaban en la respuesta y se descartaban. Ahora salen en Datos generales:

| Campo de Admin | En la ficha |
|---|---|
| `activityStartDate` | Inicio de actividades |
| `companyTaxCountry` | País de tributación |
| `fatca` / `crs` | FATCA · CRS |
| `multiActivityEnabled` | Multi-actividad |
| `purposeUse` + `purposeUsePlatform` + `purposes` | Propósito de uso |
| `kycStage1/2/3` + sus 3 fechas | Ciclo KYC |
| `complianceStatusComment` | Comentario de compliance |
| `kycStage1/2/3Comment` | Comentario KYC |
| `legalRepresentativesCount` | contraste con los cargados (ver abajo) |

**`legalRepresentativesCount` vs `legalRepresentatives.length`**: Admin declara un
número y además trae la lista. Cuando no cuadran, la ficha y el PDF lo avisan: es
Admin incompleto, y el dato hay que sacarlo de la escritura.

Ninguno de estos entra hoy en la matriz de 12 — son contexto para el analista. Si
alguno debe pesar, va en la revisión de pesos que quedó pendiente.

### 5.6 Capital social **no existe** en Admin

Confirmado. Queda como **fuente única** desde la escritura: se valida que esté, no
se compara.

---

## 6. Por qué un componente puede salir vacío

Si un componente aparece en blanco, es una de estas cuatro cosas — y la ficha lo
dice en la columna Detalle:

1. **`SOLO_ADMIN`** — los documentos no lo traían. Lo más común: el pipeline de
   extracción no reconoció el campo, o el documento no estaba entre los analizados
   (se procesan hasta 12 por empresa).
2. **`SOLO_LENS`** — Admin no lo tiene cargado.
3. **`SIN_DATOS`** — ninguna fuente. En Directorio es por el 403 de arriba.
4. **Análisis incompleto** — sin API key de Gemini, sin documentos, o una fase se
   pasó de su tope. Ahí el porcentaje **no se publica** y la ficha lista los
   faltantes.

---

## 7. Dónde se cambia cada cosa

| Qué | Archivo |
|---|---|
| Pesos, estados de identidad, factores | `types/kybMatriz.ts` |
| De dónde se lee un campo de Admin | `services/kyb/kybAdminMapper.ts` |
| Qué patrón reconoce un campo en documentos | `services/kyb/kybLensMapper.ts` |
| Reglas de comparación | `services/kyb/kybComparador.ts` |
| Tolerancias, cortes de similitud, sufijos, siglas | `services/kyb/kybNormalizadores.ts` |
| Penalización por alertas y topes | `services/kyb/kybCertaintyEngine.ts` |
| Las 36 alertas y sus umbrales | `services/kyb/kybAlertasCatalogo.ts` |
| Cortes del flujo automático | `services/kyb/flujoKybEngine.ts` |
| Campos y orden de Datos generales en la ficha | `components/KybQueue/KybFichaFlotante.tsx` (`CAMPOS_GENERALES`) |
| Campos y orden de Datos generales en el PDF | `services/kyb/kybPdfService.ts` (`CAMPOS`) |
| Filtros del barrido y el preset en vivo | `services/kyb/kybSweepService.ts` |

Todos son mantenedores: se edita el archivo y el resto lo toma solo.
