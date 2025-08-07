import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import formidable from 'formidable';

export const config = {
  api: {
    bodyParser: false,
  },
};

const extractTextFromEpub = async (epubData) => {
  try {
    const zip = await JSZip.loadAsync(epubData);
    const parser = new XMLParser({ ignoreAttributes: false });
    let textContent = '';

    const containerXmlFile = zip.file('META-INF/container.xml');
    if (!containerXmlFile) {
      throw new Error('container.xml not found in EPUB.');
    }
    const container = parser.parse(await containerXmlFile.async('string'));
    const opfPath = container.container.rootfiles.rootfile['full-path'];

    const opfFile = zip.file(opfPath);
    if (!opfFile) {
      throw new Error('OPF file not found in EPUB.');
    }
    const opf = parser.parse(await opfFile.async('string'));

    const manifestItems = opf.package.manifest.item;
    const spineItems = opf.package.spine.itemref;

    if (!spineItems || !manifestItems) {
      throw new Error('Spine or manifest not found.');
    }

    const getManifestItemById = (id) =>
      Array.isArray(manifestItems)
        ? manifestItems.find((item) => item['@_id'] === id)
        : manifestItems['@_id'] === id
        ? manifestItems
        : null;

    for (const itemRef of Array.isArray(spineItems) ? spineItems : [spineItems]) {
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

  const form = formidable({ multiples: false });
  const [fields, files] = await new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      resolve([fields, files]);
    });
  });

  const epubFile = files.epubFile?.[0];
  if (!epubFile || epubFile.mimetype !== 'application/epub+zip') {
    return res.status(400).send('Invalid or no EPUB file found in request');
  }

  try {
    const epubData = await fs.readFile(epubFile.filepath);
    const extractedText = await extractTextFromEpub(epubData);
    
    if (!extractedText) {
      return res.status(500).send('Could not extract text from EPUB.');
    }

    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const pageSize = pdfDoc.getPageSizes()[0];
    const margin = 50;
    const pageWidth = pageSize.width - 2 * margin;
    const lineHeight = 14;

    const lines = extractedText.split('\n');
    let page = pdfDoc.addPage();
    let y = pageSize.height - margin;

    for (const line of lines) {
      const textWidth = helveticaFont.widthOfTextAtSize(line, 12);
      const textLines = textWidth > pageWidth ? line.match(new RegExp(`.{1,${Math.floor(pageWidth / (12 / helveticaFont.widthOfTextAtSize('a', 12)))}}`, 'g')) : [line];

      for (const textLine of textLines) {
        if (y < margin) {
          page = pdfDoc.addPage();
          y = pageSize.height - margin;
        }
        page.drawText(textLine, {
          x: margin,
          y: y,
          size: 12,
          font: helveticaFont,
          color: rgb(0, 0, 0),
        });
        y -= lineHeight;
      }
    }

    const pdfBytes = await pdfDoc.save();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${epubFile.originalFilename.replace('.epub', '.pdf')}"`);
    return res.status(200).send(Buffer.from(pdfBytes));
  } catch (error) {
    console.error('Error during EPUB to PDF conversion:', error);
    return res.status(500).send('An error occurred during conversion.');
  }
}
