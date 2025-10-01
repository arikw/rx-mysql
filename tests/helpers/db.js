const
  path = require('path'),
  fs = require('fs');

function getQueryFromFile(filePath) {
  return normalizeQuery(fs.readFileSync(path.join(__dirname, '..', filePath), 'utf8'));
}

function normalizeQuery(query) {
  return query
    .replace(/\r/g, '') // convert crlf to lf
    .replace(/^\s*--\s.*$/gm, '') // remove sql comments
    .replace(/^\s*$/gm, '') // trim empty lines
    .replace(/^\s*/gm, '') // trim leading whitespaces
    .replace(/\s*$/gm, '') // trim line end whitespaces
    .replace(/\n+/gm, '\n'); // remove empty lines
}

module.exports = {
  normalizeQuery,
  getQueryFromFile
};
