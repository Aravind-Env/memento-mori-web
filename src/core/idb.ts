/**
 * Tiny promise wrapper over IndexedDB. No dependencies — just enough plumbing
 * for the journal store: open, single-row ops, chunked cursor paging and
 * transactional bulk writes. Failures surface as rejections the repository
 * maps into calm user-facing errors.
 */

export type IDBHasBody = { idb: IDBDatabase }

export function req<T>(r: IDBRequest<T> | IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve((r as IDBRequest<T>).result)
    r.onerror = () => reject(r.error ?? new Error('IndexedDB request failed'))
  })
}

export function openDB(
  name: string,
  version: number,
  upgrade: (db: IDBDatabase, tx: IDBTransaction, oldVersion: number) => void,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(name, version)
    open.onupgradeneeded = (ev) => upgrade(open.result, open.transaction!, ev.oldVersion)
    open.onsuccess = () => resolve(open.result)
    open.onerror = () => reject(open.error ?? new Error('Could not open the journal database'))
    open.onblocked = () => reject(new Error('The journal database is open in another tab'))
  })
}

/** Reads every range result in one request (meta index boot only). */
export function getAll<T>(store: IDBObjectStore): Promise<T[]> {
  return req<T[]>(store.getAll())
}

/**
 * Keyset paging on a store ordered by primary key (dates sort lexically).
 * `startExclusive` resumes after the previous page's last key; `limit` rows.
 */
export function pageKeys<T>(
  store: IDBObjectStore,
  limit: number,
  startExclusive?: string,
  endAt?: string,
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const upper = endAt ? IDBKeyRange.upperBound(endAt, true) : undefined
    let range: IDBKeyRange | undefined = upper
    if (startExclusive) {
      const lower = IDBKeyRange.lowerBound(startExclusive, true)
      range = endAt ? IDBKeyRange.bound(lower.lower, upper!.upper, true, true) : lower
    }
    const out: T[] = []
    const cursor = store.openCursor(range)
    cursor.onsuccess = () => {
      const c = cursor.result
      if (!c || out.length >= limit) return resolve(out)
      out.push(c.value as T)
      c.continue()
    }
    cursor.onerror = () => reject(cursor.error ?? new Error('Paging failed'))
  })
}

/** Puts many rows in one transaction; chunks larger sets at the call site. */
export function bulkPut(store: IDBObjectStore, rows: unknown[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = store.transaction
    for (const r of rows) store.put(r as never)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Bulk write failed'))
  })
}
