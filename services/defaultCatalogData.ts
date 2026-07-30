import { CatalogData } from '../types/criminalTypes';

/**
 * Catálogo Chile — actualizado desde Catalogo_delitos_2207.xlsx (delitos normalizados).
 * Los nombres de delito están normalizados (minúscula, sin tildes, solo alfanumérico
 * + espacios) para maximizar la coincidencia. El match en runtime aplica la MISMA
 * normalización (normalizeDelito en criminalDataProcessor) sobre el delito entrante.
 * 'parameters' y 'decisionTable' NO cambian (mismos pesos/parámetros que antes).
 */
export const DEFAULT_CATALOG: CatalogData = {
  "items": [
  {
    "nombre": "abandono de armas o elementos sujetas a control art 14 a",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "abandono de conyuge o de parientes enfermos art 352",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "abandono de conyuge o deparientes enfermos",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "abandono de destino",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "abandono de ninos",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "abandono de niqos",
    "riesgoG66": "ALTO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "abandono de semillas u otras art 10 inc 2 ley 20000",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "abandono o maltrato animal art 291 bis",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "abandono o maltrato animal art 291 bis codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "abandono o maltrato animal art291 bis",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "abigeato",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "abigeato art 448 bis codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "aborto",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "aborto cometido por facultativo",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "aborto cometido por facultativo por causales no reguladas",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "aborto consentido",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "aborto consentido causales no reg art 342 n 3 y 344",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "aborto consentido causales no reg art 342 no 3 y 344",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "aborto consentido por causlaes n reguladas art 342 n 3 y 344",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "aborto sin consentimiento",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "abuso de firma en blanco",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "abuso de los dispositivos art 8 ley 21 459",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "abuso sex c contacto corp a menor de 14 anos art 366 bis",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "abuso sex mayor 14 menor 18 con circuns estupro art 366 inc2",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "abuso sex mayor de 14 anos por sorpresa y o s consentim art",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "abuso sexual adulto",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "abuso sexual calificado con objetos o animales art 365 bis",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "abuso sexual con contacto de menor de 14 anos art 366 bis",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "abuso sexual de mayor de 14 con circ de violacion art 366",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "abuso sexual de mayor de 14 con circunstancias de violacion",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "abuso sexual de mayor de 14 con circunstancias de violacion",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "abuso sexual mayor14 sorpresa sin consemtim art 366 inc 3",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "abuso sexual mayor14 sorpresa sin consemtim art366 inc 3",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "abuso sexual sin contacto art 366 quater inc 1 y 2",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "abuso sexual sin contacto art 366 quater inc 1 y 2",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "abuso sexual sin contacto art 366 quater inc 1deg y 2",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "abuso sexual sin contacto mayor 14 menor 18 366 quater inc 4",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "abuso sexual sin contacto menor 14 366 quater inc 1 2 y 3",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "abuso sexual solo crimen",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "abusos contra particulares",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "abusos contra particulares art 255",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "abusos contra particulares arts 255",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "abusos contra particularesarts 255",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "abusos sexuales",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "acceso divulg y uso indeb inf genetica con ocasion trat adn",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "acceso divulgacion y uso indebido de informaciongenetica",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "acceso ilicito art 2 ley 21 459",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "acceso ilicito art 2 ley 21 459 delitos informaticos",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "accidente con resul muerte o les graves art 196 c ley 18290",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "accidente con resultado de muerte o lesiones graves arts 197 y 198 ley 18 290 del transito",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "accidente con resultado de muerte o lesiones graves ley de",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "accionar fuegos artific pirotecnicos o similares sin autor",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "acoso sex en lugares publicos o de libre acceso publico art",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "acoso sexual lug publicos libre acceso publico art 494 ter",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "acoso sexual lugpublicos libre acceso publico art494 ter",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "acuerdos abusivos directorio de s a art 134 bis ley 18046",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "adm malicsa inst sald prev art 7 inc 2 ley21 674 isapres",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "administracion desleal de persona juridica art 470 n 11",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "administracion desleal de persona juridica art 470 n11",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "administracion desleal de persona juridica art 470 ndeg11",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "administracion desleal de persona natural art 470 n 11",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "administracion desleal de persona natural art 470 n11",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "adq o almacenamiento mat porn infantil 367 quater inc 3",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "adq o almacenamiento mat pornografico inf art 374 bis inc 2",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "adquisicion material de guerra instituciones armadas",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "adquisicion material de guerra o vestuario instit armadas",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "adquisicion o almacenamiento material pornografico infantil",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "adquisicion y venta indeb de cartuchos y mun art 9 a l 17798",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "adquisicion y venta indebida de cartuchos y municiones art",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "allanamientos irregulares",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "alt ocul dest balanc libros ant art 158 ley bancos",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "alt ocul dest balanclibros ant art158 ley bancos",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "alter ocult destr balnc libr fiscaliz art 158 ley grl bco",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "alteracion fraudulenta de precios",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "alteracion fraudulenta de precios arts 285 y 286",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "alteracion orden publico",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "alterar el orden publico 495 n 1 codigo penal",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "alterar el orden publico art 495 n 1 codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "amen u ofrec econ prest falso test asoc ilic 293 bis",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "amenaza a fiscal o defensor en desemp de func art 268 quin",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "amenaza a fiscales o defensores en el desempeno de funciones",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "amenaza a gendarme en el desempeno de sus funciones",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "amenaza con arma blanca falta art 494 n 4 codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "amenaza con arma falta art 494 n 4 codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "amenaza con arma falta art 494 no 4 codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "amenaza contr prof y func salud y manipuladores alimento",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "amenaza gendarme en desemp de func art 15 d dl 2589",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "amenazar simple o condicional ofender pers investigaciones",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "amenazar simple o condicional ofender persinvestigaciones",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "amenazar u ofender a func de investigaciones art 17 quater",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "amenazas a carabineros",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "amenazas a carabineros art 417 codigo de justicia militar",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "amenazas condic c personas y propiedades art 296 1y2 art 297",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "amenazas condic contra personas y prop art 296 1 y 2 297",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "amenazas condiccpersonas y propiedades art296 1y2art297",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "amenazas condicionales contra personas y propiedades arts 296 n 1 y n 2 y 297 codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "amenazas de atentados contra personas y propiedades",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "amenazas de atentados contra personas y propiedades art 296 a 298",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "amenazas prof y funcio salud y manipula de alimentos",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "amenazas simples contra personas y propiedades art 296 n 3",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "amenazas simples contra personas y propiedades art 296 n 3 codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "amenazas simples contra personas y propiedades art 296 no3",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "amenazasa carabineros art 417 cod j militar",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "amenazasa carabineros art 417 cod jmilitar",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "ampliacion de parte",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "anticipacion y prolongacion indebida de funciones publica",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "apertura reg o interceptacion de corresp art 146 y 156",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "apertura registro o interceptacion de correspondencia",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "apoderamiento o atentado al transporte pub art 2 n 2 l 18314",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "apoderamiento o atentado al transporte publico",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "apremios ilegit violacion abuso sex agrav otros art 150e n02",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "apremios ilegit violacionabuso sex agravotrosart 150e n02",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "apremios ilegitimos cometidos por empleados publicos",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "apremios ilegitimos cometidos por empleados publicos 150 d",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "apremios ilegitimos con cuasidelito art 150 e n 3",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "apremios ilegitimos con cuasidelito art 150 e n0 3",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "apremios ilegitimos con cuasidelito art 150 e n0 3 delitos de signifacion sexual",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "apremios ilegitimos con cuasidelito art 150 e n0 3 trafico de armas art 10",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "apremios ilegitimos con homicidio art 150 e n 1",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "apremios ilegitimos con homicidio art 150 e n 1",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "apremios ilegitimos con homicidio art 150 e n 1deg",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "aprmio ileg con viol ab sex agrav otros art 150 e 2",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "aprop de monumentos nacionales art 38 bis ley 17 288",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "aprop de monumentos nacionales art 38 bis ley 17288",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "apropiacion de cables de tendido elec o de com art 443 inc 2",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "apropiacion de cables tendido electrico o de comunicaciones",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "apropiacion de cotizac previsionales y declaracion inexactas",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "apropiacion de cotizaciones previsionales ley 17322",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "apropiacion de monumentos nacionales art 38 bis ley 17 288",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "apropiacion indebida art 470 n 1",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "apropiacion indebida art 470 ndeg1",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "apropiacion indebida art 471 n 1 codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "apropiacion indebida art470 n1",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "apropiacion indebida art470 ndeg1",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "apropiacion indebida cometido por p juridica art 470 n 1",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "apropiacion indebida cometido por pers juridica art 470 n 1",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "apropiacion indebida incl depositario alzado art 470 n 1",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "apropiacion indebida incluye depositario alzado",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "arrojamiento de piedras u otros objetos 496 n 26 cod penal",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "arrojamiento de piedras u otros objetos 496 nr26 codigo pen",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "arrojamiento de piedras u otros objetos art 496 n 26 codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "arrojar basura desechos playas parq nac u otros art 494 n 3",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "arrojar basura desechos playas parq nac u otros art 494 ndeg3",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "arrojar basura en playas p nacionales u otros art 494 n 3",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "arrojar basuradesechos playasparqnac u otros art494 n3",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "arrojar basuradesechos playasparqnac u otros art494 ndeg3",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "asoc delictiva o crim mediante persona jdca art 294 cp",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "asoc ilicita para la comision de crimenes art 293",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "asoc ilicita para la comision de simples delitos art 293",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "asoc ilicta para trafico y o trata personas art411 quinquies",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "asociac ilicita para trafico de personas art 411",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "asociacion ilicita art 27 ley 19 913",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "asociacion ilicita art 28 ley 19 913",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "asociacion ilicita art 28 ley 19913",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "asociacion ilicita para comercio ilegal art 2 ley 21426",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "asociacion ilicita terrorista art 1 y 2 ley 21732",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "asociaciones ilicitas",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "asociaciones ilicitas art 16 ley 20 000 trafico estupefacientes y sustancias sicotropicas",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "asociaciones ilicitas arts 292 al 293 bis",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "asociaciones ilicitas ley de drogas art 16",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "asociaciones ilicitas ley de drogas art 16 ley n 20 000",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "asociacionilicita art 27 ley 19 913",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "asociacisn ilicita terrorista",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "asociacisnilicita terrorista",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "ataque a la integridad de datos informaticos art 4 ley 21459",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "ataque a la integridad de datos informaticos art 4 ley 21459",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "ataque a la integridad de sist informatico art 1 ley 21459",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "ataque a la integridad de sist informatico art 1 ley 21459",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "aten terrorista c j de estado o aut publ art 7 ley 21732",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "atentado a veh mot en circ con obj contundente u otro sem",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "atentado a vehiculo motorizado en circulacion con objeto con",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "atentado contra jefe de estado o autoridad publica",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "atentado explosivo o incendiario art 2 n 4 ley 18 314",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "atentado explosivo o incendiario art 2 no 4 ley 18 314",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "atentado explosivo o incendiario art 2 no 4 ley 18314",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "atentado terrorista con jefe estado aut public 7 ley 21372",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "atentado terrorista contra jefe estado autoridad publica 7 ley 21 372",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "atentado terrorista explosivo o incendiario art 8 ley 21732",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "atentados contra el medio ambiente art 305 a 310 cp",
    "riesgoG66": "BAJO",
    "valor": 0.5,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "atentados y amenazas contra la autoridad art 261 n 1 y 264",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "atentados y amenazas contra la autoridad art 261n 1y",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "atentados y amenazas contra la autoridad art 261no 1y",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "auxilio al suicidio",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "bigamia",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "bloqueo total circulacion con violencia intimidac obstaculo",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "borrado del n de serie de arma o munic art 10 b ley 21 412",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "calumnia accion privada",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "calumnia accion privada art 412 al 415",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "calumnias a traves de medios de difusion accion privada",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "captacion grab y difus de registros audiovis partes intima",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "castracion y mutilacion",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "causar la muerte a personal de la policia de investig",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "causar la muerte a personal de la policia de investigaciones",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "causar muerte personal pdi art 17 dl 2640",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "caza y comercializacion de especies proh art 31 ley 19473",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "caza y comercializacion de especies prohibidas art 31 ley",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "caza y pesca con violencia",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "caza y pesca con violencia 494 n 21 codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "caza y pesca con violencia 494 no 21 codigo penal",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "celebracion de contrato simulado",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "celebracion de contrato simulado art 471 n 2",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "celebracion de contrato simulado art 471 n 2 codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "cohecho",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "cohecho cometido por empleado publico art 248 248 bis y 249",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "cohecho cometido por empleado publico arts 248 248 bis y 249 codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "cohecho cometido por empleado publicoart248248 bis y 249",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "cohecho o soborno cometido por particular art 250",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "colocac bomba artefacto art 14 d inc 1 2 y 3",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "colocac bomba artefacto art 14 d inc 1deg 2deg y 3deg",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "colocacbomba artefacto art 14 d inc 1 2 y 3",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "colocacbomba artefacto art 14 d inc 1deg 2deg y 3deg",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "colocacion bomba o artefact art 14 d inc 1 2 3 4 y 5",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "colocacion de bomba o artef art 14 d inc 1 2 3 4 y 5",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "colusion d l 211",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "comerc disposit falsificados art 196 sexies ley transito",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "comerc material porn menor 18 art 367 quater inc 1",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "comerc o distrib senal proteg telev art 36b ltr e ley 18168",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "comercdispositfalsificados art196 sexies ley transito",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "comercializ distrib instalar maq de juegos ilegal art 276",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "comercializacion mat pornografico elab util men de 18 anos",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "comercializar distribuir instalar maquinas juegos ilegales",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "comercializardistribuir instalar maquinas juegos ilegales",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "comerciar dispositivo falsificado art196sexies l transit",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "comerciar distrib senal protegida tv art36b letra e l18168",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "comercio clandestino",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "comercio clandestino 160",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "comercio clandestino nbsp",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "comerco distribsenal protegtelevart 36bltr eley 18168",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "cond bajo la influ del alcohol caus muer art 193 inc 4",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "cond carr no aut con o sin dan o les leves 197 ter inc2",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "cond carr no autor les menos grav o graves 197 ter inc3",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "cond carrerar no autor les gravisimas muerte 197 ter inc4",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "condbajo la influ del alcohol caus muer art 193 inc 4",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "condenas irregulares",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduc bajo influ alcoh caus lesi grav gravi art 193 inc 4",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduc bajo influen del alcohol con o sin danos o les leves",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduc bajo influen del alcohol con o sin danos o lesleves",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduc bajo influencia del alcohol art 196 c ley 18290 trans",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduc bajo la inf del alcohol art 193 inc 2 ley de trans",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduc bajo la inf del alcohol art 193 inc 3 ley de trans",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduc bajo la influ del alcohol caus muer art 193 inc 4",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduc bajo la influencia del alcohol",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduc bajo la influencia del alcohol causando les men grav",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduc bajo la influencia del alcohol causando lesiones",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduc ebridad c lesions menos gravesart196 inc2 ley tran",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduc ebriedad c lesions graves art 196 inc2ley trans",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduc ebriedad c lesions gravisimas art196 inc3ley trans",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduc ebriedad c result muerte art196inc3 ley transito",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduc ebriedad c susp licencia art 196 209 ley transito",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduc ebriedad resul lesiones grave art 196 inc 2ley trans",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduc ebriedad resul lesiones grave art 196 inc 3ley trans",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduc ebriedad resul lesiones menos grave a196 i 2ley trans",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduc ebriedad resul lesionesgrave art 196 inc 2ley trans",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduc ebriedad resul muerte art 196 inc 3ley transito",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduc ebriedad resullesiones graveart 196 inc2leytrans",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduc ebriedad susp lic art 196y209 inc 2 ley transito",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduc estado de ebriedad con o sin danos o lesiones leves",
    "riesgoG66": "MEDIO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduc estado de ebriedad con resultado de danos art 19",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduc estado de ebriedad con resultado de danos art 19",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduc estado ebriedad c result lesiones graves o menos gra",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduc estado ebriedad c result muerte o lesion graves grav",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduc influencia alcohol causando les gravisimas o muerte",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduc sin la licencia debida art 194 ley de transito",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduc vehic durante vig alg sanci impuest art209 ley 18290",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conducbajo influen del alcohol con o sin danos o lesleves",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conducbajo la influ del alcohol caus muer art 193 inc 4",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conducbajo la influencia del alcohol",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conducc inf alcohol con o sin dano o les leve 193 inc 1",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduccion bajo la influencia del alcohol",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduccion bajo la influencia del alcohol causando les grav",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduccion bajo la influencia del alcohol causando lesiones",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduccion bajo la influencia del alcohol con o sin danos o lesiones leves art 193 inc 1 ley 18 290 del transito",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduccion ebriedad con o sin dano o les leve 196 inc 1",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduccion ebriedad resul muerte art 196 inc 3ley transito",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduccion ebriedad resul muerteart 196 inc 3ley transito",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduccion ebriedad resulmuerte art196 inc3leytransito",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduccion ebriedad resulmuerteart196 inc3leytransito",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduccion ebriedad susp lic art 196y209 inc 2 ley transito",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduccion estado de ebriedad con o sin danos o lesiones leves art 196 inc 1 ley 18 290 del transito",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduccion estado de ebriedad con resultado de danos",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduccion estado de ebriedad con resultado de danos art 19",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduccion estado de ebriedad con resultado de danosart 19",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduccion estado de ebriedad con resultado de lesiones",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduccion estado de ebriedad con resultado de lesiones graves o menos graves art 196 inc 2 ley de transito",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduccion estado de ebriedad con resultado de muerte",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduccion estado de ebriedad con resultado de muerte art 196 inc 3 ley 18 290 del transito",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduccion estado de ebriedad con resultado de muerte o lesiones graves gravisimas art 196 inc 3 ley de transito",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduccion estado de ebriedad con suspension de licencia arts 196 y 209 inc 2 ley 18 290 del transito",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduccion sin la licencia debida art 194 ley de transito",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduccion sin la licencia debida art 196 d ley 18 290",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conduccion sin licencia art 194 ley 18 290 del transito",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conducebriedad resullesiones graveart 196 inc2leytrans",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conducebriedad resullesiones menos gravea196 i2leytrans",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conducebriedad resulmuerte art196 inc3leytransito",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conducebriedad susplic art196y209 inc2 leytransito",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conducestado de ebriedad con o sin danos o lesiones leves",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conducestado de ebriedad con resultado de danosart 19",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conducestado ebriedad cresultlesiones graves o menos gra",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conducestado ebriedad cresultmuerte o lesion graves grav",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conducir infl alcohol causando les gravisimas art 193 inc 4",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conducir infl alcohol causando muerte art 193 inc 4",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conducir vehiculo con sancion vigente art 209 ley 18 290",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conducir vehiculo durante la vigencia de alguna sancion impuesta art 209 ley 18 290 del transito",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conducsin la licencia debida art 194 ley de transito",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conducvehic durante vig algsanci impuest art209 ley 18290",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "connivencia en la fuga y evasion culpable de detenidos",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "connivencia fuga y evasion culpable detenido art 299 a 304",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "consp homicidio calif premio contra autor 391 bis inc 2",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conspiracion de la ley 20 000 art 17",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "conspiracion homicidio calificado por premio 391 bis inc 1",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "conspiracion terrorista art 11 ley 21732",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "consumo de bebidas alcoholicas en la via publica",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "consumo de drogas art 41",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "consumo porte de drogas en lugares calificados art 51",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "consumo porte en lug pub o priv c previo concierto art 50",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "consumo porte en lug pub o priv con prev concierto art 50",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "consumo porte en lug pub opriv c previo concierto art 50",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "consumo y o porte de drogas en lugares calificados art 51 ley 20 000 trafico estupefacientes y sustancias sicotropicas",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "consumo y o porte en lugares publicos o privados con previo concierto art 50 ley 20 000 trafico estupefacientes y sustancias sicotropicas",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "consumo y otras faltas ley de drogas",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "consumoporte de drogas en lugares calificados art 51",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "consumoporte en lugpubo privcprevio conciertoart50",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "contaminacion grave imprudente art 309",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "contra salud publica",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "contra salud publica arts 313 a y 313 b",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "contra salud publica arts 313 a y 313 b codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "contra salud publica arts 313 al 318",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "contra salud publica arts 313 d al 315 y 317 codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "contra salud publica arts 313 d al 315 y art 317",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "contra salud publica arts 313 d al 318",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "contrab infrac a la ord de aduan art 168 ley 20 780",
    "riesgoG66": "BAJO",
    "valor": 0.5,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "contrab infrac a la ord de aduan art 168 ley 20780",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "contrabando de dinero art 168 bis dfl 30",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "contrabando de especies exoticas art 11 ley 20 962",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "contrabando de especies exoticas art 11 ley 20962",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "contrabando infraccion a ordenanza de aduanas art 168 d f l hacienda n 213 de 1953 modif por ley 20 780",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "contrabando infraccion a ordza aduanas art 168 ley 20780",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "contravencion medidas ley elab alcoholes art 43 ley 18455",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "corrup entre particulares por pers juridica 287 bis y ter",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "corrupcion entre particulares art 287 bis y 287 ter",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "corte destr arbol arbusto reg art 21 4363 1931y ley bosque",
    "riesgoG66": "BAJO",
    "valor": 0.5,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "corte destr arboles rgmto art 21 dcto 4363 1931 y l bosq",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "cortedestr arbolarbusto regart21 43631931y ley bosque",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "crim y sd seg int estado art 121 y ss cp y 4 y ss ley 12927",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "crim y sd sob nac y seg ext art 106 y ss cp y 1 ley 12 927",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "crimenes lesa humanidad y genocidio ley 20 357",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "crimenes lesa humanidad y genocidio ley 20357",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "crimenes y simples delitos art106 y ss cp",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "crimenes y simples delitos art106 y ss cp art 1 ley 12 927",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "crimenes y simples delitos art106 y ss cp art 1 ley 12927",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "crimenes y simples delitos art121 y ss cp",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "crimenes y simples delitos art121 y ss cp 4 y ss ley 12 927",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "crimenes y simples delitos art121 y ss cp 4 y ss ley 12927",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "crimenes y simples delitos de los proveedores",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "crimenes y simples delitos seguridad interior del estado",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "crmmenes y simples delitos c soberanma nac y seg del estado",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "crmmenes y simples delitos csoberanma nac y seg del estado",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "cuasidelito de homicidio",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "cuasidelito de homicidio art 492 inc 2 codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "cuasidelito de homicidio codigo agrupador art 492 inc 2",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "cuasidelito de homicidio cometido por profes de la salud",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "cuasidelito de homicidio cometido por profesionales de la sa",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "cuasidelito de lesiones art 490 491 inc 2 y 492",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "cuasidelito de lesiones art 490 491 inc 2deg y 492",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "cuasidelito de lesiones arts 490 491 inc 2 y 492 codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "cuasidelito de lesiones cometidos por profes de la salud",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "cuasidelito de lesiones cometidos por profesionales de la sa",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "cuasidelito de lesiones cometidos por profesionales de la salud art 491 inc 1 codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "cuasidelito vehiculo motorizado ley 18 290 del transito",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "cuasidelito vehiculo motorizado ley transito",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "cultivo cosecha espec vegetales productoras estupef art 8",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "cultivo especies veget estupef y fals recet 8 ley 20 000",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "cultivo estupefacientes falsific recetas art 8 ley n 20 000",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "cultivo y o cosecha de especies vegetales productoras estupefacientes art 8 ley 20 000 trafico estupefacientes y sustancias sicotropicas",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "cultivocosecha especvegetales productoras estupefart8",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "dano falta 495 n 21 codigo penal",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "dano falta 495 nr 21 codigo penal",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "danos",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "danos a monumentos nacionales art 38 ley 17 288",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "danos a monumentos nacionales art38 ley 17288",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "danos calificados",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "danos calificados art 485 y 486",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "danos o apropiacion sobre monum nac art 38 38 bis l 17288",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "danos o apropiacion sobre monumentos nacionales",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "danos simples",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "danos simples art 487",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "dano falta 495 nr 21 codigo penal",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "dano falta art 495 n 21 codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "danos",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "danos calificados",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "danos calificados arts 485 y 486 codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "danos simples",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "danos simples art 487 codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "declarac maliciosa impuesto art 97 n 4 except inc 3 c trib",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "declarac maliciosa impuesto art 97 no4 except inc 3 c trib",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "declarac maliciosa impuesto art97 no4except inc3 ctrib",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "declaracion falsa denunc anonimo art 100 quater c trib",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "declaracion maliciosa impstos 97n4 excepto inc 3 cod trib",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "dejar animales sueltos 496 n 17 codigo penal",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "dejar animales sueltos 496 nr 17 codigo penal",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delito cometido por militar y gente de mar l 20 000art14 y15",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delito contra el derecho de peticion",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delito contra libertad de opinion",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delito contra libertad de trabajo",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delito desordenes publicos art 269 no falta del cod 13035",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delito desordenes publicos art 269 no falta del codigo 130",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos art undec ley 20416 normas esp emp menor tamano",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos bosque nativo ley 20 283 bosque nativo",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos c la libertad ambulatoria y derecho de asociacion",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos c la vida y privacidad de conversaciones 161 a y b",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos contemplados en la ley antimonopolios",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "delitos contemplados en otros textos legales",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos contemplados en otros textos legales sanciones disciplinarias contra presos segun los ejemplos",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos contenidos en el d l 1 094 de extranjeria",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos contenidos en el d l 1094 de extranjeria",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos contenidos en el dl 1094 de extranjeria",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos contenidos en la ley 19 620 de adopcisn de menores",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos contenidos en la ley 19620 de adopcisn de menores",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos contenidos en ley 19620 de adop menores art 41 42",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos contenidos en leyes de prenda esp l 20190 y 18690",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos contenidos en leyes de prenda especiales ley 20 190",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos contenidos en leyes de prenda especiales ley 20190",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos contra adm amb art 37 bis art 37 ter ley 20417",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos contra la ley de bosque nativo ley 20 283",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos contra la ley de bosque nativoley 20283",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos contra la libertad ambulatoria y el derecho de asoc",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos contra la vida y la privacidad de las conversaciones",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos contra ley de propiedad industrial",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos contra ley de propiedad intelectual",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos contra libertad de reunion",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos contra orden pub y normalidad act nac ley 19 927",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos de la ley 17 322 sobre cotizaciones",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos de la ley 18 450 sobre riego o drenaje",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos de la ley 20 345",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos de la ley 4702 de compraventa bienes a plazo",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos de la ley de sociedades anonimas art 134 ley 18 046",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos de la ley de sociedades anonimas art 134 ley 18046",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos de signifacion sexual",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos del dl 3538 de 1979 que regula mercado financiero",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos del dl3538 de 1979 que regula mercado financiero",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos informaticos ley n 19 223",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "delitos informaticos ley n 19223",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "delitos ley bancos arts 110 141 142 154 157 159 161 dfl 252",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "delitos ley seguridad interior del estado 12 927 art 6 12",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos ley seguridad interior del estado 12927 art 6 12",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos marcarios",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos marcarios arts 28 y 28 bis ley 19 039",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos marcarios arts 28 y 28 bis ley 19 039 propiedad y privilegios industriales",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos marcarios arts 28 y 28 bis ley n 19 039",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos marcarios arts 28 y 28 bis ley no 19 039",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos marcariosarts 28 y 28 bisley no 19039",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos medioamb dolosos art 305 306 307 308 y 310",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos que comprometen relaciones internacionales",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos que contempla el codigo tributario",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos que contempla el codigo tributario arts 97 al 114",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos referidos a armas toxinicas art 34 a 38 ley 21 250",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos relativos al pago de pens alimenticias ley 14908",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos relativos al pago de pensiones alimenticias ley 14 9",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos relativos al pago de pensiones alimenticias ley 149",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "delitos tributarios",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "deltos comet pers militar y gte de mar ly 20 000 art 14 y 15",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "deltos cometpersmilitar y gte de mar ly 20000 art14 y 15",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "demas delitos contra ley de propiedad industrial",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "denegacion de auxilio",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "depositario alzado art 444 codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "depositario alzado art 444 cpc",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "desacato art 240 codigo de procedimiento civil",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "desatender el llamado a recl dl 2306 art 72",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "desatender el llamado a reclutamiento art 72 d l n 2 306 reclutamiento y movilizacion fuerzas armadas",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "desatender el llamado a reclutamiento dl 2306 art 72",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "desmp func vigilt priv fuer caso ley art30 35 ley21 659",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "desordenes en espectaculos publicos 494 n 1 codigo penal",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "desordenes en espectaculos publicos 494 no 1 codigo penal",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "desordenes publicos art 269 codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "destruccion o alteracion de deslindes",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "destruccion o alteracion de deslindes art 462 y 462 bis cp",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "desvio ilicito precursores y sust esenciales art 3 l 20000",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "desvioilicito precursores y sustancias esenciales art 3",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "detencion destierro o arresto irregular art 148",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "deudor administ o represent perjuicio acreed 463 y ss",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "deudor gerente direc admin repres actuen perjuicio acreedor",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "deudor gerente que perjudica acreed art 463 463bis y 463ter",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "deudorgerentedirecadminrepres actuen perjuicio acreedor",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "difus regis contndo sex s consent art 161 d c p inc 2",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "difusion de identidad de testigos protegidos art 31",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "difusion de material pornografico pornografia",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "difusion indebida de entrevista videograbada art23 ley 21057",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "dirigir reuniones tumultuosas art 494 n 2 codigo penal",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "dirigir reuniones tumultuosas art 494 no 2 codigo penal",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "diseminar germenes para causar enfermedad",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "disensiones domesticas 495 n 6 codigo penal",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "disensiones domesticas 495 nr 6 codigo penal",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "disensiones domesticas art 495 n 6 codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "disparos injustif via publica art 14 d inc final",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "disparos injustificados en via publica art 14 d inc final",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "divulg datos militante de part politico art 23 bis ley 18603",
    "riesgoG66": "ALTO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "divulgacion de datos militantes p politicos 23 bis 18 603",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "divulgacion de ident de menores por mcs art 33 inc 1 l 19733",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "divulgacion de identidad de menores por medios de comunicacion social art 33 inc 1 ley 19 733 libertad de opinion",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "divulgacion identidad menores por medio comunicacion social",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "duplicacion de inscripciones de d de agua art 460 bis",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "ebriedad",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "ejercicio ilegal de la profesion art 213 inc 1",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "ejercicio ilegal de la profesion art 213 inc 1o",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "ejercicio ilegal de la profesionart 213 inc 1o",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "ejercicio irregular de martillero pub art 23 ley 18 118",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "ejercicio irregular de martillero publico art 23 ley 18 118",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "ejercicio irregular de martillero publico art23 ley 18118",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "elab de alcoholes no etilicos para bebida art 42 ley 18455",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "elaboracion ilegal de drogas o sust sicot art 1 l 20000",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "elaboracion ilegal de drogas o sustancias sicotropicas art",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "empl publ expropie bienes o perturbe posesion art 158 n 6",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "empleado publico que expropie bienes o pert",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "empleador que ordena infringir cuarentena",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "empleo de violencia innecesaria art 330 cod justicia militar",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "engano para celebrar contratos trans inmuebles art 470 bis",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "enriquecimiento ilicito",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "enriquecimiento ilicito art 241 bis",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "ensenanza no autoriz de artes marciales art 5 ley 18 356",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "ensenanza no autorizada de artes marciales art 5 ley 18 356",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "ensenanza no autorizada de artes marciales art5 ley 18356",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "entrega de arma a menores de edad art 10 a ley 21 412",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "entrega o puesta a disposicion de armas a menores art 10 a",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "entrg inf flsa incmpl plans pago ley21 674 isaprs art7 inc1",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "envio de explos homic les y sec terror art 2 n 1 l 18314",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "envio explosivos homicidio lesiones y secuestro terrorista",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "envio explosivoshomicidiolesiones y secuestro terrorista",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "espionaje informatico art 2 y 4 ley 19223",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "espionaje informatico arts 2 y 4 ley n 19 223 figuras penales informaticas",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "estafa solo crimen",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "estafas y otras defraudaciones contra particulares",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "estafas y otras defraudaciones contra particulares art 468",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "estafas y otras defraudaciones contra particulares arts 468 467 469 470 excluidos n 1 3 8 y 11 y 473 codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "estupro",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "exacciones ilegales art 147 157 y 241 codigo penal",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "exacciones ilegales cometidas por func pub art 157 y 241",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "exacciones ilegales cometidas por funcionario publico",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "exacciones ilegales cometidas por particulares",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "exhib regis contdo sex s consent art 161 d c p inc 1",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "expendio de bebidas alcoholicas",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "expendio de bebidas alcoholicas a menores",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "expendio de bebidas alcoholicas a menores art 42 ley 19 925",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "expendio de bebidas alcoholicas a menores art 42 ley 19925",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "extorsion",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "extorsion art 438",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "extranj ingresan egresan pais con doc falsif art 68 d 1094",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "extranj ingresan tratan egresar clandestinamente 69 dl1094",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "extranje ingresan o intentan egresar c documentos falsific",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "extranje ingresan o intentan egresar cdocumentos falsific",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "extranjeros que ingresan o intentan egresar clandestinamente",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "fab elab mod imp exp adq fuegos artificio art 10 inc 3o",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "fabr elab modif imp exp adq fuegos art art 10 inc 3",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "fabricacion acopio o comercializacion de hilo curado",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "fabricar armar transportar importar sin autorizacion arma",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "facil facturas falsas art 97 n 4 inc final codigo trib",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "facil facturas falsas art 97 no 4 inc final codigo trib",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "facilitacion de bienes al trafico de drogas art 11",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "facilitacion de delitos aduaneros por empleado publico",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "facilitacion facturas falsas art 97 n 4 inc final cod trib",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "facilitar vehic motor part carreras cland 197 ter inc6",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "fals de rotulos o certificados art 48 ter ley 19 300",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "fals medios de pago transport art 196 quinquies ley transito",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "falsa alarma de incendio emergencia o calamidad publica",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "falsa alarma incendio emergencia o calamidad art 268 bis",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "falsedades art 367 al 371 codigo justicia militar",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "falsif medios pago transp art 196 quinquies l transit",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "falsif medios pago transportes art 196 quater l transit",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "falsif moneda para billetes cod 12031 art 162 al 214 cp",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "falsif obras protegidas ley prop intelect art 79 bis",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "falsif placas u otros de investigaciones art 16 inciso 3",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "falsific docs transp o comerc madera 448 octies inc 2",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "falsific maliciososa docs art 59 ley 18840 banco central",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "falsific medios de pago transport art 196 quater ley 18 290",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "falsific o uso de pasap o perm porte armas arts 199 201",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "falsific uso pasaporte permiso porte de arma arts 199 al 201",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "falsifica de licencias medicas o pension art 202 inc 2 y 3",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "falsifica de licencias medicas o pension art 202 inc 2deg y 3deg",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "falsifica de licencias medicas o pension art202 inc2 y 3",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "falsifica de licencias medicas o pension art202 inc2deg y 3deg",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "falsificac de rotulos o certificados art 48 ter ley 19 300",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "falsificacde rotulos o certificados art48 ter ley 19300",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "falsificacion de billetes art 64 ley organica banco central",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "falsificacion de certificados por ffpp priv y uso malicioso",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "falsificacion de dinero art 64 ley 18 840 del banco central",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "falsificacion de licencia de conducir y otras falsificaciones art 192 ley 18 290 del transito",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "falsificacion de licencias medicas o pensiones art 202",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "falsificacion de moneda y otros art 162 codigo penal",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "falsificacion de moneda y otros arts 162 al 214 codigo penal",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "falsificacion de obras protegidas por ley de propiedad intel",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "falsificacion de parte policial art 22",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "falsificacion de portes de armas",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "falsificacion informatica art 5 ley 21 459",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "falsificacion informatica art 5 ley 21459",
    "riesgoG66": "ALTO",
    "valor": 0,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "falsificacion lic de cond y otras falsif art 196 b l 18290",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "falsificacion licencia de conducir y otras falsificaciones",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "falsificacion maliciososa doc art 59 ley 18 840 bco central",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "falsificacion o uso malicioso de doc privados art 197 y 198",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "falsificacion o uso malicioso de doc publ art 193 194 196",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "falsificacion o uso malicioso de doc publ art 193194196",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "falsificacion o uso malicioso de documentos privados",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "falsificacion o uso malicioso de documentos privados arts 197 y 198 codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "falsificacion o uso malicioso de documentos publicos",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "falsificacion o uso malicioso de documentos publicos arts 193 194 y 196 codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "falsificacion o uso maliciosos de documentos publicos",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "falsificacion placas tarjetas timbres y sellos de investigac",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "falsificacion placastarjetastimbres y sellos de investigac",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "falsificacion y uso malicioso de certificados art 203 205",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "falsificacion y uso malicioso de certificados art 203205",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "falsificmedios de pago transport art 196 quater ley 18290",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "falsificuso pasaportepermiso porte de arma arts 199 al 201",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "falsmedios de pago transportart 196 quinquies ley transito",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "falso test perjurio o den calum art 206 209 210 211 y 212",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "falsotestimonio perjurio o denuncia calumniosa art 206",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "falsotestimonio perjurio o denuncia calumniosaart 206",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "falta al deber de informar art 66 bis codigo tributario",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "falta de respeto a autoridad publica 495 n 4 codigo penal",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "falta de respeto a autoridad publica 495 no 4 codigo penal",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "falta de respeto a la autoridad publica 495 n 4 codigo penal",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "falta de respeto a la autoridad publica art 495 n 4 codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "faltas al regimen penitenciario",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "faltas codigo penal conocidas por juzgados del crimen",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "favorecer acciones terroristas art 9 ley 21732",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "femicidio art 390 inc 2",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "femicidio intimo art 390 bis",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "femicidio no intimo art 390 ter",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "financiamiento ilegal de candidaturas o de partidos politico",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "fingimiento de cargos o profesiones art 213 inc 2",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "fraccion al d l 2 460 l o c de investigaciones",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "frau adu infrac a la orden aduan art 169 ley 20 780",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "frau adu infrac a la orden aduan art 169 ley 20780",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "fraude aduanero infraccion ordza aduanas art 169 ley 20780",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "fraude al fisco y organismos del estado art 239 codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "fraude de subvenciones art 470 n 8",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "fraude de subvenciones art 470 n8",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "fraude de subvenciones art 470 ndeg8",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "fraudes al fisco y organismos del estado art 239",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "fraudes en transacc electron art 7 inc final ley n 20009",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "fraudes trans electro art 7 inciso final ley n 20 009",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "fraudes trans electro art 7 inciso final ley n 20009",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "fraudes trans electro art 7deg inciso final ley ndeg 20 009",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "fraudes trans electro art 7deg inciso final ley ndeg 20009",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "fraudulenta atrib de la calidad de indigena art 5 l 19253",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "fraudulenta atribucion calidad de indigena art 5 ley 19 253",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "fraudulenta atribucion calidad de indigena art5 ley 19253",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "ganado que entra a predio ajeno causando danos",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "giro dol cheq cuent cerr ac penal priv art 22 dfl 707",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "giro dol cheq fal fond ac penal priv art 22 dfl 707",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "giro doloso cheques cuenta cerrada art 22 dfl 707",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "giro doloso cheques falta fondos art 22 dfl 707",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "giro doloso de cheques",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "giro doloso de cheques a p publica art 42 d f l n 707 cuentas corrientes bancarias y cheques",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "giro doloso de cheques ac penal p uuml blica art 42 dfl 707",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "giro doloso de cheques ac penal publica art 42 dfl 707",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "giro doloso de cheques ac penal publica art 42 dfl 707",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "giro doloso de cheques art 22 dfl 707",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "giro doloso de cheques cuenta cerrada a p privada art 22 d f l n 707 cuentas corrientes bancarias y cheques",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "giro doloso de cheques falta de fondos a p privada art 22 d f l n 707 cuentas corrientes bancarias y cheques",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "giro doloso de cheques solo crimen",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "hallazgo de drogas",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "hallazgo de vehiculo",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "hechos de relevancia criminal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "homicidio",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "homicidio art 391 n 2 codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "homicidio calificado",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "homicidio calificado art 391 n 1",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "homicidio de fiscales o defensores en desempeno de funciones",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "homicidio de gendarme en el desempeno de sus funciones",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "homicidio en rina o pelea",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "homicidio fiscal defensor en desemp de func art 268 ter",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "homicidio funcionario ffaa desempeno funciones 281 bis cjm",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "homicidio gendarme desempeno funciones art 15 dl 2859",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "homicidio simple",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "hurto agravado art 447 codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "hurto con ocasion de calamidad o alteracion al orden publico",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "hurto de bienes pertenecientes a redes de suministro publico",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "hurto de hallazgo",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "hurto en ocasion de calamidad o alteracion al orden publico",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "hurto en ocasion de calamidad o alteracion al orden publico",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "hurto falta 494 bis codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "hurto falta art 494 bis codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "hurto simple",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "hurto simple por un valor de 4 a 40 utm",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "hurto simple por un valor de 4 a 40 utm arts 432 y 446 n 2 codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "hurto simple por un valor de media a 4 utm",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "hurto simple por un valor de media a menos de 4 utm",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "hurto simple por un valor de media a menos de 4 utm arts 432 y 446 n 3 codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "hurto simple por un valor sobre 40 utm",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "hurto simple por un valor sobre 40 utm arts 432 y 446 n 1 codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "hurto solo crimen",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "impedir acceso a playas art 13 inc final ley 21 149",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "impedir acceso a playas ley 21 149",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "impedir acceso a playas ley 21149",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "impedir ejer de func a insp munic art 496 n 3 c penal",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "impedir ejerc de func a inspectores municip art 496 n0 3 cp",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "incend cosas valr inf 4 suelds vitls arts 478 cod penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "incendio",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "incendio c peligro para las personas arts 475 y 476 n01 y 2",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "incendio con peligro para las personas 475 y 476 n 1 y 2",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "incendio con peligro para las personas art 475 y art 476",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "incendio con resultado de muerte y o lesiones",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "incendio con resultado de muerte yo lesiones",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "incendio cpeligro para las personas arts475 y 476 n01 y 2",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "incendio de bosques art 476",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "incendio de bosques art 476 n 3 y 4",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "incendio solo c danos o sin peligro propagacion art 477 478",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "incendio solo c danos o sin peligro",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "incendio solo c danos o sin peligro propagacion art 477 478",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "incendio solo cdanos o sin peligro propagacionart477478",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "incendio solo con danos a terceros arts 477 codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "incendio solo con danos o sin peligro de prop art 477 y 478",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "incendio y otros estragos",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "incesto",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "incitacion terrorista art 12 ley 21732",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "incump reiterado pago pension aliment art 14 bis ley 20066",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "incumplimiento malicioso en pago de pensiones alimenticias",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "incumplimiento reserva registro de llamadas art 218 ter cpp",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "inducir a un menor a abandonar el hogar",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "inducir permitir facilitar ocultar infrac der autor conexos",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "inducir permitir u ocultar infracc der de autor art 81 ter",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "inducirpermitirfacilitarocultar infracder autorconexos",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "inf c aero 133 g 190 194 bis 195 a 198 200 ley 18 916",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infanticidio",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infidelidad en la custodia de documentos",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infidelidad en la custodia de documentos arts 242 243 244",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infr cod aeron art 133g 190 194bis 195a 198 200 ley18916",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infr cod aeron art 133g 190 194bis195a 198 200 ley18916",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infrac a la ley 21075 sobre el mal uso de aguas grises",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infrac a la seg soc dl3500 y 869 ls 18020 18469 18933 19728",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infrac a reglamento de carruajes pub o de part 496 n 14 cp",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infrac en prestacion salud art 168 174 inc final ds 1 salud",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infrac en utiliz de gas como comb en veh l18502 mod 20052",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infrac inversion extran directa en chile ley 20 848",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infrac inversion extran directa en chile ley 20848",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infrac ley 18 287 sobre jdo polic local art 22 quater",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infrac ley 18287 sobre jdo policlocal art 22 quater",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infrac ley 19 496 protec consumidor art 54 o y 59 ter",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infrac ley 19496protecconsumidor art 54 o y 59 ter",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infrac ley 21086 que perfecciona benefic otorgados bomberos",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infrac ley 21086 que perfecciona beneficotorgados bomberos",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infrac ley de administ prov de sost educ ley 20 800",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infrac ley de administ prov de sost educ ley 20800",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infrac ley gral telecom art letras a b c y d excl letra e",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infrac ley gral telecom letras a b c d f g y h excl let e",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infrac ley gral telecomartletras abc y d exclletra e",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infrac ley mdo de valores arts 59 60 61 y 62 ley 18045",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infrac ley org constitucional sobre votac populares y escrut",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infrac ley organica constit sobre votaciones ley 18 700",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infrac ley organica constit sobre votaciones ley 18700",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infrac ley organica electoral arts 54 57 y 77 ley 18 556",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infrac ley organica electoral arts 5457 y 77 ley 18556",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infrac loc inscrip elect y servel art 54 55 56 57 y 77",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infrac progr garants apyo endeudnto art5 trans ley21 543",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infrac servid publc divlg inform rsvda art 82 ley 21 659",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infrac sistema de aseg calidadad educ ley 20 845",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infrac sistema de aseg calidadad educ ley 20845",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infracc ley 19220 establecimiento de bolsas p agropecuarios",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infraccion a la ley 11 564 de mataderos clandestinos",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infraccion a la ley 11564 de mataderos clandestinos",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infraccion a la ley electoral",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infraccion a la ley electoral art 128 al 141",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infraccion a la ley mercado de valores arts 59 y 60 ley",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "infraccion a la ley n 16 643 de abusos de publicidad",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infraccion a la ley sobre genoma humano arts 17 a 19 l 20120",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infraccion a ley 11 564 de mataderos clandestinos",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infraccion a ley 11564 de mataderos clandestinos",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infraccion a otros textos legales",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infraccion a reglamento de carruajes publicos o particulares",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infraccion a reglamento de carruajes publicos o particulares",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infraccion al art 9 del decreto ley 2 695",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infraccion al art 9 del decreto ley 2695",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infraccion al deber de informacion de la ley 19 913",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infraccion al deber de informacion de la ley 19 913 art6",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infraccion al deber de informacion de la ley 19913",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infraccion al deber de reserva art 36 ley 21 663",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infraccion al estatuto de capac y empleo art 76 y 81 l 19518",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infraccion al estatuto de capacitacion y empleo art 76 y 81",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infraccion al estatuto de capacitacion y empleo art76 y 81",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infraccion articulo 454",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infraccion articulo 454 c penal",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infraccion articulo 454 cpenal",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infraccion articulo 74 bis b del c p p secreto sumario",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infraccion contaminacion art 136 ley 18 892 de pesca",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infraccion en el otorgamiento prestaciones de isapre art 23",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infraccion en el otorgamiento prestaciones de isapre art 23 no aparecen en sistema las causas de este item",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infraccion en el otorgamiento prestaciones de isapre art23",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infraccion l 21063 crea seguro para acompanar ninos enfermos",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infraccion l o c del banco central",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infraccion l18 287 sobre juzg pcia local art 22 quat l18287",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infraccion l21086 perfecciona los benef otorgados a bomberos",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infraccion ley 11 564 de mataderos clandestinos art 1",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infraccion ley 18 175 de quiebras",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infraccion ley 18 892 de pesca",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infraccion ley 18 892 de pesca art 135 al 139",
    "riesgoG66": "BAJO",
    "valor": 0.5,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "infraccion ley 18175 de quiebras",
    "riesgoG66": "ALTO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infraccion ley 18892 de pesca",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infraccion ley de quiebras art 218 al 221",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infraccion ley gral de telecomunicaciones art 36 b",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infraccion normas inhumaciones y exhumaciones",
    "riesgoG66": "MEDIO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infraccion normas inhumaciones y exhumaciones art 320 y 322",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infraccion ordenanza aduanas fraude y contrabando",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "infraccion ordenanza aduanas fraude y contrabando art 176",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "infraccion por contaminacion art 136 ley 18 892 de pesca",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infraccion por contaminacion art136 ley 18892 de pesca",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infraccion secreto tecnicas especiales inv 226 j o y t cpp",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infracciones a la ley 19132 sobre tvn art 9 ley 19 132",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infracciones a la ley 19132 sobre tvn art 9 ley 19132",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infracciones a la ley 21075 sobre mal uso de aguas grises",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infracciones a la ley 21770 sobre autorizaciones sectoriales",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infracciones a la ley de identidad de genero",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infracciones a la ley de portabilidad financiera",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infracciones a la ley de seg nuclear art 41 a 47 ley 18302",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infracciones a la ley de seguridad nuclear art 41 a 47 ley",
    "riesgoG66": "ALTO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infracciones a la ley organica constitucional sobre votacion",
    "riesgoG66": "MEDIO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infracciones a la seguridad social",
    "riesgoG66": "MEDIO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infracciones a ley educ superior art 30 y 78 ley 21 091",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infracciones al cod aeronautico arts 190 194 bis 195 a",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infracciones codigo aeronautico arts 133 g 190 194 bis 195 a 198 y 200 ley 18 916 codigo aeronautico",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infracciones inversion extranjera directa en chile ley 20848",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infracciones ley 19 496 prot al consumidor art 54 o y 59 ter",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infracciones tributarias contempladas en otras leyes",
    "riesgoG66": "MEDIO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infraccionporcontaminacion art 136 ley 18 892 de pesca",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infraccisn normas inhumaciones y exhumaciones arts 320 y 322",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infringir ley admin sostenedor educacional ley 20800 art 30",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infringir normas higienicas y de salubridad",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infringir normas higienicas y de salubridad art 318",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infringir normas higienicas y de salubridad art 318 codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "infringir sist aseguramiento cal edu ley 20845 art 54 bis",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "ingreso de celulares tecnologia a carceles art 304 bis",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "ingreso de celularestecnologia a carceles art 304 bis",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "ingreso ileg apar de comunic y tecn cent penit 304 bis",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "injuria a traves de medios de difusion accion privada",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "injuria accion privada",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "injuria accion privada art 416 al 420",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "injuria arts 416 al 420 codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "injurias y calumnias por medios de comunicacion social",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "injurias y calumnias por medios de comunicacion social art 29 ley 19 733 libertad de opinion",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "insolvencia punible alzamiento de bienes",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "instal indeb senales de tran o barreras art 196 a1 ley 18290",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "instalacion indebida de senales del transito o barreras art",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "intento de suicidio",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "interceptacion ilicita art 3 ley 21 459",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "interrumpir libre circulacion ley 21208 inc 1",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "interrupcion de serv electrico art 134 dfl 1 1982 ley",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "interrupcion serv elect art 134 dfl 1 1982 ley serv elec",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "inutilizacion dispos monitoreo telem art 23 s inc1 ley18216",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "inutilizacion dispos monitoreo telemart 23 sinc1ley18216",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "inutilizar disposit monitoreo telemat art 23 sexies l18216",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "invasion de derechos ajenos art 459 codigo penal",
    "riesgoG66": "BAJO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "invasion del giro bancario art 39",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "invasion del giro bancario art 39 ley general de bancos",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "invasion del giro bancario art 39 ley general de bancos",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "lanzar a persona vehiculo objeto apto producir lesion muerte",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "lanzar obj a via pub con muerte o lesiones ley 21208 inc 2",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "lavado de dinero",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "lavado de dinero persona juridica art 27 ley 19 913",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "lavado de dinero persona juridica art 27 ley 19913",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "lavado de dinero persona natural art 27 ley 19 913",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "lavado de dinero persona natural art 27 ley 19 913 lavado y blanqueo de activos",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "lavado de dinero persona natural art 27 ley 19913",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "lesion amenaza fiscalizador transp pub art196octies ltransit",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "lesiones contra prof y func salud y manipuladores alimento",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "lesiones corporales",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "lesiones dano con motivo de espectaculo de futbol prof",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "lesiones grav y men grav miembros de bomberos art 400 inc 3",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "lesiones graves",
    "riesgoG66": "BAJO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "lesiones graves art 397 n 2 codigo penal",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "lesiones graves gravisimas art 397 n 1",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "lesiones graves gravisimas art 397 no 1",
    "riesgoG66": "BAJO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "lesiones graves gravisimas art 397 nro 1",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "lesiones leves",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "lesiones leves 494 n 5 codigo penal",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "lesiones leves 494 n5 codigo penal",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "lesiones leves 494 ndeg5 codigo penal",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "lesiones leves art 494 n 5",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "lesiones menos graves",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "lesiones menos graves art 399 codigo penal",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "lesiones o danos en futbol profesional art 12 inc 1 19327",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "lesiones prof y funcio salud y manipula de alimentos",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "ley 19 223 delitos informaticos",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "ley 19 366 trafico ilicito de estupefacientes y sustancias",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "ley de cuentas corrientes bancarias y cheques",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "ley general de bancos d f l n 2 de 1960",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "ley n 16 643 abusos de publicidad",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "ley n 17 336 de propiedad intelectual",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "ley n 18 314 de conductas terroristas",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "ley n 18314 de conductas terroristas",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "ley n 19 039 de propiedad y privilegios industriales",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "ley responsabilidad penal personas juridicas ley 20393",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "leyes de control de armas ley 17 798 ley 21 250",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "libertad de culto",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "libro i titulo iv quebrantamiento de sentencias y los qu",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "libro ii tit ix crimenes y simples delitos contra la prop",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "libro ii tit x de los cuasidelitos",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "libro ii titulo iii crimenes y simples delitos que afectan",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "libro ii titulo iv crimenes y simples delitos contra la fe",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "libro ii titulo v crimenes y simples delitos cometidos por",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "libro ii titulo vi crimenes y simples delitos contra el or",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "libro ii titulo vii crimenes y simples delitos contra el o",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "libro ii titulo viii crimenes y simples delitos contra la",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "loteos irregulares art 138 dfl 458 1975 ley general de u",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "loteos irregulares art 138 dfl 458 1975 ley gral urb y con",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "loteria ilegal casa juego y prestamo prenda arts 275 al 283",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "loteria ilegal casas de juego y prestam sobre prenda",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "mal uso de fondos fiscales financiamiento partido politico",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "mal uso de fondos fiscales para financiamiento de p politico",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "mal uso fondos fiscales art 30 dfl 3 de 2017 ley 19 884",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "mal uso fondos fiscales art 30 dfl 3 de 2017ley 19884",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "mal uso info medios tecno transp pub art196septies ltransit",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "mal uso inform med tec transp pub art 196 septies ley trans",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "mal uso informmedtectransppubart196 septies ley trans",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "maltrato animal",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "maltrato comet p pers c deber cuid art 403 bis inc fin",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "maltrato comet ppers cdebercuid art 403 bis inc fin",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "maltrato cometido por garante art 403 bis inc final",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "maltrato corp menor o personas vul art 403 bis inc 1",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "maltrato corp menor o personas vul art 403 bis inc 1deg",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "maltrato corporal a menores o personas vulnerables art 403 bis inc 1 codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "maltrato corporal a personas vulnerables art 403 bis inc 1",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "maltrato de obra a carabineros art 416 bis codigo de justicia militar",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "maltrato de obra a gendarme en el desempeno de sus funciones",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "maltrato de obra a personal de bomberos art 400 inc 3o",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "maltrato de obra carabineros art 416 bis cjm",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "maltrato de obra func ffaa desempeno funciones 281 ter cjm",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "maltrato de obra personal investigaciones con o sin lesiones",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "maltrato habitual vif art 14 ley 20 066",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "maltrato habitual vif art 14 ley 20 066 violencia intrafamiliar",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "maltrato habitual vif art 14 ley 20066",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "maltrato habitual violencia intrafamiliar art 14",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "maltrato habitual violencia intrafamiliar art 14 ley 20066",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "maltrato habitualviolencia intrafamiliar art 14",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "maltrato obra a carabineros art 416 bis codigo just militar",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "maltrato obra a carabineros art 416 bis codigo justmilitar",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "maltrato obra a fiscales o defensores en desempeno funciones",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "maltrato obra fiscal defensor en desemp de func art 268",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "maltrato obra gendarme desemp funciones 15 b y c dl 2859",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "maltrato obra pers pdi con o sin lesiones 17 bis dl 2460",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "malversacion de caudales publicos",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "malversacion de caudales publicos arts 233 234 235 y 236",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "malversacion de caudales publicosarts233 234 235 y 236",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "malversacion defraudacion e incendio por menos de 1 utm",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "malversaciondefraudacion e incendio por menos de 1 utm",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "manejo en estado de ebriedad solo crimen",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "manejo en estado de ebriedad solo crimen",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "march sit suc sin prest aux victima art 195 inc 2 y 3",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "march sit suc sin prest aux victima art 195 inc 2 y 3",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "march sit suc sin prest aux victima art 195 inc 2deg y 3deg",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "march sitsuc sin prest aux victima art 195 inc 2 y 3",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "march sitsuc sin prest aux victima art 195 inc 2 y 3",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "marcharse sitio suceso s auxiliar victima art 195 inc 2 y 3",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "matar a carabinero en ejercicio de funciones art 416 cjm",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "matar a carabinero por su cargo o ejercicio func 416 cjm",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "matar carabinero en ejercicio de funciones justicia militar",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "microtrafico trafico de pequenas cantid art 4 ley 20000",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "microtrafico trafico de pequenas cantidades art 4 ley 20 000 trafico estupefacientes y sustancias sicotropicas",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "muertes y hallazgo de cadaver",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "mutilacion",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "negativa a efectuarse examen art 195 bis ley 18 290 del transito",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "negativa a efectuarse examen art 195 bis ley de transito",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "negativa a efectuarse examen art 195 bis leyde transito",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "negativa a efectuarse examen art 195 ley de transito",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "negativa injustificada a entregar copia art 28 y 29",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "negativa injustificada alcoholemia",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "negligencia medica",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "negociacion incompatible",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "negociacion incompatible art 240 n 1",
    "riesgoG66": "BAJO",
    "valor": 0.5,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "negociacion incompatible de particulares art 240 n 2 al 7",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "negociacion incompatible por persona juridica art 240",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "no dar cuenta de accidente de transito art 195 ley 18 290 del transito",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "no dar cuenta de accidente de transito art 96 d 1 ley 18290",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "no dar cuenta de accidente de transitoart 195ley de tra",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "no definido",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "no inf domicilio por delitos sexuales nna art 372",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "no inf domicilio por delitos sexuales nna art372",
    "riesgoG66": "MEDIO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "no informar domicilio por delitos sexuales nna art 372",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "nombramientos ilegales",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "obstrc invstg pr fiscal o asist fisc min public art269 ter",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "obstruc justicia p fiscal o asist fiscal ministerio publico",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "obstruccion a la investigacion",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "obstruccion a la investigacion art 269 bis y 269 ter",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "obstruccion a la justicia con ocasion de tratamiento de adn",
    "riesgoG66": "MEDIO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "obstruccion o infrac ley de violencia en los estadios",
    "riesgoG66": "MEDIO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "obstrucjusticia pfiscal o asistfiscalministerio publico",
    "riesgoG66": "BAJO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "obstruir invest ley violencia estadio art 3 bis inc 3 19327",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "obten mali restit fonds operac reclmd art 7 b ley20 009",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "obtencion de servicios sexuales de menores",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "obtencion declaraciones forzadas",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "obtencion declaraciones forzadas art 19 dl 2460 ley org inv",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "obtencion fraud ben trib o bonos pymes ley 21 353 y 21 354",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "obtencion fraudulenta beneficios covid 19",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "obtencion fraudulenta beneficios covid 19",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "obtencion fraudulenta de beneficios art 12 ley 21 252",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "obtencion fraudulenta de beneficios art 12 ley 21252",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "obtencion fraudulenta de beneficios art 16 ley 21 247",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "obtencion fraudulenta de beneficios art 16 ley 21247",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "obtencion fraudulenta de beneficios art 6 ley 21 256",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "obtencion fraudulenta de beneficios art 6 ley 21256",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "obtencion fraudulenta de creditos",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "obtencion fraudulenta de creditos art 160 d f l n 3 ley general de bancos",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "obtencion fraudulenta de creditos art 160 dfl 252 de 1960",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "obtencion ilegal de la entrega en adopcion de nna ley 21 760",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "obtencion indebida devol impuesto art 97 n 4 inc 3 cod tribu",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "obtencion indebida devol impuestos 97 n 4 inc 3 cod trib",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "obtencion indebida devolimpuestoart 97 n4inc3codtribu",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "obtencion realizacion accion sexual menor 18 367 ter",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "ocult ident en control prevent art 496 n 5 y 12 ley 20931",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "ocultacion de ident en control invest art 496 n05 art 85 cpp",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "ocultacion de identidad 496 n 5 codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "ocultacion de identidad 496 nr 5 codigo penal",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "ocultacion de identidad control preventivo art 496 n 5",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "ocultacion de identidad en control investigativo arts 496 n 5 codigo penal y 85 codigo procedimiento penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "ocultacion de identidad en control preventivo art 496 n 5 codigo penal y art 12 ley 20 931 aplicacion de penas",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "ocultacion ident en control investigativo 496 n 5 y 85 cpp",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "ocultacion o entr de info falsa a fne art 39 h d l 211",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "ocultacion o entrega de info falsa a fne art 39 h d l 211",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "ocultacion o entrega de infofalsa a fneart39 h dl 211",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "ocultamiento de placa patente art 192 letra e",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "ofensas al pudor 495 n 5 codigo penal",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "ofensas al pudor 495 nr 5 codigo penal",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "omision de denunciar por func publico ley 20 000 art 13",
    "riesgoG66": "BAJO",
    "valor": 0.5,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "omision de denunciar por func publico ley 20000 art13",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "omision de denunciar por funcionario pub ley 20 000 art 13",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "omision denuncia fun pbco tenen elem tec art 304 ter cp",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "oponerse a accion de la autoridad publica o sus agentes",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "oponerse a la accion de la autoridad publica o sus agentes",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "org pertenecer finan o colaborar milicias priv art 8",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "organizar carreras no autorizadas art 197 ter inc7",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "organizar carreras no autorizadas art 197 terinc7",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "organizar pertenec financ colab c milicias privadas art 8",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otorg irregular de doctos art 196 a ley 18 290 trans",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otorgamiento certif sobre alcoholes toxicos art 44 ley18455",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otorgamiento de patentes de alcoholes",
    "riesgoG66": "BAJO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otorgamiento irregular de documentos art 190 ley de transit",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otras faltas a la ley 19 366",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otras faltas codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otras faltas contra la ley de alcoholes",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otras faltas leyes especiales",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otras faltas y delitos de la ley 19 733",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otras faltas y delitos de la ley 19733",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otras faltas y delitos libertad de opinion ley 19 733 libertad de opinion",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otras infrac a la ordenanza aduanas ley 20 780",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "otras infrac a la ordenanza aduanas ley 20780",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "otras infraccion ley 18 892 de pesca",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otras infracciones a la ley 19 913",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otras infracciones a la ley del banco central",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otras infracciones a la ordenanza aduanas ley 20 780",
    "riesgoG66": "BAJO",
    "valor": 0.5,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "otras infracciones al codigo justicia militar",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otras infracciones al csdigo de justicia militar",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otras infracciones contra la ley de alcoholes",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otras infracciones ley 18 892 de pesca",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otras infracciones ley 18892 de pesca",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otros abusos contra particulares",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otros abusos contra particulares art 256 257 258 259",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otros de los cuasidelitos",
    "riesgoG66": "MEDIO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otros del c orden familia moralidad p integridad sexual",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otros del ley 19 327 sobre viol en los estadios",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otros del ley 19 327 sobre viol en los estadios lesiones prof y funcio salud y manipula de alimentos",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otros del ley 19 327 sobre viol en los estadios pueden ser con o sin violencia",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otros del ley 19327 sobre viol en los estadios",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otros delit comet por emp public en el desem de sus cargos",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otros delit comet por emp publicen el desem de sus cargos",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otros delit contra la fe pub falsific falso testim y perj",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otros delit contra orden de flias mora pub integr sexual",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otros delit contra orden y seg public comet por particul",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otros delit que afectan los dchos garant por la constituc",
    "riesgoG66": "BAJO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otros delit que afectan los dchos garant por la constituc tambien aca hay varios delitos incluida violacion de morada segun los ejemplos",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otros delitos c fe publica falsific falso test y perjurio",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otros delitos c orden y seguridad p cometidos particulares",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otros delitos contemplados en la ley n 17 798",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otros delitos contemplados en ley de propiedad intelectual",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otros delitos contra la ley de alcoholes",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otros delitos contra la ley de propiedad intelectual",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otros delitos contra la ley del transito",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otros delitos contra la propiedad",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otros delitos contra las personas",
    "riesgoG66": "BAJO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otros delitos contra ley 18 290 del transito",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otros delitos contra ley de propiedad industrial",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otros delitos de la ley 20 000",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "otros delitos de la ley 20000",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "otros delitos de la ley de control de armas ley 17 798",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otros delitos de la ley de control de armas ley 17798",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otros delitos del codigo tributario",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otros delitos dfl 252 de 1960 art 110 141 y 142 157 159",
    "riesgoG66": "BAJO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otros delitos dl 211",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otros delitos empleados publicos en desempeno de sus cargos",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otros delitos l o c de investigaciones",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otros delitos ley 16 643 sobre abusos de publicidad",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otros delitos ley 17 336 propiedad intelectual",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otros delitos ley 19 039 propiedad y privilegios industriales",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otros delitos ley 19 327 sobre violencia en los estadios",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otros delitos ley 20 000 trafico estupefacientes y sustancias sicotropicas",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "otros delitos ley de cuentas corrientes bancarias y cheque",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otros delitos ley general de bancos",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "otros delitos ley organica de investigaciones",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otros delitos loc de investigaciones",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otros delitos que afectan d s garantidos por la constitucion",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otros estragos",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otros fraudes informaticos art 7 ley 21 459",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otros fraudes informaticos art 7 ley 21459",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otros hechos",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otros hechos que no constituyan delito agrup 1008 1009 1011",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otros hechos que no constituyan delito agrup100810091011",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otros hechos que no constituyan delito codigo agrupador 01008 01009 1011 hecho de relevancia criminal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "otros ley 18 314",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "otros que no dan motivo a ingreso de sumario",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "pago de remun despropor inferior al imm art 472 bis cp",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "parricidio",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "parricidio art 390 inc 1",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "peleas de animales como espectaculo art 11 de la ley 21 020",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "peleas de animales como espectaculo art 11 de la ley 2120",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "peleas de animales como espectaculo art 11 ley 21 020",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "peleas de animales como espectaculo art11 de la ley 21020",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "peleas de animales como espectaculo art11 de la ley 2120",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "percepcion ilegal pension garant universal art 20 ley 21419",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "percepcion indebida subsidio covid 19 art 8 ley 21423",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "perro potenc pelig no inscrito art 16 de la ley 21 020",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "perro potenc pelig no inscrito art 16 de la ley 2120",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "perro potenc pelig no inscrito art16 de la ley 21020",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "perro potenc pelig no inscrito art16 de la ley 2120",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "perro potencialmente peligroso no inscrito art 16 ley 21 020",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "pesca ilegal 135 136 ter 139 139 bis 139 ter ley 18 892",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "pesca ilegal art 139 139 bis y 139 ter ley 18 892 de pesca",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "pesca ilegal art139139 bis y 139 ter ley 18892 de pesca",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "pesca ilegal arts 135 136ter 139 139bis 139ter ley 18892",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "portar aparatos de comunic en recinto penit art 304 ter cp",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "portar elemento conocidamente destinados cometer delito robo",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "portar elementos conocidamente destinados a cometer delito d",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "portar elementos conocidamente destinados a cometer delito de robo art 445 codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "portar elementos para provocar incencio o estragos art 481",
    "riesgoG66": "BAJO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "portar elementos para provocar incendio o estragos art 481",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "portar injustif combust en lug uso pbco art 288 ter cp",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "porte arma gue quimica biolo nuclear art 14 inc 2",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "porte arma gue quimica biolo nuclear art 14 inc 2deg",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "porte arma guerra quimica biologica nuclear art 14 inc 2",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "porte de arma cortante o punzante 288 bis",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "porte de arma cortante o punzante art 288 bis codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "porte de arma prohibida art 14 inc 1",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "porte de arma prohibida art 14 inc 1 ley 17 798 control de armas",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "porte de arma prohibida art 14 inc 1deg",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "porte de armas prohibidas art 14",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "porte de drogas art 41",
    "riesgoG66": "BAJO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "porte ilegal de arma de fuego munic y otr sujetas a control",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "porte ilegal de arma de fuego municiones y otros sujetas a",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "porte ilegal de arma de fuego municiones y otros sujetas a control art 11 ley n 17 798",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "porte posesion o tenencia arma guerra quim biol o nucl",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "pose tenencia arma guerr quim biolo o nuc art 13 inc 1",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "pose tenencia arma guerr quim biolo o nuc art 13 inc 1deg",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "posesion de fuegos artificiales art 9 inc final ley 21 310 control de armas",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "posesion fuegos artificiales art 9 inc final ley 17 798",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "posesion fuegos artificiales art 9 inc final ley 21 310",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "posesion fuegos artificiales art 9 inc final ley 21310",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "posesion o tenencia de armas prohibidas",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "posesion o tenencia de armas prohibidas art 13 inc 1 ley 17 798 control de armas",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "posesion o tenencia ilegitima madera art 448 octies inc1",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "posesion tenencia o porte de armas sujetas a control",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "posesion tenencia o porte de armas sujetas a control art 9 inc 1 ley 17 798 control de armas",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "posesion tenencia o porte de mun y sust quimicas",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "posesion tenencia o porte de municiones y sustancias quimicas art 9 inc 2 ley 17 798 control de armas",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "posesion tenencia porte armas art 9 inc 1 ley 17779",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "posesion tenencia porte de munic y sust quim art 9 inc 2",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "pres peritos test o inter que faltaren a verd o doc falsos",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "prescrip medica abusiva drogas estupef o sicotrop art 6",
    "riesgoG66": "BAJO",
    "valor": 0.5,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "prescrip medica abusiva drogas estupef osicotrop art 6",
    "riesgoG66": "BAJO",
    "valor": 0.5,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "prescripcion medica abusiva de drogas estupef o sicotropicas",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "prescripmedica abusiva drogas estupefo sicotropart6",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "presentacion de peritos testigos o interpretes que faltaren",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "presentacion de peritostestigos o interpretes que faltaren",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "presunta desgracia",
    "riesgoG66": "MEDIO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "presunta desgracia infantil",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "prevaricacion del abogado y procurador arts 231 y 232",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "prevaricacion del abogado y procuradorarts 231 y 232",
    "riesgoG66": "MEDIO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "prevaricacion judicial y administrativa art 223 al 229",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "produc y trafico por desvio de precursores art 2 ley 20 000",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "produccion mat porn utilizando menor 18 367 quater inc 2",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "produccion material pornografico utilizando menor de 18 anos",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "produccion material pornografico utilizando menores 18 anos",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "produccion y trafico por desvio de precurs art 2 ley 20000",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "produccion y trafico por desvio de precursores art 2 ley 20",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "profugo de la justicia",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "profugo de la justicia asociacion ilicita",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "profugo de la justicia asociacion ilicita",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "profugo de la justicia homicidio",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "profugo de la justicia hurto de material de guerra",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "profugo de la justicia infraccion a la ley 17 798 de armas",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "profugo de la justicia infraccion a la ley 17798 de armas",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "profugo de la justicia infraccion a la ley 18 314 antiterrorista",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "profugo de la justicia infraccion a la ley 18314 antiterrorista",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "profugo de la justicia infraccion a la ley de armas",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "profugo de la justicia infraccion a la ley de armas",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "profugo de la justicia lesiones graves",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "profugo de la justicia maltrato de obra a carabineros",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "profugo de la justicia orden de detencion pendiente",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "profugo de la justicia orden de detencion pendiente",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "profugo de la justicia robo con intimidacion",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "profugo de la justicia secuestro",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "prolongacion de incomunicacion",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "prom o facil entr o sal de perso del pais para prostituci",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "promover o facilitar entrada o salida del pais para prostit",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "promover o facilitar explotacion sexual menor 18 art 367",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "propag de enfermed que afecten la salud animal o vegetal",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "propagacion art 477 478",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "propagar contagio a sabiendas",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "propagar contagio a sabiendas art 318 bis",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "propagar enferm animal vegetal o elementos quim y otros",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "proveer o recolec fondos com del terro art 10 ley 21732",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "quebrantamiento",
    "riesgoG66": "BAJO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "quebrantamiento art 90",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "quebrantamiento art 90 codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "rapto",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "rec aduan infrac orden de aduanas art 182 ley 20780",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "recaud proveer fondo comis del terror pers nat art8ley18314",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "recauda provee fondos para terroristas por p jca art8 l18134",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "recauda provee fondos para terroristas por p nat art8 l18134",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "recaudproveer fondo comisdelterrorpersnatart8ley18314",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "receptacion aduanera infrac ordza aduanas art 182 ley 20780",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "receptacion art 456 bis a",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "receptacion art 456 bis a codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "receptacion cometida por persona juridica art 456 bis a",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "receptacion de datos informaticos art 6 ley 21 459",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "receptacion de vehiculos motorizados",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "receptacion de vehiculos motorizados art 456 bis a inc 4 codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "receta innecesaria de drogas",
    "riesgoG66": "BAJO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "reclamo",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "reclamo de clausura",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "reconocimiento malicioso de posesion reg art 9 dec ley 2695",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "registro de las actuaciones policiales art 228 bis c p p",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "remisos reclutamiento art 73 d l n 2 306 reclutamiento y movilizacion",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "remisos reclutamiento dl 2306 art 73",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "rendicion falsa de cuenta electoral",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "rendicion falsa de cuenta electoral",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "rendicion falsa de cuenta electoral art 31 dfl 3 ley 19884",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "rev secreto sist busq personas desap ley 21 500 art 12",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "revelacion info monitoreo telemat art 23quinquies l18216",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "revelacion secreto auditorias defensoria de las victimas",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "revelar aprovechar secretos comerc art 284 al 284 quater",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "revelar inf obt aplic monitoreo telem art23 q inc3 ley18216",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "revelar inf obtaplicmonitoreo telemart23 qinc3ley18216",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "rina publica 496 n 10 codigo penal",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "rina publica 496 no 10 codigo penal",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "rina publica 496 n 10 codigo penal",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "rina publica art 496 n 10 codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "robo calificado",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "robo con castracion mutilacion o lesiones graves gravisimas",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "robo con fuerza de cajeros automaticos",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "robo con fuerza de cajeros automaticos art 443 bis codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "robo con fuerza en las cosas",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "robo con homicidio",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "robo con intimidacion",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "robo con intimidacion art 433 436 inc 1",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "robo con intimidacion arts 433 436 inc 1 y 438 codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "robo con lesiones graves gravisimas art 433 n 2",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "robo con ocasion de calamidad o alteracion al orden publico",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "robo con ret de victimas o lesiones graves art 433 n 3",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "robo con retencion de victimas o con lesiones graves",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "robo con retencion de victimas o lesiones graves art 433 n 3",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "robo con retencion de victimas o lesiones graves art433 n3",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "robo con violacion",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "robo con violacion art 433 n 1",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "robo con violencia",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "robo con violencia art 433 436 inc 1 438 y 439",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "robo con violencia art 436 inc 1 433 438 439",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "robo con violencia art 436 inc 1 433 439",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "robo con violencia art 436 inc 1o 433 438 439",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "robo con violencia art433 436 inc 1 438 y 439",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "robo con violencia art436 inc 1o 433 438 439",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "robo con violencia arts 436 inc 1 433 438 y 439 codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "robo con violencia intimidacion de vehiculo motorizado",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "robo de vehiculo motorizado",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "robo de vehiculo motorizado art 443 inc 2",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "robo de vehiculo utilizando elementos distractivos",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "robo en bienes nac de uso pub o sitios no destinados a hab",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "robo en bienes nacionales de uso publico o sitios no destinados a habitacion art 443 codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "robo en bienes nacionales de uso publico o sitiosno destin",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "robo en lugar habitado o destinado a la habitacion",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "robo en lugar habitado o destinado a la habitacion art 440",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "robo en lugar habitado o destinado a la habitacion art 440 codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "robo en lugar no habitado",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "robo en lugar no habitado art 442",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "robo en lugar no habitado art 442 codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "robo en ocasion de calamidad o alteracion al orden publico",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "robo o hurto de material de guerra",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "robo por sorpresa",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "robo por sorpresa art 436 inc 2",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "robo por sorpresa art 436 inc 2 codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "robo solo crimen",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "robo vehic motorizado por sorpresa violencia o intimid",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "rotura de sellos",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "rotura de sellos arts 270 y 271",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "ruidos molestos 495 nr 1 codigo penal",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "sabotaje informatico",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "sabotaje informatico arts 1 y 3 ley 19 223",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "saqueo",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "se contemplan delitos relacionados con el transito vehicular terrestre y aereo",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "secuestro",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "secuestro art 141 inc 1 y 2",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "secuestro con homicidio art 141 inc final",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "secuestro con homicidio violacion o les art 141 inc final",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "secuestro con lesiones art 141 inc final",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "secuestro con violacion art 141 inc final",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "secuestro exig rescate o se prolongue mas 24 hrs 141 inc 3",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "secuestro mas 15 dias o grave dano persona 141 inc 4",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "soborno art 250 persona juridica",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "soborno art 250 persona natural",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "soborno de func pbco extranj persona natural art 251 bis",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "soborno de func pub extranj persona juridica art 251 bis",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "soborno func publico extranjero persona natural art 251 bis",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "soborno func publico extranjeropersona natural art251 bis",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "sobornoart 250 persona juridica",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "sobrepasar 60 km h limites velocidad maxima art 197 quinq",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "sodomia art 365",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "suic fem induc suic y o suic fem arts 393 bis 390 sex ter cp",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "suministro de hidrocarburos aromaticos a menores art 5",
    "riesgoG66": "BAJO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "suministro estupef sin consentimiento art 5 ley 20 000",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "suministro hidrocarburos menores art 5 bis ley 20 000",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "suministro indebido de drogas art 7 ley n 20 000",
    "riesgoG66": "BAJO",
    "valor": 0.5,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "suministro indebido de drogas art7 ley n 20000",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "superar limites fijados de velocidad max art 197 quinquies",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "superar limites fijados de velocidad max art 197 quinquies",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "sust de madera art 448 septies inc 1 y 448 octies inc 1",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "sust mad pj 448 sept inc 1 y 448 oct inc 1 1 20 393",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "sustr ruptura redes comerc esp cult 137 bis ley pesca",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "sustraccion de madera art 448 sept inc 1 y octies inc 1",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "sustraccion de menores",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "sustraccion de menores art 142",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "sustraccion de menores art 142 codigo penal",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "tacha falsa de firma autentica",
    "riesgoG66": "BAJO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "tacha falsa de firma autentica art 43 d l 707",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "tacha falsa de firma autentica art 43 dfl 707",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "tacha falsa firma auten ac penal publica art 43 d l 707",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "tacha falsa firma auten ac penal publica art 43 dl 707",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "tenencia celular en recintos penales art 304 ter c p",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "tenencia de armas prohibidas art 13",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "tenencia ilegal de arma de fuego municiones y otros sujetas",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "terrorismo individual que adhiere a fines art 3 ley 21732",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "terrorismo individual sin adherencia art 4 y 5 ley 21732",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "tolerancia al trafico o consumo de drogas art 12",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "tormentos a detenidos",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "tormentos y apremios cometidos por empleados publicos 150 a",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "tormentos y apremios cometidos por particulares 150 b",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "tortura con cuasidelito art 150 b n 3",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "tortura con cuasidelito art 150 b n03",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "tortura con homicidio art 150 b n 1",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "tortura con homicidio art 150 b n01",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "tortura con viol abuso sex agrav otros art 150 b n 2",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "tortura con violacion abuso sex agrav otros art 150 b n0 2",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "tortura con violacionabuso sex agravotros art 150 b n0 2",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "tortura para anular voluntad art 150 a inc 4",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "tortura para anular voluntad art 150 a inc 4deg",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "torturas cometidas p funcionarios publ art 150 a inc 1",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "torturas cometidas p funcionarios publ art 150 a inc 1deg",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "torturas cometidas pfuncionarios publart 150 a inc 1",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "torturas cometidas pfuncionarios publart 150 a inc 1deg",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "torturas cometidas por funcionarios publicos 150 a inc 1",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "torturas p particulares agentes d estado art 150 a inc 20",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "torturas por particulares agentes del estado 150 a inc 2",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "torturas pparticulares agentes destado art150 ainc 20",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "traf organos incl los de aborto art 13 y 13 bis ley 19 451",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "trafico de armas art 10",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "trafico de especies vegetales art 10 inc 1 ley 20 000",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "trafico de especies vegetales art 10 ley 20 000",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "trafico de especies vegetales art 10 ley 20000",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "trafico de influencias",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "trafico de influencias art 240 bis",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "trafico de inmigrantes cometidos por funcionarios publico",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "trafico de migrantes 411 bis inciso 1 2 y 3",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "trafico de pequenas cantidades art 4",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "trafico de pequenas cantidades art 4",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "trafico de residuos peligrosos ley 20 920",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "trafico de residuos peligrosos ley 20920",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "trafico ilicito de drogas art 3",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "trafico ilicito de drogas art 3 ley 20 000 trafico estupefacientes y sustancias sicotropicas",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "trafico ilicito de drogas art 3 ley n 20 000",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "trafico migrantes por funcionario pub art 411 bis inc final",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "traicion espionaje art 244 al 258 cod just militar",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "traicion espionaje y demas delitos contra sob y seg estado",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "trans imagenes connotacion sexual menor 18 367 sept",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "transp desechos a vertederos clandest art192 bis ley 20879",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "transp o distrib de gas e inst cland art 53 54 dfl 323 1931",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "transporte o distribucion de gas e instalacion clandestinas",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "transprte desech vert cland 192 bis inc 6 ley 20 879",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "trata de blancas",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "trata de menores 18 anos art 411 quater inc2",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "trata de personas calificada",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "trata de personas con fines de prostitucion art 367 bis",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "trata de personas para la explotacion sexual",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "trata de personas para la explotacion sexual art 411 quater",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "trata para trabajos forzados y otros art411 quater inc1",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "trata pers menores de 18 anos art 411 quater inc 2",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "trata pers para explotacion sexual art 411 quater inc 2",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "trata pers para trabajos forzados y otros a 411 quat inc 1",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "trata perspara trabajos forzados y otros a411 quatinc1",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "tratos degradantes a personas vulnerables art 403 ter",
    "riesgoG66": "MEDIO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "ultraje de cadaver art 322 bis",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "ultraje de sepultura art 322 ter",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "ultraje publico a las buenas costumbres",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "ultraje publico a las buenas costumbres art 373",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "ultraje publico a las buenas costumbres art 373 codigo penal",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "ultraje publico a las buenas costumbres por med com social",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "ultraje publico a las buenas costumbres por medios de comunicacion social art 34 ley 19 733 libertad de opinion",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "ultraje publico buenas costumbres por medio comunic social",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "uso de fuego artific sin autorizacion art 14 e ley 17 798",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "uso de fuego artific sin autorizacion art 14 e ley 17798",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "uso de informacion privilegiada art 247 bis",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "uso de uniforme o insignias de ff aa o carabineros de chile",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "uso de uniforme o insignias de ffaa o carabineros de chile",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "uso facilitacion o transporte de hilo curado",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "uso fraudulento de tarjetas de credito y debito",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "uso fraudulento de tarjetas o medios de pago ley 20 009",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "uso fraudulento de tarjetas o medios de pago ley 20 009 tarjetas de pago",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "uso fraudulento de tarjetas o medios de pago ley 20009",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "uso ilicito fuego art 18 22 22bis 22 terc18s 4363 leybosques",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "uso ilicito fuego art 18 22 y 22 ter ds4363 ley de bosques",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "uso ilicito fuego art18 22 y 22 ter ds4363 ley de bosques",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "uso indebido fac tecnicas especiales inv 226 c y k cpp",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "uso malcs tarj clve dispt financ art 7 ltr a ley20 009",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "uso malicioso de identidad anterior art 35",
    "riesgoG66": "BAJO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "uso malicioso recetas med art 1 inc final ley 21 267",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "uso malicioso recetas med art 1o inc final ley 21 267",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "uso malicioso recetas med art 1o inc final ley 21267",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "uso uniforme o insignias ffaa o carabineros de chile",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "usofacilitacion o transporte de hilo curado",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "usura",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "usura art 472",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "usurp u ocup de inm no viol s danos a las cosas art 458",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "usurp u ocup no violenta c dano en las cosas art 457 bis",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "usurp u ocup violenta de inmueble art 457 inc 1",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "usurpacion",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "usurpacion de aguas",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "usurpacion de aguas art 459",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "usurpacion de atribuciones de empleados pub y judiciales",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "usurpacion de atribuciones de empleados publicos y judiciale",
    "riesgoG66": "MEDIO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "usurpacion de estado civil",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "usurpacion de estado civil art 354",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "usurpacion de nombre",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "usurpacion de nombre art 214",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "usurpacion de nombre art 214 codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "usurpacion de propiedad descubrimiento o prod art 158 n 5",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "usurpacion de propiedad descubrimiento o produccion art 158",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "usurpacion de propiedad descubrimiento o produccion art 158 n 5 codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "usurpacion de propiedaddescubrimiento o produccionart158",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "usurpacion no violenta art 458 codigo penal",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "usurpacion u ocupacion no violenta con dano art 457 bis",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "usurpacion u ocupacion violenta de inmueble art 457 inc 1",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "usurpacion violenta",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "usurpar u ocupar inmueble sin violencia y sin danos art 458",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "utilizacion sin autor de obras de dom ajeno por ley pr int",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "utilizacion sin autorizacion de obras de dominio ajeno por l",
    "riesgoG66": "MEDIO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "veedor liquidador realice conducta senalada art 464y 464 bis",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "veedor o liq realice conduc arts 464 464 bis ter y quater",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "veedorliquidador realice conducta senalada art464y 464 bis",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "venta ilegal de cartuchos o municiones art 9 a ley 17 798",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "venta ilegal de cartuchos o municiones art 9 a ley 17798",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "venta ilegal de cartuchos o municiones art 9 a ley 21 412",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "venta ilicita de obras protegidas art 81 ley 17 336 propiedad intelectual",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS PRECEDENTES"
  },
  {
    "nombre": "venta ilicita de obras protegidas por ley de propiedad intel",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "venta ilicita obras protegidas ley prop intelect art 81",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "vigilancia privada no autor art 5 bis dec ley 3607 de 1981",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "vigilancia privada no autorizada art 5 bis decreto ley 3607",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "vigilancia privada no autorizada art5 bis decreto ley 3607",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "viol rev y o aprov secretos 284 284 bis ter y quat cp",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "violacion",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "violacion con homicidio",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "violacion con homicidio o femicidio art 372 bis",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "violacion de mayor de 14 anos art 361",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "violacion de mayor de 14 anos",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "violacion de mayor de 14 anos",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "violacion de menor de 14 anos art 362",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "violacion de morada",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "violacion de morada art 144",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "violacion de morada art 144 codigo penal",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "violacion de prerrogativas",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "violacion de secreto de adm de fondos de pensiones",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "violacion de secreto de invento",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "violacion de secreto parcial art 36 y 37",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "violacion de secretos",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "violacion de secretos art 246 246 bis 247 y 247 bis",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "violacion de secretos de fabrica art 284",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "violacion de secretos de fabricaart284",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "violacion del secreto absoluto art 38",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "violacion del secreto absoluto art 38",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "violacion reserva base de datos sobre inscrip y reg de arma",
    "riesgoG66": "MEDIO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "violacion secreto auditorias servicio acceso a la justicia",
    "riesgoG66": "MEDIO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "violacion sodomitica",
    "riesgoG66": "ALTO",
    "valor": 0.5,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "violacion solo crimen",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "violacisn de secretos art 246 247",
    "riesgoG66": "ALTO",
    "valor": 1,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "violencia en los estadios art 6 6a b d e f g h ley 19 327",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "violencia en los estadios art 6 ley 19 327",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "violencia en los estadios art 6 ley 19327",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  },
  {
    "nombre": "vulneracion de reserva de ley de permisos sectoriales",
    "riesgoG66": "BAJO",
    "valor": 0,
    "tipo": "DELITOS NO PRECEDENTES"
  }
],
  "parameters": {
  "HARD_FB_precedentes_count": 4,
  "HARD_FB_noprecedentes_count": 5,
  "FB_min_total_equivalente": 2,
  "UCR_min_total_equivalente": 1,
  "UCR_max_total_equivalente": 3,
  "VALOR_unit_precedente": 1,
  "VALOR_unit_nopre_low": 0.5,
  "VALOR_unit_nopre_high": 1
},
  "decisionTable": [
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 0,
    "preEquivalente": 0,
    "noPreEquivalente": 0,
    "totalEquivalente": 0,
    "decision": "Liberar",
    "razon": "Equivalente bajo"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 1,
    "preEquivalente": 0,
    "noPreEquivalente": 0,
    "totalEquivalente": 0,
    "decision": "Liberar",
    "razon": "Equivalente bajo"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 1,
    "preEquivalente": 0,
    "noPreEquivalente": 0.5,
    "totalEquivalente": 0.5,
    "decision": "Liberar",
    "razon": "Equivalente bajo"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 1,
    "preEquivalente": 0,
    "noPreEquivalente": 1,
    "totalEquivalente": 1,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Equivalente en rango UCR"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 2,
    "preEquivalente": 0,
    "noPreEquivalente": 0,
    "totalEquivalente": 0,
    "decision": "Liberar",
    "razon": "Equivalente bajo"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 2,
    "preEquivalente": 0,
    "noPreEquivalente": 0.5,
    "totalEquivalente": 0.5,
    "decision": "Liberar",
    "razon": "Equivalente bajo"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 2,
    "preEquivalente": 0,
    "noPreEquivalente": 1,
    "totalEquivalente": 1,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Equivalente en rango UCR"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 2,
    "preEquivalente": 0,
    "noPreEquivalente": 1.5,
    "totalEquivalente": 1.5,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Equivalente en rango UCR"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 0,
    "preEquivalente": 1,
    "noPreEquivalente": 0,
    "totalEquivalente": 1,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Equivalente en rango UCR"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 3,
    "preEquivalente": 0,
    "noPreEquivalente": 0,
    "totalEquivalente": 0,
    "decision": "Liberar",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 3,
    "preEquivalente": 0,
    "noPreEquivalente": 0.5,
    "totalEquivalente": 0.5,
    "decision": "Liberar",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 1,
    "preEquivalente": 1,
    "noPreEquivalente": 0,
    "totalEquivalente": 1,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Equivalente en rango UCR"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 1,
    "preEquivalente": 1,
    "noPreEquivalente": 0.5,
    "totalEquivalente": 1.5,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Equivalente en rango UCR"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 2,
    "preEquivalente": 1,
    "noPreEquivalente": 0,
    "totalEquivalente": 1,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Equivalente en rango UCR"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 2,
    "preEquivalente": 1,
    "noPreEquivalente": 0.5,
    "totalEquivalente": 1.5,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Equivalente en rango UCR"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 2,
    "preEquivalente": 0,
    "noPreEquivalente": 2,
    "totalEquivalente": 2,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Equivalente >= FB_min"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 4,
    "preEquivalente": 0,
    "noPreEquivalente": 0,
    "totalEquivalente": 0,
    "decision": "Liberar",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 4,
    "preEquivalente": 0,
    "noPreEquivalente": 0.5,
    "totalEquivalente": 0.5,
    "decision": "Liberar",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 3,
    "preEquivalente": 0,
    "noPreEquivalente": 1,
    "totalEquivalente": 1,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 3,
    "preEquivalente": 0,
    "noPreEquivalente": 1.5,
    "totalEquivalente": 1.5,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 3,
    "preEquivalente": 0,
    "noPreEquivalente": 2,
    "totalEquivalente": 2,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 3,
    "preEquivalente": 0,
    "noPreEquivalente": 2.5,
    "totalEquivalente": 2.5,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 3,
    "preEquivalente": 0,
    "noPreEquivalente": 3,
    "totalEquivalente": 3,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 4,
    "preEquivalente": 0,
    "noPreEquivalente": 3.5,
    "totalEquivalente": 3.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 4,
    "preEquivalente": 0,
    "noPreEquivalente": 4,
    "totalEquivalente": 4,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 5,
    "preEquivalente": 0,
    "noPreEquivalente": 0,
    "totalEquivalente": 0,
    "decision": "Liberar",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 5,
    "preEquivalente": 0,
    "noPreEquivalente": 0.5,
    "totalEquivalente": 0.5,
    "decision": "Liberar",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 4,
    "preEquivalente": 0,
    "noPreEquivalente": 1,
    "totalEquivalente": 1,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 4,
    "preEquivalente": 0,
    "noPreEquivalente": 1.5,
    "totalEquivalente": 1.5,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 4,
    "preEquivalente": 0,
    "noPreEquivalente": 2,
    "totalEquivalente": 2,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 4,
    "preEquivalente": 0,
    "noPreEquivalente": 2.5,
    "totalEquivalente": 2.5,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 4,
    "preEquivalente": 0,
    "noPreEquivalente": 3,
    "totalEquivalente": 3,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 5,
    "preEquivalente": 0,
    "noPreEquivalente": 3.5,
    "totalEquivalente": 3.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 5,
    "preEquivalente": 0,
    "noPreEquivalente": 4,
    "totalEquivalente": 4,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 5,
    "preEquivalente": 0,
    "noPreEquivalente": 4.5,
    "totalEquivalente": 4.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 5,
    "preEquivalente": 0,
    "noPreEquivalente": 5,
    "totalEquivalente": 5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 6,
    "preEquivalente": 0,
    "noPreEquivalente": 0,
    "totalEquivalente": 0,
    "decision": "Liberar",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 6,
    "preEquivalente": 0,
    "noPreEquivalente": 0.5,
    "totalEquivalente": 0.5,
    "decision": "Liberar",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 5,
    "preEquivalente": 0,
    "noPreEquivalente": 1,
    "totalEquivalente": 1,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 5,
    "preEquivalente": 0,
    "noPreEquivalente": 1.5,
    "totalEquivalente": 1.5,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 5,
    "preEquivalente": 0,
    "noPreEquivalente": 2,
    "totalEquivalente": 2,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 5,
    "preEquivalente": 0,
    "noPreEquivalente": 2.5,
    "totalEquivalente": 2.5,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 5,
    "preEquivalente": 0,
    "noPreEquivalente": 3,
    "totalEquivalente": 3,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 6,
    "preEquivalente": 0,
    "noPreEquivalente": 3.5,
    "totalEquivalente": 3.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 6,
    "preEquivalente": 0,
    "noPreEquivalente": 4,
    "totalEquivalente": 4,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 6,
    "preEquivalente": 0,
    "noPreEquivalente": 4.5,
    "totalEquivalente": 4.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 6,
    "preEquivalente": 0,
    "noPreEquivalente": 5,
    "totalEquivalente": 5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 6,
    "preEquivalente": 0,
    "noPreEquivalente": 5.5,
    "totalEquivalente": 5.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 6,
    "preEquivalente": 0,
    "noPreEquivalente": 6,
    "totalEquivalente": 6,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 7,
    "preEquivalente": 0,
    "noPreEquivalente": 0,
    "totalEquivalente": 0,
    "decision": "Liberar",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 7,
    "preEquivalente": 0,
    "noPreEquivalente": 0.5,
    "totalEquivalente": 0.5,
    "decision": "Liberar",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 6,
    "preEquivalente": 0,
    "noPreEquivalente": 1,
    "totalEquivalente": 1,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 6,
    "preEquivalente": 0,
    "noPreEquivalente": 1.5,
    "totalEquivalente": 1.5,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 6,
    "preEquivalente": 0,
    "noPreEquivalente": 2,
    "totalEquivalente": 2,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 6,
    "preEquivalente": 0,
    "noPreEquivalente": 2.5,
    "totalEquivalente": 2.5,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 6,
    "preEquivalente": 0,
    "noPreEquivalente": 3,
    "totalEquivalente": 3,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 7,
    "preEquivalente": 0,
    "noPreEquivalente": 3.5,
    "totalEquivalente": 3.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 7,
    "preEquivalente": 0,
    "noPreEquivalente": 4,
    "totalEquivalente": 4,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 7,
    "preEquivalente": 0,
    "noPreEquivalente": 4.5,
    "totalEquivalente": 4.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 7,
    "preEquivalente": 0,
    "noPreEquivalente": 5,
    "totalEquivalente": 5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 7,
    "preEquivalente": 0,
    "noPreEquivalente": 5.5,
    "totalEquivalente": 5.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 7,
    "preEquivalente": 0,
    "noPreEquivalente": 6,
    "totalEquivalente": 6,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 7,
    "preEquivalente": 0,
    "noPreEquivalente": 6.5,
    "totalEquivalente": 6.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 7,
    "preEquivalente": 0,
    "noPreEquivalente": 7,
    "totalEquivalente": 7,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 7,
    "preEquivalente": 0,
    "noPreEquivalente": 1,
    "totalEquivalente": 1,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 7,
    "preEquivalente": 0,
    "noPreEquivalente": 1.5,
    "totalEquivalente": 1.5,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 7,
    "preEquivalente": 0,
    "noPreEquivalente": 2,
    "totalEquivalente": 2,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 7,
    "preEquivalente": 0,
    "noPreEquivalente": 2.5,
    "totalEquivalente": 2.5,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 0,
    "noPrecedentesCount": 7,
    "preEquivalente": 0,
    "noPreEquivalente": 3,
    "totalEquivalente": 3,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 1,
    "preEquivalente": 1,
    "noPreEquivalente": 1,
    "totalEquivalente": 2,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Equivalente >= FB_min"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 2,
    "preEquivalente": 1,
    "noPreEquivalente": 1,
    "totalEquivalente": 2,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Equivalente >= FB_min"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 2,
    "preEquivalente": 1,
    "noPreEquivalente": 1.5,
    "totalEquivalente": 2.5,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Equivalente >= FB_min"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 2,
    "preEquivalente": 1,
    "noPreEquivalente": 2,
    "totalEquivalente": 3,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Equivalente >= FB_min"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 3,
    "preEquivalente": 1,
    "noPreEquivalente": 0,
    "totalEquivalente": 1,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 3,
    "preEquivalente": 1,
    "noPreEquivalente": 0.5,
    "totalEquivalente": 1.5,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 3,
    "preEquivalente": 1,
    "noPreEquivalente": 1,
    "totalEquivalente": 2,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 3,
    "preEquivalente": 1,
    "noPreEquivalente": 1.5,
    "totalEquivalente": 2.5,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 3,
    "preEquivalente": 1,
    "noPreEquivalente": 2,
    "totalEquivalente": 3,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 3,
    "preEquivalente": 1,
    "noPreEquivalente": 2.5,
    "totalEquivalente": 3.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 3,
    "preEquivalente": 1,
    "noPreEquivalente": 3,
    "totalEquivalente": 4,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 4,
    "preEquivalente": 1,
    "noPreEquivalente": 0,
    "totalEquivalente": 1,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 4,
    "preEquivalente": 1,
    "noPreEquivalente": 0.5,
    "totalEquivalente": 1.5,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 4,
    "preEquivalente": 1,
    "noPreEquivalente": 1,
    "totalEquivalente": 2,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 4,
    "preEquivalente": 1,
    "noPreEquivalente": 1.5,
    "totalEquivalente": 2.5,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 4,
    "preEquivalente": 1,
    "noPreEquivalente": 2,
    "totalEquivalente": 3,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 4,
    "preEquivalente": 1,
    "noPreEquivalente": 2.5,
    "totalEquivalente": 3.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 4,
    "preEquivalente": 1,
    "noPreEquivalente": 3,
    "totalEquivalente": 4,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 4,
    "preEquivalente": 1,
    "noPreEquivalente": 3.5,
    "totalEquivalente": 4.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 4,
    "preEquivalente": 1,
    "noPreEquivalente": 4,
    "totalEquivalente": 5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 5,
    "preEquivalente": 1,
    "noPreEquivalente": 0,
    "totalEquivalente": 1,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 5,
    "preEquivalente": 1,
    "noPreEquivalente": 0.5,
    "totalEquivalente": 1.5,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 5,
    "preEquivalente": 1,
    "noPreEquivalente": 1,
    "totalEquivalente": 2,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 5,
    "preEquivalente": 1,
    "noPreEquivalente": 1.5,
    "totalEquivalente": 2.5,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 5,
    "preEquivalente": 1,
    "noPreEquivalente": 2,
    "totalEquivalente": 3,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 5,
    "preEquivalente": 1,
    "noPreEquivalente": 2.5,
    "totalEquivalente": 3.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 5,
    "preEquivalente": 1,
    "noPreEquivalente": 3,
    "totalEquivalente": 4,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 5,
    "preEquivalente": 1,
    "noPreEquivalente": 3.5,
    "totalEquivalente": 4.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 5,
    "preEquivalente": 1,
    "noPreEquivalente": 4,
    "totalEquivalente": 5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 5,
    "preEquivalente": 1,
    "noPreEquivalente": 4.5,
    "totalEquivalente": 5.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 5,
    "preEquivalente": 1,
    "noPreEquivalente": 5,
    "totalEquivalente": 6,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 6,
    "preEquivalente": 1,
    "noPreEquivalente": 0,
    "totalEquivalente": 1,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 6,
    "preEquivalente": 1,
    "noPreEquivalente": 0.5,
    "totalEquivalente": 1.5,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 6,
    "preEquivalente": 1,
    "noPreEquivalente": 1,
    "totalEquivalente": 2,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 6,
    "preEquivalente": 1,
    "noPreEquivalente": 1.5,
    "totalEquivalente": 2.5,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 6,
    "preEquivalente": 1,
    "noPreEquivalente": 2,
    "totalEquivalente": 3,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 6,
    "preEquivalente": 1,
    "noPreEquivalente": 2.5,
    "totalEquivalente": 3.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 6,
    "preEquivalente": 1,
    "noPreEquivalente": 3,
    "totalEquivalente": 4,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 6,
    "preEquivalente": 1,
    "noPreEquivalente": 3.5,
    "totalEquivalente": 4.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 6,
    "preEquivalente": 1,
    "noPreEquivalente": 4,
    "totalEquivalente": 5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 6,
    "preEquivalente": 1,
    "noPreEquivalente": 4.5,
    "totalEquivalente": 5.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 6,
    "preEquivalente": 1,
    "noPreEquivalente": 5,
    "totalEquivalente": 6,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 6,
    "preEquivalente": 1,
    "noPreEquivalente": 5.5,
    "totalEquivalente": 6.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 6,
    "preEquivalente": 1,
    "noPreEquivalente": 6,
    "totalEquivalente": 7,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 7,
    "preEquivalente": 1,
    "noPreEquivalente": 0,
    "totalEquivalente": 1,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 7,
    "preEquivalente": 1,
    "noPreEquivalente": 0.5,
    "totalEquivalente": 1.5,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 7,
    "preEquivalente": 1,
    "noPreEquivalente": 1,
    "totalEquivalente": 2,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 7,
    "preEquivalente": 1,
    "noPreEquivalente": 1.5,
    "totalEquivalente": 2.5,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 7,
    "preEquivalente": 1,
    "noPreEquivalente": 2,
    "totalEquivalente": 3,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 7,
    "preEquivalente": 1,
    "noPreEquivalente": 2.5,
    "totalEquivalente": 3.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 7,
    "preEquivalente": 1,
    "noPreEquivalente": 3,
    "totalEquivalente": 4,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 7,
    "preEquivalente": 1,
    "noPreEquivalente": 3.5,
    "totalEquivalente": 4.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 7,
    "preEquivalente": 1,
    "noPreEquivalente": 4,
    "totalEquivalente": 5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 7,
    "preEquivalente": 1,
    "noPreEquivalente": 4.5,
    "totalEquivalente": 5.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 7,
    "preEquivalente": 1,
    "noPreEquivalente": 5,
    "totalEquivalente": 6,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 7,
    "preEquivalente": 1,
    "noPreEquivalente": 5.5,
    "totalEquivalente": 6.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 7,
    "preEquivalente": 1,
    "noPreEquivalente": 6,
    "totalEquivalente": 7,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 7,
    "preEquivalente": 1,
    "noPreEquivalente": 6.5,
    "totalEquivalente": 7.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 1,
    "noPrecedentesCount": 7,
    "preEquivalente": 1,
    "noPreEquivalente": 7,
    "totalEquivalente": 8,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 0,
    "preEquivalente": 2,
    "noPreEquivalente": 0,
    "totalEquivalente": 2,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 1,
    "preEquivalente": 2,
    "noPreEquivalente": 0,
    "totalEquivalente": 2,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 1,
    "preEquivalente": 2,
    "noPreEquivalente": 0.5,
    "totalEquivalente": 2.5,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 1,
    "preEquivalente": 2,
    "noPreEquivalente": 1,
    "totalEquivalente": 3,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 2,
    "preEquivalente": 2,
    "noPreEquivalente": 0,
    "totalEquivalente": 2,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 2,
    "preEquivalente": 2,
    "noPreEquivalente": 0.5,
    "totalEquivalente": 2.5,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 2,
    "preEquivalente": 2,
    "noPreEquivalente": 1,
    "totalEquivalente": 3,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 2,
    "preEquivalente": 2,
    "noPreEquivalente": 1.5,
    "totalEquivalente": 3.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 2,
    "preEquivalente": 2,
    "noPreEquivalente": 2,
    "totalEquivalente": 4,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 3,
    "preEquivalente": 2,
    "noPreEquivalente": 0,
    "totalEquivalente": 2,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 3,
    "preEquivalente": 2,
    "noPreEquivalente": 0.5,
    "totalEquivalente": 2.5,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 3,
    "preEquivalente": 2,
    "noPreEquivalente": 1,
    "totalEquivalente": 3,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 3,
    "preEquivalente": 2,
    "noPreEquivalente": 1.5,
    "totalEquivalente": 3.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 3,
    "preEquivalente": 2,
    "noPreEquivalente": 2,
    "totalEquivalente": 4,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 3,
    "preEquivalente": 2,
    "noPreEquivalente": 2.5,
    "totalEquivalente": 4.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 3,
    "preEquivalente": 2,
    "noPreEquivalente": 3,
    "totalEquivalente": 5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 4,
    "preEquivalente": 2,
    "noPreEquivalente": 0,
    "totalEquivalente": 2,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 4,
    "preEquivalente": 2,
    "noPreEquivalente": 0.5,
    "totalEquivalente": 2.5,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 4,
    "preEquivalente": 2,
    "noPreEquivalente": 1,
    "totalEquivalente": 3,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 4,
    "preEquivalente": 2,
    "noPreEquivalente": 1.5,
    "totalEquivalente": 3.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 4,
    "preEquivalente": 2,
    "noPreEquivalente": 2,
    "totalEquivalente": 4,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 4,
    "preEquivalente": 2,
    "noPreEquivalente": 2.5,
    "totalEquivalente": 4.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 4,
    "preEquivalente": 2,
    "noPreEquivalente": 3,
    "totalEquivalente": 5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 4,
    "preEquivalente": 2,
    "noPreEquivalente": 3.5,
    "totalEquivalente": 5.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 4,
    "preEquivalente": 2,
    "noPreEquivalente": 4,
    "totalEquivalente": 6,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 5,
    "preEquivalente": 2,
    "noPreEquivalente": 0,
    "totalEquivalente": 2,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 5,
    "preEquivalente": 2,
    "noPreEquivalente": 0.5,
    "totalEquivalente": 2.5,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 5,
    "preEquivalente": 2,
    "noPreEquivalente": 1,
    "totalEquivalente": 3,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 5,
    "preEquivalente": 2,
    "noPreEquivalente": 1.5,
    "totalEquivalente": 3.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 5,
    "preEquivalente": 2,
    "noPreEquivalente": 2,
    "totalEquivalente": 4,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 5,
    "preEquivalente": 2,
    "noPreEquivalente": 2.5,
    "totalEquivalente": 4.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 5,
    "preEquivalente": 2,
    "noPreEquivalente": 3,
    "totalEquivalente": 5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 5,
    "preEquivalente": 2,
    "noPreEquivalente": 3.5,
    "totalEquivalente": 5.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 5,
    "preEquivalente": 2,
    "noPreEquivalente": 4,
    "totalEquivalente": 6,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 5,
    "preEquivalente": 2,
    "noPreEquivalente": 4.5,
    "totalEquivalente": 6.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 5,
    "preEquivalente": 2,
    "noPreEquivalente": 5,
    "totalEquivalente": 7,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 6,
    "preEquivalente": 2,
    "noPreEquivalente": 0,
    "totalEquivalente": 2,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 6,
    "preEquivalente": 2,
    "noPreEquivalente": 0.5,
    "totalEquivalente": 2.5,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 6,
    "preEquivalente": 2,
    "noPreEquivalente": 1,
    "totalEquivalente": 3,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 6,
    "preEquivalente": 2,
    "noPreEquivalente": 1.5,
    "totalEquivalente": 3.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 6,
    "preEquivalente": 2,
    "noPreEquivalente": 2,
    "totalEquivalente": 4,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 6,
    "preEquivalente": 2,
    "noPreEquivalente": 2.5,
    "totalEquivalente": 4.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 6,
    "preEquivalente": 2,
    "noPreEquivalente": 3,
    "totalEquivalente": 5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 6,
    "preEquivalente": 2,
    "noPreEquivalente": 3.5,
    "totalEquivalente": 5.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 6,
    "preEquivalente": 2,
    "noPreEquivalente": 4,
    "totalEquivalente": 6,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 6,
    "preEquivalente": 2,
    "noPreEquivalente": 4.5,
    "totalEquivalente": 6.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 6,
    "preEquivalente": 2,
    "noPreEquivalente": 5,
    "totalEquivalente": 7,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 6,
    "preEquivalente": 2,
    "noPreEquivalente": 5.5,
    "totalEquivalente": 7.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 6,
    "preEquivalente": 2,
    "noPreEquivalente": 6,
    "totalEquivalente": 8,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 7,
    "preEquivalente": 2,
    "noPreEquivalente": 0,
    "totalEquivalente": 2,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 7,
    "preEquivalente": 2,
    "noPreEquivalente": 0.5,
    "totalEquivalente": 2.5,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 7,
    "preEquivalente": 2,
    "noPreEquivalente": 1,
    "totalEquivalente": 3,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 7,
    "preEquivalente": 2,
    "noPreEquivalente": 1.5,
    "totalEquivalente": 3.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 7,
    "preEquivalente": 2,
    "noPreEquivalente": 2,
    "totalEquivalente": 4,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 7,
    "preEquivalente": 2,
    "noPreEquivalente": 2.5,
    "totalEquivalente": 4.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 7,
    "preEquivalente": 2,
    "noPreEquivalente": 3,
    "totalEquivalente": 5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 7,
    "preEquivalente": 2,
    "noPreEquivalente": 3.5,
    "totalEquivalente": 5.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 7,
    "preEquivalente": 2,
    "noPreEquivalente": 4,
    "totalEquivalente": 6,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 7,
    "preEquivalente": 2,
    "noPreEquivalente": 4.5,
    "totalEquivalente": 6.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 7,
    "preEquivalente": 2,
    "noPreEquivalente": 5,
    "totalEquivalente": 7,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 7,
    "preEquivalente": 2,
    "noPreEquivalente": 5.5,
    "totalEquivalente": 7.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 7,
    "preEquivalente": 2,
    "noPreEquivalente": 6,
    "totalEquivalente": 8,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 7,
    "preEquivalente": 2,
    "noPreEquivalente": 6.5,
    "totalEquivalente": 8.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 2,
    "noPrecedentesCount": 7,
    "preEquivalente": 2,
    "noPreEquivalente": 7,
    "totalEquivalente": 9,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 0,
    "preEquivalente": 3,
    "noPreEquivalente": 0,
    "totalEquivalente": 3,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 1,
    "preEquivalente": 3,
    "noPreEquivalente": 0,
    "totalEquivalente": 3,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 1,
    "preEquivalente": 3,
    "noPreEquivalente": 0.5,
    "totalEquivalente": 3.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 1,
    "preEquivalente": 3,
    "noPreEquivalente": 1,
    "totalEquivalente": 4,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 2,
    "preEquivalente": 3,
    "noPreEquivalente": 0,
    "totalEquivalente": 3,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 2,
    "preEquivalente": 3,
    "noPreEquivalente": 0.5,
    "totalEquivalente": 3.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 2,
    "preEquivalente": 3,
    "noPreEquivalente": 1,
    "totalEquivalente": 4,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 2,
    "preEquivalente": 3,
    "noPreEquivalente": 1.5,
    "totalEquivalente": 4.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 2,
    "preEquivalente": 3,
    "noPreEquivalente": 2,
    "totalEquivalente": 5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 3,
    "preEquivalente": 3,
    "noPreEquivalente": 0,
    "totalEquivalente": 3,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 3,
    "preEquivalente": 3,
    "noPreEquivalente": 0.5,
    "totalEquivalente": 3.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 3,
    "preEquivalente": 3,
    "noPreEquivalente": 1,
    "totalEquivalente": 4,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 3,
    "preEquivalente": 3,
    "noPreEquivalente": 1.5,
    "totalEquivalente": 4.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 3,
    "preEquivalente": 3,
    "noPreEquivalente": 2,
    "totalEquivalente": 5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 3,
    "preEquivalente": 3,
    "noPreEquivalente": 2.5,
    "totalEquivalente": 5.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 3,
    "preEquivalente": 3,
    "noPreEquivalente": 3,
    "totalEquivalente": 6,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 4,
    "preEquivalente": 3,
    "noPreEquivalente": 0,
    "totalEquivalente": 3,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 4,
    "preEquivalente": 3,
    "noPreEquivalente": 0.5,
    "totalEquivalente": 3.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 4,
    "preEquivalente": 3,
    "noPreEquivalente": 1,
    "totalEquivalente": 4,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 4,
    "preEquivalente": 3,
    "noPreEquivalente": 1.5,
    "totalEquivalente": 4.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 4,
    "preEquivalente": 3,
    "noPreEquivalente": 2,
    "totalEquivalente": 5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 4,
    "preEquivalente": 3,
    "noPreEquivalente": 2.5,
    "totalEquivalente": 5.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 4,
    "preEquivalente": 3,
    "noPreEquivalente": 3,
    "totalEquivalente": 6,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 4,
    "preEquivalente": 3,
    "noPreEquivalente": 3.5,
    "totalEquivalente": 6.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 4,
    "preEquivalente": 3,
    "noPreEquivalente": 4,
    "totalEquivalente": 7,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 5,
    "preEquivalente": 3,
    "noPreEquivalente": 0,
    "totalEquivalente": 3,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 5,
    "preEquivalente": 3,
    "noPreEquivalente": 0.5,
    "totalEquivalente": 3.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 5,
    "preEquivalente": 3,
    "noPreEquivalente": 1,
    "totalEquivalente": 4,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 5,
    "preEquivalente": 3,
    "noPreEquivalente": 1.5,
    "totalEquivalente": 4.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 5,
    "preEquivalente": 3,
    "noPreEquivalente": 2,
    "totalEquivalente": 5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 5,
    "preEquivalente": 3,
    "noPreEquivalente": 2.5,
    "totalEquivalente": 5.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 5,
    "preEquivalente": 3,
    "noPreEquivalente": 3,
    "totalEquivalente": 6,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 5,
    "preEquivalente": 3,
    "noPreEquivalente": 3.5,
    "totalEquivalente": 6.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 5,
    "preEquivalente": 3,
    "noPreEquivalente": 4,
    "totalEquivalente": 7,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 5,
    "preEquivalente": 3,
    "noPreEquivalente": 4.5,
    "totalEquivalente": 7.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 5,
    "preEquivalente": 3,
    "noPreEquivalente": 5,
    "totalEquivalente": 8,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 6,
    "preEquivalente": 3,
    "noPreEquivalente": 0,
    "totalEquivalente": 3,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 6,
    "preEquivalente": 3,
    "noPreEquivalente": 0.5,
    "totalEquivalente": 3.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 6,
    "preEquivalente": 3,
    "noPreEquivalente": 1,
    "totalEquivalente": 4,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 6,
    "preEquivalente": 3,
    "noPreEquivalente": 1.5,
    "totalEquivalente": 4.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 6,
    "preEquivalente": 3,
    "noPreEquivalente": 2,
    "totalEquivalente": 5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 6,
    "preEquivalente": 3,
    "noPreEquivalente": 2.5,
    "totalEquivalente": 5.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 6,
    "preEquivalente": 3,
    "noPreEquivalente": 3,
    "totalEquivalente": 6,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 6,
    "preEquivalente": 3,
    "noPreEquivalente": 3.5,
    "totalEquivalente": 6.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 6,
    "preEquivalente": 3,
    "noPreEquivalente": 4,
    "totalEquivalente": 7,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 6,
    "preEquivalente": 3,
    "noPreEquivalente": 4.5,
    "totalEquivalente": 7.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 6,
    "preEquivalente": 3,
    "noPreEquivalente": 5,
    "totalEquivalente": 8,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 6,
    "preEquivalente": 3,
    "noPreEquivalente": 5.5,
    "totalEquivalente": 8.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 6,
    "preEquivalente": 3,
    "noPreEquivalente": 6,
    "totalEquivalente": 9,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 7,
    "preEquivalente": 3,
    "noPreEquivalente": 0,
    "totalEquivalente": 3,
    "decision": "UNDER_COMPLIANCE_REVIEW",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 7,
    "preEquivalente": 3,
    "noPreEquivalente": 0.5,
    "totalEquivalente": 3.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 7,
    "preEquivalente": 3,
    "noPreEquivalente": 1,
    "totalEquivalente": 4,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 7,
    "preEquivalente": 3,
    "noPreEquivalente": 1.5,
    "totalEquivalente": 4.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 7,
    "preEquivalente": 3,
    "noPreEquivalente": 2,
    "totalEquivalente": 5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 7,
    "preEquivalente": 3,
    "noPreEquivalente": 2.5,
    "totalEquivalente": 5.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 7,
    "preEquivalente": 3,
    "noPreEquivalente": 3,
    "totalEquivalente": 6,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 7,
    "preEquivalente": 3,
    "noPreEquivalente": 3.5,
    "totalEquivalente": 6.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 7,
    "preEquivalente": 3,
    "noPreEquivalente": 4,
    "totalEquivalente": 7,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 7,
    "preEquivalente": 3,
    "noPreEquivalente": 4.5,
    "totalEquivalente": 7.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 7,
    "preEquivalente": 3,
    "noPreEquivalente": 5,
    "totalEquivalente": 8,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 7,
    "preEquivalente": 3,
    "noPreEquivalente": 5.5,
    "totalEquivalente": 8.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 7,
    "preEquivalente": 3,
    "noPreEquivalente": 6,
    "totalEquivalente": 9,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 7,
    "preEquivalente": 3,
    "noPreEquivalente": 6.5,
    "totalEquivalente": 9.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 3,
    "noPrecedentesCount": 7,
    "preEquivalente": 3,
    "noPreEquivalente": 7,
    "totalEquivalente": 10,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 0,
    "preEquivalente": 4,
    "noPreEquivalente": 0,
    "totalEquivalente": 4,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 1,
    "preEquivalente": 4,
    "noPreEquivalente": 0,
    "totalEquivalente": 4,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 1,
    "preEquivalente": 4,
    "noPreEquivalente": 0.5,
    "totalEquivalente": 4.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 1,
    "preEquivalente": 4,
    "noPreEquivalente": 1,
    "totalEquivalente": 5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 2,
    "preEquivalente": 4,
    "noPreEquivalente": 0,
    "totalEquivalente": 4,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 2,
    "preEquivalente": 4,
    "noPreEquivalente": 0.5,
    "totalEquivalente": 4.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 2,
    "preEquivalente": 4,
    "noPreEquivalente": 1,
    "totalEquivalente": 5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 2,
    "preEquivalente": 4,
    "noPreEquivalente": 1.5,
    "totalEquivalente": 5.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 2,
    "preEquivalente": 4,
    "noPreEquivalente": 2,
    "totalEquivalente": 6,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 3,
    "preEquivalente": 4,
    "noPreEquivalente": 0,
    "totalEquivalente": 4,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 3,
    "preEquivalente": 4,
    "noPreEquivalente": 0.5,
    "totalEquivalente": 4.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 3,
    "preEquivalente": 4,
    "noPreEquivalente": 1,
    "totalEquivalente": 5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 3,
    "preEquivalente": 4,
    "noPreEquivalente": 1.5,
    "totalEquivalente": 5.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 3,
    "preEquivalente": 4,
    "noPreEquivalente": 2,
    "totalEquivalente": 6,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 3,
    "preEquivalente": 4,
    "noPreEquivalente": 2.5,
    "totalEquivalente": 6.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 3,
    "preEquivalente": 4,
    "noPreEquivalente": 3,
    "totalEquivalente": 7,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 4,
    "preEquivalente": 4,
    "noPreEquivalente": 0,
    "totalEquivalente": 4,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 4,
    "preEquivalente": 4,
    "noPreEquivalente": 0.5,
    "totalEquivalente": 4.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 4,
    "preEquivalente": 4,
    "noPreEquivalente": 1,
    "totalEquivalente": 5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 4,
    "preEquivalente": 4,
    "noPreEquivalente": 1.5,
    "totalEquivalente": 5.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 4,
    "preEquivalente": 4,
    "noPreEquivalente": 2,
    "totalEquivalente": 6,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 4,
    "preEquivalente": 4,
    "noPreEquivalente": 2.5,
    "totalEquivalente": 6.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 4,
    "preEquivalente": 4,
    "noPreEquivalente": 3,
    "totalEquivalente": 7,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 4,
    "preEquivalente": 4,
    "noPreEquivalente": 3.5,
    "totalEquivalente": 7.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 4,
    "preEquivalente": 4,
    "noPreEquivalente": 4,
    "totalEquivalente": 8,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 5,
    "preEquivalente": 4,
    "noPreEquivalente": 0,
    "totalEquivalente": 4,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 5,
    "preEquivalente": 4,
    "noPreEquivalente": 0.5,
    "totalEquivalente": 4.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 5,
    "preEquivalente": 4,
    "noPreEquivalente": 1,
    "totalEquivalente": 5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 5,
    "preEquivalente": 4,
    "noPreEquivalente": 1.5,
    "totalEquivalente": 5.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 5,
    "preEquivalente": 4,
    "noPreEquivalente": 2,
    "totalEquivalente": 6,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 5,
    "preEquivalente": 4,
    "noPreEquivalente": 2.5,
    "totalEquivalente": 6.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 5,
    "preEquivalente": 4,
    "noPreEquivalente": 3,
    "totalEquivalente": 7,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 5,
    "preEquivalente": 4,
    "noPreEquivalente": 3.5,
    "totalEquivalente": 7.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 5,
    "preEquivalente": 4,
    "noPreEquivalente": 4,
    "totalEquivalente": 8,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 5,
    "preEquivalente": 4,
    "noPreEquivalente": 4.5,
    "totalEquivalente": 8.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 5,
    "preEquivalente": 4,
    "noPreEquivalente": 5,
    "totalEquivalente": 9,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 6,
    "preEquivalente": 4,
    "noPreEquivalente": 0,
    "totalEquivalente": 4,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 6,
    "preEquivalente": 4,
    "noPreEquivalente": 0.5,
    "totalEquivalente": 4.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 6,
    "preEquivalente": 4,
    "noPreEquivalente": 1,
    "totalEquivalente": 5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 6,
    "preEquivalente": 4,
    "noPreEquivalente": 1.5,
    "totalEquivalente": 5.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 6,
    "preEquivalente": 4,
    "noPreEquivalente": 2,
    "totalEquivalente": 6,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 6,
    "preEquivalente": 4,
    "noPreEquivalente": 2.5,
    "totalEquivalente": 6.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 6,
    "preEquivalente": 4,
    "noPreEquivalente": 3,
    "totalEquivalente": 7,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 6,
    "preEquivalente": 4,
    "noPreEquivalente": 3.5,
    "totalEquivalente": 7.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 6,
    "preEquivalente": 4,
    "noPreEquivalente": 4,
    "totalEquivalente": 8,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 6,
    "preEquivalente": 4,
    "noPreEquivalente": 4.5,
    "totalEquivalente": 8.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 6,
    "preEquivalente": 4,
    "noPreEquivalente": 5,
    "totalEquivalente": 9,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 6,
    "preEquivalente": 4,
    "noPreEquivalente": 5.5,
    "totalEquivalente": 9.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 6,
    "preEquivalente": 4,
    "noPreEquivalente": 6,
    "totalEquivalente": 10,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 7,
    "preEquivalente": 4,
    "noPreEquivalente": 0,
    "totalEquivalente": 4,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 7,
    "preEquivalente": 4,
    "noPreEquivalente": 0.5,
    "totalEquivalente": 4.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 7,
    "preEquivalente": 4,
    "noPreEquivalente": 1,
    "totalEquivalente": 5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 7,
    "preEquivalente": 4,
    "noPreEquivalente": 1.5,
    "totalEquivalente": 5.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 7,
    "preEquivalente": 4,
    "noPreEquivalente": 2,
    "totalEquivalente": 6,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 7,
    "preEquivalente": 4,
    "noPreEquivalente": 2.5,
    "totalEquivalente": 6.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 7,
    "preEquivalente": 4,
    "noPreEquivalente": 3,
    "totalEquivalente": 7,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 7,
    "preEquivalente": 4,
    "noPreEquivalente": 3.5,
    "totalEquivalente": 7.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 7,
    "preEquivalente": 4,
    "noPreEquivalente": 4,
    "totalEquivalente": 8,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 7,
    "preEquivalente": 4,
    "noPreEquivalente": 4.5,
    "totalEquivalente": 8.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 7,
    "preEquivalente": 4,
    "noPreEquivalente": 5,
    "totalEquivalente": 9,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 7,
    "preEquivalente": 4,
    "noPreEquivalente": 5.5,
    "totalEquivalente": 9.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 7,
    "preEquivalente": 4,
    "noPreEquivalente": 6,
    "totalEquivalente": 10,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 7,
    "preEquivalente": 4,
    "noPreEquivalente": 6.5,
    "totalEquivalente": 10.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 4,
    "noPrecedentesCount": 7,
    "preEquivalente": 4,
    "noPreEquivalente": 7,
    "totalEquivalente": 11,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 0,
    "preEquivalente": 5,
    "noPreEquivalente": 0,
    "totalEquivalente": 5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 1,
    "preEquivalente": 5,
    "noPreEquivalente": 0,
    "totalEquivalente": 5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 1,
    "preEquivalente": 5,
    "noPreEquivalente": 0.5,
    "totalEquivalente": 5.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 1,
    "preEquivalente": 5,
    "noPreEquivalente": 1,
    "totalEquivalente": 6,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 2,
    "preEquivalente": 5,
    "noPreEquivalente": 0,
    "totalEquivalente": 5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 2,
    "preEquivalente": 5,
    "noPreEquivalente": 0.5,
    "totalEquivalente": 5.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 2,
    "preEquivalente": 5,
    "noPreEquivalente": 1,
    "totalEquivalente": 6,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 2,
    "preEquivalente": 5,
    "noPreEquivalente": 1.5,
    "totalEquivalente": 6.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 2,
    "preEquivalente": 5,
    "noPreEquivalente": 2,
    "totalEquivalente": 7,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 3,
    "preEquivalente": 5,
    "noPreEquivalente": 0,
    "totalEquivalente": 5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 3,
    "preEquivalente": 5,
    "noPreEquivalente": 0.5,
    "totalEquivalente": 5.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 3,
    "preEquivalente": 5,
    "noPreEquivalente": 1,
    "totalEquivalente": 6,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 3,
    "preEquivalente": 5,
    "noPreEquivalente": 1.5,
    "totalEquivalente": 6.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 3,
    "preEquivalente": 5,
    "noPreEquivalente": 2,
    "totalEquivalente": 7,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 3,
    "preEquivalente": 5,
    "noPreEquivalente": 2.5,
    "totalEquivalente": 7.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 3,
    "preEquivalente": 5,
    "noPreEquivalente": 3,
    "totalEquivalente": 8,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 4,
    "preEquivalente": 5,
    "noPreEquivalente": 0,
    "totalEquivalente": 5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 4,
    "preEquivalente": 5,
    "noPreEquivalente": 0.5,
    "totalEquivalente": 5.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 4,
    "preEquivalente": 5,
    "noPreEquivalente": 1,
    "totalEquivalente": 6,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 4,
    "preEquivalente": 5,
    "noPreEquivalente": 1.5,
    "totalEquivalente": 6.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 4,
    "preEquivalente": 5,
    "noPreEquivalente": 2,
    "totalEquivalente": 7,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 4,
    "preEquivalente": 5,
    "noPreEquivalente": 2.5,
    "totalEquivalente": 7.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 4,
    "preEquivalente": 5,
    "noPreEquivalente": 3,
    "totalEquivalente": 8,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 4,
    "preEquivalente": 5,
    "noPreEquivalente": 3.5,
    "totalEquivalente": 8.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 4,
    "preEquivalente": 5,
    "noPreEquivalente": 4,
    "totalEquivalente": 9,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 5,
    "preEquivalente": 5,
    "noPreEquivalente": 0,
    "totalEquivalente": 5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 5,
    "preEquivalente": 5,
    "noPreEquivalente": 0.5,
    "totalEquivalente": 5.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 5,
    "preEquivalente": 5,
    "noPreEquivalente": 1,
    "totalEquivalente": 6,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 5,
    "preEquivalente": 5,
    "noPreEquivalente": 1.5,
    "totalEquivalente": 6.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 5,
    "preEquivalente": 5,
    "noPreEquivalente": 2,
    "totalEquivalente": 7,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 5,
    "preEquivalente": 5,
    "noPreEquivalente": 2.5,
    "totalEquivalente": 7.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 5,
    "preEquivalente": 5,
    "noPreEquivalente": 3,
    "totalEquivalente": 8,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 5,
    "preEquivalente": 5,
    "noPreEquivalente": 3.5,
    "totalEquivalente": 8.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 5,
    "preEquivalente": 5,
    "noPreEquivalente": 4,
    "totalEquivalente": 9,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 5,
    "preEquivalente": 5,
    "noPreEquivalente": 4.5,
    "totalEquivalente": 9.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 5,
    "preEquivalente": 5,
    "noPreEquivalente": 5,
    "totalEquivalente": 10,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 6,
    "preEquivalente": 5,
    "noPreEquivalente": 0,
    "totalEquivalente": 5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 6,
    "preEquivalente": 5,
    "noPreEquivalente": 0.5,
    "totalEquivalente": 5.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 6,
    "preEquivalente": 5,
    "noPreEquivalente": 1,
    "totalEquivalente": 6,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 6,
    "preEquivalente": 5,
    "noPreEquivalente": 1.5,
    "totalEquivalente": 6.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 6,
    "preEquivalente": 5,
    "noPreEquivalente": 2,
    "totalEquivalente": 7,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 6,
    "preEquivalente": 5,
    "noPreEquivalente": 2.5,
    "totalEquivalente": 7.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 6,
    "preEquivalente": 5,
    "noPreEquivalente": 3,
    "totalEquivalente": 8,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 6,
    "preEquivalente": 5,
    "noPreEquivalente": 3.5,
    "totalEquivalente": 8.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 6,
    "preEquivalente": 5,
    "noPreEquivalente": 4,
    "totalEquivalente": 9,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 6,
    "preEquivalente": 5,
    "noPreEquivalente": 4.5,
    "totalEquivalente": 9.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 6,
    "preEquivalente": 5,
    "noPreEquivalente": 5,
    "totalEquivalente": 10,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 6,
    "preEquivalente": 5,
    "noPreEquivalente": 5.5,
    "totalEquivalente": 10.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 6,
    "preEquivalente": 5,
    "noPreEquivalente": 6,
    "totalEquivalente": 11,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 7,
    "preEquivalente": 5,
    "noPreEquivalente": 0,
    "totalEquivalente": 5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 7,
    "preEquivalente": 5,
    "noPreEquivalente": 0.5,
    "totalEquivalente": 5.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 7,
    "preEquivalente": 5,
    "noPreEquivalente": 1,
    "totalEquivalente": 6,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 7,
    "preEquivalente": 5,
    "noPreEquivalente": 1.5,
    "totalEquivalente": 6.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 7,
    "preEquivalente": 5,
    "noPreEquivalente": 2,
    "totalEquivalente": 7,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 7,
    "preEquivalente": 5,
    "noPreEquivalente": 2.5,
    "totalEquivalente": 7.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 7,
    "preEquivalente": 5,
    "noPreEquivalente": 3,
    "totalEquivalente": 8,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 7,
    "preEquivalente": 5,
    "noPreEquivalente": 3.5,
    "totalEquivalente": 8.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 7,
    "preEquivalente": 5,
    "noPreEquivalente": 4,
    "totalEquivalente": 9,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 7,
    "preEquivalente": 5,
    "noPreEquivalente": 4.5,
    "totalEquivalente": 9.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 7,
    "preEquivalente": 5,
    "noPreEquivalente": 5,
    "totalEquivalente": 10,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 7,
    "preEquivalente": 5,
    "noPreEquivalente": 5.5,
    "totalEquivalente": 10.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 7,
    "preEquivalente": 5,
    "noPreEquivalente": 6,
    "totalEquivalente": 11,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 7,
    "preEquivalente": 5,
    "noPreEquivalente": 6.5,
    "totalEquivalente": 11.5,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  },
  {
    "precedentesCount": 5,
    "noPrecedentesCount": 7,
    "preEquivalente": 5,
    "noPreEquivalente": 7,
    "totalEquivalente": 12,
    "decision": "Fully Blocked",
    "razon": "Regla dura (conteo)"
  }
]
};
