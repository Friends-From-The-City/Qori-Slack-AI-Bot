const axios = require('axios');
const pdfParse = require('pdf-parse');

/**
 * Downloads a file from Slack and extracts text content
 * @param {string} slackFileUrl - The private Slack file URL
 * @param {string} slackToken - Slack bot token for authentication
 * @param {string} fileType - MIME type of the file
 * @returns {Promise<string>} - Extracted text content
 */
async function processSlackFile(slackFileUrl, slackToken, fileType) {
  try {
    // Download file from Slack
    const response = await axios.get(slackFileUrl, {
      headers: {
        'Authorization': `Bearer ${slackToken}`
      },
      responseType: 'arraybuffer'
    });
    console.log(`🚀 ~ processSlackFile: status=${response.status}, size=${response.data?.length || 0} bytes`);

    const buffer = Buffer.from(response.data);

    // Process based on file type
    if (fileType === 'application/pdf') {
      try {
        // Extract text from PDF using pdf-parse
        const pdfData = await pdfParse(buffer);
        console.log(`🚀 ~ PDF processed successfully: ${pdfData.text.length} characters extracted`);
        return pdfData.text;
      } catch (pdfError) {
        console.error('Error parsing PDF:', pdfError);
        return `[PDF Content - ${buffer.length} bytes - Error extracting text: ${pdfError.message}]`;
      }
    } else if (fileType.includes('text/') || fileType.includes('markdown')) {
      // Handle text files
      return buffer.toString('utf-8');
    } else if (fileType.includes('image/')) {
      // For images, return a description
      return `[Image file - ${buffer.length} bytes - content analysis would require OCR processing]`;
    } else {
      // For other file types, return a placeholder
      return `[File type ${fileType} - ${buffer.length} bytes - content extraction not implemented]`;
    }
  } catch (error) {
    console.error('Error processing Slack file:', error);
    throw new Error(`Failed to process file: ${error.message}`);
  }
}

/**
 * Processes multiple Slack files and returns their content
 * @param {Array} files - Array of Slack file objects
 * @param {string} slackToken - Slack bot token
 * @returns {Promise<Array>} - Array of file content objects
 */
async function processSlackFiles(files, slackToken) {
  const processedFiles = [];

  for (const file of files) {
    try {
      // Use url_private instead of url as that's what Slack provides
      const fileUrl = file.url_private || file.url;
      if (!fileUrl) {
        throw new Error('No file URL available');
      }

      const content = await processSlackFile(fileUrl, slackToken, file.mimetype);
      console.log(`🚀 ~ processSlackFiles: ${file.name}, ${content.length} chars`);
      processedFiles.push({
        name: file.name,
        type: file.mimetype,
        content: content,
        size: content.length
      });
    } catch (error) {
      console.error(`Error processing file ${file.name}:`, error);
      // Continue with other files even if one fails
      processedFiles.push({
        name: file.name,
        type: file.mimetype,
        content: `[Error processing file: ${error.message}]`,
        size: 0
      });
    }
  }

  return processedFiles;
}

module.exports = { processSlackFile, processSlackFiles };
