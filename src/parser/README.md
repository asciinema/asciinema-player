# Parsers

Parser is a function which transforms a recording encoded in an arbitrary file
format into a simple object representing a recording. Once the player fetches a
file it runs its contents through a parser which turns it into a recording
object ready to be played.

asciinema player uses very simple internal representation of a recording. The
object has following properties:

- `cols` - number of terminal columns (terminal width in chars),
- `rows` - number of terminal rows (terminal height in lines),
- `frames` - iterable (e.g. array, generator) of frames, where each frame is a 2
  element array containing frame time and a text to print (or specifically, to
  feed into virtual terminal emulator).

Example recording in its internal representation:

```javascript
{
  cols: 80,
  rows: 24,
  frames: [
    [1.0, 'hello '],
    [2.0, 'world!']
  ]
}
```

## Default parser

Default parser used by the player is [asciicast](asciicast.js) which handles
both [asciicast
v1](https://github.com/asciinema/asciinema/blob/develop/doc/asciicast-v1.md) and
[asciicast
v2](https://github.com/asciinema/asciinema/blob/develop/doc/asciicast-v2.md)
file formats.

The exact above recording object would be returned from asciicast parser when
invoked with following input text:

```javascript
import { parseAsciicast } from "asciinema-player/parser/asciicast";

parseAsciicast('{ "version": 2, "width": 80, "height": 24 }\n[1.0, "o", "hello "]\n[2.0, "o", "world!"]\n');
```

## Custom parser

The following example illustrates implementation and usage of a custom parser:

```javascript
import * as AsciinemaPlayer from 'asciinema-player';

function parseLogs(text) {
  return {
    cols: 80,
    rows: 24,
    frames: text.split('\n').map((line, i) => [i * 0.5, line + '\n'])
  }
};

AsciinemaPlayer.create(
  { url: '/access.log', parser: parseLogs },
  document.getElementById('demo')
);
```

`parseLogs` function parses a log file into a recording which prints one log
line every half a second.

It is then passed to `create` together with a URL as source argument, which
makes the player fetch a log file (`access.log`) and pass it through the parser
function.
