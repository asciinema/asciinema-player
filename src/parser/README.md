# Parsers

Parser is a function, which transforms a recording encoded in an arbitrary file
format into a simple object representing a recording. Once the player fetches a
file, it runs its contents through a parser, which turns it into a recording
object used by player's [recording driver](../driver/recording.js).

## Data model of a recording

asciinema player uses very simple internal representation of a recording. The
object has following properties:

- `cols` - number of terminal columns (terminal width in chars),
- `rows` - number of terminal rows (terminal height in lines),
- `events` - iterable (e.g. array, generator) of recorded events, where each
   event is a 3 element array, containing
   - event time, in seconds,
   - event type, [as defined by asciicast v2
     format](https://github.com/asciinema/asciinema/blob/develop/doc/asciicast-v2.md#supported-event-types),
   - event data, specific to a type.

Example recording in its internal representation:

```javascript
{
  cols: 80,
  rows: 24,
  events: [
    [1.0, 'o', 'hello '],
    [2.0, 'o', 'world!']
  ]
}
```

Data model of a recording is _very_ similar to [asciicast v2
format](https://github.com/asciinema/asciinema/blob/develop/doc/asciicast-v2.md#supported-event-types).

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

Custom format parser can be built by implementing a function which takes file
content and returns a value conforming to the above data model.

The following example illustrates implementation of a custom parser:

```javascript
import * as AsciinemaPlayer from 'asciinema-player';

function parse(text) {
  return {
    cols: 80,
    rows: 24,
    events: [[1.0, "o", "hello"], [2.0, "o", " world!"]]
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
content, always returning hardcoded events. Also, `cols` and `rows` are made up
as well - if possible they should reflect the size of a terminal at the time of
recording, otherwise their values should be chosen to make the recording look
legible. The example illustrates what kind of data the player expects though.

A more realistic example, where content of a file is actually used to construct
events, could look like this:

```javascript
function parseLogs(text) {
  return {
    cols: 80,
    rows: 24,
    events: text.split('\n').map((line, i) => [i * 0.5, 'o', line + '\n'])
  }
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
log message then the timestamp could be used for event timing.

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
    events: text.split('\n').map(line => {
      const [_, time, message] = /^([\d.]+) (.*)/.exec(line);
      return [parseFloat(time), 'o', message + '\n']
    })
  }
};
```

Here's slightly more advanced parser, for [Simon Jansen's Star Wars
Asciimation](https://www.asciimation.co.nz/):

```javascript
function parseAsciimation(text) {
  const LINES_PER_FRAME = 14;
  const FRAME_DELAY = 67;
  const lines = text.split('\n');

  return {
    cols: 67,
    rows: LINES_PER_FRAME - 1,

    events: function*() {
      let time = 0;
      let prevFrameDuration = 0;

      yield [0, 'o', '\x9b?25l']; // hide cursor

      for (let i = 0; i + LINES_PER_FRAME - 1 < lines.length; i += LINES_PER_FRAME) {
        time += prevFrameDuration;
        prevFrameDuration = parseInt(lines[i], 10) * FRAME_DELAY;
        const frame = lines.slice(i + 1, i + LINES_PER_FRAME).join('\r\n');
        let text = '\x1b[H'; // move cursor home
        text += '\x1b[J'; // clear screen
        text += frame; // print current frame's lines
        yield [time / 1000, 'o', text];
      }
    }()
  }
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

Note that `events` in the above parser function is a generator (note `*` in
`function*`) that is immediately called (note `()` after `}` at the end). In
fact `events` can be any iterable or iterator which is finite, which in practice
means you can return an array or a finite generator, amongst others.
