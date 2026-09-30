// tiny server that MUST send Content-Type: text/html (Chromium gotcha)
const http = require('http');
const fs = require('fs');
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(fs.readFileSync('/Users/alec/me/endo/index.html'));
}).listen(8931, () => console.log('up'));
