import { createReadStream, promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import pdfkit from 'pdfkit';

export const config = {
  api: {
    bodyParser: false,
  },
};

const getTempDir = () => os.tmpdir();

const getFormData = async (req) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  const boundary = req.headers['content-type'].split(';')[1].split('=')[1];
  
  const parts = buffer.toString('latin1').split(`--${boundary}`);
  
  let epubFile;
  for (const part of parts) {
    if (part.includes('filename="')) {
      const filenameMatch = part.match(/filename="([^"]+)"/);
      const filename = filenameMatch ? filenameMatch[1] : 'unnamed.epub';
      
      const contentStartIndex = part.indexOf('\r\n\r\n') + 4;
      const fileData = part.substring(contentStartIndex, part.length - 2);
      
      epubFile = {
        name: filename,
        data: Buffer.from(fileData, 'latin1')
      };
      break;
    }
  }
  return epubFile;
};

const extractTextFromEpub = async (epubFilePath) => {
  const fileContent = await fs.readFile(epubFilePath);
  const zip = await JSZip.loadAsync(fileContent);
  const parser = new XMLParser({ ignoreAttributes: false });

  let textContent = '';
  
  const containerXml = await zip.file('META-INF/container.xml').async('string');
  const container = parser.parse(containerXml);
  const opfPath = container.container.rootfiles.rootfile['full-path'];

  const opfXml = await zip.file(opfPath).async('string');
  const opf = parser.parse(opfXml);

  const manifestItems = opf.package.manifest.item;
  const spineItems = opf.package.spine.itemref;

  const getManifestItemById = (id) => manifestItems.find(item => item['@_id'] === id);
  const getXhtmlContent = async (item) => {
    const itemPath = path.join(path.dirname(opfPath), item['@_href']);
    const xhtmlFile = zip.file(itemPath);
    if (xhtmlFile) {
      const xhtmlContent = await xhtmlFile.async('string');
      return xhtmlContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }
    return '';
  };
  
  if (spineItems) {
    for (const itemRef of spineItems) {
      const manifestItem = getManifestItemById(itemRef['@_idref']);
      if (manifestItem) {
        const chapterText = await getXhtmlContent(manifestItem);
        textContent += chapterText + '\n\n';
      }
    }
  }

  return textContent;
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let tempDir = null;

  try {
    const epubFile = await getFormData(req);

    if (!epubFile) {
      return res.status(400).send('No EPUB file found in request');
    }

    tempDir = await fs.mkdtemp(path.join(getTempDir(), 'epub-'));
    const epubPath = path.join(tempDir, epubFile.name);
    await fs.writeFile(epubPath, epubFile.data);

    const extractedText = await extractTextFromEpub(epubPath);

    if (!extractedText) {
      return res.status(500).send('Could not extract text from EPUB.');
    }

    const doc = new pdfkit();
    const pdfPath = path.join(tempDir, epubFile.name.replace('.epub', '.pdf'));
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);
    doc.text(extractedText);
    doc.end();

    await new Promise((resolve) => stream.on('finish', resolve));

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${path.basename(pdfPath)}`);
    const fileStream = createReadStream(pdfPath);
    fileStream.pipe(res);

  } catch (error) {
    console.error('Error during EPUB to PDF conversion:', error);
    res.status(500).send('An error occurred during conversion.');
  } finally {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }
}
