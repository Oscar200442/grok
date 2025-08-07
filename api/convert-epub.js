import { createReadStream, promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import PDFDocument from 'pdfkit';
import busboy from 'busboy';

export const config = {
  api: {
    bodyParser: false,
  },
};

const getTempDir = () => os.tmpdir();

const parseFormData = (req) => new Promise((resolve, reject) => {
  const bb = busboy({ headers: req.headers });
  const files = {};
  
  bb.on('file', (name, file, info) => {
    const { filename, encoding, mimeType } = info;
    const chunks = [];
    file.on('data', (chunk) => {
      chunks.push(chunk);
    });
    file.on('end', () => {
      files[name] = {
        name: filename,
        data: Buffer.concat(chunks),
        mimeType
      };
    });
  });
  
  bb.on('close', () => {
    resolve(files);
  });
  
  bb.on('error', (err) => {
    reject(err);
  });

  req.pipe(bb);
});

const extractTextFromEpub = async (epubFilePath) => {
  try {
    const fileContent = await fs.readFile(epubFilePath);
    const zip = await JSZip.loadAsync(fileContent);
    const parser = new XMLParser({ ignoreAttributes: false });

    let textContent = '';
    
    // Find the container.xml file
    const containerXmlFile = zip.file('META-INF/container.xml');
    if (!containerXmlFile) {
      throw new Error('container.xml not found in EPUB.');
    }
    const containerXml = await containerXmlFile.async('string');
    const container = parser.parse(containerXml);
    const opfPath = container.container.rootfiles.rootfile['full-path'];

    // Find the OPF file
    const opfFile = zip.file(opfPath);
    if (!opfFile) {
      throw new Error('OPF file not found in EPUB.');
    }
    const opfXml = await opfFile.async('string');
    const opf = parser.parse(opfXml);

    const manifestItems = opf.package.manifest.item;
    const spineItems = opf.package.spine.itemref;

    if (!spineItems || !manifestItems) {
      throw new Error('Spine or manifest not found.');
    }

    const getManifestItemById = (id) => Array.isArray(manifestItems) 
      ? manifestItems.find(item => item['@_id'] === id) 
      : (manifestItems['@_id'] === id ? manifestItems : null);

    for (const itemRef of (Array.isArray(spineItems) ? spineItems : [spineItems])) {
      const manifestItem = getManifestItemById(itemRef['@_idref']);
      if (manifestItem) {
        const itemPath = path.join(path.dirname(opfPath), manifestItem['@_href']);
        const xhtmlFile = zip.file(itemPath);
        if (xhtmlFile) {
          const xhtmlContent = await xhtmlFile.async('string');
          const cleanText = xhtmlContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
          if (cleanText) {
            textContent += cleanText + '\n\n';
          }
        }
      }
    }

    return textContent;
  } catch (error) {
    console.error('Extraction error:', error);
    throw new Error('Failed to extract text from EPUB file.');
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let tempDir = null;

  try {
    const files = await parseFormData(req);
    const epubFile = files.epubFile;

    if (!epubFile || epubFile.mimeType !== 'application/epub+zip') {
      return res.status(400).send('Invalid or no EPUB file found in request');
    }

    tempDir = await fs.mkdtemp(path.join(getTempDir(), 'epub-'));
    const epubPath = path.join(tempDir, epubFile.name);
    await fs.writeFile(epubPath, epubFile.data);

    const extractedText = await extractTextFromEpub(epubPath);

    if (!extractedText) {
      return res.status(500).send('Could not extract text from EPUB.');
    }
    
    // PDF Generation
    const doc = new PDFDocument();
    const buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(buffers);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${epubFile.name.replace('.epub', '.pdf')}"`);
      res.status(200).send(pdfBuffer);
    });

    // Write text to PDF
    const textLines = extractedText.split('\n');
    let isFirstLine = true;
    for (const line of textLines) {
      if (isFirstLine) {
        doc.text(line, { align: 'justify' });
        isFirstLine = false;
      } else {
        doc.text('\n' + line, { align: 'justify' });
      }
    }

    doc.end();

  } catch (error) {
    console.error('Error during EPUB to PDF conversion:', error);
    res.status(500).send('An error occurred during conversion.');
  } finally {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }
}
