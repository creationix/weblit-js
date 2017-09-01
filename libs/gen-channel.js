import { Buffer } from 'buffer'
import { flatten } from './bintools'

export function makeRead (socket, decode) {
  // If writer > reader, there is data to be read.
  // if reader > writer, there is data required.
  let queue = []
  let reader = 0
  let writer = 0

  // null = not started, true = flowing, false = paused
  let state = null

  // buffer to store leftover data between decoder calls.
  let buffer

  let concat = decode.concat || defaultConcat

  function read () {
    // If there is pending data, return it right away.
    if (writer > reader) return queue[reader++]

    // Make sure the data is flowing since we need it.
    if (state === null) {
      state = true
      // console.log("Starting");
      socket.on('data', onData)
      socket.on('end', onData)
      socket.on('error', onError)
    } else if (state === false) {
      state = true
      // console.log("Resuming");
      socket.resume()
    }

    // Wait for the data or a parse error.
    return new Promise(function (resolve) {
      queue[reader++] = resolve
    })
  }

  read.updateDecode = (newDecode) => {
    decode = newDecode
    concat = decode.concat || defaultConcat
  }

  return read

  function onError (err) {
    console.error(err)
    onValue()
  }

  function onData (chunk) {
    try {
      if (!decode) { onValue(chunk); return }
      buffer = concat(buffer, chunk)
      let out
      let offset = 0
      while ((out = decode(buffer, offset))) {
        // console.log('OUT', out)
        offset = out[1]
        onValue(out[0])
      }
      buffer = buffer && buffer.length > offset ? buffer.slice(offset) : null
      // console.log('Done parsing')
    } catch (err) {
      console.error(err.stack || err)
      onValue()
    }
  }

  function onValue (value) {
    // console.log("<-", value);
    // If there is a pending writer, give it the data right away.
    if (reader > writer) {
      queue[writer++](value)
      return
    }

    // Pause the read stream if we're buffering data already.
    if (state && writer > reader) {
      state = false
      // console.log("Pausing");
      socket.pause()
    }

    queue[writer++] = value
  }
}

export function makeWrite (socket, encode) {
  function write (value) {
    // console.log("->", value);
    if (encode) value = encode(value)
    return new Promise((resolve, reject) => {
      if (value) socket.write(new Buffer(value), check)
      else socket.end(check)
      function check (err) {
        if (err) return reject(err)
        return resolve()
      }
    })
  }

  write.updateEncode = function (newEncode) {
    encode = newEncode
  }

  return write
}

function defaultConcat (buffer, chunk) {
  return (buffer && buffer.length) ? flatten([buffer, chunk]) : chunk
}
