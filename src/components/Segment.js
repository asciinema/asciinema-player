export default props => {
  return (
    <span class={className(props.attrs, props.extraClass)} classList={classList(props.attrs)} style={style(props.attrs)}>{props.text}</span>
  );
}

function className(attrs, extraClass) {
  const fg = attrs.get('inverse')
    ? (attrs.has('bg') ? attrs.get('bg') : 'bg')
    : attrs.get('fg');

  const bg = attrs.get('inverse')
    ? (attrs.has('fg') ? attrs.get('fg') : 'fg')
    : attrs.get('bg');

  const fgClass = colorClass(fg, attrs.get('bold'), 'fg-');
  const bgClass = colorClass(bg, attrs.get('blink'), 'bg-');

  let cls = extraClass ?? '';

  if (fgClass) {
    cls += ' ' + fgClass;
  }

  if (bgClass) {
    cls += ' ' + bgClass;
  }

  return cls;
}

function classList(attrs) {
  return {
    bright: attrs.has('bold'),
    italic: attrs.has('italic'),
    underline: attrs.has('underline'),
    blink: attrs.has('blink')
  };
}

function colorClass(color, intense, prefix) {
  if (typeof color === 'number') {
    if (intense && color < 8) {
      color += 8;
    }

    return `${prefix}${color}`;
  } else if (color == 'fg' || color == 'bg') {
    return `${prefix}${color}`;
  }
}

function style(attrs) {
  const fg = attrs.get('inverse') ? attrs.get('bg') : attrs.get('fg');
  const bg = attrs.get('inverse') ? attrs.get('fg') : attrs.get('bg');

  let style = {};

  if (typeof fg === 'string') {
    style['color'] = fg;
  }

  if (typeof bg === 'string') {
    style['background-color'] = bg;
  }

  return style;
}
