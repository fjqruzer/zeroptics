import Tesseract from 'tesseract.js';

export async function recognizeTextFromFile(file, onProgress) {
  // Accepts a File object (from input or camera capture)
  const { data: { text } } = await Tesseract.recognize(file, 'eng', {
    logger: onProgress ? onProgress : () => {},
  });
  return text;
} 