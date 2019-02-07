
import { flatten } from './bintools.js'
import { Shutdown, Write } from 'uv'
import { assert } from './assert.js'

function makeCloser (socket) {
  let closer = {
    read: false,
    written: false,
    errored: false
  }

  let closed = false

  function close () {
    if (closed) return
    closed = true
    if (!closer.readClosed) {
      closer.readClosed = true
      if (closer.onClose) {
        closer.onClose()
      }
    }
    socket.close()
  }

  closer.close = close

  closer.check = function check () {
    if (closer.errored || (closer.read && closer.written)) {
      return close()
    }
  }

  return closer
}

export function makeRead (socket, decode, closer) {
  // null = not started, true = flowing, false = paused
  let state = null

  // If writer > reader, there is data to be read.
  // if reader > writer, there is data required.
  let queue = []
  let reader = 0
  let writer = 0

  let concat = decode.concat || defaultConcat

  function onValue (err, val) {
    // console.log('<-', err || JSON.stringify(val))

    // If there is a pending writer, give it the data right away.
    if (reader > writer) {
      let { resolve, reject } = queue[writer]
      queue[writer++] = undefined
      return err ? reject(err) : resolve(val)
    }

    // Pause the read stream if we're buffering data already.
    if (state && writer > reader) {
      state = false
      // console.log('[[ READ STOP ]]')
      socket.readStop()
    }

    // Store the event in the queue waiting for a future reader
    queue[writer++] = { err, val }
  }

  closer.onClose = function onClose () {
    if (!closer.read) {
      closer.read = true
      return onValue(closer.errored)
    }
  }

  // buffer to store leftover data between decoder calls.
  let buffer

  function onData (err, array) {
    if (err) {
      closer.errored = err
      return closer.check()
    }
    if (!array) {
      if (closer.read) return
      closer.read = true
      onValue()
      return closer.check()
    }
    let chunk = new Uint8Array(array)
    if (!decode) return onValue(null, chunk)
    buffer = concat(buffer, chunk)
    let out
    let offset = 0
    while ((out = decode(buffer, offset))) {
      // console.log('OUT', out)
      offset = out[1]
      onValue(null, out[0])
    }
    buffer = buffer && buffer.length > offset ? buffer.slice(offset) : null
    // console.log('Done parsing')
  }

  async function read () {
    // If there is pending data, return it right away.
    if (writer > reader) {
      let { err, val } = queue[reader]
      queue[reader++] = undefined
      if (err) throw err
      return val
    }

    // Make sure the data is flowing since we need it.
    if (!state) {
      state = true
      // console.log('[[ READ START]]')
      socket.readStart(onData)
    }

    // Wait for the data or a parse error.
    return new Promise(function (resolve, reject) {
      queue[reader++] = { resolve, reject }
    })
  }

  read.updateDecode = (newDecode) => {
    decode = newDecode
    concat = decode.concat || defaultConcat
  }

  return read
}

function makeWrite (socket, encode, closer) {
  async function write (value) {
    if (closer.written) {
      throw new Error('Already shutdown')
    }

    // console.log('->', JSON.stringify(value))

    if (encode) value = encode(value)

    return new Promise((resolve, reject) => {
      if (value != null) {
        socket.write(
          new Write(),
          flatten(value).buffer,
          err => err ? reject(err) : resolve()
        )
      } else {
        socket.shutdown(new Shutdown(), err => {
          if (err) closer.errored = err
          closer.written = true
          closer.check()
          err ? reject(err) : resolve()
        })
      }
    })
  }

  write.updateEncode = function (newEncode) {
    encode = newEncode
  }

  return write
}

export function wrapRead (socket, decode) {
  let closer = makeCloser(socket)
  closer.written = true
  let read = makeRead(socket, decode, closer)
  read.close = closer.close
  return read
}

export function wrapWrite (socket, encode) {
  let closer = makeCloser(socket)
  closer.read = true
  let write = makeWrite(socket, encode, closer)
  write.close = closer.close
  return write
}

export function wrapStream (socket, { decode, encode }) {
  assert(socket && socket.write && socket.shutdown && socket.readStart && socket.readStop && socket.close, 'Missing stream functions')
  let closer = makeCloser(socket)
  let read = makeRead(socket, decode, closer)
  let write = makeWrite(socket, encode, closer)
  read.close = closer.close
  write.close = closer.close
  return { read, write }
}

function defaultConcat (buffer, chunk) {
  return (buffer && buffer.length) ? flatten([buffer, chunk]) : chunk
}
