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

/** 统一路径分隔符，避免同一文件因 `\` / `/` 差异被当成两篇文档 */
function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

/** 找出已经打开这个磁盘文件的文档 */
export function findOpenDocumentByPath(
  documents: StoredDocument[],
  filePath: string
): StoredDocument | undefined {
  const target = normalizePath(filePath);
  return documents.find((doc) => doc.filePath && normalizePath(doc.filePath) === target);
}

/**
 * 重新载入磁盘内容前，是否需要向用户确认。
 *
 * 只有「有未保存修改」且「磁盘内容与编辑器内容不同」时才算真正会丢稿；
 * 内容一致时直接刷新即可，不必打扰。
 */
export function wouldLoseEdits(
  existing: StoredDocument | undefined,
  file: DesktopFile
): boolean {
  if (!existing || !existing.dirty) return false;
  return existing.content !== file.content;
}

export function applyOpenedFile(
  documents: StoredDocument[],
  file: DesktopFile,
  activeDocId: string,
  now?: number
): { documents: StoredDocument[]; activeDocId: string } {
  void activeDocId;
  const existing = findOpenDocumentByPath(documents, file.path);
  if (existing) {
    const timestamp = now ?? Date.now();
    const updatedDoc: StoredDocument = {
      ...existing,
      // 磁盘上的路径写法可能和内存里不一致，统一成最新一次打开时的写法
      filePath: file.path,
      content: file.content,
      dirty: false,
      updatedAt: timestamp,
    };
    const nextDocuments = documents.map((doc) => (doc.id === existing.id ? updatedDoc : doc));
    return {
      documents: nextDocuments,
      activeDocId: existing.id,
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
