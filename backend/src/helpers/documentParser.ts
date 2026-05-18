// documentParser.ts
// Structured parser for multiple documents to prevent AI hallucination

export interface DocumentInput {
  name?: string;
  content?: string;
  type?: string;
  size?: number;
  [key: string]: unknown;
}

interface DocumentMetadata {
  document_number: number;
  document_name: string;
  document_type: string;
  document_size: number;
  has_content: boolean;
  content_length: number;
}

interface ParsedDocuments {
  document_count: number;
  formatted_content: string;
  document_metadata: DocumentMetadata[];
  structured_format: string;
  documents?: Array<DocumentInput & { document_number: number; metadata: DocumentMetadata }>;
}

interface ValidationResult {
  isValid: boolean;
  message: string;
  document_count: number;
  empty_documents?: number;
  documents_with_content?: number;
}

/**
 * Parses multiple documents into a structured format that clearly separates
 * each document with metadata, reducing AI hallucination.
 */
export function parseDocuments(documents: DocumentInput[]): ParsedDocuments {
  if (!Array.isArray(documents) || documents.length === 0) {
    return {
      document_count: 0,
      formatted_content: '',
      document_metadata: [],
      structured_format: '',
    };
  }

  const documentMetadata: DocumentMetadata[] = documents.map((doc, index) => ({
    document_number: index + 1,
    document_name: doc.name || `Document ${index + 1}`,
    document_type: doc.type || 'Unknown',
    document_size: doc.size || 0,
    has_content: !!(doc.content && doc.content.trim().length > 0),
    content_length: doc.content ? doc.content.length : 0,
  }));

  const structuredFormat = documents
    .map((doc, index) => {
      const metadata = documentMetadata[index];
      const content = doc.content || '(No content available)';

      return `[DOCUMENT ${index + 1} START]
METADATA:
- Document Name: ${metadata.document_name}
- Document Type: ${metadata.document_type}
- Document Size: ${metadata.document_size} characters
- Content Length: ${metadata.content_length} characters

CONTENT:
${content}

[DOCUMENT ${index + 1} END]
`;
    })
    .join('\n\n---\n\n');

  const summaryFormat = `${structuredFormat}

=== DOCUMENT METADATA SUMMARY ===
Total Documents: ${documents.length}
${documentMetadata
  .map(
    (meta) =>
      `Document ${meta.document_number}: "${meta.document_name}" (${meta.document_type}, ${meta.content_length} characters of content)`,
  )
  .join('\n')}`;

  return {
    document_count: documents.length,
    formatted_content: structuredFormat,
    document_metadata: documentMetadata,
    structured_format: summaryFormat,
    documents: documents.map((doc, index) => ({
      ...doc,
      document_number: index + 1,
      metadata: documentMetadata[index],
    })),
  };
}

/**
 * Validates that document content exists before processing.
 */
export function validateDocuments(documents: DocumentInput[]): ValidationResult {
  if (!Array.isArray(documents) || documents.length === 0) {
    return {
      isValid: false,
      message: 'No documents provided. Please upload at least one document.',
      document_count: 0,
    };
  }

  const documentsWithContent = documents.filter(
    (doc) => doc.content && doc.content.trim().length > 0,
  );

  if (documentsWithContent.length === 0) {
    return {
      isValid: false,
      message:
        'Documents were uploaded but contain no readable content. Please check the file formats.',
      document_count: documents.length,
      empty_documents: documents.length,
    };
  }

  return {
    isValid: true,
    message: `Successfully parsed ${documentsWithContent.length} document(s) with content.`,
    document_count: documents.length,
    documents_with_content: documentsWithContent.length,
  };
}

/**
 * Creates a document summary for AI prompts that clearly states what documents exist.
 */
export function createDocumentSummary(documents: DocumentInput[]): string {
  const parsed = parseDocuments(documents);

  if (parsed.document_count === 0) {
    return 'NO DOCUMENTS PROVIDED';
  }

  return `DOCUMENTS PROVIDED: ${parsed.document_count} document(s)

${parsed.document_metadata
  .map(
    (meta) =>
      `Document ${meta.document_number}: "${meta.document_name}" (${meta.document_type}, ${meta.content_length} characters)`,
  )
  .join('\n')}

---FULL DOCUMENT CONTENT FOLLOWS---`;
}
