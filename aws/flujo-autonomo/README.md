# Flujo automático desatendido — OFAC

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
- **No toca remesas.** Esta función es solo OFAC.

## Los dos interruptores

| Interruptor | Dónde | Efecto |
|---|---|---|
| `config/flujoAutomatico.ofac.enabled` | Firestore | Si no es exactamente `true`, la corrida termina sin tocar nada. Se **relee entre lotes**, así que apagarlo frena la corrida en curso. |
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

## Por reloj, no por cantidad

Regcheq tiene mediana de ~4 s por consulta, **p90 de ~47 s y máximo observado de
104 s** (medido sobre 286 screenings). Con esa dispersión, "N casos por corrida"
no acota nada: la corrida se corta a los 13 minutos y lo que queda se toma en la
siguiente. El screening queda cacheado, así que no se vuelve a pagar.

## Desplegar

```bash
cd aws/flujo-autonomo
./build.sh
sam deploy --guided \
  --parameter-overrides \
    FirebaseSaB64=<service-account-en-base64> \
    ProxyUrl=https://empresadocs-proxy.bmackenna.workers.dev \
    RegcheqApiKey=<api-key> \
    Habilitada=DISABLED
```

Se despliega **deshabilitado**. Para la primera corrida, invocarla a mano y leer
el resumen antes de habilitar el cron:

```bash
aws lambda invoke --function-name lens-flujo-autonomo-ofac /dev/stdout
```

Y después, cuando el resultado convenza:

```bash
sam deploy --parameter-overrides Habilitada=ENABLED ...
```

## Qué deja registrado

Cada corrida escribe un documento en `flujo_autonomo_corridas` con: cuántos casos
había, cuántos se cerraron, cuántos se retuvieron **y por qué motivo**, cuántos
fallaron, y si se cortó por tiempo o porque alguien apagó el switch a mitad.

Un proceso que cierra casos de compliance sin nadie mirando tiene que poder
explicar cada decisión después, incluidas las retenciones.

## Lo que queda pendiente

- **Remesas.** El pedido incluye las dos colas. Esta función cubre OFAC; remesas
  necesita su propio recorrido (la fila de la TX en Redshift y el screening del
  beneficiario) y conviene armarlo después de ver corridas reales de OFAC.
- **Colombia.** El screening de Inspektor no tiene muestra suficiente para
  dimensionar (5 screenings en total), así que `paises.CO` conviene dejarlo
  apagado hasta medirlo.
- **Solapamiento con la app.** Si el cron corre mientras alguien tiene la Bandeja
  abierta, los dos pueden tomar el mismo caso en el mismo instante y duplicar una
  consulta o un cierre. El screening cacheado y el freno de `ya_cerrado` cubren
  casi todo, pero no la ventana exacta. Un lock por caso lo cierra del todo.
