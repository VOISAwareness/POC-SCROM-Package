// Zips samples/sample-course into samples/sample-course.zip for testing uploads.
const path = require('path');
const AdmZip = require('adm-zip');

const src = path.join(__dirname, '..', 'samples', 'sample-course');
const out = path.join(__dirname, '..', 'samples', 'sample-course.zip');
const zip = new AdmZip();
zip.addLocalFolder(src);
zip.writeZip(out);
console.log(`Wrote ${out}`);
