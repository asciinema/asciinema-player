import Segment from "./Segment";

export default (props) => {
  const segments = () => {
    if (typeof props.cursor === "number") {
      const segs = [];
      let cellOffset = 0;
      let segIndex = 0;

      while (
        segIndex < props.segments.length &&
        cellOffset + props.segments[segIndex].cellCount - 1 < props.cursor
      ) {
        const seg = props.segments[segIndex];
        segs.push(seg);
        cellOffset += seg.cellCount;
        segIndex++;
      }

      if (segIndex < props.segments.length) {
        const seg = props.segments[segIndex];
        const charWidth = seg.charWidth;
        let cellIndex = props.cursor - cellOffset;
        const charIndex = Math.floor(cellIndex / charWidth);
        cellIndex = charIndex * charWidth;
        const chars = Array.from(seg.text);

        if (charIndex > 0) {
          segs.push({ ...seg, text: chars.slice(0, charIndex).join("") });
        }

        segs.push({
          ...seg,
          text: chars[charIndex],
          offset: cellOffset + cellIndex,
          cellCount: charWidth,
          extraClass: "ap-cursor",
        });

        if (charIndex < chars.length - 1) {
          segs.push({
            ...seg,
            text: chars.slice(charIndex + 1).join(""),
            offset: cellOffset + cellIndex + 1,
            cellCount: seg.cellCount - charWidth,
          });
        }

        segIndex++;

        while (segIndex < props.segments.length) {
          const seg = props.segments[segIndex];
          segs.push(seg);
          segIndex++;
        }
      }

      return segs;
    } else {
      return props.segments;
    }
  };

  return (
    <span class="ap-line" role="paragraph">
      <Index each={segments()}>{(s) => <Segment {...s()} />}</Index>
    </span>
  );
};
