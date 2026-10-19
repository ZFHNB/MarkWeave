import {
  type StoredDocument,
  createDocument,
  uniqueTitle,
} from "../workspace/store";

export interface DesktopFile {
  path: string;
  content: string;
}

export function extractFileName(filePath: string): string {
  if (!filePath || typeof filePath !== "string") {
    return "未命名.md";
  }
  const normalized = filePath.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  const rawName = lastSlash === -1 ? normalized : normalized.slice(lastSlash + 1);
  const trimmed = rawName.trim();
  return trimmed.length > 0 ? trimmed : "未命名.md";
}

export function applyOpenedFile(
  documents: StoredDocument[],
  file: DesktopFile,
  activeDocId: string,
  now?: number
): { documents: StoredDocument[]; activeDocId: string } {
  void activeDocId;
  const existingIndex = documents.findIndex((d) => d.filePath === file.path);
  if (existingIndex !== -1) {
    const timestamp = now ?? Date.now();
    const targetDoc = documents[existingIndex];
    const updatedDoc: StoredDocument = {
      ...targetDoc,
      content: file.content,
      dirty: false,
      updatedAt: timestamp,
    };
    const nextDocuments = [...documents];
    nextDocuments[existingIndex] = updatedDoc;
    return {
      documents: nextDocuments,
      activeDocId: targetDoc.id,
    };
  }

  const baseTitle = extractFileName(file.path);
  const title = uniqueTitle(documents, baseTitle);
  const newDoc = createDocument(title, file.content, now, file.path);
  return {
    documents: [...documents, newDoc],
    activeDocId: newDoc.id,
  };
}

export function markDocumentSaved(
  documents: StoredDocument[],
  docId: string,
  filePath: string,
  now?: number
): StoredDocument[] {
  const timestamp = now ?? Date.now();
  return documents.map((doc) => {
    if (doc.id === docId) {
      return {
        ...doc,
        filePath,
        dirty: false,
        updatedAt: timestamp,
      };
    }
    return { ...doc };
  });
}

export function suggestedSaveName(
  documents: StoredDocument[],
  activeDocId: string
): string {
  const current = documents.find((doc) => doc.id === activeDocId);
  if (!current || !current.title || !current.title.trim()) {
    return "未命名.md";
  }
  return current.title.trim();
}
