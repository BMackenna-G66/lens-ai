// Qué hacer cuando el barrido vuelve a traer una empresa que ya está en la base.
//
// Puro a propósito: es la regla que decide si un caso ya trabajado vuelve o no a
// la cola, y eso hay que poder probarlo sin Firestore.
//
// La regla, que es la que ya estaba escrita en el diseño: **una empresa cerrada
// NO se reabre sola**. Si cambió algo relevante se marca para reingreso y decide
// una persona. El barrido no puede deshacer el trabajo del analista.

export interface EstadoPrevio {
  existe: boolean;
  statusKyb?: string;
  kycStage1?: string;
  complianceStatus?: string;
}

export interface Entrante {
  kycStage1?: string;
  complianceStatus?: string;
  // true = alguien pidió ESTA empresa a mano, por su Company ID. Reabre aunque
  // esté cerrada.
  //
  // La regla de "una cerrada no vuelve" existe para que el BARRIDO no deshaga el
  // trabajo del analista: trae cientos de empresas de una y no sabe qué se
  // trabajó. Una persona escribiendo un Company ID es lo contrario — es una
  // decisión explícita sobre una empresa concreta, que es justamente lo que la
  // regla quería preservar. Sin esta salida, cerrar es irreversible y el módulo
  // queda con una puerta de una sola dirección.
  reaperturaManual?: boolean;
}

export interface DecisionEncolado {
  // Se escribe `enCola` solo cuando corresponde. `undefined` = no tocar, que es
  // lo que deja quieta a una empresa cerrada.
  enCola?: boolean;
  statusKyb?: string;
  recibidoEn?: boolean;          // true = sellar ahora (solo las nuevas)
  esNueva: boolean;
  // La empresa siguió en el barrido pero está cerrada: no vuelve.
  quedaFuera: boolean;
  // Cambió algo relevante en una cerrada: se marca para que alguien decida.
  reingreso?: string;            // motivo legible
}

export function decidirEncolado(previo: EstadoPrevio, nuevo: Entrante): DecisionEncolado {
  if (!previo.existe) {
    return { enCola: true, statusKyb: 'ABIERTO', recibidoEn: true, esNueva: true, quedaFuera: false };
  }

  // Reapertura pedida a mano: vuelve, y con `recibidoEn` nuevo — es un caso que
  // entra hoy a la cola, no uno viejo que reaparece.
  if (previo.statusKyb === 'CERRADO' && nuevo.reaperturaManual) {
    return { enCola: true, statusKyb: 'ABIERTO', recibidoEn: true, esNueva: false, quedaFuera: false };
  }

  // Cerrada: se actualizan sus datos, pero NO vuelve a la cola. Si volviera,
  // cada barrido resucitaría todo lo ya trabajado y la cola no bajaría nunca.
  if (previo.statusKyb === 'CERRADO') {
    const motivos: string[] = [];
    if (previo.kycStage1 && nuevo.kycStage1 && previo.kycStage1 !== nuevo.kycStage1) {
      motivos.push(`kycStage1 pasó de ${previo.kycStage1} a ${nuevo.kycStage1}`);
    }
    if (previo.complianceStatus && nuevo.complianceStatus && previo.complianceStatus !== nuevo.complianceStatus) {
      motivos.push(`compliance status pasó de ${previo.complianceStatus} a ${nuevo.complianceStatus}`);
    }
    return {
      esNueva: false,
      quedaFuera: true,
      reingreso: motivos.length ? motivos.join(' · ') : undefined,
    };
  }

  // Abierta o en gestión: sigue en la cola con su antigüedad y su estado. No se
  // pisa `recibidoEn` ni `statusKyb`, para no perder el orden ni la asignación.
  return { enCola: true, esNueva: false, quedaFuera: false };
}
