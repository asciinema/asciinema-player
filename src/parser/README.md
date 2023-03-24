# Parsers

Parser is a function, which transforms a recording encoded in an arbitrary file
format into a simple object representing a recording. Once the player fetches a
file, it runs its contents through a parser, which turns it into a recording
object ready to be played.

asciinema player uses very simple internal representation of a recording. The
object has following properties:

- `cols` - number of terminal columns (terminal width in chars),
- `rows` - number of terminal rows (terminal height in lines),
- `frames` - iterable (e.g. array, generator) of frames, where each frame is a 2
  element array, containing frame time (in seconds) and a text to print (or
  specifically, to feed into virtual terminal emulator).

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

Default parser used by the player is [asciicast](asciicast.js), which handles
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

The following example illustrates implementation of a custom parser:

```javascript
import * as AsciinemaPlayer from 'asciinema-player';

function parse(text) {
  return {
    cols: 80,
    rows: 24,
    frames: [[1.0, "hello"], [2.0, " world!"]]
  }
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
content, always returning hardcoded frames. Also, `cols` and `rows` are made up
as well - if possible they should reflect the size of a terminal at the time of
recording, otherwise their values should be chosen to make the recording look
legible. The example illustrates what kind of data the player expects though.

A more realistic example, where content of a file is actually used to construct
frames, could look like this:

```javascript
function parseLogs(text) {
  return {
    cols: 80,
    rows: 24,
    frames: text.split('\n').map((line, i) => [i * 0.5, line + '\n'])
  }
};

AsciinemaPlayer.create(
  { url: '/example.log', parser: parseLogs },
  document.getElementById('demo')
);
```

`parseLogs` function parses a log file into a recording which prints one log
line every half a second. This replays logs at a fixed rate.

That's not very fun to watch. If log lines started with a timestamp (where 0.0
means start of the recording) followed by log message then the timestamp could
be used for frame timing.

For example:


```
# example.log
1.0 first log line
1.2 second log line
3.8 third log line
```

```javascript
function parseLogs(text) {
  return {
    cols: 80,
    rows: 24,
    frames: text.split('\n').map(line => {
      const [_, time, message] = /^([\d.]+) (.*)/.exec(line);
      return [parseFloat(time), message + '\n']
    })
  }
};
```
