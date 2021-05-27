export default props => {
  return (
    <span class={className(props.attrs, props.extraClass)} style={style(props.attrs)}>{props.text}</span>
  );
}

function className(attrs, extraClass) {
  let cls = '';

  const fg = attrs.inverse
    ? (attrs.has('bg') ? attrs.get('bg') : 'bg')
    : attrs.get('fg');

  const bg = attrs.inverse
    ? (attrs.has('fg') ? attrs.get('fg') : 'fg')
    : attrs.get('bg');

  const fgClass = colorClass(fg, attrs.get('bold'), 'fg-');
  const bgClass = colorClass(bg, attrs.get('blink'), 'bg-');

  if (fgClass) {
    cls = fgClass;
  }

  if (bgClass) {
    cls = `${cls} ${bgClass}`;
  }

  if (attrs.has('bold')) {
    cls = `${cls} bright`;
  }

  if (attrs.has('italic')) {
    cls = `${cls} italic`;
  }

  if (attrs.has('underline')) {
    cls = `${cls} underline`;
  }

  if (attrs.has('blink')) {
    cls = `${cls} blink`;
  }

  if (extraClass) {
    cls += extraClass;
  }

  return cls === '' ? undefined : cls;
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
  const fg = attrs.inverse ? attrs.get('bg') : attrs.get('fg');
  const bg = attrs.inverse ? attrs.get('fg') : attrs.get('bg');

  let style = null;

  if (typeof fg == 'string') {
    style = {color: fg};
  }

  if (typeof bg == 'string') {
    style = style || {};
    style['background-color'] = bg;
  }

  return style;
}
