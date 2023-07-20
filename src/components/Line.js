import Segment from './Segment';

export default props => {
  const segments = () => {
    if (typeof props.cursor === 'number') {
      const segs = [];
      let len = 0;
      let i = 0;

      while (i < props.segments.length && len + props.segments[i][0].length - 1 < props.cursor) {
        const seg = props.segments[i];
        segs.push(seg)
        len += seg[0].length;
        i++;
      }

      if (i < props.segments.length) {
        const seg = props.segments[i];
        const cursorAttrsA = seg[1];
        const cursorAttrsB = new Map(cursorAttrsA);
        cursorAttrsB.set('inverse', !cursorAttrsB.get('inverse'));

        const pos = props.cursor - len;

        if (pos > 0) {
          segs.push([seg[0].substring(0, pos), seg[1]]);
        }

        segs.push([seg[0][pos], cursorAttrsA, ' ap-cursor-a']);
        segs.push([seg[0][pos], cursorAttrsB, ' ap-cursor-b']);

        if (pos < seg[0].length - 1) {
          segs.push([seg[0].substring(pos + 1), seg[1]]);
        }

        i++;

        while (i < props.segments.length) {
          const seg = props.segments[i];
          segs.push(seg);
          i++;
        }
      }

      return segs;
    } else {
      return props.segments;
    }
  }

  return (
    <span class="ap-line" style={{height: props.height}} role="paragraph"><Index each={segments()}>{s => <Segment text={s()[0]} attrs={s()[1]} extraClass={s()[2]} />}</Index></span>
  );
}
