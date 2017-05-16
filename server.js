
let { Server, autoHeaders, logger, files, websocket } = require('./libs/weblit')

console.log(Server)

new Server()
  .use(logger)      // To log requests to stdout
  .use(autoHeaders) // To ensure we send proper HTTP headers

  .use(files('www'))

  .route({
    method: 'GET',
    path: '/greet/:name'
  }, async (req, res) => {
    let dom = `<h1>Well hello ${req.params.name}!</h1>\n`
    console.log(dom)
    res.body = dom
    res.code = 200
    res.headers.set('Content-Type', 'text/html')
  })

  .route({
    path: '/socket/:param'
  }, websocket(async (req, read, write) => {
    console.log('Websocket', req)
    let message
    while ((message = await read())) {
      console.log('MESSAGE', message)
      write(message)
    }
    write()
  }))

  .start()
