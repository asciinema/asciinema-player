# Parsers

Parser is a function, which transforms a recording encoded in an arbitrary file
format into a simple object representing a recording. Once the player fetches a
file, it runs its contents through a parser, which turns it into a recording
object used by player's [recording driver](../driver/recording.js).

Default parser used by the player is [asciicast parser](#asciicast), however
another [built-in](#built-in-parsers) or [custom parser](#custom-parser) can be
used by including `parser` option in source argument of
`AsciinemaPlayer.create`:

```javascript
AsciinemaPlayer.create({ url: url, parser: parser }, containerElement);
```

## Data model of a recording

asciinema player uses very simple internal representation of a recording. The
object has following properties:

- `cols` - number of terminal columns (terminal width in chars),
- `rows` - number of terminal rows (terminal height in lines),
- `output` - iterable (e.g. array, generator) of terminal writes, where each
  item is a 2 element array, containing write time (in seconds) + data written to
  a terminal,
- `input` (optional) - iterable of terminal reads (individual key presses),
  where each item is a 2 element array, containing read time (in seconds) and a
  character that was read from keyboard.

Example recording in its internal representation:

```javascript
{
  cols: 80,
  rows: 24,
  output: [
    [1.0, 'hello '],
    [2.0, 'world!']
  ]
}
```

## Built-in parsers

Built-in parser can be used by passing the parser name (string) as `parser`
option:

```javascript
AsciinemaPlayer.create({ url: url, parser: 'built-in-parser-name' }, containerElement);
```

### asciicast

`asciicast` parser handles both [asciicast
v1](https://github.com/asciinema/asciinema/blob/develop/doc/asciicast-v1.md) and
[asciicast
v2](https://github.com/asciinema/asciinema/blob/develop/doc/asciicast-v2.md)
file formats produced by [asciinema
recorder](https://github.com/asciinema/asciinema).

This parser is the default and does not have to be explicitly selected.

### typescript

`typescript` parser handles recordings in typescript format (not to be confused
with Typescript language) produced by venerable [script
command](https://www.man7.org/linux/man-pages/man1/script.1.html).

This parser supports both "classic" and "advanced" logging formats, including
input streams.

Usage:

```javascript
AsciinemaPlayer.create({
  url: ['/demo.timing', '/demo.data'],
  parser: 'typescript'
}, document.getElementById('demo'));
```

Note `url` above being an array of URLs pointing to typescript timing and data
files.

Usage for 3 file variant - timing file + output file + input file (created when
recording with `script --log-in <file>`):

```javascript
AsciinemaPlayer.create({
  url: ['/demo.timing', '/demo.output', '/demo.input'],
  parser: 'typescript'
}, document.getElementById('demo'));
```

If the recording was created in a terminal configured with character encoding
other than UTF-8 then `encoding` option should be used to specify matching
encoding to be used when decoding text:

```javascript
AsciinemaPlayer.create({
  url: ['/demo.timing', '/demo.data'],
  parser: 'typescript',
  encoding: 'iso-8859-2'
}, document.getElementById('demo'));
```

See [TextDecoder's encodings
list](https://developer.mozilla.org/en-US/docs/Web/API/Encoding_API/Encodings)
for valid names.

### ttyrec

`ttyrec` parser handles recordings in [ttyrec
format](https://nethackwiki.com/wiki/Ttyrec) produced by
[ttyrec](http://0xcc.net/ttyrec/), [termrec](http://angband.pl/termrec.html) or
[ipbt](https://www.chiark.greenend.org.uk/~sgtatham/ipbt/) amongst others.

This parser understands `\e[8;Y;Xt` terminal size sequence injected into the
first frame by termrec.

Usage:

```javascript
AsciinemaPlayer.create({
  url: '/demo.ttyrec',
  parser: 'ttyrec'
}, document.getElementById('demo'));
```

If the recording was created in a terminal configured with character encoding
other than UTF-8 then `encoding` option should be used to specify matching
encoding to be used when decoding text:

```javascript
AsciinemaPlayer.create({
  url: '/demo.ttyrec',
  parser: 'ttyrec',
  encoding: 'iso-8859-2'
}, document.getElementById('demo'));
```

See [TextDecoder's encodings
list](https://developer.mozilla.org/en-US/docs/Web/API/Encoding_API/Encodings)
for valid names.

## Custom parser

Custom format parser can be used by using a _function_ as `parser` option:

```javascript
AsciinemaPlayer.create({ url: url, parser: myParserFunction }, containerElement);
```

Custom parser function takes a [Response
object](https://developer.mozilla.org/en-US/docs/Web/API/Response) and returns
an object conforming to the [recording data model](#data-model-of-a-recording).

The following example illustrates implementation of a custom parser:

```javascript
import * as AsciinemaPlayer from 'asciinema-player';

function parse(response) {
  return {
    cols: 80,
    rows: 24,
    output: [[1.0, "hello"], [2.0, " world!"]]
  };
};

AsciinemaPlayer.create(
  { url: '/example.txt', parser: parse },
  document.getElementById('demo')
);
```

The above `parse` function returns a recording object, which makes the player
print "hello" (at time = 1.0 sec), followed by "world!" a second later.  The
parser is then passed to `create` together with a URL as source argument, which
makes the player fetch a file (`example.txt`) and pass it through the parser
function.

This parser is not quite there though because it ignores downloaded file's
content, always returning hardcoded output. Also, `cols` and `rows` are made up
as well - if possible they should be extracted from the file and reflect the
size of a terminal at the time recording session happened. The example
illustrates what kind of data the player expects though.

A more realistic example, where content of a file is actually used to construct
output, could look like this:

```javascript
async function parseLogs(response) {
  const text = await response.text();

  return {
    cols: 80,
    rows: 24,
    output: text.split('\n').map((line, i) => [i * 0.5, line + '\n'])
  };
};

AsciinemaPlayer.create(
  { url: '/example.log', parser: parseLogs },
  document.getElementById('demo')
);
```

`parseLogs` function parses a log file into a recording which prints one log
line every half a second.

This replays logs at a fixed rate. That's not very fun to watch. If log lines
started with a timestamp (where 0.0 means start of the recording) followed by
log message then the timestamp could be used for output timing.

For example:


```
# example.log
1.0 first log line
1.2 second log line
3.8 third log line
```

```javascript
async function parseLogs(response) {
  const text = await response.text();
  const pattern = /^([\d.]+) (.*)/;

  return {
    cols: 80,
    rows: 24,
    output: text.split('\n').map(line => {
      const [_, time, message] = pattern.exec(line);
      return [parseFloat(time), message + '\n']
    })
  };
};
```

Here's slightly more advanced parser, for [Simon Jansen's Star Wars
Asciimation](https://www.asciimation.co.nz/):

```javascript
const LINES_PER_FRAME = 14;
const FRAME_DELAY = 67;
const COLUMNS = 67;

async function parseAsciimation(response) {
  const text = await response.text();
  const lines = text.split('\n');

  return {
    cols: COLUMNS,
    rows: LINES_PER_FRAME - 1,

    output: function*() {
      let time = 0;
      let prevFrameDuration = 0;

      yield [0, '\x9b?25l']; // hide cursor

      for (let i = 0; i + LINES_PER_FRAME - 1 < lines.length; i += LINES_PER_FRAME) {
        time += prevFrameDuration;
        prevFrameDuration = parseInt(lines[i], 10) * FRAME_DELAY;
        const frame = lines.slice(i + 1, i + LINES_PER_FRAME).join('\r\n');
        let text = '\x1b[H'; // move cursor home
        text += '\x1b[J'; // clear screen
        text += frame; // print current frame's lines
        yield [time / 1000, text];
      }
    }()
  };
}

AsciinemaPlayer.create(
  { url: '/starwars.txt', parser: parseAsciimation },
  document.getElementById('demo')
);
```

It parses [Simon's Asciimation in its original format](starwars.txt) (please do
not redistribute without giving Simon credit for it), where each animation frame
is defined by 14 lines. First of every 14 lines defines duration a frame should
be displayed for (multiplied by a speed constant, by default `67` ms), while
lines 2-14 define frame content - text to display.

Note that `output` in the above parser function is a generator (note `*` in
`function*`) that is immediately called (note `()` after `}` at the end). In
fact `output` can be any iterable or iterator which is finite, which in practice
means you can return an array or a finite generator, amongst others.

All example parsers above parsed text (`response.text()`) however any binary
format can be parsed easily by using [binary data
buffer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/ArrayBuffer)
with [typed array
object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray)
like
[Uint8Array](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array):

```javascript
async function parseMyBinaryFormat(response) {
  const buffer = await response.arrayBuffer();
  const array = new Uint8Array(buffer);
  const output = [];
  const firstByte = array[0];
  const secondByte = array[1];
  // do something with the bytes to construct output

  return { cols: 80, rows: 24, output };
}
```

See [ttyrec.js](ttyrec.js) or [typescript.js](typescript.js) as examples of
binary parsers.
