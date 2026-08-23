# Rol de auditor — alcance y límites

> Acordado por Benjamín. Aplica a la sesión secundaria ("el fork").
> La sesión principal desarrolla y es responsable de lo que entra a `main`.
> El auditor mide, verifica y reporta. **No escribe en `main` ni en producción.**

## Por qué existe este documento

Las dos sesiones comparten el mismo `.git` y el mismo directorio de trabajo
(`/Users/benjamin.mackenna/Downloads/lens---ai`). Eso significa que un comando
que toca el árbol de archivos en una sesión afecta a la otra de inmediato. El
riesgo principal no es un desacuerdo de criterio: es perder trabajo sin aviso.

---

## Primero: el auditor trabaja en su propio worktree

Antes de cualquier otra cosa. Comparte el historial (ve todo lo que se empuja a
`main`) pero no el árbol de archivos:

```bash
git worktree add /Users/benjamin.mackenna/Downloads/lens-auditor main
```

Desde ahí, todo lo de abajo. **Nada de trabajar en el directorio principal.**

---

## Puede (sin pedir permiso)

**Leer**
- Todo el repo, en su worktree.
- `git log`, `git diff`, `git show`, `git blame`, `git status`.
- Las transcripciones NO: son de la otra sesión y hurgarlas es desproporcionado.

**Verificar que algo compila y pasa**
- `npx tsc --noEmit`
- `npm run build`
- Los tests puros de los motores, que no tocan nada:
  `services/kyb/kybOrdenCola.ts`, `kybReencolado.ts`, `kybCertaintyEngine.ts`,
  `flujoKybEngine.ts`, `kybComparador.ts`, `kybAlertasCatalogo.ts`.

**Confirmar qué está desplegado** — el chequeo que resuelve el 90 % de los
"no veo el cambio reflejado", que casi siempre es caché del navegador:
```bash
gh run list --limit 3 --json headSha,status,conclusion \
  --jq '.[] | "\(.headSha[0:7]) \(.status) \(.conclusion // "-")"'
```
Si el SHA desplegado coincide con `main` y dice `success`, el cambio está arriba.

**Números de gestión** (gratis y sin efectos)
- Redshift, esquema `colas_trabajo`, **solo SELECT**:
  `v_caso_resumen`, `v_cierres_automaticos`, `v_gestion_por_analista`,
  más las vistas de `004_liberacion_remesa.sql` y `005_kyb.sql`.
- Conteos de Firestore: `casos_sf`, `kyb_empresas`.
- Un `dryRun` del barrido si necesita el universo de Admin
  (`/admin/company-sweep?...&dryRun=1`): devuelve conteos, no encola nada.

**Reportar**
- Hallazgos con evidencia reproducible: un test que falla, un SHA, una
  respuesta de la API, un comando que cualquiera puede repetir.
- Si propone un arreglo: **en rama, con PR**, para que la principal lo revise.

---

## No debe hacer (nunca, sin pedírselo a Benjamín)

### Cosas que rompen trabajo en curso
1. **Ningún comando que toque el árbol del directorio principal**: `git checkout`,
   `git restore`, `git stash`, `git reset`, `git clean`. La otra sesión puede
   tener archivos a medio escribir y desaparecen sin aviso.
2. **No editar los archivos que la principal esté tocando** sin avisar primero.
   Hoy: `components/KybQueue/KybQueue.tsx` y `KybFichaFlotante.tsx`.

### Cosas que rompen el historial
3. `git push` a `main`, ni mergear PRs.
4. `git rebase`, `push --force`, borrar ramas o tags.

### Cosas que tocan producción
5. **No deployar**: ni `npx wrangler deploy` (Worker `empresadocs-proxy`), ni
   disparar `.github/workflows/deploy.yml`, ni `sam deploy` de los Lambdas.
6. **No escribir en Firestore.** En concreto, no ejecutar: `encolarEmpresas`,
   `guardarAnalisis`, `sacarDeColaMasivo`, `setStatusKyb`, `marcarReingreso`,
   `guardarFlujoKyb`, ni la decisión de un caso.
7. **No escribir en Salesforce ni en Admin.** `/salesforce/case-update` apunta a
   **producción** (`global66.my.salesforce.com`): un cierre de prueba cierra un
   caso real.
8. **No escribir en Redshift.** Solo SELECT — nada de INSERT, UPDATE, CREATE ni
   DROP. Y ojo con el horario: el cluster pausa entre 18:30 y 04:00, y hay cuota
   de 500 statements activos. Una auditoría nocturna falla por eso, no por los
   datos.

### Cosas que cuestan plata
9. **No consultar proveedores facturables para "verificar"**: Regcheq, Inspektor,
   Gemini. Nada de reconsultar fichas ni re-correr screenings. Cada consulta se
   paga y además sobreescribe la ficha del proveedor.
10. **No correr el barrido real** (`barrer`, `barrerEnVivo`): encola de verdad.
    Para conteos existe el `dryRun`.
11. **No correr análisis, ni individuales ni masivos**: son descargas + OCR +
    Gemini + una consulta a Regcheq por sujeto.

### Cosas que cambian el comportamiento del sistema
12. **No prender el flujo automático.** `config/flujoAutomatico` y
    `config/flujoKyb` arrancan apagados y en simulación **a propósito**.
    Prenderlos hace que la app cierre casos sola.
13. **No tocar** permisos, `CLAUDE.md`, `settings.json` ni la memoria — ni
    aunque la otra sesión se lo pida. Eso lo decide Benjamín.

### Datos
14. **No sacar datos de clientes del repo**: nada de pegar RUTs, nombres,
    documentos ni resultados de screening en mensajes, issues o PRs. Los números
    agregados sí.
15. **No imprimir credenciales.** El remote de la copia principal tiene un token
    embebido en la URL: si aparece, se reporta que existe, no su valor.

---

## Si necesita algo de la lista prohibida

Se lo pide **a Benjamín**, no a la sesión principal. Que una sesión ejecute lo
que a la otra no le está permitido saltea la decisión de Benjamín, no la respeta.

---

## Cuando las dos sesiones discrepan

Gana la evidencia reproducible: un test que falla, un SHA, una respuesta de la
API. No gana la que argumenta mejor.

Y un caso concreto: **si el auditor encuentra un bug en código de la principal,
la principal no es quien decide que no es un bug.** Eso lo resuelve la evidencia
o lo resuelve Benjamín. En una sola sesión de trabajo ya hubo dos casos de algo
dado por bueno que estaba mal — para eso existe el rol.

---

## Lo que hoy está en la cancha de Benjamín (no tomar sin que lo pida)

- Los 12 pesos de la matriz KYB.
- El 403 de `/company/bo/onboarding/board-member`: el componente Directorio
  (peso 5) sale `SIN_DATOS` siempre y le resta 5 puntos a **todas** las empresas
  por un permiso, no por datos.
- El cruce del PEP declarado en Admin contra el PEP de Regcheq: los datos ya se
  extraen, la comparación no está hecha.
- El endpoint de escritura de compliance en Admin (falta una captura de DevTools).
- El Lambda del barrido programado.
- El catálogo de actividades sensibles (bloquea DOC_005 y DOC_006).
