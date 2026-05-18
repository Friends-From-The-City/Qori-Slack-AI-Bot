import axios from 'axios';
import pdfParse from 'pdf-parse';

export interface SlackFile {
  name: string;
  mimetype: string;
  url_private?: string;
  url?: string;
  [key: string]: unknown;
}

interface ProcessedFile {
  name: string;
  type: string;
  content: string;
  size: number;
}

/**
 * Downloads a file from Slack and extracts text content.
 */
export async function processSlackFile(
  slackFileUrl: string,
  slackToken: string,
  fileType: string,
): Promise<string> {
  try {
    const response = await axios.get(slackFileUrl, {
      headers: {
        Authorization: `Bearer ${slackToken}`,
      },
      responseType: 'arraybuffer',
    });
    console.log(
      `processSlackFile: status=${response.status}, size=${response.data?.length || 0} bytes`,
    );

    const buffer = Buffer.from(response.data);

    if (fileType === 'application/pdf') {
      try {
        const pdfData = await pdfParse(buffer);
        console.log(`PDF processed successfully: ${pdfData.text.length} characters extracted`);
        return pdfData.text;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('Error parsing PDF:', err);
        return `[PDF Content - ${buffer.length} bytes - Error extracting text: ${message}]`;
      }
    } else if (fileType.includes('text/') || fileType.includes('markdown')) {
      return buffer.toString('utf-8');
    } else if (fileType.includes('image/')) {
      return `[Image file - ${buffer.length} bytes - content analysis would require OCR processing]`;
    } else {
      return `[File type ${fileType} - ${buffer.length} bytes - content extraction not implemented]`;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Error processing Slack file:', err);
    throw new Error(`Failed to process file: ${message}`);
  }
}

/**
 * Processes multiple Slack files and returns their content.
 */
export async function processSlackFiles(
  files: SlackFile[],
  slackToken: string,
): Promise<ProcessedFile[]> {
  const processedFiles: ProcessedFile[] = [];

  for (const file of files) {
    try {
      const fileUrl = file.url_private || file.url;
      if (!fileUrl) {
        throw new Error('No file URL available');
      }

      const content = await processSlackFile(fileUrl, slackToken, file.mimetype);
      console.log(`processSlackFiles: ${file.name}, ${content.length} chars`);
      processedFiles.push({
        name: file.name,
        type: file.mimetype,
        content,
        size: content.length,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Error processing file ${file.name}:`, err);
      processedFiles.push({
        name: file.name,
        type: file.mimetype,
        content: `[Error processing file: ${message}]`,
        size: 0,
      });
    }
  }

  return processedFiles;
}
