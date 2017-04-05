let { addInspect } = require('./libs/bintools');
addInspect();
let { Server, autoHeaders, logger, files, websocket, request } = require('./libs/weblit');

console.log(Server);

new Server()
  .use(logger)      // To log requests to stdout
  .use(autoHeaders) // To ensure we send proper HTTP headers

  .use(files("www"))

  .route({
    method: 'GET',
    path: '/greet/:name'
  }, async (req, res) => {
    let dom = `<h1>Well hello ${req.params.name}!</h1>\n`;
    console.log(dom);
    res.body = dom;
    res.code = 200;
    res.headers.set('Content-Type', 'text/html');
  })
  .start();
