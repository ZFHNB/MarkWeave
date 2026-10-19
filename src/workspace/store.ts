export const WORKSPACE_STORAGE_KEY = "markweave.workspace.v1";

export interface StoredDocument {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
  dirty: boolean;
}

export interface WorkspaceStateV1 {
  version: 1;
  documents: StoredDocument[];
  activeDocId: string;
  savedAt: number;
}

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createDocument(
  title?: string,
  content?: string,
  now?: number
): StoredDocument {
  return {
    id: generateId(),
    title: title ?? "未命名.md",
    content: content ?? "",
    updatedAt: now ?? Date.now(),
    dirty: false,
  };
}

export function createWorkspace(
  documents: StoredDocument[],
  activeDocId: string,
  now?: number
): WorkspaceStateV1 {
  return {
    version: 1,
    documents,
    activeDocId,
    savedAt: now ?? Date.now(),
  };
}

export function serializeWorkspace(state: WorkspaceStateV1): string {
  return JSON.stringify(state);
}

export function parseWorkspace(raw: string | null): WorkspaceStateV1 | null {
  if (!raw || typeof raw !== "string") {
    return null;
  }
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return null;
    }
    if (data.version !== 1) {
      return null;
    }
    if (!Array.isArray(data.documents)) {
      return null;
    }
    if (typeof data.activeDocId !== "string") {
      return null;
    }
    if (typeof data.savedAt !== "number") {
      return null;
    }
    for (const doc of data.documents) {
      if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
        return null;
      }
      if (
        typeof doc.id !== "string" ||
        typeof doc.title !== "string" ||
        typeof doc.content !== "string" ||
        typeof doc.updatedAt !== "number" ||
        typeof doc.dirty !== "boolean"
      ) {
        return null;
      }
    }
    return data as WorkspaceStateV1;
  } catch {
    return null;
  }
}

export function loadWorkspace(
  storage: Storage,
  fallback: WorkspaceStateV1
): WorkspaceStateV1 {
  try {
    const raw = storage.getItem(WORKSPACE_STORAGE_KEY);
    const parsed = parseWorkspace(raw);
    return parsed !== null ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function saveWorkspace(
  state: WorkspaceStateV1,
  storage: Storage
): void {
  const serialized = serializeWorkspace(state);
  storage.setItem(WORKSPACE_STORAGE_KEY, serialized);
}

export function uniqueTitle(
  documents: StoredDocument[],
  baseTitle: string
): string {
  const existingTitles = new Set(documents.map((d) => d.title));
  if (!existingTitles.has(baseTitle)) {
    return baseTitle;
  }

  const hasMdExt = /\.md$/i.test(baseTitle);
  const baseName = hasMdExt ? baseTitle.slice(0, -3) : baseTitle;
  let index = 2;
  while (true) {
    const candidate = `${baseName} (${index}).md`;
    if (!existingTitles.has(candidate)) {
      return candidate;
    }
    index++;
  }
}
