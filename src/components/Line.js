import Segment from './Segment';

export default props => {
  const segments = () => {
    let finalResult = [];
    if (typeof props.cursor === 'number') {
      let segs = [];
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

      finalResult = segs;
    } else {
      finalResult = props.segments;
    }

    let fullWord = "";
    let searchTerm = window.searchTerm;
    if(!searchTerm || searchTerm.trim() === ''){
      return finalResult;
    }
    for (const seg of finalResult) {
      fullWord+=seg[0];
    }
    let resultIndexes = [];
    let resultIndex = fullWord.toLowerCase().indexOf(searchTerm.toLowerCase());
    while(resultIndex !== -1){
      resultIndexes.push(resultIndex);
      if(resultIndex !== -1) {
        resultIndex = fullWord.toLowerCase().indexOf(searchTerm.toLowerCase(), resultIndex+1);
      }
      else{
        break;
      }
    }
    if(resultIndexes.length > 0){
      let newSegs = [];
      for (let j = 0; j < finalResult.length; j++) {
        let seg = finalResult[j];
        for (const resultIndexElement of resultIndexes) {
          if(j>= resultIndexElement && j< resultIndexElement + searchTerm.length) {
            seg = [seg[0], seg[1], (seg[2] ?? '') +' search-text-result'];
            break;
          }
        }

        newSegs.push(seg);
      }
      finalResult = newSegs;
    }

    return finalResult;
  }

  return (
    <span class="ap-line" style={{height: props.height}} role="paragraph"><Index each={segments()}>{s => <Segment text={s()[0]} attrs={s()[1]} extraClass={s()[2]} />}</Index></span>
  );
}
