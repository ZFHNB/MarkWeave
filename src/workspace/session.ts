import type { StoredDocument } from "./store";

export interface DocumentSwitchInput {
  documents: StoredDocument[];
  activeDocId: string;
  nextDocId: string;
  isSourceMode: boolean;
  sourceBuffer: string | null;
  editorMarkdown: string;
}

export interface DocumentSwitchResult {
  documents: StoredDocument[];
  activeDocId: string;
  contentForNextDoc: string;
}

export function applyDocumentSwitch(
  input: DocumentSwitchInput
): DocumentSwitchResult {
  const targetDoc = input.documents.find((d) => d.id === input.nextDocId);
  if (!targetDoc) {
    throw new Error(`document not found: ${input.nextDocId}`);
  }

  const contentToSave =
    input.isSourceMode && input.sourceBuffer !== null
      ? input.sourceBuffer
      : input.editorMarkdown;

  const now = Date.now();
  const nextDocuments: StoredDocument[] = input.documents.map((doc) => {
    if (doc.id === input.activeDocId) {
      const isDirty = doc.dirty || doc.content !== contentToSave;
      return {
        ...doc,
        content: contentToSave,
        updatedAt: now,
        dirty: isDirty,
      };
    }
    return { ...doc };
  });

  const nextActiveDoc = nextDocuments.find((d) => d.id === input.nextDocId)!;

  return {
    documents: nextDocuments,
    activeDocId: input.nextDocId,
    contentForNextDoc: nextActiveDoc.content,
  };
}
