import { CatalogData } from '../types/criminalTypes';

/**
 * Default built-in catalog loaded from:
 *  - Catalogo_Delitos.xlsx  (706 items)
 *  - Parametros.xlsx        (8 parameters)
 *  - Tabla_Decision.xlsx    (384 rules)
 *
 * This serves as the pre-loaded catalog for all users.
 * Can be overridden via the Catalog Manager UI or by uploading a new Excel file.
 */
export const DEFAULT_CATALOG: CatalogData = {
  "items": [
    {
      "nombre": "empleado publico que expropie bienes o pert",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "administración desleal de persona juridica art. 470 n°11",
      "riesgoG66": "MEDIO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "administracion desleal de persona juridica art. 470 ndeg11",
      "riesgoG66": "MEDIO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "administración desleal de persona natural art. 470 n°11",
      "riesgoG66": "MEDIO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "adquisicion material de guerra instituciones armadas",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "adquisicion o almacenamiento material pornografico infantil.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "alt ocul., dest. balanc.libros ant art.158 ley bancos",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "alteracion fraudulenta de precios.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "apropiacion de cotizaciones previsionales ley 17322",
      "riesgoG66": "MEDIO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "apropiacion indebida (incluye depositario alzado).",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "apropiacion indebida art.470 n°1",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "apropiacion indebida art.470 ndeg1",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "asociacion ilicita art. 28 ley 19.913",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "asociaciones ilicitas ley de drogas (art. 16).",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "asociaciones ilicitas.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "asociacisn ilicita terrorista.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "ataque a la integridad de datos informáticos art 4 ley 21459",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "ataque a la integridad de sist. informático art 1 ley 21459",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "atentado explosivo o incendiario. art. 2 no 4 ley 18.314.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "causar la muerte a personal de la policia de investigaciones",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "caza y comercializacion de especies prohibidas (art. 31 ley.",
      "riesgoG66": "MEDIO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "caza y pesca con violencia (494 no 21 codigo penal).",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "celebracion de contrato simulado.",
      "riesgoG66": "MEDIO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "cohecho cometido por empleado publico.art.248,248 bis y 249.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "cohecho o soborno cometido por particular. art. 250",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "colocac.bomba artefacto (art. 14 d inc. 1°, 2° y 3°)",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "colocac.bomba artefacto (art. 14 d inc. 1deg, 2deg y 3deg)",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "comerc.disposit.falsificados art.196 sexies ley transito",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "comerc.o distrib.senal proteg.telev.art 36b,ltr e,ley 18168",
      "riesgoG66": "MEDIO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "comercializar,distribuir, instalar maquinas juegos ilegales.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "comercio clandestino .",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "contrab. infrac a la ord. de aduan art 168. ley 20.780",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "contrabando de especies exoticas (art. 11, ley 20.962)",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "crimenes lesa humanidad y genocidio ley 20.357.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "crmmenes y simples delitos c/soberanma nac. y seg del estado",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "cultivo/cosecha espec.vegetales productoras estupef.(art.8.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "declarac maliciosa impuesto art 97 n 4 except inc 3 c trib",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "declarac. maliciosa impuesto art.97 no4.except inc.3 c.trib",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "delitos contra ley de propiedad intelectual.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "delitos de la ley de sociedades anonimas art. 134 ley 18.046",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "delitos del dl.3538 de 1979 que regula mercado financiero",
      "riesgoG66": "MEDIO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "delitos informaticos ley n: 19.223.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "delitos marcarios.",
      "riesgoG66": "MEDIO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "delitos marcarios.arts. 28 y 28 bis.ley no 19.039.",
      "riesgoG66": "MEDIO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "delitos que contempla el codigo tributario.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "deltos comet.pers.militar y gte de mar ly 20.000 art.14 y 15",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "deudor,gerente,direc,admin,repres actuen perjuicio acreedor",
      "riesgoG66": "MEDIO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "disparos injustif via publica (art. 14 d inc. final)",
      "riesgoG66": "MEDIO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "ejercicio irregular de martillero publico (art.23 ley 18.118",
      "riesgoG66": "MEDIO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "enriquecimiento ilicito.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "envio explosivos,homicidio,lesiones y secuestro terrorista.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "espionaje informatico art. 2 y 4 ley 19223.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "estafa (solo crimen)",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "estafas y otras defraudaciones contra particulares",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "exacciones ilegales cometidas por funcionario publico.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "extorsion. art. 438.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "fab, elab, mod, imp, exp, adq fuegos artificio art 10 inc 3o",
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
      "nombre": "facil facturas falsas. art 97 no 4. inc. final. codigo trib",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "falsifica de licencias medicas o pension art.202 inc.2° y 3°",
      "riesgoG66": "MEDIO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "falsifica de licencias medicas o pension art.202 inc.2deg y 3deg",
      "riesgoG66": "MEDIO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "falsificac.de rotulos o certificados art.48 ter (ley 19.300)",
      "riesgoG66": "MEDIO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "falsificacion de billetes art. 64 ley organica banco central",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "falsificacion de moneda y otros (art. 162 codigo penal).",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "falsificacion de obras protegidas por ley de propiedad intel",
      "riesgoG66": "MEDIO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "falsificacion o uso malicioso de doc públ art. 193,194,196",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "falsificacion o uso malicioso de documentos privados.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "falsificacion o uso maliciosos de documentos publicos.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "falsificacion placas,tarjetas,timbres y sellos de investigac",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "falsificación y uso malicioso de certificados (art. 203-205)",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "frau adu infrac a la orden. aduan art. 169. ley 20.780",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "fraude de subvenciones art 470 n°8",
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
      "nombre": "fraudes al fisco y organismos del estado (art. 239).",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "fraudes trans. electró. art. 7°, inciso final, ley n° 20.009",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "fraudes trans. electro. art. 7deg, inciso final, ley ndeg 20.009",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "giro dol cheq (fal fond) ac. penal priv. art. 22. dfl 707",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "giro dol cheq. (cuent cerr) ac. penal priv art. 22. dfl 707",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "giro doloso de cheques (solo crimen)",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "giro doloso de cheques ac. penal publica art. 42. dfl 707",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "hallazgo de drogas.",
      "riesgoG66": "MEDIO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "homicidio de fiscales o defensores en desempeno de funciones",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "homicidio de gendarme en el desempeno de sus funciones.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "infraccion a la ley mercado de valores (arts. 59 y 60 ley ).",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "infraccion ordenanza aduanas (fraude y contrabando).",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "lavado de dinero persona juridica art. 27 ley 19.913",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "lavado de dinero persona natural art. 27 ley 19.913",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "lavado de dinero persona natural art. 27 ley 19.913",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "ley n: 18,314 de conductas terroristas.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "mal uso de fondos fiscales financiamiento partido politico",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "mal uso fondos fiscales art. 30 dfl 3 de 2017(ley 19.884)",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "malversacion de caudales publicos.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "malversación de caudales publicos.arts.233, 234, 235 y 236",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "malversacion,defraudacion e incendio por menos de 1 utm.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "matar carabinero en ejercicio de funciones, justicia militar",
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
      "nombre": "obtencion de servicios sexuales de menores.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "obtencion fraudulenta de creditos.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "otras infracciones ley 18.892 de pesca",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "otros delitos de la ley 20.000.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "otros delitos ley de cuentas corrientes bancarias y cheque.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "otros delitos ley general de bancos.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "otros fraudes informáticos art. 7 ley 21.459",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "porte arma gue quimica, biolo nuclear (art. 14 inc. 2deg)",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "pose. tenencia arma guerr quim, biolo o nuc (art. 13 inc 1deg)",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "produccion material pornografico utilizando menores 18 anos.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "profugo de la justicia (robo con intimidacion)",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "prom. o facil. entr. o sal de perso del pais para prostituci",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "rec aduan infrac. orden. de aduanas. art. 182. ley 20780",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "recaud./proveer fondo comis.del.terror.pers.nat.art8ley18314",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "receptacion cometida por persona juridica art. 456 bis a",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "receptacion de vehiculos motorizados",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "receptacion. art. 456 bis a.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "robo (solo crimen)",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "robo calificado.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "robo con castracion, mutilacion o lesiones graves gravisimas",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "robo con fuerza de cajeros automaticos",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "robo con fuerza en las cosas.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "robo con homicidio.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "robo con intimidacion.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "robo con lesiones graves gravisimas art. 433 n: 2",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "robo con retencion de victimas o con lesiones graves.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "robo con retencion de victimas o lesiones graves art.433 n:3",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "robo con violencia, intimidacion de vehiculo motorizado",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "robo con violencia. art.433, 436 inc. 1:, 438 y 439.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "robo con violencia. art.436 inc. 1o 433, 438, 439.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "robo de vehiculo motorizado.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "robo de vehiculo utilizando elementos distractivos",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "robo en bienes nacionales de uso publico o sitiosno destin.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "robo en lugar habitado o destinado a la habitacion.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "robo en lugar no habitado.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "robo en ocasion de calamidad o alteracion al orden publico",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "robo o hurto de material de guerra",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "robo por sorpresa.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "sabotaje informatico.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "soborno func. publico extranjero,persona natural art.251 bis",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "soborno.art. 250. persona juridica",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "trafico de armas (art. 10)",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "trafico de especies vegetales art 10 ley 20.000",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "trafico de influencias.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "trafico de pequenas cantidades (art. 4).",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "trafico de residuos peligrosos (ley 20.920)",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "trafico ilicito de drogas (art. 3).",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "traicion, espionaje y demas delitos contra sob y seg estado",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "trata pers.para trabajos forzados y otros a.411 quat.inc.1",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "uso fraudulento de tarjetas o medios de pago. ley 20.009",
      "riesgoG66": "MEDIO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "usura.",
      "riesgoG66": "MEDIO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "usurpacion de aguas.",
      "riesgoG66": "MEDIO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "venta ilegal de cartuchos o municiones art. 9 a, ley 17.798",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "venta ilicita de obras protegidas por ley de propiedad intel",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "abandono de destino.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "abandono de niqos.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "abandono o maltrato animal art.291 bis.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "aborto cometido por facultativo por causales no reguladas",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "aborto consentido causales no reg. art. 342 no 3 y 344.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "aborto sin consentimiento.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "aborto.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "abusos contra particulares.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "abusos contra particulares.arts. 255.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "acceso, divulgacion y uso indebido de informaciongenetica.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "allanamientos irregulares.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "alteracion orden publico",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "amenazar simple o condicional. ,ofender pers.investigaciones",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "amenazas condic.c/personas y propiedades art.296 1y2,art.297",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "amenazas de atentados contra personas y propiedades.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "amenazas prof. y funcio. salud y manipula. de alimentos",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "amenazas simples contra personas y propiedades art. 296 no3.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "ampliacion de parte.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "apertura , registro o interceptacion de correspondencia.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "apoderamiento o atentado al transporte publico.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "apremios ilegitimos cometidos por empleados publicos.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "apremios ilegitimos con cuasidelito (art. 150 e n0 3)",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "aprop de monumentos nacionales art. 38 bis ley 17.288",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "arrojamiento de piedras u otros objetos (496 nr26 codigo pen",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "arrojar basura/desechos playas,parq.nac. u otros art.494 n°3",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "arrojar basura/desechos playas,parq.nac. u otros art.494 ndeg3",
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
      "nombre": "bigamia.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "calumnia (accion privada).",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "cond. bajo la influ del alcohol caus muer art. 193 inc 4",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "cond.bajo la influ del alcohol caus muer art. 193 inc 4",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "conduc bajo la inf. del alcohol art 193 inc. 2 ley de trans",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "conduc bajo la inf. del alcohol art 193 inc. 2 ley de trans",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "conduc bajo la influencia del alcohol causando lesiones.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "conduc vehic durante vig alg. sanci impuest art209 ley 18290",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "conduc. bajo influen del alcohol con o sin daños o les.leves",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "conduc. bajo la inf del alcohol art 193 inc. 3 ley de trans",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "conduc. ebriedad resul.lesiones grave.art 196 inc.2ley.trans",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "conduc. estado de ebriedad con o sin daños o lesiones leves",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "conduc.bajo influen del alcohol con o sin danos o les.leves.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "conduc.bajo la influ del alcohol caus muer art. 193 inc 4.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "conduc.bajo la influencia del alcohol.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "conduc.ebriedad resul.lesiones grave.art 196 inc.2ley.trans.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "conduc.ebriedad resul.lesiones menos grave.a196 i.2ley.trans",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "conduc.ebriedad resul.muerte art.196 inc.3ley.transito.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "conduc.ebriedad susp.lic. art.196y209 inc.2 ley.transito.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "conduc.estado de ebriedad con o sin danos o lesiones leves.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "conduc.estado de ebriedad con resultado de danos.art. 19.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "conduc.estado ebriedad c/result.lesiones graves o menos gra.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "conduc.estado ebriedad c/result.muerte o lesion graves grav.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "conduc.sin la licencia debida art 194 ley de transito.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "conduc.vehic durante vig alg.sanci impuest art209 ley 18290.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "conduccion ebriedad resul.muerte art.196 inc.3ley.transito.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "conduccion ebriedad resul.muerteart.196 inc.3ley.transito.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "conduccion estado de ebriedad con resultado de daños.art. 19",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "conduccion sin la licencia debida art 194 ley de transito.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "consumo de drogas (art. 41).",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "consumo/porte de drogas en lugares calificados (art. 51).",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "consumo/porte en lug.pub.o priv.c/previo concierto(art.50).",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "contra salud publica.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "contra salud publica. arts. 313 a y 313 b",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "contra salud publica. arts. 313 d al 315 y art. 317.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "corte/destr. arbol/arbusto. reg.art.21 4363,1931y ley bosque",
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
      "nombre": "cuasidelito de lesiones: art 490, 491 inc 2° y 492.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "cuasidelito de lesiones: art 490, 491 inc 2deg y 492.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "cuasidelito vehiculo motorizado ley transito",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "dano falta (495 nr 21 codigo penal).",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "danos a monumentos nacionales art.38 ley 17.288",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "danos calificados.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "danos o apropiacion sobre monumentos nacionales.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "danos simples.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "danos.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "dejar animales sueltos (496 nr 17 codigo penal).",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "delito desordenes publicos art. 269 (no falta del codigo 130",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "delitos contemplados en otros textos legales.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "delitos contenidos en el d.l. 1094 de extranjeria.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "delitos contenidos en la ley 19.620 de adopcisn de menores.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "delitos contenidos en leyes de prenda especiales ley 20.190.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "delitos contra la ley de bosque nativo.ley 20.283.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "delitos contra la libertad ambulatoria y el derecho de asoc.",
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
      "nombre": "delitos de la ley 4702 de compraventa bienes a plazo.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "delitos relativos al pago de pensiones alimenticias ley 14.9",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "denegacion de auxilio.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "depositario alzado art. 444 cpc",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "desacato (art. 240 codigo de procedimiento civil).",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "desatender el llamado a recl. dl 2306. art. 72",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "desordenes en espectaculos publicos (494 no 1 codigo penal).",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "destruccion o alteracion de deslindes.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "detencion, destierro o arresto irregular art. 148",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "dirigir reuniones tumultuosas art 494 no 2 codigo penal.",
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
      "nombre": "disensiones domesticas (495 nr 6 codigo penal).",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "divulg datos militante de part politico art 23 bis ley 18603",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "divulgacion identidad menores por medio comunicacion social.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "ejercicio ilegal de la profesion.art. 213. inc. 1o.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "empleador que ordena infringir cuarentena",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "ensenanza no autorizada de artes marciales (art.5 ley 18.356",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "expendio de bebidas alcoholicas a menores.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "fabricacion, acopio o comercializacion de hilo curado.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "falsa alarma de incendio, emergencia o calamidad publica",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "falsedades art. 367 al 371 codigo justicia militar",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "falsific.medios de pago transport. art 196 quater ley 18.290",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "falsificacion licencia de conducir y otras falsificaciones.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "falsotestimonio, perjurio o denuncia calumniosa.art. 206,.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "falta de respeto a autoridad publica (495 no 4 codigo penal)",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "faltas codigo penal conocidas por juzgados del crimen.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "ganado que entra a predio ajeno causando danos",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "inducir a un menor a abandonar el hogar.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "lanzar obj a via pub con muerte o lesiones (ley 21208 inc 2)",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "lesiones corporales.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "lesiones dano con motivo de espectaculo de futbol prof.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "lesiones graves gravisimas. art. 397 no 1.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "lesiones graves.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "lesiones leves 494 n°5 código penal",
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
      "nombre": "lesiones leves.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "lesiones menos graves.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "maltrato comet. p/pers. c/deber/cuid. art. 403 bis inc. fin.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "maltrato corp. menor. o personas vul. art. 403 bis inc. 1°.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "maltrato corp. menor. o personas vul. art. 403 bis inc. 1deg.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "maltrato de obra a personal de bomberos (art. 400 inc 3o)",
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
      "nombre": "maltrato habitual (vif) art. 14 ley 20.066.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "maltrato habitual(violencia intrafamiliar) (art. 14).",
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
      "nombre": "manejo en estado de ebriedad (solo crimen)",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "manejo en estado de ebriedad (sólo crimen)",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "negativa a efectuarse examen. art. 195 bis ley de transito",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "negativa a efectuarse examen. art. 195 bis ley de transito",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "negativa a efectuarse examen. art. 195 bis leyde transito",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "negativa injustificada a entregar copia (art. 28 y 29)",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "negligencia medica.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "no dar cuenta de accidente de transitoart. 195ley de tra.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "no inf. domicilio por delitos sexuales (nna) (art.372)",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "obtencion declaraciones forzadas.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "obtención fraudulenta beneficios covid 19",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "obtención fraudulenta de beneficios (art. 12 ley 21.252)",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "obtención fraudulenta de beneficios (art. 16 ley 21.247)",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "obtención fraudulenta de beneficios (art. 6 ley 21.256)",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "otros estragos.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "reclamo de clausura.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "uso malicioso recetas méd (art. 1o inc. final, ley 21.267)",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "usurpacion de estado civil.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "usurpacion de nombre.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "usurpacion de propiedad,descubrimiento o produccion.art.158.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "usurpacion no violenta (art. 458 codigo penal).",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "usurpacion violenta.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "usurpacion.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "violacion de morada.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "violencia en los estadios (art. 6 ley 19.327).",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "abuso sexual (solo crimen)",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "abuso sexual con contacto de menor de 14 anos. art. 366 bis",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "abuso sexual de mayor de 14 (con circunstancias de violación",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "abuso sexual mayor14 /sorpresa sin consemtim art.366 inc 3",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "abuso sexual sin contacto art. 366 quáter inc. 1° y 2",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "abuso sexual sin contacto art. 366 quater inc. 1deg y 2",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "accidente con resultado de muerte o lesiones graves. ley de.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "acoso sexual lug.públicos /libre acceso público art.494 ter",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "amenaza a fiscales o defensores en el desempeno de funciones",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "amenaza con arma (falta) art. 494 no 4 codigo penal.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "amenazasa carabineros (art. 417 cod. j.militar).",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "apremios ilegit violacion/abuso sex agrav/otros,art 150e n02",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "apremios ilegítimos con homicidio. (art. 150 e n 1°)",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "apremios ilegitimos con homicidio. (art. 150 e n 1deg)",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "apropiacion de cables tendido electrico o de comunicaciones.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "atentados y amenazas contra la autoridad. art. 261n? 1y.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "atentados y amenazas contra la autoridad. art. 261no 1y.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "castracion y mutilacion.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "crimenes y simples delitos art106 y ss cp",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "crimenes y simples delitos art106 y ss cp; art. 1 ley 12.927",
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
      "nombre": "crimenes y simples delitos art121 y ss cp; 4 y ss ley 12.927",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "crimenes y simples delitos seguridad interior del estado.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "cuasidelito de homicidio cometido por profesionales de la sa",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "cuasidelito de homicidio.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "delitos ley seguridad interior del estado 12.927 art. 6 - 12",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "extranje. ingresan o intentan egresar c/documentos falsific.",
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
      "nombre": "fals.medios de pago transport.art 196 quinquies ley transito",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "falsific/uso pasaporte/permiso porte de arma arts 199 al 201",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "femicidio intimo art. 390 bis",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "femicidio no intimo art. 390 ter.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "homicidio calificado.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "homicidio en rina o pelea.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "homicidio simple.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "homicidio.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "incendio con resultado de muerte y/o lesiones.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "infanticidio.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "maltrato obra a carabineros art. 416 bis codigo just.militar",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "muertes y hallazgo de cadaver.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "otros delit contra orden de flias, mora. pub. integr. sexual",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "parricidio.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "presunta desgracia infantil.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "secuestro",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "secuestro.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "profugo de la justicia",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "profugo de la justicia (asociación ilícita)",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "profugo de la justicia (homicidio)",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "profugo de la justicia (hurto de material de guerra)",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "profugo de la justicia (infracción a la ley 17.798 de armas)",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "profugo de la justicia (infracción a la ley 18.314 antiterrorista)",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "profugo de la justicia (infracción a la ley de armas)",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "profugo de la justicia (lesiones graves)",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "profugo de la justicia (maltrato de obra a carabineros)",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "profugo de la justicia (orden de detención pendiente)",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "profugo de la justicia (secuestro)",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "violacion (solo crimen)",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "violación de mayor de 14 años.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "faltas al regimen penitenciario",
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
      "nombre": "posesion tenencia o porte de mun y sust quimicas",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "daños a monumentos nacionales art.38 ley 17.288",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "infraccion ley 18.175 de quiebras.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "adquisicion y venta indebida de cartuchos y municiones. art.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "apremios ilegitimos con cuasidelito (art. 150 e n0 3) tráfico de armas (art. 10)",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "incendio de bosques (art. 476).",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "desordenes en espectáculos públicos (494 nº 1 código penal).",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "otros delit que afectan los dchos garant. por la constituc (también acá hay varios delitos, incluida violación de morada, según los ejemplos)",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "hurto (solo crimen)",
      "riesgoG66": "MEDIO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "revelar inf. obt.aplic.monitoreo telem.art23 q.inc3.ley18216",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "otras faltas codigo penal.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "asociac. ilicita para tráfico de personas art.411",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "obstruc.justicia p/fiscal o asist.fiscal,ministerio publico.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "amenaza a gendarme en el desempeño de sus funciones.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "atentados y amenazas contra la autoridad. art. 261nº 1y",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "propagar contagio a sabiendas",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "infidelidad en la custodia de documentos.",
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
      "nombre": "violacion de secretos de fabrica.art.284.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "posesión fuegos artificiales. art. 9 inc. final ley 21.310",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "daños calificados.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "oponerse a la accion de la autoridad publica o sus agentes.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "asociacion ilicita art. 27 ley 19.913",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "fabricación, acopio o comercialización de hilo curado.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "otros delit que afectan los dchos garant. por la constituc",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "infrac. ley 18.287 sobre jdo polic.local art 22 quater",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "daño falta (495 nr 21 codigo penal).",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "asociaciones ilícitas ley de drogas (art. 16).",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "asociaciones ilicitas. arts. 292 al 293 bis",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "asociacionilicita art. 27 ley 19.913",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "impedir acceso a playas (ley 21.149)",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "apremios ilegitimos con cuasidelito (art. 150 e n0 3) delitos de signifacion sexual.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "asociacisnilicita terrorista.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "tacha falsa firma auten ac penal publica art 43. d.l. 707",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "atentado contra jefe de estado o autoridad publica.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "causar la muerte a personal de la policia de investig",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "injurias y calumnias por medios de comunicacion social.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "porte de drogas (art. 41).",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "cohecho",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "instalacion indebida de señales del transito o barreras art.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "ocultamiento de placa patente (art. 192 letra e)",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "obstrucción a la investigacion. art. 269 bis y 269 ter",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "cohecho cometido por empleado público.art.248,248 bis y 249.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "transp desechos a vertederos clandest (art192 bis ley 20879)",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "falta de respeto a autoridad pública (495 nº 4 código penal)",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "cohecho.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "prolongacion de incomunicacion.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "apropiación de cotizac.previsionales y declaracion inexactas",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "mal uso inform.med.tec.transp.pub.art.196 septies ley trans",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "vigilancia privada no autorizada (art.5 bis decreto ley 3607",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "otorgamiento irregular de documentos art. 190 ley de transit",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "hurto simple por un valor de media a menos de 4 utm.",
      "riesgoG66": "MEDIO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "ejercicio ilegal de la profesión.art. 213. inc. 1º.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "comercializar,distribuir, instalar máquinas juegos ilegales.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "comercio clandestino&#160;.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "infracción a reglamento de carruajes públicos o particulares",
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
      "nombre": "comercio clandestino&nbsp;.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "incendio c/peligro para las personas arts.475 y 476 n01 y 2",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "cuasidelito de homicidio",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "cultivo estupefacientes/falsific recetas art. 8 ley n 20.000",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "violación de morada.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "lesiones leves 494 nº 5 código penal",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "desvioilicito precursores y sustancias esenciales (art.3).",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "infraccion a ley 11.564 de mataderos clandestinos.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "conduc.estado de ebriedad con resultado de daños.art. 19.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "lesiones graves gravisimas. art. 397 nro. 1.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "elaboracion ilegal de drogas o sustancias sicotropicas art.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "infraccion a la ley 11.564 de mataderos clandestinos.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "deudor,gerente,direc,admin,repres actúen perjuicio acreedor",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "riña pública (496 nº 10 código penal).",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "march sit suc sin prest aux victima. art 195 inc 2deg y 3deg",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "infracciones tributarias contempladas en otras leyes.",
      "riesgoG66": "MEDIO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "rendición falsa de cuenta electoral",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "infringir normas higiénicas y de salubridad",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "delitos de signifacion sexual.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "maltrato animal.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "estafas y otras defraudaciones contra particulares.art. 468,",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "infracciones a la ley 19132, sobre tvn art 9 ley 19.132",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "uso,facilitación o transporte de hilo curado.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "obstruccion a la justicia con ocasión de tratamiento de adn.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "otros delit. contra orden y seg. public comet por particul",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "peleas de animales como espectaculo. art.11 de la ley 2120",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "infraccisn normas inhumaciones y exhumaciones arts 320 y 322",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "exacciones ilegales cometidas por funcionario público.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "conduc.estado de ebriedad con o sin daños o lesiones leves.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "extorsion.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "otras faltas y delitos de la ley 19.733.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "infraccion articulo 454 c.penal.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "otros del. ley 19.327 sobre viol. en los estadios lesiones prof. y funcio. salud y manipula. de alimentos",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "infrac. ley de administ. prov. de sost. educ. ley 20.800",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "produccion y trafico por desvio de precursores art. 2 ley 20",
      "riesgoG66": "MEDIO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "loteos irregulares (art. 138 dfl 458, 1975, ley general de u",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "hallazgo de vehiculo.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "infracciones a la ley organica constitucional sobre votación",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "abandono de conyuge o deparientes enfermos.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "remisos (reclutamiento) dl 2306. art. 73",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "consumo/porte en lug.pub.opriv.c/previo concierto(art.50).",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "pesca ilegal arts 135, 136ter, 139, 139bis, 139ter ley 18892",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "fabricar, armar, transportar, importar sin autorizacion arma",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "conduccion ebriedad susp.lic. art.196y209 inc.2 ley.transito",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "rotura de sellos.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "uso de uniforme o insignias de ff.aa. o carabineros de chile",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "otros delitos contra la ley de propiedad intelectual.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "alteración orden público",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "desordenes en espectáculos públicos (494 nº1 código penal).",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "ultraje publico a las buenas costumbres.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "apropiación de cotizaciones previsionales ley 17322",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "contra salud pública. arts. 313 d al 315 y art. 317.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "uso de fuego artific sin autorización. art. 14 e, ley 17.798",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "infrac. ley 21086 que perfecciona benefic.otorgados bomberos",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "conduccion bajo la influencia del alcohol causando lesiones.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "facil facturas falsas. art 97 n° 4. inc. final. codigo trib",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "otros hechos que no constituyan delito: agrup.1008,1009,1011",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "falsificación de billetes art. 64 ley orgánica banco central",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "infracción al deber de información de la ley 19.913",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "amenaza a fiscales o defensores en el desempeño de funciones",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "suministro de hidrocarburos aromaticos a menores (art. 5).",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "negativa a efectuarse examen. art. 195 ley de transito",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "otras faltas contra la ley de alcoholes.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "hurto de bienes pertenecientes a redes de suministro publico",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "conduc.ebriedad resul.lesiones grave.art.196 inc.3ley.trans.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "hurto de hallazgo.",
      "riesgoG66": "MEDIO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "abigeato.",
      "riesgoG66": "MEDIO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "sabotaje informático.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "infraccion al art. 9 del decreto ley 2.695.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "infrac ley orgánica constit sobre votaciones ley 18.700",
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
      "nombre": "falsificacion de moneda y otros (art. 162 código penal).",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "otros delitos contra la ley del transito.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "conduc.bajo influen del alcohol con o sin daños o les.leves.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "connivencia en la fuga y evasión culpable de detenidos",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "se contemplan delitos relacionados con el tránsito vehicular, terrestre y aéreo.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "ofensas al pudor (495 nr 5 codigo penal).",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "tortura para anular voluntad (art. 150 a, inc. 4°)",
      "riesgoG66": "MEDIO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "peleas de animales como espectaculo. art.11 de la ley 21.020",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "daños.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "utilizacion sin autorizacion de obras de dominio ajeno por l",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "femicidio art.390 inc.2",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "invasion de derechos ajenos (art. 459 codigo penal).",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "fraudes al fisco y organismos del estado (art. 239)",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "interrumpir libre circulación (ley 21208 inc 1)",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "fraudes al fisco y organismos del estado (art. 239)..",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "atentado explosivo o incendiario. art.2 nº 4 ley 18.314.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "giro doloso de cheques (sólo crimen)",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "abusos contra particulares.art. 255.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "giro doloso de cheques ac. penal p&uuml;blica art. 42. dfl 707",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "otros del. ley 19.327 sobre viol. en los estadios (pueden ser con o sin violencia)",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "prescrip.medica abusiva drogas estupef.o sicotrop.(art.6).",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "infracciones a la seguridad social.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "consumo y otras faltas ley de drogas.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "otros delitos contra las personas",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "otros abusos contra particulares.art. 256,257,258,259.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "maltrato de obra a gendarme en el desempeño de sus funciones",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "otros delitos l.o.c. de investigaciones.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "giro doloso de cheques ac. penal pública art. 42. dfl 707",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "uso ilicito fuego art.18, 22, y 22 ter ds4363 ley de bosques",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "portar elementos para provocar incencio o estragos art. 481",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "giro doloso de cheques ac. penal püblica art. 42. dfl 707",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "portar elemento conocidamente destinados cometer delito robo",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "conduc. ebriedad resul.lesionesgrave.art 196 inc.2ley.trans",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "giro doloso de cheques.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "auxilio al suicidio.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "hurto simple por un valor de 4 a 40 utm.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "maltrato corp. menor. o personas vul. art. 403 bis inc. 1º.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "porte de arma cortante o punzante (288 bis).",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "infraccion en el otorgamiento prestaciones de isapre (art.23 (no aparecen en sistema las causas de este ítem)",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "infraccion ley 18.892 de pesca.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "ruidos molestos (495 nr 1 codigo penal).",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "homicidio de fiscales o defensores en desempeño de funciones",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "injuria (accion privada).",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "infraccion a la ley electoral.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "torturas cometidas p/funcionarios publ.(art. 150, a inc 1deg)",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "negociacion incompatible.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "homicidio en riña o pelea.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "otorgamiento de patentes de alcoholes.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "infraccion ley gral de telecomunicaciones art. 36 b",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "infracciones a la ley de seguridad nuclear (art. 41 a 47 ley",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "otros delit comet. por emp. públic.en el desem de sus cargos",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "delitos de la ley 17.322 sobre cotizaciones",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "usurpacion de atribuciones de empleados publicos y judiciale",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "infraccionporcontaminacion art.136 ley 18.892 de pesca",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "lesiones leves art. 494 n° 5",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "ingreso de celulares/tecnología a cárceles art 304 bis",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "delitos contemplados en otros textos legales. (sanciones disciplinarias contra presos, según los ejemplos)",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "lanzar obj a vía púb con muerte o lesiones (ley 21208 inc 2)",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "lavado de dinero.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "loteria ilegal, casas de juego y prestam sobre prenda",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "propag. de enfermed que afecten la salud animal o vegetal",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "inducir,permitir,facilitar,ocultar infrac.der. autor/conexos",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "inutilizacion dispos. monitoreo telem.art 23 s.inc1.ley18216",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "malversación,defraudación e incendio por menos de 1 utm.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "obtención de servicios sexuales de menores.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "conduc.estado de ebriedad con resultado de daños.art.19.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "infrac. ley 19.496,protec.consumidor art 54 o y 59 ter",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "infraccion al deber de informacion de la ley 19.913",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "obtencion indebida devol impuesto art 97 n 4 inc 3 cod tribu",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "infrac ley orgánica electoral arts. 54-57 y 77 ley 18.556",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "infracciones al cod. aeronautico (arts. 190, 194 bis, 195 a.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "organizar carreras no autorizadas. art. 197 ter.inc7°",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "saqueo",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "falsa alarma de incendio, emergencia o calamidad pública",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "obtencion indebida devol.impuesto.art 97 n.4.inc.3.cod.tribu",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "org, pertenecer, finan. o colaborar milicias priv (art. 8)",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "incendio solo c/danos o sin peligro propagacion.art.477,478.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "hurto en ocasión de calamidad o alteración al orden público",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "otras infrac a la ordenanza aduanas. ley 20.780",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "conduc.bajo influen del alcohol con o sin daños o les.leves",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "nombramientos ilegales.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "hurto falta (494 bis codigo penal).",
      "riesgoG66": "MEDIO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "abuso de firma en blanco.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "ocultacion de identidad (496 nr 5 codigo penal).",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "insolvencia punible (alzamiento de bienes).",
      "riesgoG66": "MEDIO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "march sitsuc sin prest aux víctima. art 195 inc 2° y 3°",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "otros del. ley 19.327 sobre viol. en los estadios",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "hurto agravado (art. 447 codigo penal).",
      "riesgoG66": "MEDIO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "hurto simple por un valor sobre 40 utm.",
      "riesgoG66": "MEDIO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "fraudulenta atribucion calidad de indigena art.5 ley 19.253.",
      "riesgoG66": "MEDIO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "otros delitos contra ley de propiedad industrial.",
      "riesgoG66": "MEDIO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "incendio solo c/daños o sin peligro",
      "riesgoG66": "MEDIO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "otras infracciones a la ley 19.913.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "deudor/gerente que perjudica acreed art 463, 463bis y 463ter",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "omision de denunciar por func. publico ley 20.000 art.13",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "otras infracciones a la ley del banco central.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "otros delitos contemplados en la ley n: 17.798.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "otros delitos de la ley de control de armas (ley 17.798)",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "conduc estado de ebriedad con o sin daños o lesiones leves.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "hurto simple.",
      "riesgoG66": "MEDIO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "ocult ident en control prevent art 496 n: 5 y 12 ley 20931",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "pesca ilegal art.139,139 bis y 139 ter. ley 18.892 de pesca",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "transporte o distribucion de gas e instalacion clandestinas.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "prescrip.médica abusiva drogas estupef.osicotróp.(art.6).",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "porte arma gue química, bioló nuclear (art. 14 inc. 2°)",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "porte de arma prohibida (art. 14 inc. 1°)",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "porte de arma prohibida (art. 14 inc. 1deg)",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "porte de armas prohibidas art. 14",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "porte ilegal de arma de fuego, municiones y otros sujetas a.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "pose. tenencia arma guerr quím, bioló o nuc (art. 13 inc 1°)",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "posesión o tenencia de armas prohibidas",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "infraccion normas inhumaciones y exhumaciones.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "posesión tenencia o porte de mun y sust químicas",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "march sit suc sin prest aux víctima. art 195 inc 2° y 3°",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "otros abusos contra particulares",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "posesión, tenencia o porte de armas sujetas a control",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "produc y trafico por desvio de precursores art. 2 ley 20.000",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "impedir ejerc de func a inspectores municip art 496 n0 3 cp",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "receptacion cometida por persona jurídica art. 456 bis a",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "otros delit contra la fe púb, falsific., falso testim y perj",
      "riesgoG66": "MEDIO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "receptación de vehículos motorizados",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "robo con castracion, mutilacion o lesiones graves gravísimas",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "delitos contra ley de propiedad industrial.",
      "riesgoG66": "MEDIO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "robo con violacion.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "robo con violencia, intimidación de vehículo motorizado",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "robo con violencia.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "robo con violencia. art.436 inc. 1º, 433, 439.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "ganado que entra a predio ajeno causando daños",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "sabotaje informático",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "conduc.bajo influ alcoh caus lesi grav gravi art 193 inc 4.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "ultraje publico buenas costumbres por medio comunic. social.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "tormentos y apremios cometidos por empleados publicos 150 a",
      "riesgoG66": "MEDIO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "infracciones a la ley de identidad de genero",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "soborno.art. 250. persona jurídica",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "infrac. ley gral telecom.art.letras a,b,c y d (excl.letra e)",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "soborno.art. 250. persona natural",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "disparos injustif vía pública (art. 14 d inc. final)",
      "riesgoG66": "MEDIO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "apropiación indebida cometido por pers.jurídica art.470 nº1.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "sustracción de madera art. 448 sept inc 1: y octies inc. 1:",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "sustraccion de menores.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "tenencia de armas prohibidas art. 13",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "aborto cometido por facultativo.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "apremios ilegítimos cometidos por empleados públicos.",
      "riesgoG66": "MEDIO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "conducción bajo la influencia del alcohol",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "daños simples.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "fingimiento de cargos o profesiones .art. 213 inc. 2.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "incendio con peligro para las personas: art 475 y art. 476",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "infrac sistema de aseg. calidadad educ, ley 20.845",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "infraccion por contaminacion art.136 ley 18.892 de pesca",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "tenencia ilegal de arma de fuego, municiones y otros sujetas",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "lesiones prof. y funcio. salud y manipula. de alimentos",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "maltrato obra a fiscales o defensores en desempeño funciones",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "tormentos y apremios cometidos por particulares 150 b",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "tortura con cuasidelito (art. 150 b n03)",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "posesión, tenencia o porte de armas sujetas a control.",
      "riesgoG66": "MEDIO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "presentacion de peritos,testigos o interpretes que faltaren.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "prevaricacion del abogado y procuradorarts. 231 y 232.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "prevaricacion judicial y administrativa art. 223 al 229.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "tortura con homicidio (art. 150 b n01)",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "tortura con violacion/abuso sex agrav/otros (art 150 b n0 2)",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "torturas cometidas p/funcionarios publ.(art. 150, a inc 1°)",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "torturas p/particulares agentes d/estado (art.150 a,inc. 20)",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "tráfico de armas (art. 10)",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "trafico de inmigrantes cometidos por funcionarios público",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "tacha falsa de firma autentica.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "abandono de armas o elementos sujetas a control. art. 14 a.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "trafico de migrantes 411 bis inciso 1, 2 y 3",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "incendio",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "infrac. a la ley 21075, sobre el mal uso de aguas grises",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "presunta desgracia.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "trafico de pequeñas cantidades (art. 4).",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "uso malicioso de identidad anterior (art. 35)",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "infidelidad en la custodia de documentos arts. 242, 243, 244",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "infraccion en el otorgamiento prestaciones de isapre (art.23",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "celebración de contrato simulado.",
      "riesgoG66": "MEDIO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "contra salud publica. arts. 313 d al 318.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "tolerancia al trafico o consumo de drogas art. 12.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "trafico ilícito de drogas (art. 3).",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "amenazasa carabineros (art. 417 cód. j.militar).",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "otras infracciones al csdigo de justicia militar.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "caza y pesca con violencia (494 nº 21 código penal).",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "superar límites fijados de velocidad max. art 197 quinquies",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "contrab. infrac a la ord. de aduan art 168 . ley 20.780",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "receta innecesaria de drogas.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "trata de personas para la explotación sexual",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "conduc. ebriedad resul.lesiones grave.art.196 inc.3ley.trans",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "aborto consentido.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "suministro indebido de drogas art.7 ley n° 20.000",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "perro potenc. pelig. no inscrito. art.16 de la ley 2120",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "daños o apropiación sobre monumentos nacionales.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "diseminar gérmenes para causar enfermedad",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "infrac inversion extran. directa en chile. ley 20.848.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "propagacion.art.477,478.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "quebrantamiento.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "violacion de secretos.",
      "riesgoG66": "MEDIO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "perro potenc. pelig. no inscrito. art.16 de la ley 21.020",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "trata pers.menores de 18 años. art. 411 quater inc. 2",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "trata pers.para explotación sexual art. 411 quater inc.2",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "invasión del giro bancario. art. 39 ley general de bancos",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "ocultacion o entrega de info.falsa a fne.art.39 h) d.l. 211",
      "riesgoG66": "MEDIO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "infr cod aeron art 133g; 190, 194bis,195a, 198, 200 ley18916",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "tortura para anular voluntad (art. 150 a, inc. 4deg)",
      "riesgoG66": "MEDIO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "uso fraudulento de tarjetas de crédito y débito.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "obstruccion a la investigación.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "tratos degradantes a personas vulnerables. art. 403 ter.",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "interrupcion de serv. electrico (art. 134 dfl 1, 1982, ley.",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "violacion con homicidio.",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "falsificación informática art. 5 ley 21.459",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "otros delitos dfl 252 de 1960 art. 110, 141, y 142, 157, 159",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "violación del secreto absoluto (art. 38)",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "veedor/liquidador realice conducta señalada art.464y 464 bis",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "infraccion al estatuto de capacitacion y empleo (art.76 y 81",
      "riesgoG66": "BAJO",
      "valor": 0,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "otros de los cuasidelitos",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "obstruccion o infrac. ley de violencia en los estadios",
      "riesgoG66": "MEDIO",
      "valor": 0.5,
      "tipo": "DELITOS NO PRECEDENTES"
    },
    {
      "nombre": "violacisn de secretos. art. 246, 247",
      "riesgoG66": "ALTO",
      "valor": 1,
      "tipo": "DELITOS PRECEDENTES"
    },
    {
      "nombre": "march sit suc sin prest aux víctima. art 195 inc 2° y 3°",
      "riesgoG66": "ALTO",
      "valor": 1,
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
