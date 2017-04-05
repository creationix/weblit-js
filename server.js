let { addInspect } = require("./libs/bintools");
addInspect();
let { Server, autoHeaders, logger, files, websocket, request } = require("./libs/weblit");

console.log(Server);

new Server()
  .use(logger)      // To log requests to stdout
  .use(autoHeaders) // To ensure we send proper HTTP headers

  .route({
    method: "GET",
    path: "/:name"
  }, async (req, res) => {
    res.body = `Well hello ${req.params.name}!\n`;
    res.code = 200;
  })
  .start();
