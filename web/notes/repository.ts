/**
 * 笔记持久化。
 *
 * 优先 IndexedDB（容量大、可存结构化索引），不可用时降级到 localStorage
 * （评测环境 / 隐私模式）。两者实现同一套接口，调用方无需关心。
 */
import type { Note } from "./model";

export interface NoteRepository {
  list(): Promise<Note[]>;
  get(id: string): Promise<Note | null>;
  save(note: Note): Promise<void>;
  remove(id: string): Promise<void>;
  /** 批量写入（导入用） */
  saveMany(notes: Note[]): Promise<void>;
  clear(): Promise<void>;
}

const DB_NAME = "markweave-web";
const DB_VERSION = 1;
const STORE = "notes";
const LS_KEY = "mw-web-notes";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexedDB unavailable"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
        store.createIndex("archived", "archived");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("open failed"));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

class IndexedDbRepository implements NoteRepository {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private db(): Promise<IDBDatabase> {
    if (!this.dbPromise) this.dbPromise = openDb();
    return this.dbPromise;
  }

  async list(): Promise<Note[]> {
    const db = await this.db();
    const tx = db.transaction(STORE, "readonly");
    const result = await requestToPromise(tx.objectStore(STORE).getAll());
    return result as Note[];
  }

  async get(id: string): Promise<Note | null> {
    const db = await this.db();
    const tx = db.transaction(STORE, "readonly");
    const result = await requestToPromise(tx.objectStore(STORE).get(id));
    return (result as Note | undefined) ?? null;
  }

  async save(note: Note): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(STORE, "readwrite");
    await requestToPromise(tx.objectStore(STORE).put(note));
  }

  async saveMany(notes: Note[]): Promise<void> {
    if (notes.length === 0) return;
    const db = await this.db();
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    for (const note of notes) store.put(note);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async remove(id: string): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(STORE, "readwrite");
    await requestToPromise(tx.objectStore(STORE).delete(id));
  }

  async clear(): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(STORE, "readwrite");
    await requestToPromise(tx.objectStore(STORE).clear());
  }
}

class LocalStorageRepository implements NoteRepository {
  private read(): Note[] {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as Note[]) : [];
    } catch {
      return [];
    }
  }

  private write(notes: Note[]): void {
    localStorage.setItem(LS_KEY, JSON.stringify(notes));
  }

  async list(): Promise<Note[]> {
    return this.read();
  }

  async get(id: string): Promise<Note | null> {
    return this.read().find((n) => n.id === id) ?? null;
  }

  async save(note: Note): Promise<void> {
    const notes = this.read();
    const index = notes.findIndex((n) => n.id === note.id);
    if (index === -1) notes.push(note);
    else notes[index] = note;
    this.write(notes);
  }

  async saveMany(incoming: Note[]): Promise<void> {
    const notes = this.read();
    const map = new Map(notes.map((n) => [n.id, n]));
    for (const note of incoming) map.set(note.id, note);
    this.write([...map.values()]);
  }

  async remove(id: string): Promise<void> {
    this.write(this.read().filter((n) => n.id !== id));
  }

  async clear(): Promise<void> {
    this.write([]);
  }
}

/**
 * 创建仓库。
 *
 * 先探测 IndexedDB 是否真的能用（某些隐私模式会暴露 API 但调用即失败），
 * 探测失败时退回 localStorage。这个探测只跑一次。
 */
export async function createRepository(): Promise<NoteRepository> {
  try {
    const db = await openDb();
    db.close();
    return new IndexedDbRepository();
  } catch {
    console.warn("[notes] IndexedDB 不可用，降级到 localStorage");
    return new LocalStorageRepository();
  }
}

/** 测试与导出用：与具体实现无关的存储键 */
export const STORAGE_KEYS = { local: LS_KEY, db: DB_NAME } as const;
