// Firestore EN MEMORIA para probar lens-flujo-autonomo sin tocar producción.
// Implementa solo lo que usa el Lambda. Semántica que importa reproducir:
//   · set(…, {merge:true}) CREA el documento si no existe (el bug del 15-10);
//   · update() falla con NOT_FOUND si no existe;
//   · count() / where('in') / orderBy(documentId) / limit.
export const store = (globalThis.__FAKE_FS ??= new Map());   // ruta → datos (compartido con el test)
export const FieldPath = { documentId: () => '__id__' };
export const FieldValue = { serverTimestamp: () => ({ __st: true }) };
// Bases con nombre: sus documentos van en el mismo mapa con el prefijo `@nombre/`.
// `globalThis.__FAKE_FS_FALLA` = nombre de una base cuyas operaciones fallan.
const fallaSi = path => {
  const b = globalThis.__FAKE_FS_FALLA;
  if (b && path.startsWith(`@${b}/`)) throw Object.assign(new Error('14 UNAVAILABLE: base no disponible (simulado)'), { code: 14 });
};
const resolver = v => {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    if (v.__st === true) return new Date().toISOString();
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolver(x)]));
  }
  return Array.isArray(v) ? v.map(resolver) : v;
};

const clonar = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const esMapa = v => v && typeof v === 'object' && !Array.isArray(v);
function fusionar(a, b) {
  const out = { ...(a ?? {}) };
  for (const [k, v] of Object.entries(b)) out[k] = esMapa(v) && esMapa(out[k]) ? fusionar(out[k], v) : clone1(v);
  return out;
}
const clone1 = v => clonar(v);
const noExiste = () => Object.assign(new Error('5 NOT_FOUND: No document to update'), { code: 5 });

class Snap {
  constructor(ref, data) { this.ref = ref; this.id = ref.id; this._d = data; this.exists = data !== undefined; }
  data() { return clonar(this._d); }
}

class DocRef {
  constructor(path) { this.path = path; }
  get id() { return this.path.split('/').pop(); }
  collection(n) { return new Query(`${this.path}/${n}`); }
  async get() { fallaSi(this.path); return new Snap(this, clonar(store.get(this.path))); }
  async set(d, o) { escribir(this.path, d, o); }
  async update(d) { if (!store.has(this.path)) throw noExiste(); escribir(this.path, d, { merge: true }); }
  async delete() { store.delete(this.path); }
}

function escribir(path, d, o) {
  fallaSi(path);
  const v = resolver(clonar(d));
  store.set(path, o?.merge ? fusionar(store.get(path), v) : v);
}

class Query {
  constructor(path, filtros = [], orden = null, tope = null, desde = null, campos = null) {
    Object.assign(this, { path, filtros, orden, tope, desde, campos });
  }
  _con(cambio) { return Object.assign(new Query(this.path, this.filtros, this.orden, this.tope, this.desde, this.campos), cambio); }
  doc(id) { return new DocRef(`${this.path}/${id}`); }
  where(c, op, vals) { return this._con({ filtros: [...this.filtros, { c, op, vals }] }); }
  orderBy(c, dir = 'asc') {
    // Como en producción: ordenar por id DESCENDENTE pide un índice que no hay.
    if (c === '__id__' && dir === 'desc') throw Object.assign(new Error('9 FAILED_PRECONDITION: The query requires an index.'), { code: 9 });
    return this._con({ orden: { c, dir } });
  }
  limit(n) { return this._con({ tope: n }); }
  startAfter(snap) { return this._con({ desde: snap.id }); }
  select(...campos) { return this._con({ campos }); }
  _docs() {
    const pref = this.path + '/';
    let ids = [...store.keys()].filter(k => k.startsWith(pref) && !k.slice(pref.length).includes('/'))
      .map(k => k.slice(pref.length)).sort();
    for (const f of this.filtros) {
      ids = ids.filter(id => { const v = store.get(pref + id)?.[f.c]; return f.op === 'in' ? f.vals.includes(v) : v === f.vals; });
    }
    if (this.desde != null) ids = ids.filter(id => id > this.desde);
    if (this.tope != null) ids = ids.slice(0, this.tope);
    const recortar = d => (this.campos ? Object.fromEntries(this.campos.filter(c => d && c in d).map(c => [c, d[c]])) : d);
    return ids.map(id => new Snap(this.doc(id), clonar(recortar(store.get(pref + id)))));
  }
  async get() { fallaSi(this.path); const docs = this._docs(); return { docs, size: docs.length, empty: docs.length === 0 }; }
  count() { return { get: async () => ({ data: () => ({ count: this._docs().length }) }) }; }
  async add(d) { const ref = this.doc(`auto${Math.random().toString(36).slice(2, 10)}`); escribir(ref.path, d); return ref; }
}

const hacerDb = (prefijo) => ({
  collection: n => new Query(prefijo + n),
  batch() {
    const ops = [];
    return {
      set: (r, d, o) => ops.push(() => escribir(r.path, d, o)),
      update: (r, d) => ops.push(() => { if (!store.has(r.path)) throw noExiste(); escribir(r.path, d, { merge: true }); }),
      create: (r, d) => ops.push(() => {
        if (store.has(r.path)) throw Object.assign(new Error('6 ALREADY_EXISTS: Document already exists'), { code: 6 });
        escribir(r.path, d);
      }),
      // Atómico como en Firestore: si una operación falla, no se aplica ninguna.
      commit: async () => {
        for (const op of ops) if (op.chequeo) op.chequeo();
        const copia = new Map(store);
        try { for (const op of ops) op(); } catch (e) { store.clear(); for (const [k, v] of copia) store.set(k, v); throw e; }
      },
    };
  },
  async runTransaction(fn) {
    const ops = [];
    const tx = {
      get: r => r.get(),
      set: (r, d, o) => ops.push(() => escribir(r.path, d, o)),
      update: (r, d) => ops.push(() => { if (!store.has(r.path)) throw noExiste(); escribir(r.path, d, { merge: true }); }),
      create: (r, d) => ops.push(() => {
        if (store.has(r.path)) throw Object.assign(new Error('6 ALREADY_EXISTS: Document already exists'), { code: 6 });
        escribir(r.path, d);
      }),
    };
    const out = await fn(tx);
    for (const op of ops) op();
    return out;
  },
  getAll: (...refs) => Promise.all(refs.map(r => r.get())),
});

const bases = new Map();
export const getFirestore = (_app, nombre) => {
  const prefijo = nombre && nombre !== '(default)' ? `@${nombre}/` : '';
  if (!bases.has(prefijo)) bases.set(prefijo, hacerDb(prefijo));
  return bases.get(prefijo);
};
