# Flujo automático desatendido — OFAC y remesas

Hace lo mismo que la app cuando la pestaña está abierta, pero sin navegador: por
cada caso de la cola lo consulta en listas, cruza con el catálogo, decide
**Liberar / Liberar UCR / Fully Blocked** y cierra en Salesforce y en Admin.

## Lo que NO hace

- **No decide distinto que la app.** El screening, la decisión y los payloads de
  cierre se importan de `services/` en el build. No hay una segunda copia de las
  reglas. Si mañana cambia un freno en la app, el próximo build lo trae.
- **No libera lo que la app retiene.** Delito sensible, PEP, país apagado,
  conclusión de revisión y caso ya cerrado retienen igual. Un caso retenido
  queda para el analista.
- **No consulta dos veces.** Si el caso ya tiene screening vigente
  (`schemaVersion >= 3`), no se vuelve a pedir al proveedor.
- **No mezcla las colas.** El asunto del caso decide en cuál va —`clasificarCola`,
  la misma función que la app— y cada cola tiene su propio switch. Prender OFAC no
  prende remesas.

## Un solo ejecutor

La app **no cierra casos automáticamente**. Los muestra, y con el botón «Correr
ahora» dispara una corrida. El Lambda es el único que ejecuta.

Por qué: cuando los dos ejecutaban hubo **69 casos con cierre automático
duplicado** entre el 16 y el 25 de agosto, separados por 0,1 a 9,6 segundos. Eran
dos pestañas de la app —el guard era un ref por pestaña y no podía verse a sí
mismo entre ventanas—.

**Ninguno de los 69 mandó dos updates a Salesforce**: el guard de idempotencia de
`caseResolutionService` frenó los 69 segundos envíos. Verificado — los 69 tienen
un solo `RESPUESTA_SF_COMPLETADA`. El duplicado quedaba en la auditoría, no en
producción.

Ese guard vivía solo en el camino de la app. Este Lambda usaba `sendCaseUpdate`
directo y **no lo tenía**, así que habría sido el primer camino capaz de mandar el
update dos veces de verdad. Ahora lo tiene, con la misma semántica.

El cierre MANUAL de un caso sigue en la app y no puede chocar: el Lambda saltea
los casos asignados, y tomar un caso lo reserva en transacción.

## Los dos interruptores

| Interruptor | Dónde | Efecto |
|---|---|---|
| `config/flujoAutomatico.ofac.enabled` | Firestore | Habilita la cola OFAC. Se **relee entre lotes**, así que apagarlo frena la corrida en curso. |
| `config/flujoAutomatico.remesa.enabled` | Firestore | Habilita la cola de remesas, independiente del anterior. Mismo comportamiento. |
| `Habilitada` del stack | CloudFormation | Habilita o deshabilita el cron. Arranca en `DISABLED`. |

`ofac.enabled` y los países arrancan apagados si el campo falta: un campo ausente
no puede habilitar un cierre automático. Los canales y las tipologías sí caen a
su default, igual que en la app — de lo contrario un doc recreado dejaría de
funcionar en silencio.

La normalización de la config es **la misma función** que usa la app
(`normalizarFlujoConfig`). Antes cada lado normalizaba a su manera y con los
`tipo*` ausentes el Lambda decidía `sin_conclusion` donde la app decidía
`liberar_normal`. Lo encontró la auditoría comparando los dos caminos sobre 512
combinaciones de config.

Y cuando algún campo se resuelve por defecto, la corrida lo dice en
`camposAusentes` del resumen. Un proceso desatendido no puede degradarse en
silencio: `sin_conclusion` es un motivo legítimo y sin este aviso no habría forma
de distinguir "no había nada que hacer" de "la config quedó incompleta".

## Candado de corrida

Una corrida a la vez. Con el cron a 30 min era imposible que se pisaran; a 5 min
deja de serlo, y el botón «Correr ahora» puede caer justo encima de una del cron.

El candado vive en `config/flujoAutonomoLock` y **vence solo a los 15 minutos**,
el techo de Lambda: si una corrida muere sin liberarlo, la siguiente lo toma en
vez de quedar bloqueada para siempre.

## El botón «Correr ahora»

Va por el Worker (`POST /flujo/correr`), que agrega el secreto que la Function URL
exige. El navegador nunca lo ve.

La Function URL es `AuthType: NONE` porque el navegador no puede firmar IAM; la
autorización la hace el handler con el header `x-lens-trigger`. El riesgo está
acotado por diseño: **disparar una corrida no puede cerrar nada que el cron no
cerraría igual** — los dos switches y todos los frenos se evalúan lo mismo. Lo que
se protege es el gasto, no la decisión.

## Por reloj, no por cantidad

Regcheq tiene mediana de ~4 s por consulta, **p90 de ~47 s y máximo observado de
104 s** (medido sobre 286 screenings). Con esa dispersión, "N casos por corrida"
no acota nada: la corrida se corta a los 13 minutos y lo que queda se toma en la
siguiente. El screening queda cacheado, así que no se vuelve a pagar.

Cada corrida registra su `duracionMs`. Antes no se guardaba y hubo que inferirlo
de los timestamps; con el cron a 5 minutos es el dato que avisa si las corridas se
acercan al límite. Las medidas hasta ahora tardan entre 16 y 59 segundos.

## Desplegar

Una sola vez, guardar la key de Regcheq en un archivo:

```bash
printf '%s' 'LA-KEY' > ~/.lens-regcheq-key && chmod 600 ~/.lens-regcheq-key
```

Y después, siempre:

```bash
cd aws/flujo-autonomo
./deploy.sh              # despliega con el cron ACTIVO
./deploy.sh DISABLED     # o apagado, para probar primero
```

El script lee los dos secretos de archivos, así que **no pasan por la línea de
comandos ni quedan en el historial de la shell**. Y rechaza el deploy si el
archivo de la key todavía tiene un placeholder, que es el error fácil de cometer.

Para ver qué haría el flujo ahora mismo, sin esperar al cron:

```bash
aws lambda invoke --profile compliance-admin --region us-east-1 \
  --function-name lens-flujo-autonomo --cli-read-timeout 900 /tmp/lens-run.json
```

## Qué deja registrado

Cada corrida escribe un documento en `flujo_autonomo_corridas` con: cuántos casos
había, cuántos se cerraron, cuántos se retuvieron **y por qué motivo**, cuántos
fallaron, y si se cortó por tiempo o porque alguien apagó el switch a mitad.

Un proceso que cierra casos de compliance sin nadie mirando tiene que poder
explicar cada decisión después, incluidas las retenciones.

## La cola de remesas

Recorrido distinto del de OFAC: primero se traen las filas de las transacciones
—una sola consulta para todos los casos— porque de ahí sale el beneficiario, y
después se lo screenea. Lo que se libera es la **transacción** en Admin, no el
cliente.

**Admin va primero y Salesforce después**, a propósito: si Salesforce falla, el
caso queda abierto con la transacción liberada, que se ve y se corrige. Al revés
quedaría cerrado en Salesforce con la plata retenida, que no se ve.

Dos frenos difieren de OFAC, y son decisiones de negocio:

- **PEP no retiene una remesa.** En OFAC un cliente PEP no se libera solo porque
  corresponde el bloqueo preventivo más el formulario. Acá se libera una
  transacción puntual, no se vincula a un cliente.
- **Cualquier coincidencia retiene**, sensible o no: causa penal o lista
  internacional, la revisa el analista.

Y sin screening resuelto no se libera nada. Si el proveedor falló, el caso queda
como estaba: un error de la API no se lee como "sin hallazgos".

**El cron corre 24/7** y la cola de remesas convive con la pausa de Redshift. El
cluster pausa 18:30–04:00 hora Chile y la fila de la transacción sale de ahí, así
que en esa ventana el paso de remesas se **omite** con un aviso: no se marca cada
caso como error.

La distinción importa. Con el cron a 5 minutos son ~114 corridas por noche: si
cada una marcara decenas de errores, el aviso dejaría de significar algo y nadie
mirararía el siguiente que sí importe. Las remesas omitidas se retoman solas
cuando el cluster vuelve, y la barra de la app lo dice —"N en espera"— en vez de
pintarse de ámbar toda la noche.

OFAC no depende de Redshift: funciona a toda hora.

## Lo que queda pendiente

- **Colombia.** El screening de Inspektor no tiene muestra suficiente para
  dimensionar (5 screenings en total), así que `paises.CO` conviene dejarlo
  apagado hasta medirlo.
- **Solapamiento con la app.** Si el cron corre mientras alguien tiene la Bandeja
  abierta, los dos pueden tomar el mismo caso en el mismo instante y duplicar una
  consulta o un cierre. El screening cacheado y el freno de `ya_cerrado` cubren
  casi todo, pero no la ventana exacta. Un lock por caso lo cierra del todo.
